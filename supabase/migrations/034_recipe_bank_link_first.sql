-- Migration 034 — Recipe bank link-first evolution (v2.0.0)
--
-- Per the v2.0.0 plan: bank stores LINKS to external recipes, not full content.
-- Existing AI-composed rows are preserved + restructured (ingredients/steps
-- archived into composed_payload jsonb so the rows can still hydrate without
-- a network fetch).
--
-- Adds:
--   * source_kind_v2: 'web'|'composed'|'user_import'|'community'
--   * secondary_ingredients text[] — sparse "lead-and-couple-more" tagging
--   * popularity_score numeric — rotation/retirement signal
--   * retired_at timestamptz — soft-retire (not delete) so we keep history
--   * audit_imported_from_user_count int — how many user URL-imports promoted to this row
--   * composed_payload jsonb — archive for legacy composed rows
-- Adds RPCs:
--   * under_covered_cells(p_target int) — used by refresher to top up
--   * retire_stale_recipes() — used by refresher end-of-tick
-- Adds view:
--   * recipe_bank_coverage — per (diet × meal_type × slot_role) row count;
--     multi-tag rows count for each diet (unnest)
-- Adds table:
--   * recipe_bank_audit_log — audit decisions for user URL imports (idempotent
--     auditor, rate-limit, never carries user identity to bank)
-- Upgrades sample_recipes_for_slot to prefer link-first over composed.
--
-- Reversibility: column-additive only; never drops the legacy ingredients/steps
-- columns (just nulls them for composed rows after archiving).
-- Idempotent — safe to re-run.

-- ─── A.1 New columns ───────────────────────────────────────────────────────
ALTER TABLE public.recipe_bank
  ADD COLUMN IF NOT EXISTS source_kind_v2 text
    CHECK (source_kind_v2 IN ('web','composed','user_import','community')),
  ADD COLUMN IF NOT EXISTS secondary_ingredients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS popularity_score numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS audit_imported_from_user_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS composed_payload jsonb;

-- ─── A.2 Backfill v1 source_kind → v2 enum (1:1 for web/composed) ──────────
UPDATE public.recipe_bank
   SET source_kind_v2 = source_kind
 WHERE source_kind_v2 IS NULL;

-- ─── A.2b Archive existing composed rows' content into composed_payload ────
-- Only touches rows that haven't been archived yet (idempotent).
UPDATE public.recipe_bank
   SET composed_payload = jsonb_build_object(
         'ingredients',  ingredients,
         'steps',        to_jsonb(steps),
         'totalTimeMin', COALESCE(prep_time_min, 0) + COALESCE(cook_time_min, 0))
 WHERE source_kind_v2 = 'composed'
   AND composed_payload IS NULL
   AND ingredients IS NOT NULL;

-- Null the legacy columns for archived composed rows. The hydrator uses
-- composed_payload now; ingredients + steps stay null for new rows too.
UPDATE public.recipe_bank
   SET ingredients = NULL,
       steps       = NULL
 WHERE source_kind_v2 = 'composed'
   AND composed_payload IS NOT NULL
   AND ingredients IS NOT NULL;

-- ─── A.3 Drop NOT NULL on ingredients / steps ──────────────────────────────
-- New link-first rows (source_kind_v2 in 'web','user_import') leave them NULL.
ALTER TABLE public.recipe_bank ALTER COLUMN ingredients DROP NOT NULL;
ALTER TABLE public.recipe_bank ALTER COLUMN steps        DROP NOT NULL;

-- ─── A.4 Source-URL constraint for link-first rows ─────────────────────────
ALTER TABLE public.recipe_bank DROP CONSTRAINT IF EXISTS recipe_bank_link_required;
ALTER TABLE public.recipe_bank
  ADD CONSTRAINT recipe_bank_link_required
  CHECK (
    source_kind_v2 IS NULL
    OR source_kind_v2 IN ('composed','community')
    OR (source_kind_v2 IN ('web','user_import') AND source_url IS NOT NULL)
  ) NOT VALID;
ALTER TABLE public.recipe_bank VALIDATE CONSTRAINT recipe_bank_link_required;

-- ─── A.5 Partial unique index on (source_url, slot_role) ───────────────────
-- Used by the refresher + auditor to UPSERT without dup spam.
CREATE UNIQUE INDEX IF NOT EXISTS recipe_bank_url_uniq
  ON public.recipe_bank (source_url, slot_role)
  WHERE source_url IS NOT NULL;

-- ─── A.6 Per-diet coverage view ────────────────────────────────────────────
-- Multi-tag rows count for each diet — a vegetarian + gluten-free row lifts
-- both buckets. Rows with no dietary tags count as 'omnivore'.
CREATE OR REPLACE VIEW public.recipe_bank_coverage AS
WITH expanded AS (
  SELECT id, meal_type, slot_role,
         CASE WHEN cardinality(dietary_tags) = 0
              THEN ARRAY['omnivore']::text[]
              ELSE dietary_tags END AS diets
  FROM public.recipe_bank
  WHERE retired_at IS NULL AND expires_at > now()
)
SELECT diet, meal_type, slot_role, COUNT(*) AS row_count
FROM expanded, unnest(diets) AS diet
GROUP BY diet, meal_type, slot_role;

-- ─── A.7 Coverage probe RPC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.under_covered_cells(p_target int DEFAULT 30)
RETURNS TABLE(diet text, meal_type text, slot_role text, deficit int)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT diet, meal_type, slot_role,
         GREATEST(0, p_target - row_count)::int AS deficit
  FROM public.recipe_bank_coverage
  WHERE row_count < p_target
  ORDER BY deficit DESC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.under_covered_cells(int) TO authenticated;

-- ─── A.8 Retirement RPC ────────────────────────────────────────────────────
-- Retires (soft-deletes) rows that:
--   • have never been served AND were generated > 30 days ago, OR
--   • have a popularity_score below 10
-- Returns the count of newly-retired rows.
CREATE OR REPLACE FUNCTION public.retire_stale_recipes()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH retired AS (
    UPDATE public.recipe_bank
       SET retired_at = now()
     WHERE retired_at IS NULL
       AND ((times_served = 0 AND generated_at < now() - interval '30 days')
            OR popularity_score < 10)
    RETURNING 1
  )
  SELECT COALESCE(COUNT(*), 0)::int FROM retired;
$$;

GRANT EXECUTE ON FUNCTION public.retire_stale_recipes() TO authenticated;

-- ─── A.9 Sampler upgrade ───────────────────────────────────────────────────
-- Prefer link-first rows (web/user_import/community) over composed, then by
-- popularity_score, then quality_score, then random tiebreak.
CREATE OR REPLACE FUNCTION public.sample_recipes_for_slot(
  p_meal_type            text,
  p_slot_role            text,
  p_cuisine_ids          text[]   DEFAULT '{}',
  p_dietary_tags         text[]   DEFAULT '{}',
  p_disliked_ingredients text[]   DEFAULT '{}',
  p_recent_dish_names    text[]   DEFAULT '{}',
  p_limit                int      DEFAULT 5
)
RETURNS SETOF public.recipe_bank
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM public.recipe_bank
  WHERE meal_type = p_meal_type
    AND slot_role = p_slot_role
    AND retired_at IS NULL
    AND expires_at > now()
    AND (cardinality(p_cuisine_ids) = 0 OR cuisine_id = ANY(p_cuisine_ids))
    AND (cardinality(p_dietary_tags) = 0 OR dietary_tags @> p_dietary_tags)
    AND (cardinality(p_disliked_ingredients) = 0
         OR NOT (lower(ingredient_main) = ANY(SELECT lower(unnest(p_disliked_ingredients)))))
    AND (cardinality(p_recent_dish_names) = 0
         OR NOT (lower(trim(title)) = ANY(SELECT lower(trim(unnest(p_recent_dish_names))))))
  ORDER BY
    (CASE WHEN source_kind_v2 IN ('web','user_import','community') THEN 0 ELSE 1 END),
    popularity_score DESC,
    quality_score DESC,
    random()
  LIMIT p_limit;
$$;

-- (Grant already exists from migration 030 but re-grant is safe + idempotent.)
GRANT EXECUTE ON FUNCTION public.sample_recipes_for_slot(text, text, text[], text[], text[], text[], int)
  TO authenticated;

-- ─── A.10 Auditor log table ────────────────────────────────────────────────
-- Records every auditor decision for user URL imports — prevents duplicate
-- audits on retry, lets us rate-limit per user, and gives ops visibility.
-- IMPORTANT: this table holds recipe_id (which links to a user) — NOT
-- user_id directly. The bank itself never carries user identity.
CREATE TABLE IF NOT EXISTS public.recipe_bank_audit_log (
  recipe_id   uuid          PRIMARY KEY
                            REFERENCES public.recipes(id) ON DELETE CASCADE,
  decided_at  timestamptz   NOT NULL DEFAULT now(),
  decision    text          NOT NULL CHECK (decision IN (
                              'promoted',
                              'skipped_dup',
                              'skipped_pii',
                              'skipped_low_quality',
                              'skipped_rate_limit',
                              'error'
                            )),
  bank_id     uuid          REFERENCES public.recipe_bank(id) ON DELETE SET NULL,
  notes       text
);

CREATE INDEX IF NOT EXISTS recipe_bank_audit_log_decided_at_idx
  ON public.recipe_bank_audit_log (decided_at DESC);

ALTER TABLE public.recipe_bank_audit_log ENABLE ROW LEVEL SECURITY;

-- No public read or write — service role only. (No policies = deny all.)

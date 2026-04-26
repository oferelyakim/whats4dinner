-- Migration 030 — Recipe bank (v1.17.0)
-- Pre-generated recipe library that meal-plan generation samples from before
-- calling Anthropic. Cuts AI calls 80%+ for common dietary axes — the core
-- of the v1.17.0 "stop one user from crashing the system" architecture shift.
--
-- Owner: any logged-in user can SELECT (rows are generic, non-PII recipes).
-- Service role writes (cron + manual seed). RLS enforced.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.recipe_bank (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text          NOT NULL,
  cuisine_id        text          NOT NULL,
  meal_type         text          NOT NULL,
  slot_role         text          NOT NULL,
  dietary_tags      text[]        NOT NULL DEFAULT '{}',
  ingredient_main   text          NOT NULL,
  protein_family    text,
  style_id          text,
  flavor_id         text,
  ingredients       jsonb         NOT NULL,
  steps             text[]        NOT NULL,
  prep_time_min     int,
  cook_time_min     int,
  servings          int,
  image_url         text,
  source_url        text,
  source_domain     text,
  source_kind       text          NOT NULL DEFAULT 'composed'
                                    CHECK (source_kind IN ('web', 'composed')),
  quality_score     numeric       NOT NULL DEFAULT 50,
  times_served      int           NOT NULL DEFAULT 0,
  last_served_at    timestamptz,
  generated_at      timestamptz   NOT NULL DEFAULT now(),
  expires_at        timestamptz   NOT NULL DEFAULT now() + interval '14 days'
);

-- Sampling indexes — these power the per-slot lookup hot path.
CREATE INDEX IF NOT EXISTS recipe_bank_meal_role_idx
  ON public.recipe_bank (meal_type, slot_role);
CREATE INDEX IF NOT EXISTS recipe_bank_cuisine_idx
  ON public.recipe_bank (cuisine_id);
CREATE INDEX IF NOT EXISTS recipe_bank_dietary_gin
  ON public.recipe_bank USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS recipe_bank_quality_idx
  ON public.recipe_bank (quality_score DESC);
CREATE INDEX IF NOT EXISTS recipe_bank_expires_idx
  ON public.recipe_bank (expires_at);

-- Run-tracking table for the cron (when implemented in v1.18.0).
CREATE TABLE IF NOT EXISTS public.recipe_bank_runs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      timestamptz   NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  recipes_added   int           NOT NULL DEFAULT 0,
  tokens_used     int           NOT NULL DEFAULT 0,
  cost_usd        numeric       NOT NULL DEFAULT 0,
  trigger         text          NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual' | 'seed'
  notes           text
);

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.recipe_bank      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_bank_runs ENABLE ROW LEVEL SECURITY;

-- Any logged-in user can read recipes (they're generic, not user-owned).
DROP POLICY IF EXISTS "Authenticated users can read recipe_bank" ON public.recipe_bank;
CREATE POLICY "Authenticated users can read recipe_bank"
  ON public.recipe_bank FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Service role bypasses RLS, so no INSERT/UPDATE/DELETE policy needed.

-- recipe_bank_runs: read-only for users (debugging), writes via service role.
DROP POLICY IF EXISTS "Authenticated users can read recipe_bank_runs" ON public.recipe_bank_runs;
CREATE POLICY "Authenticated users can read recipe_bank_runs"
  ON public.recipe_bank_runs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─── Sampling RPC ─────────────────────────────────────────────────────────
-- Returns up to p_limit candidate recipes matching the slot's constraints.
-- Caller filters by sibling-slot compatibility client-side (cheap + DB-agnostic).

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
    AND expires_at > now()
    -- Cuisine: empty array = any cuisine; else must match one of the listed.
    AND (cardinality(p_cuisine_ids) = 0 OR cuisine_id = ANY(p_cuisine_ids))
    -- Dietary: row must contain ALL caller-required tags (superset match).
    AND (cardinality(p_dietary_tags) = 0 OR dietary_tags @> p_dietary_tags)
    -- Disliked ingredient: row's ingredient_main must NOT be on the disliked list.
    AND (cardinality(p_disliked_ingredients) = 0
         OR NOT (lower(ingredient_main) = ANY(SELECT lower(unnest(p_disliked_ingredients)))))
    -- Recent dish: row title must NOT match a recently-served dish (case-insensitive).
    AND (cardinality(p_recent_dish_names) = 0
         OR NOT (lower(trim(title)) = ANY(SELECT lower(trim(unnest(p_recent_dish_names))))))
  ORDER BY quality_score DESC, random()
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.sample_recipes_for_slot(text, text, text[], text[], text[], text[], int)
  TO authenticated;

-- ─── Bump times_served on use (called from client after slot fills) ───────
CREATE OR REPLACE FUNCTION public.bump_recipe_bank_served(p_recipe_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.recipe_bank
  SET times_served = times_served + 1,
      last_served_at = now()
  WHERE id = ANY(p_recipe_ids);
$$;

GRANT EXECUTE ON FUNCTION public.bump_recipe_bank_served(uuid[]) TO authenticated;

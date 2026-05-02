-- Migration 035 — Weekly menu drop (v3.0.0)
--
-- The shared weekly recipe drop. Generated once per week by the
-- `weekly-drop-generator` edge function (cron-fired Sunday 06:00 ET, see
-- migration 038). One drop per ISO Monday week. Free for all authenticated
-- users to read. Service role writes.
--
-- Drop shape: 126 entries per week
--   - 7 days × 10 dinner positions
--   - 7 days × 5 lunch positions
--   - 7 days × 3 breakfast positions
--
-- Each entry references a row in `recipe_bank`. The drop is a thin curation
-- layer — content lives in the bank, not duplicated here.
--
-- Idempotent — safe to re-run.

-- ─── Drop manifest (one row per ISO Monday) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.weekly_menu_drops (
  week_start         date          PRIMARY KEY,
  generated_at       timestamptz   NOT NULL DEFAULT now(),
  total_recipes      int           NOT NULL,
  diet_coverage      jsonb         NOT NULL DEFAULT '{}'::jsonb,
  generator_version  text          NOT NULL
);

CREATE INDEX IF NOT EXISTS weekly_menu_drops_generated_idx
  ON public.weekly_menu_drops (generated_at DESC);

-- ─── Drop entries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.weekly_menu (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start      date          NOT NULL REFERENCES public.weekly_menu_drops(week_start) ON DELETE CASCADE,
  day_idx         int           NOT NULL CHECK (day_idx BETWEEN 0 AND 6),
  meal_type       text          NOT NULL,
  slot_role       text          NOT NULL,
  position        int           NOT NULL,
  recipe_bank_id  uuid          NOT NULL REFERENCES public.recipe_bank(id) ON DELETE CASCADE,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (week_start, day_idx, meal_type, slot_role, position)
);

CREATE INDEX IF NOT EXISTS weekly_menu_week_idx
  ON public.weekly_menu (week_start, day_idx, meal_type);
CREATE INDEX IF NOT EXISTS weekly_menu_recipe_idx
  ON public.weekly_menu (recipe_bank_id);

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.weekly_menu_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_menu       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read weekly_menu_drops" ON public.weekly_menu_drops;
CREATE POLICY "Authenticated users can read weekly_menu_drops"
  ON public.weekly_menu_drops FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can read weekly_menu" ON public.weekly_menu;
CREATE POLICY "Authenticated users can read weekly_menu"
  ON public.weekly_menu FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Service role bypasses RLS — no INSERT/UPDATE/DELETE policy needed.

-- ─── Lookup RPC: ISO Monday for a given date ───────────────────────────────
-- Helper used by both the generator and the client. ISO weeks start Monday.
CREATE OR REPLACE FUNCTION public.iso_monday(p_date date)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT date_trunc('week', p_date::timestamp)::date;
$$;

GRANT EXECUTE ON FUNCTION public.iso_monday(date) TO authenticated;

-- ─── Fetch current week's drop (joined with recipe_bank rows) ──────────────
-- Returns a flat row per drop entry with the recipe content embedded.
-- Caller groups client-side by (day_idx, meal_type) for rendering.
CREATE OR REPLACE FUNCTION public.get_current_weekly_drop()
RETURNS TABLE(
  week_start         date,
  day_idx            int,
  meal_type          text,
  slot_role          text,
  position           int,
  recipe_bank_id     uuid,
  title              text,
  cuisine_id         text,
  dietary_tags       text[],
  ingredient_main    text,
  protein_family     text,
  prep_time_min      int,
  cook_time_min      int,
  servings           int,
  image_url          text,
  source_url         text,
  source_domain      text,
  source_kind_v2     text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH active_week AS (
    SELECT week_start FROM public.weekly_menu_drops
    WHERE week_start <= (now() AT TIME ZONE 'UTC')::date
    ORDER BY week_start DESC
    LIMIT 1
  )
  SELECT
    wm.week_start, wm.day_idx, wm.meal_type, wm.slot_role, wm.position,
    rb.id AS recipe_bank_id, rb.title, rb.cuisine_id, rb.dietary_tags,
    rb.ingredient_main, rb.protein_family,
    rb.prep_time_min, rb.cook_time_min, rb.servings,
    rb.image_url, rb.source_url, rb.source_domain, rb.source_kind_v2
  FROM public.weekly_menu wm
  JOIN public.recipe_bank rb ON rb.id = wm.recipe_bank_id
  WHERE wm.week_start = (SELECT week_start FROM active_week)
    AND rb.retired_at IS NULL
  ORDER BY wm.day_idx, wm.meal_type, wm.position;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_weekly_drop() TO authenticated;

-- ─── Fetch a specific week's drop ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_weekly_drop_for_week(p_week_start date)
RETURNS TABLE(
  week_start         date,
  day_idx            int,
  meal_type          text,
  slot_role          text,
  position           int,
  recipe_bank_id     uuid,
  title              text,
  cuisine_id         text,
  dietary_tags       text[],
  ingredient_main    text,
  protein_family     text,
  prep_time_min      int,
  cook_time_min      int,
  servings           int,
  image_url          text,
  source_url         text,
  source_domain      text,
  source_kind_v2     text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    wm.week_start, wm.day_idx, wm.meal_type, wm.slot_role, wm.position,
    rb.id AS recipe_bank_id, rb.title, rb.cuisine_id, rb.dietary_tags,
    rb.ingredient_main, rb.protein_family,
    rb.prep_time_min, rb.cook_time_min, rb.servings,
    rb.image_url, rb.source_url, rb.source_domain, rb.source_kind_v2
  FROM public.weekly_menu wm
  JOIN public.recipe_bank rb ON rb.id = wm.recipe_bank_id
  WHERE wm.week_start = public.iso_monday(p_week_start)
    AND rb.retired_at IS NULL
  ORDER BY wm.day_idx, wm.meal_type, wm.position;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_drop_for_week(date) TO authenticated;

-- Migration 040 — Remove iso_monday normalization from get_weekly_drop_for_week (v3.0.1 hot-fix)
--
-- Discovered while finishing the v3.0.1 deploy: `get_weekly_drop_for_week`
-- (defined in migration 035) normalizes its input through `public.iso_monday()`
-- before matching `weekly_menu.week_start`. This was correct under v3.0.0's
-- Monday-week assumption, but v3.0.1 switched to Sunday-Saturday weeks.
-- Passing a Sunday date (e.g. '2026-05-03') makes iso_monday() return the
-- Monday of *that ISO week* (Mon 2026-04-27), which won't match the new
-- Sunday-keyed `weekly_menu` rows.
--
-- The frontend (`WeeklyDropDrawer` + `PlanV2View`) now passes the exact
-- Sunday week_start the drop generator wrote, so no normalization is needed.
--
-- Fix: drop the iso_monday() call, use direct equality on the input.
--
-- Idempotent — `CREATE OR REPLACE FUNCTION` just rewrites the body.

CREATE OR REPLACE FUNCTION public.get_weekly_drop_for_week(p_week_start date)
RETURNS TABLE(
  week_start         date,
  day_idx            int,
  meal_type          text,
  slot_role          text,
  card_position      int,
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
    wm.week_start, wm.day_idx, wm.meal_type, wm.slot_role, wm.position AS card_position,
    rb.id AS recipe_bank_id, rb.title, rb.cuisine_id, rb.dietary_tags,
    rb.ingredient_main, rb.protein_family,
    rb.prep_time_min, rb.cook_time_min, rb.servings,
    rb.image_url, rb.source_url, rb.source_domain, rb.source_kind_v2
  FROM public.weekly_menu wm
  JOIN public.recipe_bank rb ON rb.id = wm.recipe_bank_id
  WHERE wm.week_start = p_week_start
    AND rb.retired_at IS NULL
  ORDER BY wm.day_idx, wm.meal_type, wm.position;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_drop_for_week(date) TO authenticated, anon;

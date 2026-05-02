-- Migration 039 — Thursday cron + Sunday-start week + drawer-friendly RPC (v3.0.1)
--
-- Three product changes that ship together:
--
-- 1. The drop now runs **Thursdays** at 10:00 UTC (instead of Sundays).
--    This delivers the upcoming week's plan ~3 days before the week starts,
--    giving households the weekend to plan + shop. (US household calendar
--    research: most grocery runs are Sat/Sun.)
--
-- 2. The week is now **Sunday-Saturday** (US convention) instead of Mon-Sun
--    (ISO). This is purely a calendar-naming change — `week_start` in
--    `weekly_menu_drops` is just an opaque date identifier; the database
--    doesn't care which day of the week it represents. The edge function
--    `weekly-drop-generator` (v3.0.1) computes the next Sunday and uses
--    that as `week_start`. Existing Mon-keyed drops (e.g. 2026-05-04) stay
--    in the table but become orphans the new RPC will skip past.
--
-- 3. `get_current_weekly_drop()` filter is **widened** so the drawer also
--    surfaces upcoming drops, not just past/current. The old filter
--    `week_start <= today` made the Drop drawer empty between Thursday's
--    cron run and the following Sunday. New filter is "drop is still
--    active" — its 7-day window has not yet expired.
--
-- Idempotent — safe to re-run.

-- ─── A. Widen get_current_weekly_drop's filter ─────────────────────────────
-- Old: WHERE week_start <= today ORDER BY week_start DESC LIMIT 1
-- New: WHERE week_start + 7 > today ORDER BY week_start ASC LIMIT 1
--
-- Rationale: the drop is "active" while we're still inside its 7-day window.
-- After Thursday generates next Sunday's drop, the current Sunday's drop is
-- still live (its week+7 hasn't expired). Once the new Sunday rolls in, the
-- ASC sort selects the new drop because it's now the earliest still-active.

CREATE OR REPLACE FUNCTION public.get_current_weekly_drop()
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
  WITH active_week AS (
    SELECT week_start FROM public.weekly_menu_drops
    WHERE week_start + 7 > (now() AT TIME ZONE 'UTC')::date
    ORDER BY week_start ASC
    LIMIT 1
  )
  SELECT
    wm.week_start,
    wm.day_idx,
    wm.meal_type,
    wm.slot_role,
    wm.position           AS card_position,
    wm.recipe_bank_id,
    rb.title,
    rb.cuisine_id,
    rb.dietary_tags,
    rb.ingredient_main,
    rb.protein_family,
    rb.prep_time_min,
    rb.cook_time_min,
    rb.servings,
    rb.image_url,
    rb.source_url,
    rb.source_domain,
    rb.source_kind_v2
  FROM public.weekly_menu wm
  JOIN public.recipe_bank rb ON rb.id = wm.recipe_bank_id
  WHERE wm.week_start = (SELECT week_start FROM active_week)
  ORDER BY wm.day_idx, wm.meal_type, wm.position;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_weekly_drop() TO authenticated, anon;

-- ─── B. Reschedule pg_cron job from Sunday to Thursday ─────────────────────
-- Old: '0 10 * * 0' (Sundays 10:00 UTC)
-- New: '0 10 * * 4' (Thursdays 10:00 UTC ≈ 06:00 EDT / 05:00 EST)

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'weekly-drop-generator';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'weekly-drop-generator',
  '0 10 * * 4',  -- Thursday at 10:00 UTC
  $cron$
    SELECT net.http_post(
      url := 'https://zgebzhvbszhqvaryfiwk.supabase.co/functions/v1/weekly-drop-generator',
      headers := jsonb_build_object('content-type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

-- Verify after migrating with:
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname = 'weekly-drop-generator';

-- ─── C. Clean up orphaned meal_menu_recipes rows ───────────────────────────
-- Per investigation 2026-05-02: existing meal_menu_recipes rows reference
-- recipe_ids that no longer exist in `recipes` (recipes were deleted but
-- the link rows weren't cascaded). The Templates UI shows these templates
-- as empty because `getMealMenus()` LEFT JOINs and filters out null recipes.
-- Cleanup keeps the templates' identity (name, description) but drops the
-- dead links so the UI behavior is consistent with the data.

DELETE FROM public.meal_menu_recipes mmr
WHERE NOT EXISTS (
  SELECT 1 FROM public.recipes r WHERE r.id = mmr.recipe_id
);

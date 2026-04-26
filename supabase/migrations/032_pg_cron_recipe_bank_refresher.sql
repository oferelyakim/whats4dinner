-- v1.19.0 — pg_cron schedule for recipe-bank-refresher edge function.
--
-- Fires every 6 hours. Each invocation tops up under-served (cuisine ×
-- meal_type × slot_role × diet) cells in `recipe_bank` so the bank-first
-- hot path in `MealPlanEngine.tryFillSlotFromBank` keeps a high hit rate
-- without manual seeding.
--
-- The edge function is deployed `--no-verify-jwt` (mirrors meal-plan-worker)
-- so the cron POST doesn't need a bearer token. The function itself uses
-- `SUPABASE_SERVICE_ROLE_KEY` from the deno env for all DB writes — no
-- secrets need to flow through the cron pipe.
--
-- Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any prior version of this job, then reschedule. cron.unschedule
-- raises if the job doesn't exist, so wrap in a DO block to swallow.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'recipe-bank-refresher';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

-- Schedule every 6 hours. We pass an empty body — the edge function probes
-- `recipe_bank` itself to decide which cells to top up.
SELECT cron.schedule(
  'recipe-bank-refresher',
  '0 */6 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://zgebzhvbszhqvaryfiwk.supabase.co/functions/v1/recipe-bank-refresher',
      headers := jsonb_build_object('content-type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 70000
    );
  $cron$
);

-- Surface schedule registration in supabase_realtime not needed — cron.job
-- is a system table, not a user-facing one. Verify after migrating with:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'recipe-bank-refresher';

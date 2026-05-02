-- Migration 038 — pg_cron schedule for weekly-drop-generator (v3.0.0)
--
-- Fires every Sunday at 10:00 UTC, which lands at:
--   * 06:00 EDT (summer) — the headline "Sunday 6 AM ET" promise
--   * 05:00 EST (winter) — one hour earlier, still pre-breakfast
--
-- pg_cron schedules in UTC only; daylight-saving drift is a documented
-- 1-hour shift. If the marketing copy needs a tighter promise, run the
-- cron more often (e.g. 10 + 11 UTC) and let the generator's idempotent
-- `INSERT ... ON CONFLICT (week_start) DO NOTHING` swallow duplicates.
--
-- The edge function is deployed `--no-verify-jwt` (mirrors recipe-bank-refresher
-- and meal-plan-worker pattern) so the cron POST doesn't need a bearer token.
-- The function uses `SUPABASE_SERVICE_ROLE_KEY` from the deno env for all
-- DB writes — no secrets need to flow through the cron pipe.
--
-- Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any prior version of this job, then reschedule.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'weekly-drop-generator';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

-- Schedule Sundays at 10:00 UTC (06:00 EDT / 05:00 EST).
SELECT cron.schedule(
  'weekly-drop-generator',
  '0 10 * * 0',
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

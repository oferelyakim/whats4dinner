-- Migration 044 — Web Push Notifications (v3.6.0)
--
-- Creates:
--   • public.push_subscriptions  — VAPID subscription endpoints per user/device
--   • public.push_notification_log — idempotency dedup (service-role only)
--   • public.purge_old_push_log() — security definer cleanup helper
--   • pg_cron job send-scheduled-push (every minute)
--   • pg_cron job purge-push-log (daily at 03:00 UTC)
--
-- Idempotent — safe to re-run. Follows the patterns in migrations 032 and 038.
--
-- Deploy order:
--   1. Apply this migration.
--   2. Set secrets: VAPID_PRIVATE_KEY, VAPID_SUBJECT
--   3. Set Vercel env: VITE_VAPID_PUBLIC_KEY
--   4. Deploy edge functions: subscribe-push (with JWT), send-scheduled-push
--      and send-list-item-push (both --no-verify-jwt)
--   5. Configure the shopping_list_items INSERT database webhook in the
--      Supabase dashboard (see webhook config notes at bottom of file).

-- ─── Extensions ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── push_subscriptions ───────────────────────────────────────────────────
-- One row per (user, browser endpoint). Same user may have multiple devices
-- (phone + desktop + tablet). Rows are immutable; subscription is replaced if
-- the browser rotates keys by upsert in subscribe-push.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text        NOT NULL,
  p256dh       text        NOT NULL,  -- client DH public key, base64url
  auth_key     text        NOT NULL,  -- auth secret, base64url
  user_agent   text,                  -- nullable; for debugging only
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,           -- updated on each successful send
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions. No UPDATE policy — rows are
-- replaced by DELETE+INSERT or UPSERT in the subscribe-push function.
-- Service-role bypasses RLS so the sender functions can read all subs.

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.push_subscriptions IS
  'VAPID Web Push subscription endpoints. One row per (user, browser). '
  'RLS: users manage own rows; service-role bypasses for push senders.';

-- ─── push_notification_log ────────────────────────────────────────────────
-- Idempotency dedup table so the every-minute cron never double-fires a
-- notification for the same chore/activity on the same day.
-- No RLS — this is a service-role-only table.

CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key  text        NOT NULL UNIQUE,
  sent_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_notification_log_dedup_key_idx
  ON public.push_notification_log (dedup_key);

CREATE INDEX IF NOT EXISTS push_notification_log_sent_at_idx
  ON public.push_notification_log (sent_at);

COMMENT ON TABLE public.push_notification_log IS
  'Idempotency dedup for scheduled push notifications. '
  'Service-role only — no RLS. Rows older than 7 days are pruned daily.';

-- ─── purge_old_push_log() ─────────────────────────────────────────────────
-- Called nightly by pg_cron. Security definer so it runs under the function
-- owner (postgres) and can bypass RLS on push_notification_log.

CREATE OR REPLACE FUNCTION public.purge_old_push_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_notification_log
  WHERE sent_at < now() - INTERVAL '7 days';
END
$$;

GRANT EXECUTE ON FUNCTION public.purge_old_push_log() TO service_role;

-- ─── pg_cron: send-scheduled-push (every minute) ─────────────────────────
-- Fires every minute. The edge function reads ET time, finds matching
-- chores/activities, deduplicates via push_notification_log, and sends.
-- Timeout 55s gives the function 5s headroom before the next cron tick.

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'send-scheduled-push';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'send-scheduled-push',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://zgebzhvbszhqvaryfiwk.supabase.co/functions/v1/send-scheduled-push',
      headers := jsonb_build_object('content-type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);

-- ─── pg_cron: purge-push-log (daily at 03:00 UTC) ────────────────────────

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'purge-push-log';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'purge-push-log',
  '0 3 * * *',
  $cron$
    SELECT public.purge_old_push_log();
  $cron$
);

-- ─── Verify after migrating ───────────────────────────────────────────────
-- SELECT jobname, schedule, active FROM cron.job
-- WHERE jobname IN ('send-scheduled-push', 'purge-push-log');

-- ─── Database webhook (manual setup in Supabase dashboard) ───────────────
-- Create a new Database Webhook with these settings:
--
--   Name:    send-list-item-push
--   Table:   public.shopping_list_items
--   Events:  INSERT
--   Method:  POST
--   URL:     https://zgebzhvbszhqvaryfiwk.supabase.co/functions/v1/send-list-item-push
--   Headers: Content-Type: application/json
--
-- No filter is needed — the edge function checks circle membership and
-- filters out the adder. The function is deployed --no-verify-jwt because
-- database webhooks do not carry a bearer token.

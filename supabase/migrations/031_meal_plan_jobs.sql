-- Migration 031 — Async meal-plan generation job queue (v1.18.0)
-- Server-resumed background generation so a closed tab no longer kills a run,
-- and a single user no longer crashes the system. Pairs with v1.17.0 recipe
-- bank: bank handles 80%+ of slots instantly; this queue handles the residual
-- AI calls in the background, with retry-after honoring and cross-tab re-attach.
--
-- Idempotent — safe to re-run.

-- ─── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meal_plan_jobs (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid         NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  circle_id         uuid         REFERENCES public.circles(id) ON DELETE SET NULL,
  plan_id           text         NOT NULL,           -- Dexie local plan id (NOT a Postgres FK)
  status            text         NOT NULL DEFAULT 'queued'
                                 CHECK (status IN ('queued','running','completed','failed','cancelled')),
  total_slots       int          NOT NULL,
  completed_slots   int          NOT NULL DEFAULT 0,
  failed_slots      int          NOT NULL DEFAULT 0,
  started_at        timestamptz,
  finished_at       timestamptz,
  error_message     text,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meal_plan_job_slots (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid    NOT NULL REFERENCES public.meal_plan_jobs(id) ON DELETE CASCADE,
  slot_id               text    NOT NULL,    -- Dexie Slot.id
  meal_id               text    NOT NULL,    -- Dexie Meal.id
  day_id                text    NOT NULL,    -- Dexie Day.id
  slot_role             text    NOT NULL,
  meal_type             text    NOT NULL,
  envelope              jsonb   NOT NULL,    -- variety envelope picked client-side
  dietary_constraints   text[]  NOT NULL DEFAULT '{}',
  disliked_ingredients  text[]  NOT NULL DEFAULT '{}',
  recent_dish_names     text[]  NOT NULL DEFAULT '{}',
  status                text    NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','in_progress','done','failed','cancelled')),
  result                jsonb,              -- Recipe shape from src/engine/types.ts
  error_message         text,
  attempts              int     NOT NULL DEFAULT 0,
  started_at            timestamptz,
  finished_at           timestamptz
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS meal_plan_jobs_user_status_idx
  ON public.meal_plan_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS meal_plan_jobs_status_created_idx
  ON public.meal_plan_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS meal_plan_jobs_plan_idx
  ON public.meal_plan_jobs(plan_id);
CREATE INDEX IF NOT EXISTS meal_plan_job_slots_job_status_idx
  ON public.meal_plan_job_slots(job_id, status);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.meal_plan_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_job_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own meal_plan_jobs" ON public.meal_plan_jobs;
CREATE POLICY "Users can select own meal_plan_jobs"
  ON public.meal_plan_jobs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own meal_plan_jobs" ON public.meal_plan_jobs;
CREATE POLICY "Users can insert own meal_plan_jobs"
  ON public.meal_plan_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Cancel-only update — users can flip status to 'cancelled' but not anything else.
DROP POLICY IF EXISTS "Users can cancel own meal_plan_jobs" ON public.meal_plan_jobs;
CREATE POLICY "Users can cancel own meal_plan_jobs"
  ON public.meal_plan_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

DROP POLICY IF EXISTS "Users can select own meal_plan_job_slots" ON public.meal_plan_job_slots;
CREATE POLICY "Users can select own meal_plan_job_slots"
  ON public.meal_plan_job_slots FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.meal_plan_jobs WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own meal_plan_job_slots" ON public.meal_plan_job_slots;
CREATE POLICY "Users can insert own meal_plan_job_slots"
  ON public.meal_plan_job_slots FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.meal_plan_jobs WHERE user_id = auth.uid()
    )
  );

-- Service role bypasses RLS — worker writes all UPDATEs to slots and counter columns.

-- ─── Realtime publication (required for postgres_changes subscriptions) ────
-- Wrap each ALTER PUBLICATION in a DO so re-running this migration after
-- the table is already published doesn't fail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meal_plan_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_plan_jobs;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meal_plan_job_slots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_plan_job_slots;
  END IF;
END $$;

-- ─── claim_next_meal_plan_job RPC ──────────────────────────────────────────
-- Atomically pick the oldest queued/running job using FOR UPDATE SKIP LOCKED
-- so multiple worker invocations never grab the same job. Sets the job to
-- 'running' on first claim and stamps started_at.

CREATE OR REPLACE FUNCTION public.claim_next_meal_plan_job()
RETURNS public.meal_plan_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job public.meal_plan_jobs;
BEGIN
  SELECT * INTO job
  FROM public.meal_plan_jobs
  WHERE status IN ('queued', 'running')
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    UPDATE public.meal_plan_jobs
    SET status = 'running',
        started_at = COALESCE(started_at, now())
    WHERE id = job.id
    RETURNING * INTO job;
    RETURN job;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_meal_plan_job() FROM public, anon, authenticated;
-- Only service role calls this from the worker function.

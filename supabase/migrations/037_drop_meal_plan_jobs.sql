-- Migration 037 — Drop async meal-plan job queue (v3.0.0)
--
-- The per-user async generation pipeline (mig 031) is retired in v3.0. The
-- weekly drop replaces per-user weekly plan generation; per-meal AI swaps
-- are synchronous and don't need the worker queue.
--
-- This migration drops:
--   * meal_plan_job_slots (FK to meal_plan_jobs, dropped first)
--   * meal_plan_jobs
--   * claim_next_meal_plan_job() RPC
--
-- pg_cron / pg_net stay (used by recipe-bank-refresher and the new
-- weekly-drop-generator).
--
-- Idempotent — DROP IF EXISTS.

DROP FUNCTION IF EXISTS public.claim_next_meal_plan_job();
DROP TABLE IF EXISTS public.meal_plan_job_slots CASCADE;
DROP TABLE IF EXISTS public.meal_plan_jobs CASCADE;

-- Realtime publication: rows are removed automatically when the tables go.

-- Verify after migrating with:
--   SELECT relname FROM pg_class
--   WHERE relname IN ('meal_plan_jobs', 'meal_plan_job_slots');
-- (Expected: 0 rows.)

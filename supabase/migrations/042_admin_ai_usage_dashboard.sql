-- Migration 042: Admin AI usage dashboard + system-user spend tracking
--
-- Three pieces:
--   (a) Self-heal `ai_usage` schema in case earlier migrations didn't fully
--       land in this environment (idempotent ADD COLUMN IF NOT EXISTS for the
--       context fields that mig 021 introduced).
--   (b) Widen the action_type CHECK constraint to include the new system
--       buckets (bank_seed / bank_refresh / auditor) so cron functions and
--       seed scripts can log their Anthropic spend.
--   (c) Add a synthetic "system" profile so service-role writers don't have
--       to invent fake user_ids, plus the bucketer + dashboard RPC.

-- ─── (a) Self-heal — ensure mig 021's columns exist ──────────────────────
ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS session_id      uuid,
  ADD COLUMN IF NOT EXISTS feature_context text,
  ADD COLUMN IF NOT EXISTS scope           text;

-- ─── (b) Widen action_type CHECK to include system buckets ───────────────
ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_action_type_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_action_type_check
  CHECK (action_type IN (
    'recipe_import_url', 'recipe_import_photo',
    'meal_plan', 'meal_plan_edit',
    'nlp_action',
    'chat', 'chat_recipe_import',
    'event_plan', 'event_plan_refine',
    -- v3.0 system buckets (no human user behind these calls):
    'bank_seed',     -- one-shot seeder scripts (scripts/seed-recipe-bank-*.mjs)
    'bank_refresh',  -- recipe-bank-refresher cron edge fn
    'auditor'        -- auditor-from-imports edge fn
  ));

-- ─── (c) Allow NULL user_id for system rows ──────────────────────────────
-- mig 018 declared `user_id uuid NOT NULL REFERENCES profiles(id) ...`. The
-- profiles FK chains to auth.users so we can't synthesize a "system" user
-- without polluting the auth schema. Easier: relax NOT NULL so service-role
-- writers (recipe-bank-refresher, auditor-from-imports, seed scripts) can
-- log spend with user_id=NULL. Real-user rows still carry their user_id.
-- The "Users can insert own ai_usage" RLS policy is unaffected — anon /
-- authenticated still need auth.uid() = user_id; only service_role bypasses.
ALTER TABLE ai_usage ALTER COLUMN user_id DROP NOT NULL;

-- Bucket each granular action_type into a higher-level "purpose" so the
-- dashboard can show meaningful product surfaces instead of internal opcodes.
CREATE OR REPLACE FUNCTION ai_usage_purpose(p_action_type text)
RETURNS text AS $$
  SELECT CASE
    WHEN p_action_type IN ('recipe_import_url', 'recipe_import_photo', 'chat_recipe_import') THEN 'recipe_import'
    WHEN p_action_type IN ('meal_plan', 'meal_plan_edit')                                    THEN 'meal_planning'
    WHEN p_action_type IN ('event_plan', 'event_plan_refine')                                THEN 'event_planning'
    WHEN p_action_type = 'chat'                                                              THEN 'ai_chat'
    WHEN p_action_type = 'nlp_action'                                                        THEN 'nlp'
    WHEN p_action_type IN ('bank_seed', 'bank_refresh')                                      THEN 'bank_seeding'
    WHEN p_action_type = 'auditor'                                                           THEN 'auditor'
    ELSE 'other'
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Single-call dashboard aggregator. Returns a JSON object with all the
-- rollups the dashboard renders so the website does ONE round-trip.
CREATE OR REPLACE FUNCTION admin_ai_usage_summary(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS jsonb AS $$
  WITH base AS (
    SELECT
      u.id,
      u.user_id,
      u.action_type,
      ai_usage_purpose(u.action_type) AS purpose,
      COALESCE(u.model_used, 'unknown') AS model,
      u.tokens_in,
      u.tokens_out,
      u.api_cost_usd AS cost,
      u.created_at,
      u.feature_context
    FROM ai_usage u
    WHERE u.created_at >= p_from
      AND u.created_at <  p_to
  ),
  totals AS (
    SELECT
      COUNT(*)::bigint                    AS calls,
      COALESCE(SUM(tokens_in), 0)::bigint AS tokens_in,
      COALESCE(SUM(tokens_out), 0)::bigint AS tokens_out,
      COALESCE(SUM(cost), 0)::numeric     AS cost,
      COUNT(DISTINCT user_id)::bigint     AS unique_users
    FROM base
  ),
  daily AS (
    SELECT
      date_trunc('day', created_at) AS day,
      purpose,
      COUNT(*)::bigint              AS calls,
      SUM(tokens_in)::bigint        AS tokens_in,
      SUM(tokens_out)::bigint       AS tokens_out,
      SUM(cost)::numeric            AS cost
    FROM base
    GROUP BY 1, 2
  ),
  by_purpose AS (
    SELECT
      purpose,
      COUNT(*)::bigint        AS calls,
      SUM(tokens_in)::bigint  AS tokens_in,
      SUM(tokens_out)::bigint AS tokens_out,
      SUM(cost)::numeric      AS cost
    FROM base
    GROUP BY purpose
  ),
  by_action AS (
    SELECT
      action_type,
      purpose,
      COUNT(*)::bigint        AS calls,
      SUM(tokens_in)::bigint  AS tokens_in,
      SUM(tokens_out)::bigint AS tokens_out,
      SUM(cost)::numeric      AS cost
    FROM base
    GROUP BY action_type, purpose
  ),
  by_model AS (
    SELECT
      model,
      COUNT(*)::bigint        AS calls,
      SUM(tokens_in)::bigint  AS tokens_in,
      SUM(tokens_out)::bigint AS tokens_out,
      SUM(cost)::numeric      AS cost
    FROM base
    GROUP BY model
  ),
  by_user AS (
    SELECT
      b.user_id,
      CASE
        WHEN b.user_id IS NULL THEN '(system)'
        ELSE COALESCE(p.email, '(deleted user)')
      END AS email,
      COUNT(*)::bigint        AS calls,
      SUM(b.tokens_in)::bigint  AS tokens_in,
      SUM(b.tokens_out)::bigint AS tokens_out,
      SUM(b.cost)::numeric      AS cost
    FROM base b
    LEFT JOIN profiles p ON p.id = b.user_id
    GROUP BY b.user_id, p.email
    ORDER BY SUM(b.cost) DESC NULLS LAST
    LIMIT 25
  ),
  by_feature AS (
    SELECT
      COALESCE(feature_context, '(none)') AS feature_context,
      COUNT(*)::bigint        AS calls,
      SUM(cost)::numeric      AS cost
    FROM base
    GROUP BY feature_context
    ORDER BY SUM(cost) DESC NULLS LAST
    LIMIT 25
  ),
  hour_of_day AS (
    SELECT
      EXTRACT(dow  FROM created_at AT TIME ZONE 'UTC')::int AS dow,
      EXTRACT(hour FROM created_at AT TIME ZONE 'UTC')::int AS hour,
      COUNT(*)::bigint   AS calls,
      SUM(cost)::numeric AS cost
    FROM base
    GROUP BY 1, 2
  ),
  date_bounds AS (
    SELECT
      MIN(created_at) AS first_event_at,
      MAX(created_at) AS last_event_at
    FROM ai_usage
  )
  SELECT jsonb_build_object(
    'range',          jsonb_build_object('from', p_from, 'to', p_to),
    'data_bounds',    (SELECT to_jsonb(date_bounds.*) FROM date_bounds),
    'totals',         (SELECT to_jsonb(totals.*) FROM totals),
    'daily',          COALESCE((SELECT jsonb_agg(to_jsonb(daily.*) ORDER BY day) FROM daily), '[]'::jsonb),
    'by_purpose',     COALESCE((SELECT jsonb_agg(to_jsonb(by_purpose.*) ORDER BY cost DESC NULLS LAST) FROM by_purpose), '[]'::jsonb),
    'by_action',      COALESCE((SELECT jsonb_agg(to_jsonb(by_action.*)  ORDER BY cost DESC NULLS LAST) FROM by_action), '[]'::jsonb),
    'by_model',       COALESCE((SELECT jsonb_agg(to_jsonb(by_model.*)   ORDER BY cost DESC NULLS LAST) FROM by_model), '[]'::jsonb),
    'by_user',        COALESCE((SELECT jsonb_agg(to_jsonb(by_user.*)) FROM by_user), '[]'::jsonb),
    'by_feature',     COALESCE((SELECT jsonb_agg(to_jsonb(by_feature.*)) FROM by_feature), '[]'::jsonb),
    'hour_of_day',    COALESCE((SELECT jsonb_agg(to_jsonb(hour_of_day.*)) FROM hour_of_day), '[]'::jsonb)
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Lock down: only service_role may call this RPC. The edge function uses
-- SUPABASE_SERVICE_ROLE_KEY after password-gating the request.
REVOKE EXECUTE ON FUNCTION admin_ai_usage_summary(timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_ai_usage_summary(timestamptz, timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION admin_ai_usage_summary(timestamptz, timestamptz) TO service_role;

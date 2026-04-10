-- Migration 018: Subscriptions and AI Usage Tracking
-- New pricing model: Free (all features) / AI Individual $4.99/mo / AI Family $6.99/mo

-- ============================================
-- 1. Subscriptions table
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'ai_individual', 'ai_family')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz DEFAULT now() + interval '30 days',
  stripe_subscription_id text, -- TODO: Replace with Stripe integration
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS: users can read their own subscription
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. AI Usage table
-- ============================================
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('recipe_import_url', 'recipe_import_photo', 'meal_plan', 'nlp_action')),
  api_cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  model_used text NOT NULL DEFAULT 'claude-haiku-4-5',
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS: users can read their own usage, insert via service role only
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai_usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Insert policy: users can insert their own usage (edge function uses user's auth context)
CREATE POLICY "Users can insert own ai_usage"
  ON ai_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for fast monthly usage queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_period
  ON ai_usage(user_id, period_start);

-- ============================================
-- 3. Function: get_user_monthly_usage
-- ============================================
CREATE OR REPLACE FUNCTION get_user_monthly_usage(p_user_id uuid)
RETURNS TABLE(total_cost numeric, usage_count bigint) AS $$
  SELECT
    COALESCE(SUM(api_cost_usd), 0) AS total_cost,
    COUNT(*) AS usage_count
  FROM ai_usage
  WHERE user_id = p_user_id
    AND period_start = (
      SELECT current_period_start
      FROM subscriptions
      WHERE user_id = p_user_id
      LIMIT 1
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- 4. Default all existing users to free plan
-- ============================================
INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'free', 'active'
FROM profiles
ON CONFLICT (user_id) DO NOTHING;

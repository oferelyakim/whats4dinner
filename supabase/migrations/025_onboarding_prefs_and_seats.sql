-- 025: Onboarding preferences + Family plan seat roster
-- Adds per-user diet + meal prefs captured during onboarding,
-- and a subscription_seats table to enforce the AI Family plan 4-seat cap.

-- ============================================
-- 1. Profile preference columns (diet + meal prefs)
-- ============================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS diet text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meal_preferences jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.diet IS
  'Dietary tags chosen in onboarding (vegetarian, vegan, kosher, halal, gluten-free, dairy-free, nut-free, pescatarian, low-carb, none). Free-form so future tags are additive.';
COMMENT ON COLUMN profiles.meal_preferences IS
  'Shape: { skill_level: 1-5, cook_time_pref: "quick"|"medium"|"project", spice_level: 1-5, disliked_ingredients: string[] }. Optional fields.';

-- ============================================
-- 2. subscription_seats — Family plan roster
-- ============================================
-- Explicit list of accounts that share an AI Family subscription.
-- The subscribing user (owner) is seeded on subscription creation.
-- Soft cap of 4 seats (owner + 3) is enforced in app code via useAIAccess;
-- the DB enforces uniqueness and ownership but not the 4-count (so owner
-- can temporarily hold >4 during a seat swap).
CREATE TABLE IF NOT EXISTS subscription_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_seats_subscription
  ON subscription_seats(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_seats_user
  ON subscription_seats(user_id);

ALTER TABLE subscription_seats ENABLE ROW LEVEL SECURITY;

-- A user can see rows for subscriptions they own OR are a seat on.
DROP POLICY IF EXISTS "Users can read their seats" ON subscription_seats;
CREATE POLICY "Users can read their seats"
  ON subscription_seats FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_seats.subscription_id
        AND s.user_id = auth.uid()
    )
  );

-- Only the subscription owner can add seats.
DROP POLICY IF EXISTS "Owner can add seats" ON subscription_seats;
CREATE POLICY "Owner can add seats"
  ON subscription_seats FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_id
        AND s.user_id = auth.uid()
    )
  );

-- Only the subscription owner can remove seats.
DROP POLICY IF EXISTS "Owner can remove seats" ON subscription_seats;
CREATE POLICY "Owner can remove seats"
  ON subscription_seats FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_id
        AND s.user_id = auth.uid()
    )
  );

-- ============================================
-- 3. Security-definer function: does this user have an active Family seat?
-- ============================================
-- Lets the client cheaply check "am I on a Family plan (directly or via a seat)?"
-- without exposing the full subscriptions row of another user.
CREATE OR REPLACE FUNCTION has_active_family_seat(p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM subscription_seats ss
    JOIN subscriptions s ON s.id = ss.subscription_id
    WHERE ss.user_id = p_user_id
      AND s.plan = 'ai_family'
      AND s.status = 'active'
      AND s.current_period_end >= now()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 4. Backfill: seed existing ai_family subscribers as owner seats
-- ============================================
INSERT INTO subscription_seats (subscription_id, user_id, role)
SELECT id, user_id, 'owner'
FROM subscriptions
WHERE plan = 'ai_family'
ON CONFLICT (subscription_id, user_id) DO NOTHING;

-- Migration 028: Subscription seat invites + single-tier billing
-- - Makes user_id nullable so rows can be "pending invite" (email-only)
-- - Adds pending_email + invited_at columns
-- - Adds a partial unique index on (subscription_id, lower(pending_email)) for pending rows
-- - Adds CHECK ensuring a row has user_id XOR pending_email
-- - Replaces has_active_family_seat() — any active sub (not just ai_family) grants seat access
-- - New security-definer function claim_seat_by_email() to redeem pending invites
-- - Adds trial_end + billing_period columns to subscriptions for Stripe trial support

-- ============================================
-- 1. Subscriptions: add billing_period + trial_end columns
-- ============================================
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_period text CHECK (billing_period IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS trial_end timestamptz;

-- Widen plan check to allow the new 'monthly'/'annual' plan values alongside legacy values.
-- We do this by replacing the constraint (Postgres doesn't support ALTER CHECK directly).
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free', 'ai_individual', 'ai_family', 'monthly', 'annual'));

-- ============================================
-- 2. subscription_seats: make user_id nullable
-- ============================================
ALTER TABLE subscription_seats
  ALTER COLUMN user_id DROP NOT NULL;

-- ============================================
-- 3. subscription_seats: add pending invite columns
-- ============================================
ALTER TABLE subscription_seats
  ADD COLUMN IF NOT EXISTS pending_email text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz;

-- ============================================
-- 4. Partial unique index for pending email invites
-- Only applies when pending_email is set and user_id is NULL.
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS subscription_seats_sub_email_idx
  ON subscription_seats (subscription_id, lower(pending_email))
  WHERE pending_email IS NOT NULL AND user_id IS NULL;

-- ============================================
-- 5. CHECK: a row must have exactly one of user_id or pending_email
-- ============================================
ALTER TABLE subscription_seats DROP CONSTRAINT IF EXISTS seat_target_chk;
ALTER TABLE subscription_seats ADD CONSTRAINT seat_target_chk
  CHECK ((user_id IS NULL) <> (pending_email IS NULL));

-- ============================================
-- 6. Replace has_active_family_seat() — plan-agnostic
-- Any active subscription (with a current period end in the future) grants AI
-- to its seat-holders, regardless of plan name. This supports the new single-tier
-- 'monthly'/'annual' plans as well as legacy 'ai_family'.
-- ============================================
CREATE OR REPLACE FUNCTION has_active_family_seat(p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM subscription_seats ss
    JOIN subscriptions s ON s.id = ss.subscription_id
    WHERE ss.user_id = p_user_id
      AND s.status = 'active'
      AND s.current_period_end >= now()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 7. New function: claim_seat_by_email
-- Called on first profile load (or auth signup) to convert a pending email invite
-- into a real seat for the newly authenticated user.
-- ============================================
CREATE OR REPLACE FUNCTION claim_seat_by_email(p_email text)
RETURNS SETOF subscription_seats AS $$
DECLARE
  v_row subscription_seats;
BEGIN
  UPDATE subscription_seats
  SET
    user_id      = auth.uid(),
    pending_email = NULL,
    invited_at   = invited_at  -- preserve original invite timestamp
  WHERE lower(pending_email) = lower(p_email)
    AND user_id IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NOT NULL THEN
    RETURN NEXT v_row;
  END IF;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. Notify PostgREST to reload schema
-- ============================================
NOTIFY pgrst, 'reload schema';

-- 021: AI meal planning + event planning schema additions

-- Events: headcount columns + AI planning status
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS headcount_adults integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS headcount_kids integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_plan_status text DEFAULT 'none'
    CHECK (ai_plan_status IN ('none', 'generating', 'complete', 'failed'));

-- AI usage: add tracking context fields
ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS feature_context text,
  ADD COLUMN IF NOT EXISTS scope text;

-- Extend action_type constraint to include new event planning types
ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_action_type_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_action_type_check
  CHECK (action_type IN (
    'recipe_import_url', 'recipe_import_photo',
    'meal_plan', 'meal_plan_edit',
    'nlp_action',
    'chat', 'chat_recipe_import',
    'event_plan', 'event_plan_refine'
  ));

-- Credit packs stub table (schema only, not active yet)
CREATE TABLE IF NOT EXISTS credit_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  credits_purchased integer NOT NULL,
  credits_remaining integer NOT NULL,
  pack_type text NOT NULL,
  expires_at timestamptz,
  stripe_payment_intent_id text,
  created_at timestamptz DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'credit_packs'
  ) THEN
    ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- RLS for credit_packs
DROP POLICY IF EXISTS "Users can view own packs" ON credit_packs;
CREATE POLICY "Users can view own packs" ON credit_packs
  FOR SELECT USING (auth.uid() = user_id);

-- Migration 019: AI Chat usage tracking
-- Adds 'chat' and 'chat_recipe_import' action types for the AI chat helper feature

-- ============================================
-- 1. Update ai_usage action_type constraint
-- ============================================
ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_action_type_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_action_type_check
  CHECK (action_type IN ('recipe_import_url', 'recipe_import_photo', 'meal_plan', 'nlp_action', 'chat', 'chat_recipe_import'));

-- ============================================
-- 2. Function: get_free_recipe_import_count
-- Returns monthly count of free recipe imports via chat
-- ============================================
CREATE OR REPLACE FUNCTION get_free_recipe_import_count(p_user_id uuid)
RETURNS integer AS $$
  SELECT COALESCE(COUNT(*), 0)::integer
  FROM ai_usage
  WHERE user_id = p_user_id
    AND action_type = 'chat_recipe_import'
    AND created_at >= date_trunc('month', now());
$$ LANGUAGE sql SECURITY DEFINER;

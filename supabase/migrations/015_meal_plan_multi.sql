-- Allow multiple recipes/menus per meal slot
-- Remove the unique constraint that limits to 1 per slot
ALTER TABLE public.meal_plans DROP CONSTRAINT IF EXISTS meal_plans_circle_id_plan_date_meal_type_key;

NOTIFY pgrst, 'reload schema';

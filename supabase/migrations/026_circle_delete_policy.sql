-- 026: Allow circle creators to delete their circles
--
-- Why: migrations 002 + 008 set up SELECT / INSERT / UPDATE policies on
-- public.circles, but never added a DELETE policy. With RLS enabled and no
-- DELETE policy, every DELETE silently affects 0 rows and returns no error,
-- so CircleDetailPage's "Delete circle" button looked successful but did
-- nothing. All child tables (circle_members, items, recipes, meal_plans,
-- shopping_lists, stores, events, activities, chores, …) already have
-- ON DELETE CASCADE, so a single owner-scoped DELETE policy is sufficient.

DROP POLICY IF EXISTS "Owner can delete circle" ON public.circles;
CREATE POLICY "Owner can delete circle"
  ON public.circles FOR DELETE
  USING (created_by = auth.uid());

NOTIFY pgrst, 'reload schema';

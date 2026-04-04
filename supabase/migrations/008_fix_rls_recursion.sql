-- Fix infinite recursion in circle_members RLS
-- The problem: circle_members SELECT policy checks circle_members, causing infinite loop

-- Drop the problematic policies
drop policy if exists "Members can view their circles" on public.circles;
drop policy if exists "Members can view circle members" on public.circle_members;
drop policy if exists "Owner/admin can update circle" on public.circles;
drop policy if exists "Owner/admin can remove members" on public.circle_members;
drop policy if exists "Users can leave circles" on public.circle_members;
drop policy if exists "Users can join circles" on public.circle_members;
drop policy if exists "Circle members can view each other profiles" on public.profiles;

-- Fix: use auth.uid() directly with a security definer function to avoid recursion
create or replace function public.get_my_circle_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select circle_id from public.circle_members where user_id = auth.uid();
$$;

-- Circles: members can see their circles (uses function to avoid recursion)
create policy "Members can view their circles"
  on public.circles for select
  using (id in (select public.get_my_circle_ids()));

-- Circle update: owner/admin only
create policy "Owner/admin can update circle"
  on public.circles for update
  using (
    id in (
      select circle_id from public.circle_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Circle members: use the function to check membership without recursion
create policy "Members can view circle members"
  on public.circle_members for select
  using (circle_id in (select public.get_my_circle_ids()));

-- Join circle: any authenticated user can insert themselves
create policy "Users can join circles"
  on public.circle_members for insert
  with check (auth.uid() = user_id);

-- Leave circle: users can remove themselves
create policy "Users can leave circles"
  on public.circle_members for delete
  using (auth.uid() = user_id);

-- Owner/admin can remove members (uses function)
create policy "Owner/admin can remove members"
  on public.circle_members for delete
  using (
    circle_id in (
      select circle_id from public.circle_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Profiles: members can see profiles within their circles (uses function)
create policy "Circle members can view each other profiles"
  on public.profiles for select
  using (
    id in (
      select user_id from public.circle_members
      where circle_id in (select public.get_my_circle_ids())
    )
  );

-- Now fix all other policies that reference circle_members indirectly

-- Items
drop policy if exists "Users can view own and circle items" on public.items;
create policy "Users can view own and circle items"
  on public.items for select
  using (
    created_by = auth.uid()
    or circle_id in (select public.get_my_circle_ids())
  );

-- Recipes
drop policy if exists "Users can view own and circle recipes" on public.recipes;
create policy "Users can view own and circle recipes"
  on public.recipes for select
  using (
    created_by = auth.uid()
    or circle_id in (select public.get_my_circle_ids())
  );

-- Meal menus
drop policy if exists "Users can view own and circle menus" on public.meal_menus;
create policy "Users can view own and circle menus"
  on public.meal_menus for select
  using (
    created_by = auth.uid()
    or circle_id in (select public.get_my_circle_ids())
  );

-- Meal plans
drop policy if exists "Circle members can view meal plans" on public.meal_plans;
drop policy if exists "Circle members can manage meal plans" on public.meal_plans;
create policy "Circle members can view meal plans"
  on public.meal_plans for select
  using (circle_id in (select public.get_my_circle_ids()));
create policy "Circle members can manage meal plans"
  on public.meal_plans for all
  using (circle_id in (select public.get_my_circle_ids()));

-- Stores
drop policy if exists "Users can view own and circle stores" on public.stores;
create policy "Users can view own and circle stores"
  on public.stores for select
  using (
    created_by = auth.uid()
    or circle_id in (select public.get_my_circle_ids())
  );

-- Events (if table exists from migration 007)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'events') then
    execute 'drop policy if exists "Event visibility" on public.events';
    execute '
      create policy "Event visibility"
        on public.events for select
        using (
          created_by = auth.uid()
          or circle_id in (select public.get_my_circle_ids())
          or id in (select event_id from public.event_participants where user_id = auth.uid())
        )';
  end if;
end $$;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

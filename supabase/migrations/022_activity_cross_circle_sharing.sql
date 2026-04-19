-- Activity cross-circle sharing
-- Lets a creator share an activity from its home circle with people in other
-- circles (e.g., co-parent's household, grandparents' circle). Visibility =
-- home circle members PLUS anyone who belongs to any circle listed in
-- shared_with_circles.

alter table public.activities
  add column if not exists shared_with_circles uuid[] not null default '{}';

create index if not exists activities_shared_circles_idx
  on public.activities using gin (shared_with_circles);

-- Helper: array of all circle_ids the calling user belongs to.
-- Wraps the existing set-returning get_my_circle_ids() for use with the
-- PostgreSQL array overlap operator (&&).
create or replace function public.get_my_circle_ids_array()
returns uuid[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(circle_id), '{}'::uuid[])
  from public.circle_members
  where user_id = auth.uid()
$$;

-- Rebuild SELECT policy to include shared circles.
drop policy if exists "Circle members can view activities" on public.activities;
drop policy if exists "Members and shared circles can view activities" on public.activities;

create policy "Members and shared circles can view activities"
  on public.activities for select
  using (
    circle_id in (select public.get_my_circle_ids())
    or shared_with_circles && public.get_my_circle_ids_array()
    or created_by = auth.uid()
  );

-- Allow the creator to always update/delete their own activity even if they
-- later leave the home circle (prevents orphaned shares).
drop policy if exists "Creator can update activities" on public.activities;
drop policy if exists "Creator can delete activities" on public.activities;

create policy "Creator can update activities"
  on public.activities for update
  using (created_by = auth.uid());

create policy "Creator can delete activities"
  on public.activities for delete
  using (created_by = auth.uid());

notify pgrst, 'reload schema';

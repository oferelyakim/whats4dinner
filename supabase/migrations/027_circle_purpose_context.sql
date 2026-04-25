-- Migration 027: Circle purpose + AI context
-- Adds purpose, circle_type, and a freeform AI-consumable context blob
-- so onboarding (now circle-creation-driven) can capture what the circle is
-- about and feed it to AI prompts (meal planning, event planning, chat).

alter table public.circles
  add column if not exists purpose text,
  add column if not exists circle_type text
    check (circle_type in ('family','event','roommates','friends','other')),
  add column if not exists context jsonb not null default '{}'::jsonb;

-- Replace create_circle_with_owner to accept the new fields.
-- Existing callers pass only (p_name, p_icon) — defaults preserve behavior.
create or replace function public.create_circle_with_owner(
  p_name text,
  p_icon text default '👨‍👩‍👧‍👦',
  p_purpose text default null,
  p_circle_type text default null,
  p_context jsonb default '{}'::jsonb
)
returns public.circles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_circle public.circles;
begin
  insert into public.circles (name, icon, created_by, purpose, circle_type, context)
  values (p_name, p_icon, auth.uid(), p_purpose, p_circle_type, coalesce(p_context, '{}'::jsonb))
  returning * into v_circle;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle.id, auth.uid(), 'owner');

  return v_circle;
end;
$$;

-- Allow owner/admin to update purpose/type/context via existing RLS update policy.
-- (No new policy needed — migration 002 already grants update to owner/admin.)

notify pgrst, 'reload schema';

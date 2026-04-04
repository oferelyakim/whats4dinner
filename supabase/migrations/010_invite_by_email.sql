-- Function to add a user to a circle by email
-- Returns the circle_members row if successful, null if user not found
create or replace function public.invite_to_circle_by_email(
  p_circle_id uuid,
  p_email text
)
returns public.circle_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_member public.circle_members;
begin
  -- Check caller is owner/admin of the circle
  if not exists (
    select 1 from public.circle_members
    where circle_id = p_circle_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only circle owners and admins can invite members';
  end if;

  -- Find user by email
  select id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'No user found with that email. They need to sign up first.';
  end if;

  -- Add as member (ignore if already exists)
  insert into public.circle_members (circle_id, user_id, role)
  values (p_circle_id, v_user_id, 'member')
  on conflict (circle_id, user_id) do nothing
  returning * into v_member;

  if v_member is null then
    raise exception 'User is already a member of this circle';
  end if;

  return v_member;
end;
$$;

-- Allow anyone to look up a circle by invite code (for the join page)
-- Only exposes name and icon, not full circle data
create or replace function public.get_circle_by_invite_code(p_code text)
returns table(name text, icon text)
language sql
security definer
stable
set search_path = ''
as $$
  select name, icon from public.circles where invite_code = p_code limit 1;
$$;

notify pgrst, 'reload schema';

-- Function to create a circle and add the creator as owner atomically
create or replace function public.create_circle_with_owner(
  p_name text,
  p_icon text default '👨‍👩‍👧‍👦'
)
returns public.circles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_circle public.circles;
begin
  insert into public.circles (name, icon, created_by)
  values (p_name, p_icon, auth.uid())
  returning * into v_circle;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle.id, auth.uid(), 'owner');

  return v_circle;
end;
$$;

notify pgrst, 'reload schema';

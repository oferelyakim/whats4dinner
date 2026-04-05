-- Event items: unified table for dishes, supplies, and tasks
create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  type text not null check (type in ('dish', 'supply', 'task')),
  name text not null,
  category text not null default 'other',
  quantity integer,
  recipe_id uuid references public.recipes(id) on delete set null,
  meal_slot text,
  assigned_to uuid references public.profiles(id) on delete set null,
  guest_name text,
  notes text,
  due_at timestamptz,
  status text not null default 'unclaimed' check (status in ('unclaimed', 'claimed', 'in_progress', 'done')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index event_items_event_idx on public.event_items(event_id);
create index event_items_type_idx on public.event_items(event_id, type);

alter table public.event_items enable row level security;

-- Event organizers (co-hosts)
create table public.event_organizers (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, user_id)
);

alter table public.event_organizers enable row level security;

-- Helper: check if user is organizer of an event
create or replace function public.is_event_organizer(p_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists(
    select 1 from public.events where id = p_event_id and created_by = auth.uid()
    union
    select 1 from public.event_organizers where event_id = p_event_id and user_id = auth.uid()
  );
$$;

-- Helper: check if user can see event
create or replace function public.can_see_event(p_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists(
    select 1 from public.events where id = p_event_id and created_by = auth.uid()
    union
    select 1 from public.event_participants where event_id = p_event_id and user_id = auth.uid()
    union
    select 1 from public.event_organizers where event_id = p_event_id and user_id = auth.uid()
  );
$$;

-- RLS for event_items
create policy "Event viewers can see items"
  on public.event_items for select
  using (public.can_see_event(event_id));

create policy "Organizers can manage items"
  on public.event_items for all
  using (public.is_event_organizer(event_id));

create policy "Participants can add items"
  on public.event_items for insert
  with check (public.can_see_event(event_id));

create policy "Anyone can claim/update items they're assigned to"
  on public.event_items for update
  using (assigned_to = auth.uid() or public.is_event_organizer(event_id));

-- RLS for event_organizers
create policy "Event viewers can see organizers"
  on public.event_organizers for select
  using (public.can_see_event(event_id));

create policy "Event creator can manage organizers"
  on public.event_organizers for all
  using (
    event_id in (select id from public.events where created_by = auth.uid())
  );

-- Update events RLS to include organizers
drop policy if exists "Event creator can update" on public.events;
create policy "Organizers can update event"
  on public.events for update
  using (public.is_event_organizer(id));

-- Function to join event by invite code (like circles)
create or replace function public.join_event_by_invite(p_code text)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where invite_code = p_code;

  if v_event is null then
    raise exception 'Invalid event code';
  end if;

  insert into public.event_participants (event_id, user_id, status)
  values (v_event.id, auth.uid(), 'attending')
  on conflict do nothing;

  return v_event;
end;
$$;

-- Function to look up event by invite code (public, for join page)
create or replace function public.get_event_by_invite_code(p_code text)
returns table(name text, event_date timestamptz, location text, description text)
language sql
security definer
stable
set search_path = ''
as $$
  select name, event_date, location, description
  from public.events where invite_code = p_code limit 1;
$$;

-- Function to create event (avoids RLS insert+select issue)
create or replace function public.create_event_with_organizer(
  p_name text,
  p_description text default null,
  p_event_date timestamptz default null,
  p_location text default null,
  p_circle_id uuid default null
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  insert into public.events (name, description, event_date, location, circle_id, created_by)
  values (p_name, p_description, p_event_date, p_location, p_circle_id, auth.uid())
  returning * into v_event;

  -- Add creator as participant
  insert into public.event_participants (event_id, user_id, status)
  values (v_event.id, auth.uid(), 'attending');

  -- Add creator as organizer
  insert into public.event_organizers (event_id, user_id)
  values (v_event.id, auth.uid());

  return v_event;
end;
$$;

-- Enable realtime for event_items
alter publication supabase_realtime add table public.event_items;

notify pgrst, 'reload schema';

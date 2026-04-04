-- Recipe shares (public links, no account needed to view)
create table public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  share_code text not null unique default encode(gen_random_bytes(6), 'base64url'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index recipe_shares_code_idx on public.recipe_shares(share_code);
create index recipe_shares_recipe_idx on public.recipe_shares(recipe_id);

alter table public.recipe_shares enable row level security;

-- Anyone can read a share by code (public access for shared recipes)
create policy "Anyone can view shared recipes by code"
  on public.recipe_shares for select
  using (true);

-- Only recipe owner can create/manage shares
create policy "Recipe owner can create shares"
  on public.recipe_shares for insert
  with check (
    recipe_id in (select id from public.recipes where created_by = auth.uid())
  );

create policy "Recipe owner can delete shares"
  on public.recipe_shares for delete
  using (created_by = auth.uid());

-- Allow public read on recipes that have an active share
create policy "Public can view shared recipes"
  on public.recipes for select
  using (
    id in (
      select recipe_id from public.recipe_shares
      where (expires_at is null or expires_at > now())
    )
  );

-- Allow public read on ingredients of shared recipes
create policy "Public can view shared recipe ingredients"
  on public.recipe_ingredients for select
  using (
    recipe_id in (
      select recipe_id from public.recipe_shares
      where (expires_at is null or expires_at > now())
    )
  );

-- Events (potluck / dinner party)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  event_date timestamptz,
  location text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete set null,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger events_updated_at
  before update on public.events
  for each row execute function public.update_updated_at();

alter table public.events enable row level security;

-- Event participants
create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  guest_name text,
  guest_email text,
  status text not null default 'invited' check (status in ('invited', 'attending', 'declined')),
  joined_at timestamptz not null default now(),
  -- Either user_id or guest_name must be set
  constraint participant_identity check (user_id is not null or guest_name is not null)
);

create index event_participants_event_idx on public.event_participants(event_id);

alter table public.event_participants enable row level security;

-- Event assignments (who brings what)
create table public.event_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  guest_name text,
  dish_name text not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  category text not null default 'other' check (category in ('appetizer', 'main', 'side', 'dessert', 'drink', 'other')),
  notes text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed')),
  created_at timestamptz not null default now()
);

create index event_assignments_event_idx on public.event_assignments(event_id);

alter table public.event_assignments enable row level security;

-- Event RLS: creator, circle members, and participants can see events
create policy "Event visibility"
  on public.events for select
  using (
    created_by = auth.uid()
    or circle_id in (select circle_id from public.circle_members where user_id = auth.uid())
    or id in (select event_id from public.event_participants where user_id = auth.uid())
  );

create policy "Users can create events"
  on public.events for insert
  with check (auth.uid() = created_by);

create policy "Event creator can update"
  on public.events for update
  using (created_by = auth.uid());

create policy "Event creator can delete"
  on public.events for delete
  using (created_by = auth.uid());

-- Participants: visible to anyone who can see the event
create policy "Participants visible to event viewers"
  on public.event_participants for select
  using (
    event_id in (select id from public.events)
  );

create policy "Users can join events"
  on public.event_participants for insert
  with check (user_id = auth.uid() or user_id is null);

create policy "Users can update own participation"
  on public.event_participants for update
  using (user_id = auth.uid());

create policy "Event creator can manage participants"
  on public.event_participants for all
  using (
    event_id in (select id from public.events where created_by = auth.uid())
  );

-- Assignments: visible to event viewers
create policy "Assignments visible to event viewers"
  on public.event_assignments for select
  using (
    event_id in (select id from public.events)
  );

create policy "Event creator can manage assignments"
  on public.event_assignments for all
  using (
    event_id in (select id from public.events where created_by = auth.uid())
  );

create policy "Participants can claim assignments"
  on public.event_assignments for update
  using (
    event_id in (select event_id from public.event_participants where user_id = auth.uid())
  );

create policy "Participants can add assignments"
  on public.event_assignments for insert
  with check (
    event_id in (select event_id from public.event_participants where user_id = auth.uid())
    or event_id in (select id from public.events where created_by = auth.uid())
  );
6
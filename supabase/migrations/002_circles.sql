-- Circles (family/friend groups)
create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text not null default '👨‍👩‍👧‍👦',
  created_by uuid not null references public.profiles(id) on delete cascade,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger circles_updated_at
  before update on public.circles
  for each row execute function public.update_updated_at();

-- Circle members (M:N join)
create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;

-- Circle visibility: members can see circles they belong to
create policy "Members can view their circles"
  on public.circles for select
  using (
    id in (select circle_id from public.circle_members where user_id = auth.uid())
  );

-- Circle creation: any authenticated user
create policy "Authenticated users can create circles"
  on public.circles for insert
  with check (auth.uid() = created_by);

-- Circle update: owner/admin only
create policy "Owner/admin can update circle"
  on public.circles for update
  using (
    id in (
      select circle_id from public.circle_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Circle members: members can see other members
create policy "Members can view circle members"
  on public.circle_members for select
  using (
    circle_id in (select circle_id from public.circle_members where user_id = auth.uid())
  );

-- Join circle: any authenticated user can insert themselves
create policy "Users can join circles"
  on public.circle_members for insert
  with check (auth.uid() = user_id);

-- Leave circle: users can remove themselves
create policy "Users can leave circles"
  on public.circle_members for delete
  using (auth.uid() = user_id);

-- Owner/admin can remove members
create policy "Owner/admin can remove members"
  on public.circle_members for delete
  using (
    circle_id in (
      select circle_id from public.circle_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Profiles: members can see profiles within their circles
create policy "Circle members can view each other profiles"
  on public.profiles for select
  using (
    id in (
      select cm2.user_id from public.circle_members cm1
      join public.circle_members cm2 on cm1.circle_id = cm2.circle_id
      where cm1.user_id = auth.uid()
    )
  );

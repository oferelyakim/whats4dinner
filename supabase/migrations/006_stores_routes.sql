-- Stores
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.stores enable row level security;

create policy "Users can view own and circle stores"
  on public.stores for select
  using (
    created_by = auth.uid()
    or circle_id in (select circle_id from public.circle_members where user_id = auth.uid())
  );

create policy "Users can create stores"
  on public.stores for insert
  with check (auth.uid() = created_by);

create policy "Users can update own stores"
  on public.stores for update
  using (created_by = auth.uid());

create policy "Users can delete own stores"
  on public.stores for delete
  using (created_by = auth.uid());

-- Store routes (ordered departments)
create table public.store_routes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  department text not null,
  sort_order integer not null default 0,
  aisle_hint text,
  unique (store_id, department)
);

create index store_routes_store_idx on public.store_routes(store_id);

alter table public.store_routes enable row level security;

-- Routes follow store visibility
create policy "Users can view store routes"
  on public.store_routes for select
  using (
    store_id in (select id from public.stores)
  );

create policy "Store owner can manage routes"
  on public.store_routes for all
  using (
    store_id in (select id from public.stores where created_by = auth.uid())
  );

-- Add FK from shopping_lists to stores
alter table public.shopping_lists
  add constraint shopping_lists_store_fk
  foreign key (store_id) references public.stores(id) on delete set null;

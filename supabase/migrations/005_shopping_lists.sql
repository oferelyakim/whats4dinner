-- Shopping lists
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  circle_id uuid not null references public.circles(id) on delete cascade,
  store_id uuid,  -- FK added in 006
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_lists_circle_idx on public.shopping_lists(circle_id);

create trigger shopping_lists_updated_at
  before update on public.shopping_lists
  for each row execute function public.update_updated_at();

alter table public.shopping_lists enable row level security;

-- Shopping list access control
create table public.shopping_list_access (
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view', 'edit', 'admin')),
  primary key (list_id, user_id)
);

alter table public.shopping_list_access enable row level security;

-- Users can see lists they created or have access to
create policy "Users can view accessible lists"
  on public.shopping_lists for select
  using (
    created_by = auth.uid()
    or id in (select list_id from public.shopping_list_access where user_id = auth.uid())
  );

create policy "Users can create lists"
  on public.shopping_lists for insert
  with check (auth.uid() = created_by);

create policy "Creators and admins can update lists"
  on public.shopping_lists for update
  using (
    created_by = auth.uid()
    or id in (select list_id from public.shopping_list_access where user_id = auth.uid() and permission = 'admin')
  );

create policy "Creators can delete lists"
  on public.shopping_lists for delete
  using (created_by = auth.uid());

-- Access records: creator and those with access can see
create policy "Users can view list access"
  on public.shopping_list_access for select
  using (
    user_id = auth.uid()
    or list_id in (select id from public.shopping_lists where created_by = auth.uid())
  );

-- Only list creator can grant access
create policy "List creator can manage access"
  on public.shopping_list_access for all
  using (
    list_id in (select id from public.shopping_lists where created_by = auth.uid())
  );

-- Shopping list items
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  menu_id uuid references public.meal_menus(id) on delete set null,
  name text not null,
  quantity decimal,
  unit text not null default '',
  category text not null default 'Other',
  is_checked boolean not null default false,
  checked_by uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 0,
  notes text,
  added_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index shopping_list_items_list_idx on public.shopping_list_items(list_id);

alter table public.shopping_list_items enable row level security;

-- Items follow list access
create policy "Users can view list items"
  on public.shopping_list_items for select
  using (
    list_id in (select id from public.shopping_lists)
  );

-- Users with edit+ access can add items
create policy "Users can add list items"
  on public.shopping_list_items for insert
  with check (
    list_id in (
      select id from public.shopping_lists where created_by = auth.uid()
      union
      select list_id from public.shopping_list_access where user_id = auth.uid() and permission in ('edit', 'admin')
    )
  );

-- Users with edit+ access can update items
create policy "Users can update list items"
  on public.shopping_list_items for update
  using (
    list_id in (
      select id from public.shopping_lists where created_by = auth.uid()
      union
      select list_id from public.shopping_list_access where user_id = auth.uid() and permission in ('edit', 'admin')
    )
  );

-- Users with edit+ access can delete items
create policy "Users can delete list items"
  on public.shopping_list_items for delete
  using (
    list_id in (
      select id from public.shopping_lists where created_by = auth.uid()
      union
      select list_id from public.shopping_list_access where user_id = auth.uid() and permission in ('edit', 'admin')
    )
  );

-- Item requests
create table public.item_requests (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  item_name text not null,
  quantity decimal,
  unit text not null default '',
  recipe_id uuid references public.recipes(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index item_requests_list_idx on public.item_requests(list_id);

alter table public.item_requests enable row level security;

create policy "Users can view requests on accessible lists"
  on public.item_requests for select
  using (
    list_id in (select id from public.shopping_lists)
  );

create policy "Circle members can create requests"
  on public.item_requests for insert
  with check (auth.uid() = requested_by);

create policy "List owner can manage requests"
  on public.item_requests for update
  using (
    list_id in (select id from public.shopping_lists where created_by = auth.uid())
  );

-- Enable realtime for shopping list items
alter publication supabase_realtime add table public.shopping_list_items;

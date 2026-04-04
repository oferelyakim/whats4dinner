-- Profiles table extending Supabase auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  email text not null default '',
  preferences jsonb not null default '{"theme": "dark"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();
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
-- Items (master catalog)
create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Other',
  default_unit text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index items_circle_id_idx on public.items(circle_id);
create index items_name_idx on public.items(name);

alter table public.items enable row level security;

-- Items visible to creator and circle members
create policy "Users can view own and circle items"
  on public.items for select
  using (
    created_by = auth.uid()
    or circle_id in (select circle_id from public.circle_members where user_id = auth.uid())
  );

create policy "Users can create items"
  on public.items for insert
  with check (auth.uid() = created_by);

create policy "Users can update own items"
  on public.items for update
  using (created_by = auth.uid());

create policy "Users can delete own items"
  on public.items for delete
  using (created_by = auth.uid());

-- Recipes
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  instructions text,
  source_url text,
  image_url text,
  prep_time_min integer,
  cook_time_min integer,
  servings integer,
  tags text[] not null default '{}',
  created_by uuid not null references public.profiles(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_circle_id_idx on public.recipes(circle_id);
create index recipes_created_by_idx on public.recipes(created_by);

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.update_updated_at();

alter table public.recipes enable row level security;

create policy "Users can view own and circle recipes"
  on public.recipes for select
  using (
    created_by = auth.uid()
    or circle_id in (select circle_id from public.circle_members where user_id = auth.uid())
  );

create policy "Users can create recipes"
  on public.recipes for insert
  with check (auth.uid() = created_by);

create policy "Users can update own recipes"
  on public.recipes for update
  using (created_by = auth.uid());

create policy "Users can delete own recipes"
  on public.recipes for delete
  using (created_by = auth.uid());

-- Recipe ingredients
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  name text not null,
  quantity decimal,
  unit text not null default '',
  sort_order integer not null default 0,
  notes text
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients(recipe_id);

alter table public.recipe_ingredients enable row level security;

-- Ingredients follow recipe visibility
create policy "Users can view recipe ingredients"
  on public.recipe_ingredients for select
  using (
    recipe_id in (select id from public.recipes)
  );

create policy "Users can manage own recipe ingredients"
  on public.recipe_ingredients for insert
  with check (
    recipe_id in (select id from public.recipes where created_by = auth.uid())
  );

create policy "Users can update own recipe ingredients"
  on public.recipe_ingredients for update
  using (
    recipe_id in (select id from public.recipes where created_by = auth.uid())
  );

create policy "Users can delete own recipe ingredients"
  on public.recipe_ingredients for delete
  using (
    recipe_id in (select id from public.recipes where created_by = auth.uid())
  );
-- Meal menus (recipe collections)
create table public.meal_menus (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger meal_menus_updated_at
  before update on public.meal_menus
  for each row execute function public.update_updated_at();

alter table public.meal_menus enable row level security;

create policy "Users can view own and circle menus"
  on public.meal_menus for select
  using (
    created_by = auth.uid()
    or circle_id in (select circle_id from public.circle_members where user_id = auth.uid())
  );

create policy "Users can create menus"
  on public.meal_menus for insert
  with check (auth.uid() = created_by);

create policy "Users can update own menus"
  on public.meal_menus for update
  using (created_by = auth.uid());

create policy "Users can delete own menus"
  on public.meal_menus for delete
  using (created_by = auth.uid());

-- Meal menu recipes (M:N)
create table public.meal_menu_recipes (
  menu_id uuid not null references public.meal_menus(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (menu_id, recipe_id)
);

alter table public.meal_menu_recipes enable row level security;

create policy "Users can view menu recipes"
  on public.meal_menu_recipes for select
  using (
    menu_id in (select id from public.meal_menus)
  );

create policy "Users can manage own menu recipes"
  on public.meal_menu_recipes for all
  using (
    menu_id in (select id from public.meal_menus where created_by = auth.uid())
  );

-- Meal plans (weekly calendar)
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  plan_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  menu_id uuid references public.meal_menus(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  unique (circle_id, plan_date, meal_type)
);

create index meal_plans_circle_date_idx on public.meal_plans(circle_id, plan_date);

alter table public.meal_plans enable row level security;

create policy "Circle members can view meal plans"
  on public.meal_plans for select
  using (
    circle_id in (select circle_id from public.circle_members where user_id = auth.uid())
  );

create policy "Circle members can manage meal plans"
  on public.meal_plans for all
  using (
    circle_id in (select circle_id from public.circle_members where user_id = auth.uid())
  );
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

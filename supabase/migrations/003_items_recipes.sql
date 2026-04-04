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

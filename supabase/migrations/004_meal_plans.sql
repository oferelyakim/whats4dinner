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

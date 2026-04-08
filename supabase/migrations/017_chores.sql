-- Chores feature: chore definitions and completions tracking

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  name text not null,
  description text,
  icon text default '🧹',
  assigned_to uuid references public.profiles(id),
  assigned_name text,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'once')),
  recurrence_days integer[] default '{}',
  due_time time,
  points integer default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chore_completions (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references public.chores(id) on delete cascade,
  completed_by uuid references public.profiles(id),
  completed_name text,
  completed_at timestamptz not null default now(),
  due_date date not null,
  notes text
);

create index chores_circle_idx on public.chores(circle_id);
create index chore_completions_chore_idx on public.chore_completions(chore_id);
create index chore_completions_date_idx on public.chore_completions(due_date);

alter table public.chores enable row level security;
alter table public.chore_completions enable row level security;

-- RLS using get_my_circle_ids()
create policy "Circle members can view chores"
  on public.chores for select using (circle_id in (select public.get_my_circle_ids()));
create policy "Circle members can create chores"
  on public.chores for insert with check (circle_id in (select public.get_my_circle_ids()));
create policy "Creator can update chores"
  on public.chores for update using (created_by = auth.uid());
create policy "Creator can delete chores"
  on public.chores for delete using (created_by = auth.uid());

create policy "Circle members can view completions"
  on public.chore_completions for select
  using (chore_id in (select id from public.chores where circle_id in (select public.get_my_circle_ids())));
create policy "Circle members can add completions"
  on public.chore_completions for insert
  with check (chore_id in (select id from public.chores where circle_id in (select public.get_my_circle_ids())));

-- Updated_at trigger
create trigger chores_updated_at
  before update on public.chores
  for each row execute function public.update_updated_at();

-- Add participants and bring_items JSON columns to activities
alter table public.activities add column if not exists participants jsonb default '[]';
alter table public.activities add column if not exists bring_items jsonb default '[]';

notify pgrst, 'reload schema';

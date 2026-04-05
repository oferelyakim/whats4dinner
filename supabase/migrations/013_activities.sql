-- Activities: recurring events/schedules for family members
-- Covers: after-school activities, sports, lessons, carpooling, chores, etc.

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'other' check (category in (
    'sports', 'music', 'arts', 'education', 'social', 'chores', 'carpool', 'other'
  )),
  location text,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_name text,  -- for kids or non-users (e.g., "Emma", "Dad")

  -- Recurrence
  recurrence_type text not null default 'once' check (recurrence_type in (
    'once', 'daily', 'weekly', 'biweekly', 'monthly', 'custom'
  )),
  recurrence_days integer[] default '{}',  -- 0=Sun, 1=Mon, ..., 6=Sat (for weekly)
  start_date date not null,
  end_date date,  -- null = no end
  start_time time,
  end_time time,
  exclude_holidays boolean not null default false,

  -- Meta
  color text,  -- hex color for calendar display
  notes text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_circle_idx on public.activities(circle_id);
create index activities_assigned_idx on public.activities(assigned_to);

create trigger activities_updated_at
  before update on public.activities
  for each row execute function public.update_updated_at();

alter table public.activities enable row level security;

-- Activity duty roster (who's responsible this week/occurrence)
create table public.activity_duties (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  duty_date date not null,
  duty_type text not null default 'general' check (duty_type in (
    'general', 'carpool_to', 'carpool_from', 'snack', 'volunteer', 'setup', 'other'
  )),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_name text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'done')),
  created_at timestamptz not null default now()
);

create index activity_duties_activity_idx on public.activity_duties(activity_id);
create index activity_duties_date_idx on public.activity_duties(duty_date);

alter table public.activity_duties enable row level security;

-- RLS: use circle membership
create policy "Circle members can view activities"
  on public.activities for select
  using (circle_id in (select public.get_my_circle_ids()));

create policy "Circle members can create activities"
  on public.activities for insert
  with check (circle_id in (select public.get_my_circle_ids()));

create policy "Creator can update activities"
  on public.activities for update
  using (created_by = auth.uid());

create policy "Creator can delete activities"
  on public.activities for delete
  using (created_by = auth.uid());

-- Duties follow activity visibility
create policy "Circle members can view duties"
  on public.activity_duties for select
  using (activity_id in (select id from public.activities));

create policy "Circle members can manage duties"
  on public.activity_duties for all
  using (activity_id in (select id from public.activities));

notify pgrst, 'reload schema';

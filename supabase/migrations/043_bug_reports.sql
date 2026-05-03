-- Migration 042 — Bug reports + admin gate (v3.4.0).
--
-- Stores user-submitted bug reports + auto-captured ErrorBoundary crashes.
-- Visible only to the user who filed it (own reports) and to app admins
-- (whose emails live in app_admin_emails).
--
-- The admin email seed is `ofere@highqa.com` (the user's launch admin email,
-- per the auto-memory `userEmail`). Add more admins by inserting into
-- app_admin_emails after the migration runs:
--   insert into app_admin_emails (email) values ('founder@yourdomain.com');

-- ─── Admin email allow-list ────────────────────────────────────────────────
create table if not exists public.app_admin_emails (
  email text primary key,
  added_at timestamptz not null default now()
);

alter table public.app_admin_emails enable row level security;

-- Only service-role / admins can read this table; users can never see it.
-- Default deny: no policies = nothing visible to authenticated users.

-- Seed the launch admin. Idempotent.
insert into public.app_admin_emails (email)
values ('ofere@highqa.com')
on conflict (email) do nothing;

-- ─── Admin check helper ────────────────────────────────────────────────────
create or replace function public.is_app_admin()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email text;
begin
  -- auth.email() returns the JWT's email claim. NULL when called by service
  -- role or anonymous, in which case we return false (caller should use the
  -- service-role key to bypass when admin scripts run server-side).
  select auth.email() into v_email;
  if v_email is null then
    return false;
  end if;
  return exists (
    select 1 from public.app_admin_emails where email = lower(v_email)
  );
end
$$;

grant execute on function public.is_app_admin() to authenticated, anon;

-- ─── bug_reports table ─────────────────────────────────────────────────────
create table if not exists public.bug_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  circle_id   uuid references public.circles(id) on delete set null,
  message     text not null check (char_length(message) between 1 and 4000),
  url         text,
  user_agent  text,
  app_version text,
  -- 'crash' = auto-filed by ErrorBoundary; 'bug' = user-filed via dialog;
  -- 'feedback' = user-filed feedback (not necessarily a bug).
  severity    text not null default 'bug' check (severity in ('crash', 'bug', 'feedback')),
  -- 'open' | 'investigating' | 'resolved' | 'dismissed'
  status      text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists bug_reports_user_id_idx on public.bug_reports(user_id);
create index if not exists bug_reports_status_created_idx on public.bug_reports(status, created_at desc);
create index if not exists bug_reports_severity_idx on public.bug_reports(severity);

alter table public.bug_reports enable row level security;

-- Users can INSERT their own report (or anonymously if not signed in — useful
-- for ErrorBoundary crashes that happen pre-auth).
drop policy if exists bug_reports_insert_own on public.bug_reports;
create policy bug_reports_insert_own on public.bug_reports
  for insert
  to authenticated, anon
  with check (
    user_id is null or user_id = auth.uid()
  );

-- Users can SELECT their own reports.
drop policy if exists bug_reports_select_own on public.bug_reports;
create policy bug_reports_select_own on public.bug_reports
  for select
  to authenticated
  using (user_id = auth.uid());

-- Admins can SELECT all reports.
drop policy if exists bug_reports_select_admin on public.bug_reports;
create policy bug_reports_select_admin on public.bug_reports
  for select
  to authenticated
  using (public.is_app_admin());

-- Admins can UPDATE (mark resolved / dismissed / etc).
drop policy if exists bug_reports_update_admin on public.bug_reports;
create policy bug_reports_update_admin on public.bug_reports
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Admins can DELETE (cleanup).
drop policy if exists bug_reports_delete_admin on public.bug_reports;
create policy bug_reports_delete_admin on public.bug_reports
  for delete
  to authenticated
  using (public.is_app_admin());

comment on table public.bug_reports is
  'User-submitted bug reports + ErrorBoundary auto-captures. RLS: user sees own, admins (via is_app_admin) see all.';

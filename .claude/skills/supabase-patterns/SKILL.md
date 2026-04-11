---
name: supabase-patterns
description: "Supabase patterns for OurTable: RLS policies, Auth, Realtime subscriptions, migrations, Edge Functions, security definer functions. Use when working on: 'supabase', 'RLS', 'auth', 'realtime', 'migration', 'database', 'edge function', 'policy', 'security', 'query'."
---

# Supabase Patterns

Database, auth, and realtime patterns for OurTable.

## RLS (Row Level Security)

All tables use RLS. The core pattern uses security definer functions to avoid infinite recursion:

```sql
-- Core function: get circles the current user belongs to
CREATE OR REPLACE FUNCTION get_my_circle_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT circle_id FROM circle_members WHERE user_id = auth.uid() $$;

-- Typical RLS policy
CREATE POLICY "Users can view circle items"
  ON items FOR SELECT
  USING (circle_id IN (SELECT get_my_circle_ids()));
```

### Security Definer Functions
Functions that bypass RLS for specific operations:
- `get_my_circle_ids()` — circle membership lookup
- `get_my_event_ids()` — event access lookup
- `get_my_accessible_list_ids()` — shopping list access
- `join_circle_by_invite(code)` — join a circle
- `join_event_by_invite(code)` — join an event
- `create_circle_with_owner(name, user_id)` — atomic circle creation
- `create_shopping_list(...)` — list creation with RLS bypass
- `create_event_with_organizer(...)` — event creation with organizer
- `get_circle_by_invite_code(code)` — public circle lookup
- `get_event_by_invite_code(code)` — public event lookup

## Auth

- **Providers**: Email/password + Google OAuth
- **Email confirmation**: Required
- **Profile sync**: `profiles` table linked to `auth.users` via trigger
- **Client**: `src/services/supabase.ts` — Supabase client with anon key

## Realtime

Used for collaborative features (shopping lists, events):
```ts
const channel = supabase
  .channel('list-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'shopping_list_items',
    filter: `list_id=eq.${listId}`
  }, handleChange)
  .subscribe()
```

## Edge Functions

- `scrape-recipe` — AI-powered recipe import from URL/photo
- Deploy: `npx supabase functions deploy scrape-recipe --no-verify-jwt`
- Uses Claude Haiku for recipe extraction

## Migrations

18 migrations in `supabase/migrations/`, numbered 001-018:
- 001-006: Core tables (profiles, circles, items, recipes, lists, stores)
- 007-012: Features (events, RLS fixes, invites, ingredients)
- 013-016: Activities, event items, meal plan fix, supply kits
- 017: Chores and activity fields
- 018: Subscriptions and AI usage tracking

### Migration Conventions
- Numbered sequentially: `NNN_description.sql`
- Must be idempotent where possible (`IF NOT EXISTS`, `CREATE OR REPLACE`)
- Include RLS policies for new tables
- Test locally before applying: `npx supabase db push`

### SQL Fixes Outside Migrations
Some fixes applied directly via Supabase SQL editor (documented in CLAUDE.md). When finding issues, prefer creating a new numbered migration.

## Service Layer

12 service files in `src/services/` — each wraps Supabase queries:
- `supabase.ts` — client initialization
- `circles.ts` — circle CRUD, members, invites
- `recipes.ts` — recipe CRUD, search, import
- `shopping-lists.ts` — list CRUD, items, real-time
- `events.ts` — event CRUD, items, organizers
- `chores.ts` — chore CRUD, completions
- `activities.ts` — activity CRUD, schedules
- `stores.ts` — store routes, departments
- `meal-plans.ts` — weekly planning
- `profiles.ts` — user profile management
- `subscriptions.ts` — subscription + AI usage

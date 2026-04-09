# OurTable (whats4dinner)

Family household management PWA - meals, shopping, events, chores, activities.

## Links

- **GitHub**: https://github.com/oferelyakim/whats4dinner
- **Live**: https://whats4dinner-gamma.vercel.app
- **Supabase**: https://zgebzhvbszhqvaryfiwk.supabase.co (project: Whats4dinner)

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite 8 + Tailwind CSS v4 + Radix UI + dnd-kit
- **Database**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **State**: Zustand (UI) + TanStack Query (server)
- **Hosting**: Vercel (auto-deploys from GitHub `master` branch)
- **PWA**: vite-plugin-pwa with Workbox, offline persistence via IndexedDB
- **Testing**: Playwright E2E (chromium + mobile-chrome)

## Dev Commands

```bash
npm run dev                # Local dev server (localhost:5173)
npm run build              # Production build
npx tsc --noEmit           # Type-check
npx playwright test        # Run E2E tests
git push origin master     # Triggers Vercel deploy
npx supabase functions deploy scrape-recipe --no-verify-jwt  # Deploy edge function
```

## Environment

- `.env` has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `.env.production` has public keys hardcoded (Vercel env vars had caching issues)
- Supabase anon key also hardcoded in `src/services/supabase.ts` as fallback

## App Identity

- **Name**: OurTable (Hebrew: השולחן שלנו)
- **Brand color**: #f97316 (orange)
- **i18n**: Hebrew/English, 260+ translation keys, full RTL support
- **Theme**: Dark / Light / System

## Navigation

- **Bottom nav**: Home | Events | Lists | Recipes | More
- **More menu**: Circles, Activities, Chores, Meal Plan, Meal Templates, Stores, Profile, Theme, Language, Subscription

## Database Migrations (17 total)

001-006: Core tables (profiles, circles, items, recipes, shopping lists, stores)
007: Recipe shares + events
008: Fix RLS recursion (security definer functions)
009: create_circle_with_owner function
010: invite_by_email function
011: Event redesign (event_items, event_organizers)
012: Common ingredients seed (129 items with Hebrew), create_recipe_share function
013: Activities (recurring schedules)
014: pending_approval status for event_items
015: Remove meal_plans unique constraint (multi-recipe slots)
016: Supply kits (type + kit_category on recipes table)
017: Chores tables + chore_completions + activities participants/bring_items columns (idempotent, `017_chores_and_activity_fields.sql`)

Additional SQL fixes applied directly (not in migration files):
- Events RLS fix: `get_my_event_ids()` security definer function
- Recipe shares: fixed share_code default from base64url to hex
- Shopping lists RLS: `get_my_accessible_list_ids()` function
- Various security definer functions: `join_circle_by_invite`, `join_event_by_invite`, `create_shopping_list`, `create_event_with_organizer`
- Public lookup: `get_circle_by_invite_code`, `get_event_by_invite_code`

## Key Architecture Patterns

- **RLS**: All tables use Row Level Security. Circle-scoped queries use `get_my_circle_ids()` security definer function
- **Assignment**: Chores and activities use `AutocompleteInput` with circle member suggestions + free-text custom names
- **Circle members**: `getCircleMembers(circleId)` in `src/services/circles.ts` returns members with profiles
- **Services layer**: Each feature has a service file in `src/services/` (supabase queries + helpers)
- **Pages**: Each route maps to a page in `src/pages/`
- **Subscription tiers**: Free (participate) / Premium $4.99/mo (organize) / Family $7.99/mo (5 members) - Stripe not yet integrated

## Features

- **Auth**: Email/password + Google OAuth, email confirmation
- **Circles**: Create, join (invite code/link/email), member management
- **Recipes**: CRUD, ingredients with autocomplete, auto-tags, multi-ingredient search, import from URL/photo (AI via Claude Haiku), share via link
- **Supply Kits**: Non-food item collections (same tab as Recipes with toggle)
- **Shopping Lists**: CRUD, check/uncheck, DnD reorder, real-time sync, share with circle, sort by store route, ingredient deduplication
- **Store Routes**: DnD department ordering, sort shopping list by route
- **Meal Planning**: Week view, multi-recipe per slot, templates, copy week, add to list, calendar export
- **Events**: 5 tabs (Overview/Mine/Menu/Supplies/Tasks), invite link, co-organizers, claim/assign items, clone, calendar export
- **Activities**: Recurring schedules (weekly/biweekly/daily), circle member assignment dropdown + custom names, participants with roles, bring items, weekly calendar view
- **Chores**: Create/edit/delete, emoji icons, frequency (daily/weekly/biweekly/monthly/once), recurrence days, points system, completion tracking, weekly summary
- **Home**: Daily dashboard showing today's activities and chores

## E2E Tests

- Config: `playwright.config.ts` (chromium + mobile-chrome, baseURL localhost:5173)
- Tests in `e2e/` directory (~86 tests across 13 spec files)
- Chores/activities tests mock Supabase auth via `page.route()` and localStorage
- Key test files: `chores.spec.ts` (~40 tests), `activities.spec.ts` (~46 tests)

## Known Issues / Incomplete

- RecipeFormPage shows "Edit Recipe" when editing a supply kit (needs type awareness)
- Recipe detail page partially updated for supply kits
- Assignment approval UI built but needs multi-user testing
- Onboarding flow: not built
- Stripe integration: not built (subscription simulated locally)
- Push notifications: not built

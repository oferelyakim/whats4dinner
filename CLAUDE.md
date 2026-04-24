# Replanish

Family household management PWA for the US market — meals, shopping, events, chores, activities. Revenue = retailer cart integrations (Walmart-first affiliate add-to-cart) + AI subscriptions (Individual / Family).

Repo folder is still `Replanish_App/`; legacy Supabase project name is `Whats4dinner`. Live hosting is Vercel with custom domains: **replanish.app** (marketing) and **app.replanish.app** (app). The old `whats4dinner-gamma.vercel.app` URL still resolves.

## Links

- **GitHub**: https://github.com/oferelyakim/whats4dinner
- **Live (app)**: https://app.replanish.app
- **Live (site)**: https://replanish.app
- **Legacy Vercel URL**: https://whats4dinner-gamma.vercel.app (still resolves)
- **Supabase**: https://zgebzhvbszhqvaryfiwk.supabase.co (project: Whats4dinner)

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Radix UI + dnd-kit + Framer Motion
- **Design language**: "Hearth" — warm cream + ember terracotta + sage + candlelight gold. Instrument Serif italic (display) + Geist (sans) + Caveat (hand accent). Full spec in `handoff/DESIGN_SYSTEM.md` + `handoff/SKINS.md`; visual reference `handoff/Replanish Redesign.html`.
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

- **Name**: Replanish
- **Tagline**: Family life, planned & shared — together
- **Brand color**: `#c4522d` ember terracotta (Hearth `--rp-brand`); sage `#6b7f56` secondary; candlelight gold `#e8a84a` warmth. Old teal `#2bbaa0` and orange `#f97316` are retired — do not use. PWA manifest still references the old teal and needs updating before store submission.
- **Typography**: Instrument Serif italic for every page title + display moments; Geist for body/UI; Caveat for one handwritten accent per screen.
- **Primary market**: United States. Hebrew/RTL remains fully supported as a secondary locale.
- **i18n**: English (primary) / Hebrew, 300+ translation keys, full RTL support
- **Theme**: Dark / Light / System

## Navigation

- **Bottom nav**: Home | Food | **Gather** | **House** | **Me** (paths unchanged: `/`, `/food`, `/events`, `/household`, `/profile`; labels renamed in the Hearth redesign). Custom hand-drawn nav icons in `src/components/ui/hearth/NavIcons.tsx` — do not replace with lucide.
- **Food hub** (`/food`): Pill tabs — Overview | Recipes | Plan | Lists. Quick actions, this week's meals, active lists, templates & stores shortcuts
- **Household hub** (`/household`): Segmented control — Chores | Activities. Today's summary banner, daily/weekly chores, activity categories
- **Profile** (`/profile`): Circles, Settings, Theme, Language, Subscription (slim replacement for old MorePage)
- **Legacy routes**: `/more/*` paths redirect to `/profile/*` for backward compatibility

## Routes

```
/                          → HomePage (daily dashboard)
/food                      → FoodHubPage (recipes, lists, plan, stores)
/recipes, /recipes/new, /recipes/:id, /recipes/:id/edit
/lists, /lists/new, /lists/:id
/plan                      → PlanPage (weekly meal planner)
/food/templates            → MealMenusPage
/food/stores, /food/stores/:id
/events, /events/:id       → Events
/household                 → HouseholdHubPage (chores + activities)
/household/activities      → ActivitiesPage (full page)
/household/chores          → ChoresPage (full page)
/profile                   → MorePage (settings)
/profile/circles, /profile/circles/:id
/profile/settings          → ProfilePage
/join/:code, /join-event/:code, /r/:code  → Public join/share links
```

## Database Migrations (24 total)

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
018: Subscriptions + AI usage tracking (`018_subscriptions_and_ai_usage.sql`) — subscriptions table, ai_usage table, `get_user_monthly_usage()` function, RLS policies
019: Activity reminders + yearly recurrence (`019_activity_reminders_and_yearly.sql`); AI chat usage logging (`019_ai_chat_usage.sql`)
020: Onboarding flag on profiles (`020_onboarding_flag.sql`)
021: Meal + event AI support (`021_meal_event_ai.sql`)
022: Activity cross-circle sharing (`022_activity_cross_circle_sharing.sql`)
023: Grocer integrations (`023_grocer_integrations.sql`) — encrypted OAuth token store, product cache, list↔store links, app_config feature flag
024: Circle skins (`024_circle_skins.sql`) — adds `circles.skin_id text DEFAULT 'hearth'` + `circles.custom_skin jsonb` for the Hearth skin system

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
- **Services layer**: Each feature has a service file in `src/services/` (12 service files — supabase queries + helpers)
- **Pages**: 24+ pages in `src/pages/`, organized by domain (food, household, events, circles, profile)
- **Hub pages**: FoodHubPage and HouseholdHubPage aggregate related features with internal tab navigation
- **Subscription tiers**: Free (all core coordination) / AI Individual $4.99/mo / AI Family $6.99/mo (5 members). Stripe `create-checkout` + `stripe-webhook` Edge Functions built; needs `STRIPE_*` secrets set in Supabase to go live.
- **Revenue**: AI subs (live today) + retailer cart integrations (Walmart-first, planned) — affiliate commission on ingredients sent from shopping lists
- **AI gating**: `useAIAccess` hook checks subscription + usage cap. `AIUpgradeModal` for upgrade/limit-reached. `UsageMeter` progress bar in Profile/Settings
- **AI usage tracking**: Edge function returns `_ai_usage` metadata (model, tokens, cost). `logAIUsage()` logs to `ai_usage` table. $4.00/mo hard cap, $3.00 warning threshold
- **Design tokens**: `src/index.css` declares `--rp-*` CSS variables + a Tailwind v4 `@theme` block that exposes them as utilities (`bg-rp-brand`, `text-rp-ink`, `font-display`, `shadow-rp-card`, etc.). Legacy `brand-500` is remapped to Hearth terracotta so not-yet-migrated pages stay on-palette. Hardcoded hex values are banned outside `src/index.css` / `src/lib/skins.ts`.
- **Skin system**: `src/lib/skins.ts` (9 built-ins) + `src/components/SkinProvider.tsx` (writes `--rp-*` vars onto `<html>` from active circle's `skin_id` / `custom_skin`, toggles `.dark` for dark skins). Custom-skin builder (AI Family tier) is planned but not yet routed.
- **Hearth primitives**: `src/components/ui/hearth/` exports `Avatar`, `AvatarStack`, `CircleGlyph`, `RingsOrnament`, `PageTitle`, `DisplayTitle`, `MonoLabel`, `HandAccent`, `PhotoPlaceholder`, and the five custom nav icons. Use these for all new screens — do not import shadcn/daisy/Material wholesale.

## Features

- **Auth**: Email/password + Google OAuth, email confirmation
- **Circles**: Create, join (invite code/link/email), member management
- **Recipes**: CRUD, ingredients with autocomplete, auto-tags, multi-ingredient search, import from URL/photo (AI via Claude Haiku), share via link
- **Essentials**: Non-food item collections (renamed from Supply Kits), accessible from FoodHub tab + Recipes toggle
- **Shopping Lists**: CRUD, check/uncheck, DnD reorder, real-time sync, share with circle, sort by store route, ingredient deduplication
- **Store Routes**: DnD department ordering, sort shopping list by route
- **Meal Planning**: Week view, multi-recipe per slot, templates, copy week, add to list, calendar export, AI meal plan generation (Edge Function)
- **Events**: 5 tabs (Overview/Mine/Menu/Supplies/Tasks), invite link, co-organizers, claim/assign items, clone, calendar export
- **Activities**: Recurring schedules (weekly/biweekly/daily/monthly/yearly), circle member assignment, participants, bring items, month/week/day calendar drill-down with Zustand persistence, reminders (any activity, flexible timing)
- **Chores**: Create/edit/delete, emoji icons, frequency (daily/weekly/biweekly/monthly/once), recurrence days, points system, completion tracking, assignee filter chips (defaults to "Me"), colored person headers
- **Home**: Daily dashboard, today's activities/chores, upcoming reminders widget, NLP quick action input (AI)
- **Onboarding**: 3-step first-run flow (Welcome → Create/Join Circle → Done), gated via has_onboarded flag
- **Notifications**: In-app notification center (bell icon in header), activity reminders + chore nudges, browser Notification API
- **Subscriptions**: AI Individual/Family plans, Stripe checkout Edge Function (with mock fallback), webhook handler
- **AI Assistant**: In-app Claude-powered chat (`ai-chat` edge function), gated by subscription + monthly $ cap
- **Retailer cart (planned)**: Walmart-first affiliate add-to-cart from shopping lists (primary long-term revenue stream, not yet implemented)

## E2E Tests

- Config: `playwright.config.ts` (chromium + mobile-chrome, baseURL localhost:5173)
- Tests in `e2e/` directory (~86 tests across 14 spec files)
- Chores/activities tests mock Supabase auth via `page.route()` and localStorage
- Key test files: `chores.spec.ts` (~40 tests), `activities.spec.ts` (~46 tests)

## Known Issues / Incomplete

- Recipe detail page partially updated for supply kits (Essentials)
- Assignment approval UI built but needs multi-user testing
- Family plan member sharing: currently checks only the subscribing user, not shared across circle members
- Stripe integration: Edge Functions built (create-checkout, stripe-webhook) but needs STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_* secrets configured in Supabase
- Edge Functions not yet deployed: generate-meal-plan, nlp-action, create-checkout, stripe-webhook (deploy with `npx supabase functions deploy <name> --no-verify-jwt`)
- Server-side push notifications: deferred (VAPID/cron), currently browser Notification API only
- Calendar import from external calendars: deferred (needs Google OAuth)
- Code splitting: 1MB+ bundle, needs lazy routes via dynamic import()
- App store listing (TWA/Capacitor): not started

## Version Tracking

- App version lives in `src/lib/version.ts` (exported as `APP_VERSION`) and `package.json`
- Version is displayed in the AI assistant welcome screen so users can confirm which build they're testing
- **Bump the version on every production deployment** — increment the patch digit (1.0.2 → 1.0.3 → ...)
- Use minor version (1.1.0) for significant feature additions, major (2.0.0) for architecture changes
- After each deploy, report the new version number to the user
- Deploy command sequence:
  ```bash
  # 1. Update version in src/lib/version.ts and package.json
  # 2. Run: npx tsc --noEmit  (type check)
  # 3. Run: git add -A && git commit -m "chore: bump version to X.Y.Z"
  # 4. Run: git push origin master  (triggers Vercel deploy)
  # 5. If edge functions changed: npx supabase functions deploy <name> --no-verify-jwt
  ```

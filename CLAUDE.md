# Replanish

Family household management PWA for the US market — meals, shopping, events, chores, activities. Revenue = retailer cart integrations (Walmart-first affiliate add-to-cart) + AI subscription (Replanish AI, monthly or annual).

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
- **Theme**: derived from the active skin only. The `theme` preference (Dark / Light / System) is persisted for future use but does NOT toggle the `.dark` class — `SkinProvider` / `applySkin` own the class. Hearth (light-only) therefore renders identically regardless of OS dark mode.

## Navigation

- **Bottom nav**: Home | Food | **Gather** | **House** | **Me** (paths unchanged: `/`, `/food`, `/events`, `/household`, `/profile`; labels renamed in the Hearth redesign). Custom hand-drawn nav icons in `src/components/ui/hearth/NavIcons.tsx` — do not replace with lucide.
- **Food hub** (`/food`): Pill tabs — Overview | Recipes | Plan | Lists. Quick actions, this week's meals, active lists, templates & stores shortcuts
- **Household** (`/household`): redirects to whichever tab the user was last on (`/household/chores` or `/household/activities`). Tab choice persisted as `lastHouseholdTab` in appStore. The shared `<HouseholdTabs>` segmented control sits at the top of both `ChoresPage` and `ActivitiesPage` — there is no separate "hub" summary view.
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
/household                 → HouseholdHubPage (redirect to last tab — chores or activities)
/household/activities      → ActivitiesPage (full page)
/household/chores          → ChoresPage (full page)
/profile                   → MorePage (settings)
/profile/circles, /profile/circles/:id
/profile/settings          → ProfilePage
/join/:code, /join-event/:code, /r/:code  → Public join/share links
```

## Database Migrations (27 total)

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
025: Onboarding prefs + Family seat roster (`025_onboarding_prefs_and_seats.sql`) — adds `profiles.diet text[]`, `profiles.meal_preferences jsonb`, `subscription_seats` table (AI Family 4-seat cap), `has_active_family_seat()` security definer function. Owner of any `ai_family` subscription is backfilled as an `owner` seat. Diet + meal prefs are captured during onboarding (steps 2 + 3); `useAIAccess` calls `has_active_family_seat` so users on a shared seat unlock AI without their own subscription row.
026: Circle delete policy (`026_circle_delete_policy.sql`) — adds the missing `DELETE` policy on `public.circles` (`created_by = auth.uid()`). Migrations 002+008 only set up SELECT/INSERT/UPDATE, so RLS silently dropped every DELETE. Child tables already CASCADE, so no further cleanup needed.
027: Circle purpose + AI context (`027_circle_purpose_context.sql`) — adds `circles.purpose text`, `circles.circle_type text` (`family|event|roommates|friends|other`), `circles.context jsonb default '{}'`. Updates `create_circle_with_owner` RPC to accept `(p_name, p_icon, p_purpose, p_circle_type, p_context)` with safe defaults (legacy 2-arg callers still work). Powers v2 onboarding-as-circle-creation: each circle captures its purpose + type-specific intake (diet/household/cooking for family; date/venue/headcount/style for event; cadence for roommates/friends) which AI edge functions inject into prompts.
028: Subscription seat invites + single-tier billing (`028_subscription_seat_invites.sql`) — makes `subscription_seats.user_id` nullable for pending invites; adds `pending_email text` + `invited_at timestamptz`; partial unique index on `(subscription_id, lower(pending_email))` for pending rows; `CHECK` ensuring a seat row has exactly one of `user_id` or `pending_email`; replaces `has_active_family_seat()` to be plan-agnostic (any active sub grants seat AI access, not just `ai_family`); new `claim_seat_by_email(p_email)` security definer to redeem pending invites on first login. Also adds `billing_period text` + `trial_end timestamptz` columns to `subscriptions` and widens the `plan` CHECK to include `'monthly'` and `'annual'`.

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
- **Hub pages**: FoodHubPage aggregates related Food features with internal tab navigation. HouseholdHubPage is a thin redirect to `/household/chores` or `/household/activities` based on `appStore.lastHouseholdTab` — the [Chores | Activities] segmented control lives in those standalone pages via the shared `<HouseholdTabs>`.
- **Subscription tiers**: Free (all core coordination, 10 recipe imports/month) / **Replanish AI** — single tier, two billing periods: `monthly` $6/mo or `annual` $60/yr (14-day free trial on annual). 4-seat sharing (owner + 3 invitees) via `subscription_seats` table. `useAIAccess` calls the `has_active_family_seat(uuid)` RPC (plan-agnostic since mig 028) so seat-holders inherit AI access. Seat cap enforced in `src/services/subscription-seats.ts` (`SeatCapReachedError`). `create-checkout` accepts `{ billingPeriod: 'monthly'|'annual' }` and passes `trial_period_days: 14` for annual. Legacy `ai_individual`/`ai_family` plan values still accepted (normalised to `monthly`). Stripe `STRIPE_PRICE_MONTHLY` + `STRIPE_PRICE_ANNUAL` secrets required.
- **Revenue**: AI subs (live today) + retailer cart integrations (Walmart-first, planned) — affiliate commission on ingredients sent from shopping lists
- **AI gating**: `useAIAccess` hook exposes `checkAIAccess()` (paid AI features) and `checkRecipeImportAccess()` (paid-or-free + 10/mo free cap). `AIUpgradeModal` renders three variants: upgrade, `isLimitReached` (paid user over $ cap), `isImportCapReached` (free user over 10/mo). `UsageMeter` progress bar in Profile/Settings. Free-tier recipe-import cap = `RECIPE_IMPORT_FREE_CAP` in `src/services/ai-usage.ts`.
- **AI usage tracking**: Edge function returns `_ai_usage` metadata (model, tokens, cost). `logAIUsage()` logs to `ai_usage` table. $4.00/mo hard cap, $3.00 warning threshold
- **AI circle-context injection**: `supabase/functions/_shared/circle-context.ts` exports `loadCircleContext(supabase, circleId)` + `renderCircleContextBlock()` which fetches `name / icon / purpose / circle_type / context` and renders a `<circle_context>…</circle_context>` block. `generate-meal-plan`, `plan-event`, and `ai-chat` all inject this block into the prompt with a "circle context is the source of truth" instruction so the AI grounds on what was captured at circle setup (diet, household, event details, etc.) instead of asking again. Any new AI edge function that takes a `circleId` should reuse this helper.
- **Design tokens**: `src/index.css` declares `--rp-*` CSS variables + a Tailwind v4 `@theme` block that exposes them as utilities (`bg-rp-brand`, `text-rp-ink`, `font-display`, `shadow-rp-card`, etc.). Legacy `brand-500` is remapped to Hearth terracotta so not-yet-migrated pages stay on-palette. Hardcoded hex values are banned outside `src/index.css` / `src/lib/skins.ts`.
- **Surface utilities — use `rp-*`, not `surface-dark-*`**: Always use `bg-rp-card` / `bg-rp-bg` / `bg-rp-bg-soft` / `text-rp-ink` for surface + ink. Do NOT use `bg-white dark:bg-surface-dark-elevated` (or any `dark:bg-surface-dark-*`) — `applySkin` writes inline `--rp-*` values onto `<html>` while `applyTheme` toggles `.dark` based on system preference, so the two can disagree (light Hearth tokens + `.dark` class). Legacy `dark:bg-surface-dark-*` then forces a dark surface while `text-rp-ink` stays dark → unreadable. The shared `<Card>` primitive already uses rp-tokens; mirror that in any new surface.
- **Skin system**: `src/lib/skins.ts` (13 built-ins as of v1.10.0 — Hearth, Coastal, Ranch, Pacific, Brooklyn, Tuscan, Meadow, **Nordic**, **Bloom**, **Citrus**, Dusk, **Studio**, Night Market) + `src/components/SkinProvider.tsx`. `applySkin()` writes `--rp-*` color tokens, `--rp-ff-*` font stacks, sets `data-feel="editorial|terminal|pillow|sticker"` on `<html>` (per-feel CSS in `src/index.css` reshapes radii / card chrome / type — Studio adds a CRT scanline overlay), and toggles `.dark` for `dark: true` skins. The `Skin` type carries optional `fonts` (display/sans/mono/hand) + `feel`; older skins omit both and keep Hearth-era chrome. **The skin is the only authority on `.dark`** — `appStore.applyTheme` is a no-op. SkinProvider resolves in this priority: `personalSkinId` (per-device override, persisted in zustand `w4d-app`) → `activeCircle.skin_id` / `custom_skin` → Hearth. Owner edits the circle's skin from the Skin card on `CircleDetailPage` (writes `circles.skin_id` via `updateCircleSkin()`); members override per-device from `MorePage`. Onboarding (`CircleSetupWizard`) has a `skin` step before review — `suggestSkinId(circle_type)` pre-selects (family→hearth, event→citrus, roommates→nordic, friends→bloom, other→hearth), the user can override, then `createCircle({ skin_id })` follows up with an UPDATE because the RPC predates skin support. Shared picker: `src/components/skins/SkinPicker.tsx` is reused by all three surfaces. Custom-skin builder (AI Family tier) still planned.
- **Hearth primitives**: `src/components/ui/hearth/` exports `Avatar`, `AvatarStack`, `CircleGlyph`, `RingsOrnament`, `PageTitle`, `DisplayTitle`, `MonoLabel`, `HandAccent`, `PhotoPlaceholder`, and the five custom nav icons. Use these for all new screens — do not import shadcn/daisy/Material wholesale.

## Features

- **Auth**: Email/password + Google OAuth, email confirmation
- **Circles**: Create, join (invite code/link/email), member management
- **Recipes**: CRUD, ingredients with autocomplete, auto-tags, multi-ingredient search, import from URL/photo (AI via Claude Haiku), share via link
- **Essentials**: Non-food item collections (renamed from Supply Kits), accessible from FoodHub tab + Recipes toggle
- **Shopping Lists**: CRUD, check/uncheck, DnD reorder, real-time sync, share with circle, sort by store route, ingredient deduplication
- **Store Routes**: DnD department ordering, sort shopping list by route
- **Meal Planning**: Week view, multi-recipe per slot, templates, copy week, add to list, calendar export, AI meal plan generation (Edge Function) — AI-proposed recipes dedup against existing circle recipes by title (case-insensitive, trimmed) before creating
- **Events**: 5 tabs (Overview/Mine/Menu/Supplies/Tasks), invite link, co-organizers, claim/assign items, clone, calendar export, AI event planning (Claude Haiku via `plan-event` Edge Function) — AI-proposed dishes/supplies/tasks persist to `event_items` with case-insensitive dedup against existing items. **Attendees + assignee dropdown** (v1.11.0+) merge `event_participants` (explicit invite-link joins) with `circle_members` of `event.circle_id` — circle members appear as implicit attendees so the host can assign items to them without forcing every household member to click the join link.
- **Activities**: Recurring schedules (weekly/biweekly/daily/monthly/yearly), circle member assignment, participants, bring items, month/week/day calendar drill-down with Zustand persistence, reminders (any activity, flexible timing)
- **Chores**: Create/edit/delete, emoji icons, frequency (daily/weekly/biweekly/monthly/once), recurrence days, points system, completion tracking, assignee filter chips (defaults to "Me"), colored person headers
- **Home**: Daily dashboard — greeting, tonight's meal hero, two-card pulse row (shared shopping list + Household entry that routes to `/household`), today's activities timeline, week meals strip, recipe-import buttons (gate via `checkRecipeImportAccess()`). Chores are NOT shown on home; users go through the Household tab. NLP quick action input (AI).
- **Onboarding (v2, circle-creation-driven)**: First-run flow IS the new-circle wizard. `<CircleSetupWizard>` in `src/components/circle/CircleSetupWizard.tsx` is rendered both by `OnboardingPage` (gated by `has_onboarded`) and by `CirclesPage` "Create" (full-screen Radix dialog). Steps are computed from the chosen `circle_type`: Family → identity → purpose → household → diet → cooking → review; Event → identity → purpose → when/where → who → food → review; Roommates/Friends/Other → identity → purpose → diet → cadence → review. Captured answers persist to `circles.purpose` + `circles.circle_type` + `circles.context` jsonb so AI prompts can ground on them. The legacy `profiles.diet` / `profiles.meal_preferences` fields still exist as a per-user fallback but are no longer written by onboarding.
- **Notifications**: In-app notification center (bell icon in header), activity reminders + chore nudges, browser Notification API
- **Subscriptions**: Single Replanish AI tier ($6/mo or $60/yr, 14-day annual trial). `MorePage` subscription card: non-subscriber sees monthly/annual toggle (default Annual) + "Start free trial" CTA; active subscriber sees plan name, renewal/trial badge, disabled "Manage in Stripe" button, and "Share AI access" section (owner-only) with progress bar, seat list + per-row remove, "+ Add member" dialog (from-circles tab uses `getCircleMembers` + `addSeatByUserId`; by-email tab uses `inviteSeatByEmail`; both catch `SeatCapReachedError`). On app boot, auth state change fires `claim_seat_by_email` RPC to auto-claim pending email invites. `AIUpgradeModal` shows same monthly/annual toggle (default Annual) with 14-day trial highlight. Stripe checkout Edge Function (`create-checkout`) accepts `billingPeriod: 'monthly'|'annual'`; mock fallback active when Stripe secrets are absent.
- **AI Assistant**: In-app Claude-powered chat (`ai-chat` edge function), gated by subscription + monthly $ cap. Meal-plan revision (v1.8.2): "Request changes" / "Replace" in `ChatPlanReview` keeps the plan modal open and calls `useChat.revisePlan()`, which posts the current plan summary + revision request back to `ai-chat` with `forcePlanMeals: true`. That flag sets Anthropic `tool_choice` to `plan_meals` so the model MUST return structured plan data — never a conversational "I can't search the web" refusal. Cancellable via `AbortController` (overlay Cancel button). For online-recipe requests the prompt forces `source_preference: "web"` so `get-recipe` fetches the real recipe.
- **Retailer cart (planned)**: Walmart-first affiliate add-to-cart from shopping lists (primary long-term revenue stream, not yet implemented)

## E2E Tests

- Config: `playwright.config.ts` (chromium + mobile-chrome, baseURL localhost:5173)
- Tests in `e2e/` directory (~86 tests across 14 spec files)
- Chores/activities tests mock Supabase auth via `page.route()` and localStorage
- Key test files: `chores.spec.ts` (~40 tests), `activities.spec.ts` (~46 tests)

## Known Issues / Incomplete

- Recipe detail page partially updated for supply kits (Essentials)
- Assignment approval UI built but needs multi-user testing
- ~~Family plan seat enforcement~~: live as of v1.11.0 — `useAIAccess` calls `hasActiveFamilySeat(userId)` (RPC `has_active_family_seat`) when the user has no direct subscription, so AI Family seat-holders inherit AI access. The 4-seat cap itself is still enforced in app code (no DB constraint).
- Stripe integration: Edge Functions built (create-checkout, stripe-webhook) but needs STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_* secrets configured in Supabase
- Edge Functions: `ai-chat` was deployed for v1.8.2. `generate-meal-plan` and `plan-event` were also touched in v1.8.2 (circle-context injection) — redeploy those next time Supabase functions go out (`npx supabase functions deploy generate-meal-plan plan-event --no-verify-jwt`). `nlp-action`, `create-checkout`, `stripe-webhook` still pending.
- Migration 027: applied. Circle creation goes through `(p_name, p_icon, p_purpose, p_circle_type, p_context)`.
- v2 onboarding browser smoke test: not done yet (type-check + production build are green, but the wizard wasn't clicked through across all 5 circle types). Owner: user.
- Server-side push notifications: deferred (VAPID/cron), currently browser Notification API only
- Calendar import from external calendars: deferred (needs Google OAuth)
- Code splitting: 1MB+ bundle, needs lazy routes via dynamic import()
- App store listing (TWA/Capacitor): not started
- Skins Vol. 2 (v1.10.0): 4 new skins shipped + browser smoke test pending — verify each `feel` (especially Studio's terminal mono-everything + CRT overlay) on Home / Food / Gather / House / Me before declaring done.
- v1.12.2: Forgot-password link added to `JoinCirclePage` + `JoinEventPage` (was only on `LoginPage`). Both invite landing pages support a `'forgot'` auth mode. `sendPasswordReset(email, nextPath?)` now accepts an optional return path that is appended to `redirectTo` as `?next=<path>`; `ResetPasswordPage` reads `?next=` (rejects anything not starting with `/` to prevent open redirects) and routes there after a successful reset. So a user who hits forgot-password from `/join/CODE` lands on `/reset-password?next=/join/CODE`, sets a new password, and is sent back to the invite where the auto-join `useEffect` runs. Same for `/join-event/CODE`. **Supabase config:** `app.replanish.app/reset-password` (and the localhost equivalent) must be in the Auth → Redirect URLs allow-list — query strings on allowed paths are accepted by Supabase as long as the base path matches.
- v1.11.0 soft-launch: PWA manifest now uses Hearth colors (`theme_color #c4522d`, `background_color #faf6ef`); EventDetailPage + post-create dialog have WhatsApp / native-share / copy-link affordances using `getShareOrigin()` from `src/lib/url.ts`; JoinEventPage has above-fold claim CTA + below-fold social proof (3-icon preview + sign-up nudge); in-app review prompt (`src/lib/reviewPrompt.ts` + `src/components/ReviewPrompt.tsx`) wired at 3 value moments (shopping list ≥80% checked, JoinEventPage join, AI meal plan saved) with 90-day cooldown + first-3-sessions skip + `REVIEW_STORE_URL` TODO. Browser smoke test (WhatsApp share opens correctly on mobile, JoinEventPage looks right in EN + HE) still pending.

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

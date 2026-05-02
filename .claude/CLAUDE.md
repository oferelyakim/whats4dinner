# Replanish — Family & Social Coordination PWA

## What This Is
A mobile-first Progressive Web App for US households to coordinate family life — combining circles/groups, event/potluck planning, collaborative shopping lists, meal planning, chores, and activities.

**Current version: v3.0.0** — bank-driven shared weekly drop replaces per-user AI weekly plan. AI repositioned to per-meal hooks. Full product story: [docs/v3/PRODUCT.md](../docs/v3/PRODUCT.md).

## Business Model
- **Primary market**: United States. Hebrew/RTL fully supported as a secondary locale.
- **Revenue stream 1 — Retailer cart integrations**: One-tap send of a shopping list's ingredients to US retailer carts (Walmart-first affiliate add-to-cart; Instacart, Amazon Fresh planned). Revenue = affiliate commission. v3.1 target.
- **Revenue stream 2 — Replanish AI subscription**: Single tier — $6/mo or $60/yr (14-day annual trial). Unlocks per-meal AI swap, pantry/leftover reroll, unlimited recipe URL imports, smart shopping consolidation, the AI event planner, and the in-app AI chat. 4-seat sharing (owner + 3 invitees) via `subscription_seats` table.
- All core coordination — circles, **the shared weekly drop (free for everyone, 126 curated recipes per week)**, manual meal planning, shopping lists, events, chores, activities — is free. Free users URL-import 10 recipes/month (which feed the bank via the auditor).

## Stack
- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Radix UI + dnd-kit + Framer Motion
- **Backend/DB:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Hosting:** Vercel (auto-deploys from `master`)
- **PWA:** vite-plugin-pwa with Workbox, offline persistence via IndexedDB
- **i18n:** English (primary) + Hebrew (RTL supported)
- **Payments:** Stripe via Supabase Edge Functions (`create-checkout`, `stripe-webhook`)
- **AI:** Claude API (Haiku 4.5 default + Sonnet 4.5 for compose-fallback) via Edge Functions. **Active set:** `meal-engine` (slot pipeline + per-meal swap + URL hydration), `weekly-drop-generator` (cron, picks 126 cards/week), `recipe-bank-refresher` (cron, tops up bank coverage), `auditor-from-imports` (user URL → bank promotion), `event-engine` (dynamic event-planner questionnaire), `ai-chat`, `scrape-recipe`, `get-recipe`, `nlp-action`, plus Stripe + Kroger functions.
- **Retired in v3.0:** `meal-plan-worker`, `plan-event`, `generate-meal-plan` (deleted from `supabase/functions/`).

## Architecture
- Mobile-first responsive design — desktop is secondary
- Offline-first for shopping lists (sync when online via Supabase Realtime)
- Row Level Security (RLS) on all Supabase tables — no exceptions
- Real-time sync via Supabase Realtime subscriptions for shared data
- Auth via Supabase Auth (email/password + Google OAuth)

## Key Product Decisions
- **The weekly drop is the marketing hero.** 126 curated recipes per week, free for everyone, served from `weekly_menu` table (mig 035) populated by the cron generator. Drop runs Sunday 06:00 ET (10:00 UTC).
- Shopping lists are the daily-habit retention hook and the surface for retailer cart integrations (the main long-term revenue lever).
- AI is **per-meal**, not per-week. Per-user weekly generation was retired in v3.0 because it was fragile + expensive.
- US market focus — English-first, prices in USD, Walmart as the first retailer integration.
- Hebrew/RTL remains fully supported, but new copy and flows are designed for US users first.
- Circles are the foundation — everything (events, lists, meals, chores, activities) is scoped to a circle. As of migration 027, each circle carries `purpose` + `circle_type` (`family|event|roommates|friends|other`) + `context jsonb` captured during the v2 setup wizard. AI edge functions ground prompts on this via `supabase/functions/_shared/circle-context.ts`.

## Conventions
- TypeScript strict mode, no `any` unless justified
- Functional components with hooks only
- Supabase migrations numbered NNN_description.sql, must be idempotent
- Tailwind CSS for styling, mobile-first breakpoints
- All user-facing strings go through i18n — never hardcode text
- Services layer: one file per domain in `src/services/` (Supabase queries + helpers)
- Pages in `src/pages/`, organized by domain

## Navigation
- **Bottom nav**: Home | Food | **Gather** | **House** | **Me** — 5 domain tabs, routes unchanged (`/`, `/food`, `/events`, `/household`, `/profile`).
- **Food hub** (`/food`): Pill tabs — Overview | Recipes | Plan | Lists
- **Household** (`/household`): redirects to last tab (`/household/chores` or `/household/activities`)
- **Me** (`/profile`): Circles, Settings, Subscription
- **Plan** (`/plan-v2`): the v3.0 planner — week navigation + day cards. The weekly-drop hero strip lands per the design handoff.

## Design language — "Hearth"
- Warm cream (`--rp-bg #faf6ef`) + ember terracotta (`--rp-brand #c4522d`) + sage + candlelight gold.
- Fonts: Instrument Serif italic (page titles, display), Geist (sans body/UI), Caveat (one handwritten accent per screen max).
- Tokens: `--rp-*` CSS vars in `src/index.css`, Tailwind v4 `@theme` exposes them (`bg-rp-brand`, `text-rp-ink`, `font-display`, `shadow-rp-card`, …).
- Skin system: `src/lib/skins.ts` (6 built-in skins — Hearth, Citrus, Brooklyn, Meadow, Studio, Night Market). Schema: `circles.skin_id` + `circles.custom_skin jsonb` (mig 024). Mig 029 remaps retired v1 ids.
- Shared primitives in `src/components/ui/hearth/`: `Avatar`, `AvatarStack`, `CircleGlyph`, `RingsOrnament`, `PageTitle`, `DisplayTitle`, `MonoLabel`, `HandAccent`, `PhotoPlaceholder`, nav icons.

## File Structure
```
src/
  components/     # Shared/reusable UI components
  pages/          # Page components by domain
  services/       # Supabase queries (incl. recipe-bank.ts for v3 drops)
  engine/         # Meal-planning slot engine + Dexie offline store
  hooks/          # Shared hooks
  lib/            # Supabase client, i18n config, utils
  locales/        # i18n
  stores/         # Zustand stores
supabase/
  migrations/     # 38 numbered migrations:
                  #   030 recipe_bank, 032 cron, 033 event-planner v2,
                  #   034 link-first, 035 weekly_menu (v3.0),
                  #   036 pantry_match (v3.0), 037 drop async-jobs (v3.0),
                  #   038 pg_cron weekly-drop (v3.0)
  functions/      # Active: meal-engine, ai-chat, recipe-bank-refresher,
                  #         event-engine, auditor-from-imports,
                  #         weekly-drop-generator, nlp-action, scrape-recipe,
                  #         get-recipe, create-checkout, stripe-webhook, kroger-*
                  # Retired in v3.0: meal-plan-worker, plan-event, generate-meal-plan
docs/v3/          # v3.0 product, marketing, FAQ, sources, partner-pitch, press kit
e2e/              # Playwright E2E tests
```

## Dev Commands
```bash
npm run dev                # Local dev (localhost:5173)
npm run build              # Production build
npx tsc -b                 # Strict type-check (the Vercel gate — use this, not --noEmit)
npx vitest run             # Unit + integration tests
npx playwright test        # E2E tests
npm run deploy:functions   # Deploy all v3 edge functions
git push origin master     # Triggers Vercel deploy
```

## Security
- RLS on all tables, enforced via `get_my_circle_ids()` security definer
- Never commit `.env` or secrets
- Security definer functions for cross-RLS operations
- Input validation on Edge Functions

# Replanish — Family & Social Coordination PWA

## What This Is
A mobile-first Progressive Web App for US households to coordinate family life — combining circles/groups, event/potluck planning, collaborative shopping lists, meal planning, chores, and activities.

## Business Model
- **Primary market**: United States. Hebrew/RTL fully supported as a secondary locale.
- **Revenue stream 1 — Retailer cart integrations**: One-tap send of a shopping list's ingredients to US retailer carts (Walmart-first affiliate add-to-cart; Instacart, Amazon Fresh planned). Revenue = affiliate commission. Not yet implemented.
- **Revenue stream 2 — AI subscriptions**: Single Replanish AI tier — $6/mo or $60/yr (14-day annual trial). Unlocks the interactive meal-plan interview (v2.0.0), AI recipe import from URL/photo, AI assistant chat, and event planning. 4-seat sharing (owner + 3 invitees) via `subscription_seats` table. Stripe Edge Functions built; awaiting secret configuration to go live.
- All core coordination features (circles, lists, plans, events, chores, activities) are free. Free users see a disabled AI banner + "Quick fill" (Standard week + bank-fill, no AI ask) and can URL-import 10 recipes/month (which feed the bank via the auditor).

## Stack
- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Radix UI + dnd-kit + Framer Motion
- **Backend/DB:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Hosting:** Vercel (auto-deploys from `master`)
- **PWA:** vite-plugin-pwa with Workbox, offline persistence via IndexedDB
- **i18n:** English (primary) + Hebrew (RTL supported), 300+ translation keys
- **Payments:** Stripe via Supabase Edge Functions (`create-checkout`, `stripe-webhook`)
- **AI:** Claude API (Haiku 4.5 default + Sonnet 4.5 for compose-fallback) via Edge Functions. Active set: `meal-engine` (slot pipeline + interview ops), `meal-plan-worker` (async job worker), `recipe-bank-refresher` (cron-driven link discovery), `auditor-from-imports` (user URL → bank promotion, v2.0.0), `plan-event`, `ai-chat`, `scrape-recipe`, `get-recipe`, `nlp-action`. Legacy `generate-meal-plan` retained for backwards-compat but new flows use the slot-based `/plan-v2` engine.

## Architecture
- Mobile-first responsive design — desktop is secondary
- Offline-first for shopping lists (sync when online via Supabase Realtime)
- Row Level Security (RLS) on all Supabase tables — no exceptions
- Real-time sync via Supabase Realtime subscriptions for shared data
- Auth via Supabase Auth (email/password + Google OAuth)

## Key Product Decisions
- Shopping lists are the daily-habit retention hook (2-3x/week usage) and the surface for retailer cart integrations (the main long-term revenue lever)
- US market focus — English-first, prices in USD, Walmart as the first retailer integration
- Hebrew/RTL remains fully supported (bilingual product), but new copy and flows are designed for US users first
- Circles are the foundation — everything (events, lists, meals, chores, activities) is scoped to a circle. As of migration 027, each circle also carries `purpose` + `circle_type` (`family|event|roommates|friends|other`) + `context jsonb` captured during the v2 setup wizard (`src/components/circle/CircleSetupWizard.tsx`). AI edge functions ground prompts on this via the shared `supabase/functions/_shared/circle-context.ts` helper.

## Conventions
- TypeScript strict mode, no `any` unless justified with comment
- Functional components with hooks only
- Supabase migrations numbered NNN_description.sql, must be idempotent
- Tailwind CSS for styling, mobile-first breakpoints
- All user-facing strings go through i18n — never hardcode text
- Services layer: one file per domain in `src/services/` (Supabase queries + helpers)
- Pages in `src/pages/`, organized by domain

## Navigation
- **Bottom nav**: Home | Food | **Gather** | **House** | **Me** — 5 domain tabs, routes unchanged (`/`, `/food`, `/events`, `/household`, `/profile`). Labels were renamed in the Hearth redesign; custom hand-drawn icons live in `src/components/ui/hearth/NavIcons.tsx`.
- **Food hub** (`/food`): Pill tabs — Overview | Recipes | Plan | Lists
- **Household** (`/household`): redirects to last tab (`/household/chores` or `/household/activities`); the [Chores | Activities] segmented control (shared `<HouseholdTabs>`) sits at the top of those pages
- **Me** (`/profile`): Circles, Settings, Theme, Language, Subscription. "Appearance → Household skin" is planned (skin system is in place, UI not yet routed).

## Design language — "Hearth"
- Warm cream (`--rp-bg #faf6ef`) + ember terracotta (`--rp-brand #c4522d`) + sage + candlelight gold. Old teal `#2bbaa0` and orange `#f97316` are retired.
- Fonts: Instrument Serif italic (page titles, display), Geist (sans body/UI), Caveat (one handwritten accent per screen max).
- Tokens: `--rp-*` CSS vars in `src/index.css`, Tailwind v4 `@theme` exposes them (`bg-rp-brand`, `text-rp-ink`, `font-display`, `shadow-rp-card`, …).
- Skin system: `src/lib/skins.ts` (6 built-in skins as of v1.13.0 — Hearth, Citrus, Brooklyn, Meadow, Studio, Night Market) + `SkinProvider` writes the active circle's tokens onto `<html>`. Schema: `circles.skin_id text DEFAULT 'hearth'` + `circles.custom_skin jsonb` (migration 024). Migration 029 remaps retired v1 ids; runtime fallback via `LEGACY_SKIN_REMAP`.
- Shared primitives in `src/components/ui/hearth/`: `Avatar`, `AvatarStack`, `CircleGlyph`, `RingsOrnament`, `PageTitle`, `DisplayTitle`, `MonoLabel`, `HandAccent`, `PhotoPlaceholder`, nav icons. Full spec: `handoff/DESIGN_SYSTEM.md` + `handoff/SKINS.md`; visual reference: `handoff/Replanish Redesign.html`.

## File Structure
```
src/
  components/     # Shared/reusable UI components
  pages/          # 24+ pages organized by domain
  services/       # 12 service files (Supabase queries)
  hooks/          # Shared hooks
  lib/            # Supabase client, i18n config, utils
  locales/        # i18n translation files (en, he)
  types/          # Shared TypeScript types
  stores/         # Zustand stores
supabase/
  migrations/     # 33 numbered migrations (030-034 are recipe-bank lineage:
                  #  030 bank table, 031 async-jobs, 032 cron, 033 reserved
                  #  for Event Planner v2, 034 v2.0.0 link-first overhaul)
  functions/      # Edge Functions (ai-chat, scrape-recipe, generate-meal-plan,
                  #  plan-event, get-recipe, nlp-action, create-checkout, stripe-webhook,
                  #  meal-engine, meal-plan-worker, recipe-bank-refresher,
                  #  auditor-from-imports [v2.0.0])
e2e/              # Playwright E2E tests
```

## Dev Commands
```bash
npm run dev                # Local dev (localhost:5173)
npm run build              # Production build
npx tsc --noEmit           # Type-check
npx playwright test        # E2E tests
git push origin master     # Triggers Vercel deploy
```

## Security
- RLS on all tables, enforced via `get_my_circle_ids()` security definer
- Never commit `.env` or secrets
- Security definer functions for cross-RLS operations
- Input validation on Edge Functions

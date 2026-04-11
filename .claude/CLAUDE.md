# OurTable — Family & Social Coordination PWA

## What This Is
A mobile-first Progressive Web App for family and social group coordination — combining circles/groups, event/potluck planning, collaborative shopping lists, meal planning, chores, and activities.

## Stack
- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Radix UI + dnd-kit + Framer Motion
- **Backend/DB:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Hosting:** Vercel (auto-deploys from `master`)
- **PWA:** vite-plugin-pwa with Workbox, offline persistence via IndexedDB
- **i18n:** English + Hebrew (RTL support required), 300+ translation keys

## Architecture
- Mobile-first responsive design — desktop is secondary
- Offline-first for shopping lists (sync when online via Supabase Realtime)
- Row Level Security (RLS) on all Supabase tables — no exceptions
- Real-time sync via Supabase Realtime subscriptions for shared data
- Auth via Supabase Auth (email/password + Google OAuth)

## Key Product Decisions
- Shopping lists are the daily-habit retention hook (2-3x/week usage)
- Israeli market focus — Hebrew/RTL is first-class, not an afterthought
- Circles are the foundation — everything (events, lists, meals, chores, activities) is scoped to a circle

## Conventions
- TypeScript strict mode, no `any` unless justified with comment
- Functional components with hooks only
- Supabase migrations numbered NNN_description.sql, must be idempotent
- Tailwind CSS for styling, mobile-first breakpoints
- All user-facing strings go through i18n — never hardcode text
- Services layer: one file per domain in `src/services/` (Supabase queries + helpers)
- Pages in `src/pages/`, organized by domain

## Navigation
- **Bottom nav**: Home | Food | Events | Household | Profile (5 domain-based tabs)
- **Food hub** (`/food`): Pill tabs — Overview | Recipes | Plan | Lists
- **Household hub** (`/household`): Segmented control — Chores | Activities
- **Profile** (`/profile`): Circles, Settings, Theme, Language, Subscription

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
  migrations/     # 18 numbered migrations
  functions/      # Edge Functions (scrape-recipe)
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

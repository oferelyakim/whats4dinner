# Replanish Architecture

## System Overview

Replanish is a family coordination Progressive Web App targeting the US market. It helps households manage meals, shopping, events, chores, and activities through shared "circles" (family groups). Revenue comes from (1) retailer cart integrations (Walmart-first affiliate add-to-cart from shopping lists) and (2) AI subscriptions (Individual / Family tiers that unlock AI meal planning, recipe import, AI assistant, and event planning). Hebrew/RTL is fully supported as a secondary locale.

```
┌─────────────────────────────────────────────────┐
│                   Vercel CDN                     │
│              (auto-deploy from master)           │
├─────────────────────────────────────────────────┤
│           React 19 SPA (PWA + Workbox)           │
│    TypeScript  |  Tailwind v4  |  Radix UI       │
│    Zustand (UI state)  |  TanStack Query (data)  │
├─────────────────────────────────────────────────┤
│              Services Layer (src/services/)       │
│         12 service files — all DB access here     │
├─────────────────────────────────────────────────┤
│                 Supabase Platform                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Auth     │ │ Realtime │ │ Edge Functions    │ │
│  │ email+   │ │ channels │ │ 8 functions       │ │
│  │ Google   │ │          │ │ (ai-chat, stripe…)│ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────────────────────────────────┐│
│  │        PostgreSQL + Row Level Security        ││
│  │   Security definer functions (RLS core)       ││
│  │   22 migrations | 15+ tables                  ││
│  └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

## Frontend Architecture

### Stack
- **React 19** with TypeScript (strict mode)
- **Vite 8** for build tooling and dev server
- **Tailwind CSS v4** for utility-first styling
- **Radix UI** for accessible component primitives
- **dnd-kit** for drag-and-drop (shopping lists, store routes)
- **Framer Motion** for animations

### State Management
- **Zustand** for UI state (i18n locale, theme, transient UI)
- **TanStack Query** for server state (caching, invalidation, background refetch)
- **IndexedDB** for offline persistence via TanStack Query persist (`src/lib/queryPersist.ts`)

### Navigation (Hub-Based)
Bottom navigation with 5 domain-based tabs:

```
Home  |  Food  |  Events  |  Household  |  Profile
```

- **Food Hub** (`/food`): Internal pill tabs for Overview, Recipes, Plan, Lists
- **Household Hub** (`/household`): Segmented control for Chores and Activities
- **Profile** (`/profile`): Circles, Settings, Theme, Language, Subscription

### Pages and Components
- 24+ page components in `src/pages/`, organized by domain
- Shared components in `src/components/`
- Custom hooks in `src/hooks/`
- Utilities in `src/lib/` (i18n, calendar, cn, constants, subscription)

## Data Layer

### Supabase PostgreSQL
All data stored in Supabase-hosted PostgreSQL with Row Level Security enforced on every table.

### RLS Pattern
```
Client Request → Supabase API → RLS Policy Check → get_my_circle_ids() → Data
```
Security definer functions (`SECURITY DEFINER`) bypass RLS internally to avoid recursion when policies need cross-table lookups.

### Services Layer
`src/services/` contains 12 files, one per domain:
- `supabase.ts` (client init), `circles.ts`, `recipes.ts`, `recipeImport.ts`
- `shoppingLists.ts`, `mealPlans.ts`, `mealMenus.ts`, `events.ts`
- `stores.ts`, `chores.ts`, `activities.ts`, `ai-usage.ts`

Components never call Supabase directly. All queries and mutations go through service functions.

### Realtime
Supabase Realtime channels provide live updates for:
- Shopping list item changes (check/uncheck, add/remove)
- Event item updates (claims, assignments)

## Authentication

- **Supabase Auth** with two providers:
  - Email/password (with email confirmation)
  - Google OAuth
- Auth state managed via Supabase client
- `auth.uid()` used in all RLS policies
- Profile auto-created on first sign-in via database trigger

## PWA and Offline

- **vite-plugin-pwa** with Workbox for service worker
- **Precaching**: HTML shell, JS/CSS bundles
- **Runtime caching**: Network-first for API, cache-first for static assets
- **IndexedDB**: Offline persistence for shopping lists and query cache
- **Background sync**: Queued mutations replayed on reconnect
- **Install prompt**: Custom UI for PWA installation on mobile

## Internationalization and RTL

- **Two locales**: English (`en`, primary — US market) and Hebrew (`he`, secondary)
- **300+ translation keys** in `src/lib/i18n.ts` (Zustand store with persistence)
- **RTL layout**: Logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`, `text-start`)
- **Direction**: `dir()` helper returns `'rtl'` or `'ltr'` based on locale
- **Bidirectional text**: `dir="auto"` for user-generated content

## Deployment

### Frontend (Vercel)
- Auto-deploys from GitHub `master` branch
- `.env.production` has public Supabase keys hardcoded (Vercel env var caching workaround)
- Build: `npm run build` (Vite)

### Backend (Supabase)
- Hosted Supabase project
- Migrations in `supabase/migrations/` (001-022)
- Edge Functions deployed via CLI: `npx supabase functions deploy`
- Database changes applied via Supabase dashboard or migration files

## Feature Domains

### Circles
Family/group management. Users create or join circles via invite codes/links/email. All data is circle-scoped.

### Food
- **Recipes**: CRUD, ingredient autocomplete, auto-tags, multi-ingredient search, AI import from URL/photo, sharing via link, supply kits
- **Shopping Lists**: CRUD, real-time sync, DnD reorder, store route sorting, ingredient deduplication
- **Meal Planning**: Week view, multi-recipe per slot, templates, copy week, calendar export
- **Stores**: Department ordering for optimized shopping routes

### Events
Potluck/gathering coordination with 5 tabs (Overview/Mine/Menu/Supplies/Tasks), invite links, co-organizers, item claiming/assignment, cloning, calendar export.

### Household
- **Chores**: Frequency-based (daily/weekly/biweekly/monthly/once), emoji icons, points system, completion tracking
- **Activities**: Recurring schedules (weekly/biweekly/daily), participant management, bring-items, weekly calendar view

## Revenue Model

Replanish monetizes through two streams:

### 1. Retailer Cart Integrations (primary long-term)
One-tap "send to cart" from any shopping list to US grocery retailers. Walmart-first (affiliate add-to-cart API), Instacart and Amazon Fresh planned. Revenue = affiliate commission on purchased items. Free for users. (Integration work in progress — see roadmap.)

### 2. AI Subscriptions

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | All core coordination features |
| AI Individual | $4.99/mo | AI recipe import (URL/photo), AI meal planning, AI assistant chat, event planning AI |
| AI Family | $6.99/mo | AI features for up to 5 circle members |

- `useAIAccess` hook gates AI features
- `AIUpgradeModal` for upgrade prompts
- `UsageMeter` shows monthly AI consumption
- AI usage capped at $4.00/mo with $3.00 warning threshold
- Stripe integration: `create-checkout` + `stripe-webhook` Edge Functions (requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` secrets)

## Testing

- **Playwright E2E** with chromium and mobile-chrome profiles
- ~86 tests across 14 spec files in `e2e/`
- Tests mock Supabase auth via `page.route()` and localStorage
- Config: `playwright.config.ts`

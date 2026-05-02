# Replanish

Family life, planned & shared — together. A mobile-first Progressive Web App for US households to coordinate meals, shopping, events, chores, and activities.

**Live**: [replanish.app](https://replanish.app) (marketing site) · [app.replanish.app](https://app.replanish.app) (app)

## Product (v3.0)

Replanish is built for US families. Two revenue streams:

1. **Retailer cart integrations** — one-tap send of a shopping list's ingredients to retailer carts (Walmart-first, Instacart/Amazon Fresh next), earning affiliate commission. The long-term lever.
2. **Replanish AI subscription** — single tier, $6/mo or $60/yr (14-day annual trial). Unlocks per-meal AI swap, pantry/leftover reroll, unlimited recipe URL imports, smart shopping consolidation, the AI event planner, and the in-app AI assistant.

All core coordination — circles, the **shared weekly recipe drop** (NEW in v3.0, free for everyone), manual meal planning, shopping lists, events, chores, activities — is free. Hebrew/RTL fully supported.

Full product story: see [docs/v3/PRODUCT.md](docs/v3/PRODUCT.md). Marketing copy and the `/sources` legal-attribution page live in [docs/v3/](docs/v3/).

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Radix UI + dnd-kit + Framer Motion
- **State**: Zustand (UI) + TanStack Query (server) + IndexedDB (offline)
- **Database**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **AI**: Claude API (Haiku 4.5 + Sonnet 4.5 fallback) via Supabase Edge Functions
- **Payments**: Stripe (Edge Function checkout + webhook)
- **Hosting**: Vercel (auto-deploy from `master`)
- **PWA**: vite-plugin-pwa + Workbox for offline support
- **i18n**: English (primary) + Hebrew with full RTL layout support

## Getting Started

### Prerequisites
- Node.js 18+
- npm
- Supabase account (or use the hosted project)

### Installation
```bash
npm install
```

### Environment Variables
Create `.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Supabase Edge Function secrets (set via `npx supabase secrets set`):
```
ANTHROPIC_API_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_MONTHLY=...
STRIPE_PRICE_ANNUAL=...
```

### Development

```bash
npm run dev          # Dev server at localhost:5173
npm run build        # Production build
npx tsc -b           # Strict type-check (the Vercel gate)
npx vitest run       # Unit + integration tests
npx playwright test  # E2E tests
```

### Supabase Setup

```bash
# Apply migrations (or use db push for the full set)
npx supabase db push

# Deploy edge functions in one command
npm run deploy:functions
# Ships: meal-engine, ai-chat, recipe-bank-refresher, event-engine,
#        auditor-from-imports, weekly-drop-generator
```

## Project Structure

```
Replanish_App/
├── src/
│   ├── pages/        24+ page components by domain
│   ├── components/   Shared UI components
│   ├── services/     Supabase queries (incl. recipe-bank.ts for v3 drops)
│   ├── engine/       Meal-planning slot engine + Dexie offline store
│   ├── hooks/        Custom React hooks
│   ├── stores/       Zustand stores
│   └── lib/          i18n, version, utilities, constants
├── supabase/
│   ├── migrations/   38 numbered SQL migrations (035–038 are v3.0)
│   └── functions/    Edge Functions (see DEPLOY.md for the full list)
├── docs/v3/          v3.0 product, marketing, FAQ, sources, partner-pitch, press kit
├── e2e/              Playwright E2E tests
└── public/           PWA manifest, icons
```

## Features (v3.0)

- **Weekly drop** — 126 curated recipes drop every Sunday at 6 AM ET (10 dinners + 5 lunches + 3 breakfasts per day for 7 days). Free for everyone, every diet.
- **Circles** — household groups with invite codes/links/email
- **Recipes** — CRUD, AI import from URL/photo (paid: unlimited; free: 10/month), ingredient search, sharing
- **Shopping Lists** — real-time sync, offline-first, drag reorder, store-route sorting, ingredient deduplication
- **Meal Planning** — drag-and-drop from the drop, manual slot assembly, templates, calendar export, per-meal AI swap (paid)
- **Events** — potluck coordination with item claiming, co-organizers, 5-tab view, AI event planner via dynamic questionnaire (paid)
- **Chores** — frequency-based scheduling, points system, completion tracking
- **Activities** — recurring schedules, participants, bring-items, calendar drill-down, reminders
- **Home** — daily dashboard with quick-action input (AI)
- **AI Assistant** — in-app chat powered by Claude, gated by subscription + monthly cap
- **Subscriptions** — Stripe checkout (Edge Function) for Replanish AI ($6/mo or $60/yr, 14-day trial)
- **i18n** — English + Hebrew with full RTL layout
- **PWA** — installable, offline shopping lists, background sync

## Architecture

- See [docs/v3/PRODUCT.md](docs/v3/PRODUCT.md) for product architecture.
- See [DEPLOY.md](DEPLOY.md) for the deploy runbook.
- See [CLAUDE.md](CLAUDE.md) for codebase conventions and Replanish-specific context.

## Deployment

Frontend auto-deploys to Vercel on push to `master`. Database and Edge Functions on Supabase.

```bash
# 1. Bump version in src/lib/version.ts and package.json
# 2. Strict type-check (Vercel runs this — must be clean)
npx tsc -b
# 3. Verify tests + build
npx vitest run && npm run build
# 4. Commit and push
git push origin master  # Triggers Vercel deploy
# 5. Redeploy affected edge functions
npm run deploy:functions
```

Full runbook with v3-specific steps: [DEPLOY.md](DEPLOY.md).

## License

MIT

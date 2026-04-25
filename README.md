# Replanish

Family life, planned & shared — together. A mobile-first Progressive Web App for US households to coordinate meals, shopping, events, chores, and activities.

**Live**: [replanish.app](https://replanish.app) (marketing site) · [app.replanish.app](https://app.replanish.app) (app)

## Product

Replanish is built for US families. Revenue comes from two streams:

1. **Shopping cart integrations** — one-tap send of a shopping list's ingredients to retailer carts (Walmart-first, Instacart/Amazon Fresh next), earning affiliate commission on purchases.
2. **AI subscriptions** — AI Individual ($4.99/mo) and AI Family ($6.99/mo, 5 members) unlock AI meal planning, recipe import from URL/photo, the in-app AI assistant, and event planning.

All core coordination features (circles, shopping lists, meal plans, events, chores, activities) are free. Hebrew/RTL remains fully supported as a secondary locale.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Radix UI + dnd-kit + Framer Motion
- **State**: Zustand (UI) + TanStack Query (server) + IndexedDB (offline)
- **Database**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **AI**: Claude API (Haiku/Sonnet) via Supabase Edge Functions
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
STRIPE_PRICE_INDIVIDUAL=...
STRIPE_PRICE_FAMILY=...
```

### Development

```bash
npm run dev          # Dev server at localhost:5173
npm run build        # Production build
npx tsc --noEmit     # Type-check
npx playwright test  # E2E tests
```

### Supabase Setup

```bash
# Apply migrations
npx supabase db push

# Deploy edge functions
npx supabase functions deploy scrape-recipe --no-verify-jwt
npx supabase functions deploy ai-chat --no-verify-jwt
npx supabase functions deploy generate-meal-plan --no-verify-jwt
npx supabase functions deploy plan-event --no-verify-jwt
npx supabase functions deploy get-recipe --no-verify-jwt
npx supabase functions deploy nlp-action --no-verify-jwt
npx supabase functions deploy create-checkout --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

## Project Structure

```
Replanish_App/
├── src/
│   ├── pages/        24+ page components by domain
│   ├── components/   Shared UI components
│   ├── services/     Service files (all Supabase queries)
│   ├── hooks/        Custom React hooks
│   ├── stores/       Zustand stores
│   └── lib/          i18n, version, utilities, constants
├── supabase/
│   ├── migrations/   22 numbered SQL migrations
│   └── functions/    Edge Functions (ai-chat, scrape-recipe, generate-meal-plan,
│                     plan-event, get-recipe, nlp-action, create-checkout, stripe-webhook)
├── e2e/              Playwright E2E tests
└── public/           PWA manifest, icons
```

## Features

- **Circles**: Household groups with invite codes/links/email
- **Recipes**: CRUD, AI import from URL/photo, ingredient search, sharing, Essentials (non-food kits)
- **Shopping Lists**: Real-time sync, offline-first, drag reorder, store route sorting, ingredient deduplication
- **Meal Planning**: Week view, multi-recipe slots, templates, calendar export, AI weekly plan generation
- **Events**: Potluck coordination with item claiming, co-organizers, 5-tab view, AI event planning
- **Chores**: Frequency-based scheduling, points system, completion tracking, assignee filters
- **Activities**: Recurring schedules, participants, bring-items, month/week/day calendar, reminders
- **Home**: Daily dashboard with NLP quick-action input (AI)
- **AI Assistant**: In-app chat powered by Claude, gated by subscription + monthly cap
- **Subscriptions**: Stripe checkout (Edge Function) for AI Individual / AI Family plans
- **i18n**: English + Hebrew with full RTL layout
- **PWA**: Installable, offline shopping lists, background sync

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## Deployment

Frontend auto-deploys to Vercel on push to `master`. Database and Edge Functions on Supabase.

```bash
# 1. Bump version in src/lib/version.ts and package.json
# 2. Type-check
npx tsc --noEmit
# 3. Commit and push
git push origin master  # Triggers Vercel deploy
# 4. Redeploy affected edge functions
npx supabase functions deploy <name> --no-verify-jwt
```

## License

MIT

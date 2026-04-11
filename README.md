# OurTable — השולחן שלנו

Family coordination PWA for meals, shopping, events, chores, and activities. Built for the Israeli market with full Hebrew/RTL support.

**Live**: [whats4dinner-gamma.vercel.app](https://whats4dinner-gamma.vercel.app)

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Radix UI
- **State**: Zustand (UI) + TanStack Query (server) + IndexedDB (offline)
- **Database**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Hosting**: Vercel (auto-deploy from `master`)
- **PWA**: vite-plugin-pwa + Workbox for offline support
- **i18n**: Hebrew + English with full RTL layout support

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
```

## Project Structure

```
whats4dinner/
├── src/
│   ├── pages/        24+ page components by domain
│   ├── components/   Shared UI components
│   ├── services/     12 service files (all Supabase queries)
│   ├── hooks/        Custom React hooks
│   └── lib/          i18n, utilities, constants
├── supabase/
│   └── migrations/   18 numbered SQL migrations
├── e2e/              Playwright E2E tests (~86 tests)
└── public/           PWA manifest, icons
```

## Features

- **Circles**: Family groups with invite codes/links/email
- **Recipes**: CRUD, AI import from URL/photo, ingredient search, sharing, supply kits
- **Shopping Lists**: Real-time sync, offline-first, drag reorder, store route sorting
- **Meal Planning**: Week view, multi-recipe slots, templates, calendar export
- **Events**: Potluck coordination with item claiming, co-organizers, 5-tab view
- **Chores**: Frequency-based scheduling, points system, completion tracking
- **Activities**: Recurring schedules, participant management, weekly calendar
- **i18n**: Full Hebrew/English with RTL layout support
- **PWA**: Installable, offline shopping lists, background sync

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## Deployment

Frontend auto-deploys to Vercel on push to `master`. Database hosted on Supabase.

```bash
git push origin master  # Triggers Vercel deploy
```

## License

MIT

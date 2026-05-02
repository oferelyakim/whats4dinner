# Replanish — Product Doc (v3.0)

This is the master product document for Replanish v3.0. Every other doc in `docs/v3/` is a slice of this one, formatted for a specific audience.

## What Replanish is

> **Replanish is a free family meal planner with a fresh recipe drop every Sunday.**
> Plan your week, share with your household, generate the shopping list, and send it straight to Walmart in one tap.

A mobile-first Progressive Web App for US households. It coordinates the things families actually argue about: what to cook, who's bringing what to the dinner party, who's picking up the milk, who promised to walk the dog.

**Live at:**
- Marketing site: <https://replanish.app>
- App: <https://app.replanish.app>

## Who it's for

| Audience | Their problem | What Replanish gives them |
|---|---|---|
| **Busy families** | "What's for dinner?" every night, half-empty fridge, mid-week grocery runs | A weekly menu that's already done. Drag dinners onto the week, the shopping list builds itself, send it to Walmart. |
| **Hosts & potluck organizers** | Spreadsheets and group-chat chaos when planning a gathering | Events module: claim/assign menu items, supplies, tasks. Invite via link. |
| **Roommates** | Whose turn is it to buy paper towels / take out the trash | Shared shopping lists + chores with rotation. |
| **Caregivers planning meals for others** | Diet restrictions, kid-friendly options, weekly variety | Diet filters across the recipe bank, pantry rerolls, per-meal swaps. |

Primary market: **United States** (English, USD, Walmart-first). Hebrew/RTL fully supported.

## The five modules

Replanish is built around a single foundational unit — the **circle** (a household, family, friend group, or event-specific group). Every other module is scoped to a circle.

### 1. Meal planning — *the daily-decision module*
- **Weekly drop** (NEW in v3.0): every Sunday at 06:00 ET, a curated menu of **126 recipes** lands — 10 dinner options + 5 lunch + 3 breakfast per day. Free for everyone. Diet-tagged across omnivore, vegetarian, vegan, gluten-free, dairy-free, kosher, halal, low-carb, Mediterranean.
- **Manual planning**: drag-and-drop from the drop into your week, or pick from your own saved recipes, or apply a template.
- **Quick fill** (free): one tap fills your week from the drop using deterministic round-robin.
- **AI per-meal swap** (paid): "make this dinner vegan" / "swap chicken for tofu" — rewrites one slot.
- **AI pantry reroll** (paid): "I have chicken and broccoli" → 3 dishes from the bank that match.

### 2. Shopping lists — *the daily-habit module*
- Offline-first, real-time sync across the household.
- Build automatically from selected recipes, or add ad-hoc.
- Department sorting, store routes, item check-off.
- **AI shopping consolidation** (paid): dedupe ingredients across the week, then add them to an existing shopping list or a new one — one tidy list instead of duplicate rows from each recipe.
- **Walmart cart export** (v3.1, planned): one-tap send to Walmart's affiliate cart.

### 3. Events — *the coordination module*
- Potlucks, dinner parties, holiday gatherings, picnics, reunions.
- 5-tab detail page: Overview / Mine / Menu / Supplies / Tasks.
- Invite via link, claim/assign items, co-organizers, calendar export.
- **AI event planner** (paid, dynamic questionnaire): walks you through 4–12 adaptive questions, proposes dishes/supplies/tasks/activities. Catalog fallback for free tier.

### 4. Chores — *the rotation module*
- Daily/weekly/biweekly/monthly/once.
- Emoji icons, assignee filter chips, points system, completion tracking.
- Colored person headers per assignee.

### 5. Activities — *the calendar module*
- Recurring schedules (daily/weekly/biweekly/monthly/yearly).
- Circle member assignment, participants, bring-items.
- Month/week/day calendar drill-down with reminders.

## What changed in v3.0

| | v2.x (retired) | v3.0 |
|---|---|---|
| **Weekly plan** | Per-user AI generation (Sunday batch, ~$0.42/week/user, fragile) | One curated drop per week, served to all users (zero AI per user) |
| **AI on the meal planner** | "I generate your week" | "I help you decide tonight" — per-meal swap, pantry reroll |
| **Recipe source** | AI-imagined or per-user web-searched | Bank-first (400+ recipes at launch, link to original source) |
| **Free tier** | Limited weekly plans, capped imports | Full weekly drop, manual planning, 10 URL imports/month |
| **Paid tier** | Per-user weekly AI plan + imports | Per-meal swap + unlimited imports + pantry reroll + smart shopping consolidation |
| **Pricing** | $6/mo or $60/yr (14-day annual trial) | **Unchanged** |

## Free vs paid

| Capability | Free | Replanish AI ($6/mo, $60/yr) |
|---|---|---|
| Weekly drop (126 curated recipes) | ✓ | ✓ |
| Manual week planning | ✓ | ✓ |
| Quick fill | ✓ | ✓ |
| Shopping list (sync, share) | ✓ | ✓ |
| Walmart cart export *(v3.1)* | ✓ | ✓ |
| Events / chores / activities | ✓ | ✓ |
| Recipe URL imports | 10 / month | **Unlimited** |
| AI per-meal swap | — | ✓ |
| AI pantry / leftover reroll | — | ✓ |
| AI shopping consolidation | — | ✓ |
| AI event planner | — | ✓ |
| AI chat assistant | — | ✓ |
| 4-seat household sharing | — | ✓ (owner + 3) |

14-day free trial on the annual plan.

## Recipe bank — where the recipes come from

The bank is the spine of v3.0. It holds **link-first recipe records** — URL, title, image, ingredients, tags — and points users to the original source for full instructions. Three sources feed it:

1. **Curated discovery** — automated cron + editorial curation from reputable food sources (food blogs, recipe sites). Honored `robots.txt` + opt-out path.
2. **User imports** — paid users import recipes from any URL; the auditor strips PII, tags, and promotes them to the shared bank.
3. **Manual seed** — a one-shot script fills coverage gaps (ensuring every diet × meal × role cell has ≥10 options).

**Legal posture:** ingredient lists are factual data (not copyrightable per *Feist v. Rural*). Full instructions are not stored — we link out or summarize in our own words at user-open time. Public attribution at `/sources`. Opt-out path documented.

## Data architecture

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Radix UI
- **Backend**: Supabase (Postgres + Auth + Realtime + Edge Functions)
- **Hosting**: Vercel (auto-deploys from `master`)
- **PWA**: vite-plugin-pwa, offline-first via IndexedDB
- **AI**: Claude Haiku 4.5 (Sonnet 4.5 for fallback compose) via Edge Functions
- **Payments**: Stripe (Edge Functions: `create-checkout`, `stripe-webhook`)
- **i18n**: English (primary) + Hebrew (RTL supported)
- **Security**: Row Level Security on every table, security-definer functions for cross-RLS operations

## Revenue model

Two streams:

1. **Replanish AI subscription** — $6/mo or $60/yr. Live today. The four paid hooks (per-meal swap, unlimited imports, pantry reroll, shopping consolidation) are dense and tied to daily decisions, not Sunday batch operations.

2. **Retailer cart affiliate** — primary long-term lever. Walmart-first add-to-cart from shopping lists (v3.1). Instacart + Amazon Fresh planned. The bank's depth + the weekly drop's predictable cadence are what makes this pitch concrete to retailer BD teams.

## Brand & design — "Hearth"

- **Colors**: warm cream (`#faf6ef`), ember terracotta (`#c4522d`), sage, candlelight gold.
- **Typography**: Instrument Serif italic (display), Geist (body), Caveat (one handwritten accent per screen).
- **Skin system**: 6 built-in skins (Hearth, Citrus, Brooklyn, Meadow, Studio, Night Market). Per-circle theme.
- **Custom hand-drawn nav icons** for the 5 bottom-tab modules.

## Out of scope for v3.0

- Mobile native wrapper (TWA / Capacitor) — separate track.
- Locales beyond EN + HE.
- Re-architecting events / chores / activities — those modules are stable.
- Visual design refresh — handled separately via Claude-design handoff.

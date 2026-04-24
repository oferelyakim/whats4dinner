# CLAUDE.md — Replanish redesign (update existing app)

> **Replanish is an existing, working PWA.** This redesign is a **visual + UX refresh applied in place** — not a rewrite. Keep the data model, routing, auth, Supabase schema, and business logic untouched unless a section below explicitly says otherwise. Change styling, copy, component structure, and add the skin system.

## The "Hearth" redesign in one paragraph
Warm, handmade family coordination app. Cream + ember terracotta + sage + candlelight gold. Instrument Serif italic display + Geist sans + Caveat handwritten accents. Concentric-circle metaphor (the ring of people around a glowing home). Every core screen shows the *people* — stacked avatars, "Ben is bringing," who-did-what. Copy is warm and short. The table is the app.

## Before you change anything
1. Read `handoff/DESIGN_SYSTEM.md` — tokens, type scale, components, patterns, copy tone.
2. Read `handoff/SKINS.md` — the theming system (Hearth is the default skin; 8 others ship with it).
3. Open `handoff/Replanish Redesign.html` in a browser — this is the living visual reference. Every screen, every skin.
4. Import `handoff/design-tokens.css` into `src/index.css` (before Tailwind).
5. Merge `handoff/tailwind-extension.js` into `tailwind.config.ts` under `theme.extend`.

## Migration strategy: foundation → shell → pages

### Phase 1 — Foundation (do first, do not skip)
- [ ] Load Instrument Serif, Geist, Caveat fonts (next/font, `@fontsource`, or `<link>` — your call).
- [ ] Import `design-tokens.css` so `--rp-*` CSS vars resolve globally.
- [ ] Extend Tailwind with the tokens (`bg-rp-brand`, `text-rp-ink`, `font-display`, `font-hand`).
- [ ] Build the shared component library in `src/components/ui/`:
  - `Avatar` — initialed warm-color chip, 6-color hash-by-name
  - `AvatarStack` — overlapping row
  - `CircleGlyph` — members in a ring
  - `RingsOrnament` — decorative concentric rings SVG
  - `PageTitle` — Instrument Serif italic wrapper
  - `MonoLabel` — mono uppercase section label
  - `HandAccent` — Caveat tagline with slight rotation
  - `PhotoPlaceholder` — warm gradient + grain + lowercase label
  - Refresh existing `Button`, `Card`, `Pill` to use Hearth tokens
- [ ] Build `SkinProvider` (see `SKINS.md`) + migration `circles.skin_id DEFAULT 'hearth'` + `circles.custom_skin jsonb`.

### Phase 2 — Shell
- [ ] `AppShell` / layout — new bg, type, custom bottom-nav icons (hearth, pot, table, house, person).
- [ ] Rename nav labels: Events → **Gather**, Profile → **Me**, Household → **House**. (Home, Food stay.)
- [ ] Dark mode flag wired to the `.dark` class on `<html>`; Dusk palette takes over.

### Phase 3 — Pages (in order of visibility)
1. `HomePage` — flagship
2. `EventsPage` + `EventDetailPage` — emotional peak (Gather)
3. `FoodHubPage` — weekly rhythm
4. `ShoppingListPage` — shared gathering feel
5. `CirclesPage` + `CircleDetailPage` — the people page
6. `OnboardingPage` — add step 3 "pick your skin" (see `SkinStudioScreen` in the HTML reference)
7. `ChoresPage`, `ActivitiesPage`, `MealMenusPage`, `PlanPage`
8. `RecipesPage`, `RecipeDetailPage`, `RecipeFormPage`
9. `ProfilePage`, `MorePage` — add **Appearance → Household skin** entry
10. `StoresPage`, `StoreRoutePage`, auth/join flows

### Phase 4 — Skin system polish
- [ ] Ship all 9 built-in skins (Hearth, Coastal, Ranch, Pacific, Brooklyn, Tuscan, Meadow, Dusk, Night Market).
- [ ] Custom skin builder route (AI Family tier only) — see `SKINS.md` §"Custom skin builder."
- [ ] Run `npm run skins:check` a11y contrast lint at PR time.

## Refactor rules (apply as you migrate each file)
- Replace `#2bbaa0` (old teal) → `var(--rp-brand)` or `bg-rp-brand`.
- Replace `#f97316` (old orange) → `var(--rp-glow)` or `bg-rp-glow`.
- Replace Inter → Geist.
- Every page `<h1>` → **Instrument Serif italic, 30–32px**, never sans.
- Emojis used as functional icons → brand icon set.
- Hardcoded hex values → CSS vars. No exceptions.
- One Caveat handwritten accent per screen, max. Warmth, not decoration.

## Copy tone (quick reference)
- Warm, short, personal. "Tonight at the table" > "Tonight's meal."
- Lowercase for incidental labels ("pantry", "tonight"); Title Case for actions and proper sections.
- Full tone guide: `DESIGN_SYSTEM.md` §8.

## What NOT to change
- Data model / Supabase schema — except the two skin columns on `circles`.
- Routing / URLs.
- Auth flow logic.
- Business logic, scheduling, notification rules.
- Feature set — no new features during the visual refresh.

## What NOT to do
- Don't pull in shadcn, daisy, Material, or any UI kit wholesale. Hearth is custom.
- Don't use Lucide, Feather, or Material icons for the five custom nav icons.
- Don't slap gradients behind everything.
- Don't gamify aggressively — points are a gentle pill, not confetti.
- Don't ship inline style objects to production. The design HTML uses them; your code uses Tailwind.

## When in doubt
Open `handoff/Replanish Redesign.html` and find the screen you're working on. If your output doesn't feel like that, keep iterating.

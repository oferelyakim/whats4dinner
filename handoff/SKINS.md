# Skin System — Implementation Guide

> Appendix to `DESIGN_SYSTEM.md`. Covers theming, regional skins, and the custom-skin builder.

## What a skin is

A **skin** is a named set of design tokens. It includes:

1. **Color tokens** (10 required) — `bg, bgSoft, bgDeep, ink, inkSoft, inkMute, hairline, card, brand, brandSoft, brandDeep, accent, accentSoft, glow, glowSoft, cool, coolSoft`
2. **Optional overrides** — `display` font, `sans` font, `hand` font, `radius` scale, `density` preset
3. **Metadata** — `id, name, sub (tagline), tag (hand-font accent)`

Layout, spacing, copy tone, iconography, and the concentric-circle metaphor **do not change** between skins. This is a deliberate constraint — it keeps the app feeling like "one app with outfits" rather than three disjoint products.

## Built-in skins (v1)

| id | name | sub | mood |
|---|---|---|---|
| `hearth` | Hearth | warm homey | default |
| `coastal` | Coastal | breezy california | |
| `ranch` | Ranch | hearty texas | |
| `pacific` | Pacific | misted pnw | |
| `brooklyn` | Brooklyn | urban premium | |
| `tuscan` | Tuscan | rustic italian | |
| `meadow` | Meadow | sage & honey | |
| `dusk` | Dusk | candlelit | dark |
| `night` | Night Market | festive | dark |

All tokens live in `src/lib/skins.ts`. See `replanish/tokens.jsx` in the design project for the full color values.

## Data model

```ts
// src/lib/skins.ts
export type Skin = {
  id: string
  name: string
  sub: string
  tag: string
  tokens: {
    bg: string; bgSoft: string; bgDeep: string
    ink: string; inkSoft: string; inkMute: string
    hairline: string; card: string
    brand: string; brandSoft: string; brandDeep: string
    accent: string; accentSoft: string
    glow: string; glowSoft: string
    cool: string; coolSoft: string
  }
  dark?: boolean
}

export const SKINS: Skin[] = [ /* ... */ ]
```

## Implementation in the real app

### 1. Persistence
- Store `skin_id` on the `circles` table (everyone in the circle sees the same skin).
- Add migration: `ALTER TABLE circles ADD COLUMN skin_id text DEFAULT 'hearth';`
- For a custom skin (AI Family only), store the full tokens JSON in `circles.custom_skin jsonb`.

### 2. Runtime application
A provider at the app root reads the active circle's `skin_id`, looks up tokens, and writes them as CSS variables on `<html>`:

```tsx
// src/components/SkinProvider.tsx
export function SkinProvider({ children }) {
  const { activeCircle } = useAppStore()
  const skin = resolveSkin(activeCircle?.skin_id, activeCircle?.custom_skin)

  useEffect(() => {
    const root = document.documentElement
    Object.entries(skin.tokens).forEach(([k, v]) => {
      root.style.setProperty(`--rp-${kebab(k)}`, v)
    })
    root.classList.toggle('dark', !!skin.dark)
  }, [skin])

  return children
}
```

All Tailwind utilities (`bg-rp-brand`, `text-rp-ink`, etc.) resolve through these CSS vars, so swapping skin = one writeback, no re-render needed.

### 3. Changing skin
- Onboarding: step 3 (`SkinStudioScreen` in design) lets the creator pick.
- Settings: `Me → Appearance → Household skin` (`SkinSettingsScreen`).
- Changes update `circles.skin_id` via a mutation. Supabase Realtime pushes to other members.

### 4. Adding a new built-in skin
```ts
// src/lib/skins.ts
export const SKINS: Skin[] = [
  // ...existing
  {
    id: 'prairie',
    name: 'Prairie',
    sub: 'wide-open midwest',
    tag: 'big sky',
    tokens: { bg: '#f4eee2', brand: '#9a6b2a', /* ... */ }
  }
]
```
Add to the card grid in `SkinStudioScreen` — no other code changes.

### 5. Custom skin builder (AI Family tier)
- Route: `/profile/settings/skin/custom`
- Design pattern: show a "live preview card" of the Home screen at top, then three color pickers (brand, accent, glow) + a "mood" slider (warm ↔ cool affecting bg/ink derivation).
- Generate remaining tokens procedurally:
  - `brandSoft` = mix(brand, card, 0.7)
  - `brandDeep` = darken(brand, 20%)
  - `glowSoft` = mix(glow, card, 0.7)
  - `accentSoft` = mix(accent, card, 0.7)
  - `bgSoft` = mix(bg, ink, 0.06)
  - `hairline` = ink @ 0.09 alpha
- Save JSON to `circles.custom_skin`; set `skin_id = 'custom'`.

## Accessibility checklist per skin

Every skin must pass:
- `ink` on `bg` — ≥ 7:1 contrast (AAA body)
- `ink` on `card` — ≥ 7:1
- `brand` on `bg` — ≥ 4.5:1 (for "brand-colored text" moments)
- `card` on `brand` — ≥ 4.5:1 (for white text on brand-filled CTAs)
- `brandDeep` on `brandSoft` — ≥ 4.5:1 (for chip text)

Build a `npm run skins:check` lint script using `culori` or `wcag-contrast` to enforce at PR time.

## Per-skin font overrides (optional, v2)

A skin can declare font overrides:
```ts
{
  id: 'ranch',
  fonts: { display: 'Playfair Display', sans: 'Work Sans' }
}
```

Apply via CSS vars same as colors: `--rp-ff-display`. Only add a font override if it genuinely shifts the mood (slab serif for Ranch, rounded humanist for Coastal). Most skins should use the default Instrument Serif + Geist.

## Out of scope for v1

- Per-skin icon sets — keep the five custom nav icons constant.
- Per-skin illustrations / photographic hero art — would be powerful but expensive to produce.
- Per-skin copy tone — deferred; one copy voice for now.
- Seasonal / time-of-day auto-skinning.

## File map

- `src/lib/skins.ts` — skin definitions + type
- `src/components/SkinProvider.tsx` — applies CSS vars at runtime
- `src/pages/SkinStudioPage.tsx` — onboarding step 3 + settings page
- `src/pages/CustomSkinPage.tsx` — builder (AI Family tier)
- `supabase/migrations/XXX_circle_skin.sql` — schema change

## Reference

Live skin preview: `Replanish Redesign.html` → Tweaks panel → Skin dropdown. Also the Skin Studio artboards in the design canvas.

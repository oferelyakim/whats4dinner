# Replanish Design System — "Hearth"

> Warm homey × boutique premium × a little playful.
> For families, roommates, and anyone who shops and plans together.

This document is the single source of truth for the Replanish visual language. All new UI must follow it. When in doubt, choose warmth and breath over density.

---

## 1. Design principles

1. **Circles, not grids.** The word "circles" is core to the brand. Favor concentric rings, radial layouts, overlapping discs, and soft-rounded shapes over hard rectangles. Use the concentric-ring ornament as signature.
2. **Feelings first.** Every screen should feel like a warm room at golden hour, not a productivity dashboard. Use serif display moments to create emotion; use sans for clean functional text.
3. **Shared, visibly.** When something is shared across family members, show the people. Stacked avatars, "Ben is bringing," who-claimed-what. Make the "together" visible in every core flow.
4. **A little silly.** One handwritten accent per screen (Caveat font) keeps it from feeling corporate. Examples: "✶ a good day to be four ✶" or "~ it's free ~".
5. **Breath.** Generous padding, 16-24px screen margins, text never cramped. The app is a calm place.
6. **No AI slop.** No gradient-behind-everything, no glassmorphism, no emoji-as-icon (except the intentional playful ones). Real warm colors, real type pairings.

---

## 2. Color tokens

Three palettes — user-switchable. `Hearth` is default.

### Hearth (default — warm cream + ember)
```
--bg:          #faf6ef   // warm cream
--bg-soft:     #f2ece0   // oatmeal
--bg-deep:     #1f1612   // deep espresso (dark hero blocks)
--ink:         #2a1f18   // warm black
--ink-soft:    #5c4a3e   // warm gray
--ink-mute:    #9a8878   // muted warm gray
--hairline:    rgba(42,31,24,0.08)
--card:        #ffffff

--brand:       #c4522d   // ember terracotta — primary
--brand-soft:  #f2c9b4   // soft peach tint for chips/bg
--brand-deep:  #8a2f1a   // used for text on brand-soft

--accent:      #6b7f56   // sage — secondary
--accent-soft: #d8deaf

--glow:        #e8a84a   // candlelight / honey — for moments of warmth
--glow-soft:   #f9e3b8

--cool:        #3e5970   // evening sky — balancing blue
--cool-soft:   #c9d4df
```

### Meadow (alt — sage + honey)
```
--bg:#f4f6ea --bg-soft:#e9edd8 --bg-deep:#1a2418
--ink:#1f2a1e --ink-soft:#536150 --ink-mute:#8fa089
--card:#ffffff --hairline:rgba(31,42,30,0.1)
--brand:#d6732a --brand-soft:#f4d4b4 --brand-deep:#7a3a10
--accent:#4a7c59 --accent-soft:#c9ddd1
--glow:#dfa62d --glow-soft:#f5e3b6
--cool:#4a6870 --cool-soft:#c9d8dc
```

### Dusk (dark, candlelit)
```
--bg:#1a1620 --bg-soft:#261f2e --bg-deep:#0f0c14
--ink:#f4ebe0 --ink-soft:#bcaea0 --ink-mute:#7d6e63
--card:#241d2a --hairline:rgba(255,235,210,0.08)
--brand:#e38466 --brand-soft:#6a3324 --brand-deep:#f2c9b4
--accent:#a8bb82 --accent-soft:#3a4a2d
--glow:#f0bf72 --glow-soft:#6a4a20
--cool:#7a95b2 --cool-soft:#2e3d4d
```

### Member avatar palette
Six warm, family-friendly hues. Assign by name hash so the same person always gets the same color.
```
honey:   bg #f4c78c ink #5a3a12
coral:   bg #e89b86 ink #5a2418
sage:    bg #b6c88a ink #324018
sky:     bg #a8b8d4 ink #1f2e4a
plum:    bg #d4a8c8 ink #4a1f3e
mustard: bg #e8c866 ink #4a3412
```

### Color rules
- **Never** use the old teal `#2bbaa0` or orange `#f97316`. They are retired.
- Backgrounds are `--bg` or `--card`. Never use pure white on Hearth (use `--card` which is #fff, but the overall canvas is cream).
- Text is `--ink` for body, `--ink-soft` for secondary, `--ink-mute` for metadata/labels.
- Interactive primary: `--brand`. Interactive success/done: `--accent`. Interactive highlight/CTA-adjacent warmth: `--glow`.
- Chips and badges use `-soft` backgrounds with `-deep` text.

---

## 3. Typography

Three families, each with a distinct role. Load via Google Fonts:
```
family=Instrument+Serif:ital@0;1 — display, italic by default
family=Geist:wght@400;500;600;700 — sans body/UI
family=Caveat:wght@500;700 — handwritten accent (use sparingly)
```

### Stack
```css
--ff-display: 'Instrument Serif', 'Times New Roman', serif;
--ff-sans:    'Geist', -apple-system, system-ui, sans-serif;
--ff-hand:    'Caveat', cursive;
--ff-mono:    ui-monospace, 'SF Mono', Menlo, monospace;
```

### Scale & usage
| Role | Family | Size | Weight | Letter-spacing | Notes |
|---|---|---|---|---|---|
| Display hero | Display, italic | 44–72px | 400 | -1 | Ad hero, onboarding |
| Page title | Display, italic | 30–32px | 400 | -0.5 | Every page title |
| Card title | Display, italic | 18–24px | 400 | 0 | Feature cards |
| Body | Sans | 13–14px | 400–500 | 0 | Default UI text |
| Metadata / labels | Mono uppercase | 10–11px | 600 | 1.2 | Section labels |
| Warmth accent | Hand | 15–22px | 500–700 | 0 | One per screen max |

**Rule:** Every main page title should be Instrument Serif italic. Never use sans for a page title.

---

## 4. Spacing, radii, shadows

```
--radius-xs: 8px
--radius-sm: 12px
--radius-md: 18px  // most cards
--radius-lg: 24px  // hero cards
--radius-xl: 32px  // marketing blocks
--radius-round: 9999px

--screen-px: 20px       // page horizontal padding
--card-pad: 18px        // default card interior
--gap-tight: 8px
--gap: 12px
--gap-loose: 18px

--shadow-card: 0 1px 0 var(--hairline), 0 10px 30px -18px rgba(40,20,10,0.2)
```

All cards have a hairline border + subtle warm-tinted shadow. Never use blue-tinted shadows.

---

## 5. Signature components

### RCircleGlyph
Concentric rings of avatars around a center. This is the brand's hero visual element — appears in onboarding, circle page, ad hero.

### RRingsOrnament
Four concentric hairline circles, used as decorative background behind hero blocks. Low opacity (0.16 stroke), positioned off-canvas so they bleed in.

### RAvatar
Warm-colored initialed chip. 22px for metadata, 26–30px for inline lists, 48–52px for "members of circle", 72px for hero.

### Stacked avatars
Overlapping with -8 to -10px margin, first avatar no offset. Always add a ring color (white on card, bg on screen) so they visually separate.

### Handwritten warmth
One Caveat line per screen, slightly rotated (-2 to -4deg), reduced opacity. Example placements: below content block, as subtle tagline near CTA.

### Photo placeholders
Warm gradient background (brand-soft → glow-soft → accent-soft) with multiply-blended dotted grain texture. Lowercase mono label in bottom-left describing what should go there ("long table · golden hour").

---

## 6. Iconography

Hand-drawn style, 1.6px stroke, rounded line caps.
- **Home:** house with hearth inside (not generic house)
- **Food:** pot with steam curls
- **Events / Gather:** oval table from 3/4 perspective
- **House:** house with circle inside
- **Me:** simple person bust

Avoid the standard lucide set for the main navigation — these five custom icons define the brand. Secondary UI icons can use lucide.

---

## 7. Navigation structure

Five bottom-nav tabs (rename pattern):
```
Home → "Home"
Food → "Food" (kitchen metaphor)
Events → "Gather" (warmer word)
Household → "House"
Profile → "Me"
```

Active tab: icon + label in `--brand`, icon sits inside a rounded `--brand-soft` pill (36×36, radius 10).
Inactive: `--ink-mute`.

---

## 8. Copy tone

- Warm, short, a touch poetic. "Tonight at the table" > "Tonight's meal."
- Personal. "Ben is bringing" > "Assigned: Ben."
- Quietly joyful. "5 of 8 claimed" > "5/8 items assigned."
- Never corporate. No "optimize", "manage", "streamline". Replace with "plan," "share," "gather."

### Headline examples
- Home: "Good morning, Maya." → "Four of you have a day together."
- Events empty: "No gatherings yet — start one."
- Onboarding: "The people you feed, in one place."
- Ad hero: "The table was always the app."

---

## 9. Motion

- Page transitions: 300ms `ease-out`, 8px translateY fade-in.
- Claim/check interactions: spring scale to 1.05 then 1, 200ms. Tiny confetti burst on event item claim.
- Avatar appearance: stagger 60ms between siblings.
- No hard bounces. Always soft, organic easing.

---

## 10. Layout patterns — by screen

### Home
- Greeting: Display italic, "Good morning, {Name}." brand-colored name.
- Secondary line: "Four of you have a day together."
- Right side: RCircleGlyph with current circle members.
- Hero card: `--bg-deep` dark block, "Tonight at the table" mono label, display italic meal name, who's cooking + time.
- Two-card pulse row: shared list (plain card) + next gathering (glow-soft bg).
- "Today's beats" timeline — simple rows with mono time, colored dot, name, avatar.
- One handwritten accent at bottom.

### Events
- Page title "Gatherings" (never "Events").
- Featured event: photo (full width), then card with claim progress ring.
- Progress metric: "5 of 8 claimed" in display italic.

### Event detail
- Full-bleed photo hero (220px) with gradient fade to bg.
- Potluck items grid: claimed = clean card with avatar; unclaimed = dashed glow-soft card with "Claim this →".

### Food hub
- Page title "The kitchen" (emotional, not "Food").
- Pill tabs with shadow on active.
- Week rhythm row: 5-7 day cards, today highlighted in brand.
- Family favorites: photo + italic name + micro-metadata.

### Shopping list
- Grouped by section (Produce, Dairy, Pantry).
- Who's-shopping-with-you avatar stack in header.
- Progress bar + "2 of 8 · gathered" in the header.
- Cart-to-retailer CTA in bg-deep.

### Circle
- "Your people" mono label.
- Big RCircleGlyph visualization — members arranged in a ring around a glowing center labeled "home" in hand font.
- Leaderboard below ("This month · helping hands") for chore points — playful but not aggressive.

### Onboarding
- Three-circle logo mark centered.
- Giant serif italic headline, brand-colored accent on middle line.
- Social proof with stacked avatars + "40k+ circles, gathering now" in hand font.
- Primary: dark pill "Start your circle." Secondary: outlined pill "I have an invite code."

---

## 11. Don'ts

- ❌ Don't use teal or orange (old brand).
- ❌ Don't use Inter, Roboto, or system sans for display text.
- ❌ Don't use pure black (#000) or pure white backgrounds on Hearth mode — use `--ink` and `--bg`.
- ❌ Don't use emoji as functional icons.
- ❌ Don't use rounded corners with a left-border-accent (AI-slop pattern).
- ❌ Don't add gradient behind everything. Gradients appear intentionally: ad hero, photo placeholders, one "team effort" cheer block in Chores.
- ❌ Don't add filler stats, skeuomorphic "badges earned", or gamification language beyond the gentle points system.
- ❌ Don't cram. If a screen feels tight, remove something.

---

## 12. Where the art lives

See `Replanish Redesign.html` and the JSX under `replanish/` in the design project:
- `replanish/tokens.jsx` — palette definitions
- `replanish/primitives.jsx` — RAvatar, RCircleGlyph, RCard, icons
- `replanish/screens-*.jsx` — one file per screen group
- `replanish/ad-hero.jsx` — marketing/social hero moments

Refer to screenshots in `handoff/screenshots/` for pixel reference.

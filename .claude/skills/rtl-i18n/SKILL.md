---
name: rtl-i18n
description: "Hebrew/RTL and internationalization for OurTable. Use when working on: 'hebrew', 'RTL', 'i18n', 'translation', 'language', 'locale', 'right-to-left', 'bidirectional', 'direction', 'text'."
---

# RTL & Internationalization

Hebrew/English bilingual support with full RTL layout.

## App Identity

- **English**: OurTable
- **Hebrew**: השולחן שלנו
- **Brand color**: #f97316 (orange)

## i18n Setup

- Configuration: `src/lib/i18n.ts`
- 300+ translation keys
- Two languages: `en` (English, LTR) and `he` (Hebrew, RTL)
- Language detection: user preference → browser locale → default (en)

## Translation Patterns

```ts
import { useTranslation } from 'react-i18next'

function Component() {
  const { t } = useTranslation()
  return <h1>{t('home.title')}</h1>
}
```

### Adding Translations
1. Add key to both language files
2. Use nested keys by domain: `food.recipes.title`, `household.chores.add`
3. Support interpolation: `t('items.count', { count: 5 })`
4. Pluralization: `t('items', { count })` with `_one`, `_other` variants

## RTL Layout

### Direction-Aware Patterns

The `dir` attribute is set on `<html>` based on current language.

```tsx
// Use logical properties instead of physical:
// ✅ Good: ms-2 (margin-inline-start), me-2 (margin-inline-end)
// ❌ Bad: ml-2, mr-2 (won't flip in RTL)

// Tailwind logical utilities:
// ps-*, pe-* (padding inline start/end)
// ms-*, me-* (margin inline start/end)
// start-*, end-* (inset inline start/end)
// text-start, text-end (text alignment)
```

### Common RTL Issues
- **Icons**: Directional icons (arrows, chevrons) need `rtl:rotate-180`
- **Flex direction**: `flex-row` auto-reverses with `dir="rtl"` — this is usually correct
- **Absolute positioning**: Use `start-0`/`end-0` instead of `left-0`/`right-0`
- **Borders**: Use `border-s`/`border-e` instead of `border-l`/`border-r`
- **Animations**: Slide-in directions need RTL variants

### Date/Number Formatting

```ts
// Israeli locale formatting
const date = new Date()
date.toLocaleDateString('he-IL') // "11.4.2026"
date.toLocaleDateString('en-US') // "4/11/2026"

// Numbers
(1234.5).toLocaleString('he-IL') // "1,234.5"
```

## Testing Both Directions

When implementing UI:
1. Test in English (LTR) first
2. Switch to Hebrew and verify layout
3. Check: text alignment, icon direction, margins/padding, absolute positioning
4. Verify long text wrapping in both directions

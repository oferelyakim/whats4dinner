// User-hint parsing and envelope override.
//
// Precedence (highest first):
//   1. explicit slot.notes / replaceHint user phrase
//   2. circle context (diet, dislikes) — applied earlier as filter args
//   3. envelope (the local spin)
//   4. model default (LLM training prior — what we're trying to escape)
//
// Only override the dimensions the user actually mentioned. "Less spicy"
// narrows flavor, not cuisine. "Italian tonight" overrides cuisine but
// leaves protein/style alone.

import type { SlotEnvelope } from './envelope'
import { CUISINES, FLAVORS, STYLES, findCuisine, findFlavor, findStyle } from './taxonomy'
import { resolveProteinHint } from './envelope'

export interface UserHint {
  cuisineId?: string
  styleId?: string
  flavorId?: string
  proteinName?: string
  proteinFamily?: string
  hardAvoid?: string[]
  softText?: string
}

export function parseUserHint(notes?: string): UserHint {
  if (!notes) return {}
  const lower = notes.toLowerCase()
  const out: UserHint = { softText: notes }

  // Cuisine token match (longest-first to prefer specific over generic).
  const cuisineByLen = [...CUISINES].sort((a, b) => b.displayName.length - a.displayName.length)
  for (const c of cuisineByLen) {
    const tokens = c.displayName.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4)
    if (tokens.some((t) => lower.includes(t))) {
      out.cuisineId = c.id
      break
    }
  }

  // Style match.
  for (const s of STYLES) {
    if (lower.includes(s.displayName.toLowerCase().split(/\s|\//)[0])) {
      out.styleId = s.id
      break
    }
  }

  // Flavor match (heuristic).
  if (/\b(less spicy|mild|kid[-\s]?friendly|not spicy)\b/.test(lower)) out.flavorId = 'peppery-mild'
  else if (/\b(spicy|hot|chili|sriracha|fiery)\b/.test(lower)) out.flavorId = 'spicy-hot'
  else if (/\b(bright|fresh|citrus|lemon|lime)\b/.test(lower)) out.flavorId = 'bright-citrusy'
  else if (/\b(creamy|rich|butter|coconut)\b/.test(lower)) out.flavorId = 'creamy-rich'
  else if (/\b(smoky|charred|grilled|bbq)\b/.test(lower)) out.flavorId = 'smoky'
  else if (/\b(herby|herbal|herbs|fresh-herb)\b/.test(lower)) out.flavorId = 'herby'

  // Protein hint.
  const protein = resolveProteinHint(notes)
  if (protein) {
    out.proteinName = protein.name
    out.proteinFamily = protein.family
  }

  // Explicit avoids ("no peanuts", "without dairy").
  const avoidMatches = lower.match(/\b(no|without)\s+([a-z][a-z\s]{2,30}?)(?=[,.\s]|$)/g) ?? []
  out.hardAvoid = avoidMatches.map((m) => m.replace(/^\s*(no|without)\s+/, '').trim())

  return out
}

export function mergeEnvelope(env: SlotEnvelope, hint: UserHint): SlotEnvelope {
  if (!hint.cuisineId && !hint.styleId && !hint.flavorId && !hint.proteinName) return env
  const next = { ...env }
  if (hint.cuisineId) {
    const c = findCuisine(hint.cuisineId)
    if (c) {
      next.cuisineId = c.id
      next.cuisineLabel = c.displayName
      next.cuisineRegion = c.region
    }
  }
  if (hint.styleId) {
    const s = findStyle(hint.styleId)
    if (s) {
      next.styleId = s.id
      next.styleLabel = s.displayName
    }
  }
  if (hint.flavorId) {
    const f = findFlavor(hint.flavorId)
    if (f) {
      next.flavorId = f.id
      next.flavorLabel = f.displayName
    }
  }
  if (hint.proteinName) {
    next.proteinName = hint.proteinName
    next.proteinFamily = hint.proteinFamily
  }
  next.reasoning += ` (override: ${hint.softText ?? ''})`
  return next
}

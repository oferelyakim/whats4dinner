/**
 * normalizeIngredient — pure ingredient name normalization helper.
 *
 * Example expectations:
 *   "2 cloves minced garlic"   → { base: 'garlic', form: null, hadQuantity: true }
 *   "1 clove garlic, sliced"   → { base: 'garlic', form: null, hadQuantity: true }
 *   "grated parmesan"          → { base: 'parmesan', form: 'grated', hadQuantity: false }
 *   "sliced parmesan"          → { base: 'parmesan', form: 'sliced', hadQuantity: false }
 *   "30 gr butter"             → { base: 'butter', form: null, hadQuantity: true }
 *   "2 tbsp butter"            → { base: 'butter', form: null, hadQuantity: true }
 */

export interface NormalizedIngredient {
  base: string
  form: string | null
  hadQuantity: boolean
}

// ── Whitelists ────────────────────────────────────────────────────────────────

const UNIT_WORDS = new Set([
  'g', 'gr', 'gram', 'grams',
  'kg', 'mg',
  'oz', 'lb', 'lbs',
  'ml', 'l', 'liter', 'liters',
  'tsp', 'teaspoon', 'teaspoons',
  'tbsp', 'tablespoon', 'tablespoons',
  'cup', 'cups',
  'clove', 'cloves',
  'pinch', 'pinches',
  'dash', 'dashes',
  'slice', 'slices',
  'piece', 'pieces',
  'can', 'cans',
  'bunch', 'bunches',
  'head', 'heads',
  'pack', 'packs',
  'package', 'packages',
])

// Form words are KEPT as `form` when no quantity was present
const FORM_WORDS = new Set([
  'grated', 'shredded', 'sliced', 'ground', 'powdered', 'whole',
])

// Prep words are always stripped
const PREP_WORDS = new Set([
  'minced', 'chopped', 'finely', 'diced', 'crushed', 'peeled',
  'cubed', 'smashed', 'halved', 'quartered', 'julienned', 'mashed',
  'melted', 'softened', 'beaten', 'fresh', 'freshly', 'dried',
  'raw', 'cooked', 'roasted', 'toasted',
  'large', 'small', 'medium', 'extra', 'extra-virgin',
])

// Unicode fraction characters → approximate decimal strings (used only to detect quantity presence)
const UNICODE_FRACTIONS = /[\u00BC\u00BD\u00BE\u2150-\u215E\u2189]/

// Digit / ASCII fraction pattern at word boundary
const QUANTITY_PREFIX = /^(\d+[\d./]*)\s*/

// ── Helper ────────────────────────────────────────────────────────────────────

function stripLeadingQuantity(tokens: string[]): { remaining: string[]; stripped: boolean } {
  let index = 0
  let stripped = false

  // Accept optional leading number (digit or unicode fraction)
  if (
    index < tokens.length &&
    (QUANTITY_PREFIX.test(tokens[index]) || UNICODE_FRACTIONS.test(tokens[index]))
  ) {
    index++
    stripped = true
  }

  // Accept optional unit word after the number
  if (index < tokens.length && UNIT_WORDS.has(tokens[index])) {
    index++
  }

  // Strip trailing "of" after unit  e.g. "2 cups of flour"
  if (index < tokens.length && tokens[index] === 'of') {
    index++
  }

  return { remaining: tokens.slice(index), stripped }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function normalizeIngredient(rawName: string): NormalizedIngredient {
  // Step 1 — lowercase, trim, collapse whitespace, strip parentheticals
  let text = rawName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\(.*?\)/g, '')   // strip (optional), (to taste), etc.
    .trim()

  // Step 2 — handle "noun, prep" form: "garlic, minced" → "minced garlic"
  // Swap around the comma so that the prep word comes first and gets stripped later
  const commaIndex = text.indexOf(',')
  if (commaIndex !== -1) {
    const before = text.slice(0, commaIndex).trim()
    const after = text.slice(commaIndex + 1).trim()
    if (after.length > 0) {
      text = `${after} ${before}`
    } else {
      text = before
    }
  }

  // Step 3 — tokenize
  const tokens = text.split(/\s+/).filter(Boolean)

  // Step 4 — strip leading quantity/unit
  const { remaining: afterQty, stripped: hadQuantity } = stripLeadingQuantity(tokens)

  // Step 5 — filter out prep words and (conditionally) form words
  // Rule: if hadQuantity === true, treat form words as prep (drop them)
  const resultTokens: string[] = []
  let detectedForm: string | null = null

  for (const token of afterQty) {
    // Strip trailing punctuation from each token for comparison
    const clean = token.replace(/[.,;:!?]+$/, '')

    if (PREP_WORDS.has(clean)) {
      continue
    }

    if (FORM_WORDS.has(clean)) {
      if (hadQuantity) {
        // Treat as prep — drop it
        continue
      } else {
        // Preserve as form
        if (detectedForm === null) {
          detectedForm = clean
        }
        continue  // don't include it in the base tokens
      }
    }

    resultTokens.push(clean)
  }

  // Step 6 — collapse and trim trailing punctuation from the final base
  const base = resultTokens
    .join(' ')
    .replace(/[.,;:!?]+$/, '')
    .trim()

  return {
    base: base || rawName.toLowerCase().trim(), // fallback to original if we stripped everything
    form: detectedForm,
    hadQuantity,
  }
}

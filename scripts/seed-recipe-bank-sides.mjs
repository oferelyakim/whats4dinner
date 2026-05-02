#!/usr/bin/env node
// scripts/seed-recipe-bank-sides.mjs
//
// Companion to seed-recipe-bank-main.mjs that seeds non-`main` slot roles
// the meal-engine presets actually reference: veg_side, starch_side, side,
// salad, bread, soup, plus a small dessert pool (not in any current preset
// but useful for future shapes + per-meal AI swap suggestions).
//
// `tapas` and `drink` are intentionally skipped — niche and hard for
// Anthropic's web_search to return clean recipe URLs for.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
//     node scripts/seed-recipe-bank-sides.mjs [--dry-run]

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-haiku-4-5-20251001'

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY')
  process.exit(1)
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)
const DRY_RUN = !!args['dry-run']
const PACE_MS = 4_000

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

const ALL_DIETS = [
  'omnivore', 'vegetarian', 'vegan', 'gluten-free',
  'dairy-free', 'kosher', 'halal', 'low-carb', 'mediterranean',
]

// Cell matrix — keep tight to stay near $1.40 spend.
function buildCells() {
  const cells = []

  // Dinner sides — these are the workhorses (sys-standard-dinner uses both).
  // 9 diets × 2 cuisines each = 18 cells per role.
  for (const diet of ALL_DIETS) {
    for (const cuisine of ['american', 'italian']) {
      cells.push({ meal_type: 'dinner', slot_role: 'veg_side',    diet, cuisine })
      cells.push({ meal_type: 'dinner', slot_role: 'starch_side', diet, cuisine })
    }
  }

  // Salads — used by italian + pasta-night + light-dinner presets.
  // Diet enforcement matters here (a salad can be vegetarian/vegan/etc.).
  // 9 diets × 1 cuisine = 9 cells, dinner-bound.
  for (const diet of ALL_DIETS) {
    cells.push({ meal_type: 'dinner', slot_role: 'salad', diet, cuisine: 'mediterranean' })
  }
  // Lunch salads (1 generic cell per diet).
  for (const diet of ALL_DIETS) {
    cells.push({ meal_type: 'lunch', slot_role: 'salad', diet, cuisine: 'american' })
  }

  // Generic 'side' — used by lunch + big-breakfast + mexican feast presets.
  // 6 diets × 1 cuisine — skip the rarer halal/kosher/mediterranean here.
  for (const diet of ['omnivore', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'low-carb']) {
    cells.push({ meal_type: 'lunch', slot_role: 'side', diet, cuisine: 'american' })
  }

  // Bread — pasta-night + light-dinner presets. Few cells; bread varies less.
  for (const diet of ['omnivore', 'vegetarian', 'gluten-free', 'vegan']) {
    cells.push({ meal_type: 'dinner', slot_role: 'bread', diet, cuisine: 'mediterranean' })
  }

  // Soup — light-dinner preset.
  for (const diet of ['omnivore', 'vegetarian', 'vegan', 'gluten-free', 'low-carb', 'mediterranean']) {
    cells.push({ meal_type: 'dinner', slot_role: 'soup', diet, cuisine: 'american' })
  }

  // Dessert — not in any current preset but user asked. Small pool, dinner-bound.
  for (const diet of ['omnivore', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'low-carb']) {
    cells.push({ meal_type: 'dinner', slot_role: 'dessert', diet, cuisine: 'american' })
  }

  return cells
}

const SUBMIT_LINKS_TOOL = {
  name: 'submit_links',
  description: 'Submit 1-3 reputable recipe URLs that match the requested cell.',
  input_schema: {
    type: 'object',
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          required: ['title', 'url', 'ingredient_main'],
          properties: {
            title: { type: 'string' },
            url: { type: 'string' },
            sourceDomain: { type: 'string' },
            ingredient_main: { type: 'string' },
            secondary_ingredients: { type: 'array', items: { type: 'string' } },
            protein_family: { type: 'string' },
            cuisine_id: { type: 'string' },
            prep_time_min: { type: 'integer' },
            cook_time_min: { type: 'integer' },
            servings: { type: 'integer' },
            quality_score: { type: 'number' },
          },
        },
      },
    },
  },
}

function systemFor(slot_role) {
  const ROLE_GUIDE = {
    veg_side: 'a vegetable-forward side dish (roasted, grilled, sauteed, or salad-style)',
    starch_side: 'a starch-based side (rice, potatoes, grains, pasta side, polenta, etc.)',
    side: 'a generic side dish that pairs with a main',
    salad: 'a clearly-labeled salad recipe (greens-, grain-, or vegetable-based)',
    bread: 'a bread recipe (loaf, focaccia, flatbread, biscuit, rolls)',
    soup: 'a soup or stew recipe',
    dessert: 'a dessert recipe (cookies, cake, fruit dessert, ice cream, pudding, etc.)',
  }
  const guide = ROLE_GUIDE[slot_role] ?? 'a side dish recipe'
  return `You search the web for ONE-to-THREE high-quality, indexable recipe URLs
that match the requested cell. The recipe MUST be ${guide}, not a main dish.

Use the web_search tool. Submit via submit_links.

Rules:
- Reputable sites only (allrecipes, seriouseats, cooking.nytimes, bonappetit,
  smittenkitchen, budgetbytes, food52, foodnetwork, simplyrecipes, thekitchn,
  eatingwell, kingarthurbaking, etc.).
- URL must be the actual recipe page, NOT a category or roundup.
- Honor dietary constraints absolutely.
- DO NOT pick shawarma/kabob/falafel/hummus/tahini/za'atar/sumac/labneh
  unless cuisine is greek/persian/israeli.

Reply by calling submit_links with 1-3 candidates.`
}

async function generateLinks({ meal_type, slot_role, diet, cuisine }) {
  const dietStr = diet === 'omnivore' ? 'no restrictions' : diet
  const user = `Find ${cuisine} ${slot_role.replace('_', ' ')} recipes for ${meal_type}. Diet: ${dietStr}. Pick well-known dishes that home cooks search for.`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2200,
      system: systemFor(slot_role),
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
        SUBMIT_LINKS_TOOL,
      ],
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  const tool = (data.content || []).find(
    (b) => b.type === 'tool_use' && b.name === 'submit_links',
  )
  return tool?.input?.candidates ?? []
}

function domainFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}

async function insertCandidates({ meal_type, slot_role, diet }, candidates) {
  if (candidates.length === 0) return 0
  const seen = new Set()
  const unique = candidates.filter((c) => {
    if (!c.url || seen.has(c.url)) return false
    seen.add(c.url); return true
  })
  if (unique.length === 0) return 0

  const urls = unique.map((c) => c.url)
  const { data: existing } = await sb
    .from('recipe_bank')
    .select('source_url')
    .eq('slot_role', slot_role)
    .in('source_url', urls)
  const existingSet = new Set((existing ?? []).map((r) => r.source_url))
  const fresh = unique.filter((c) => !existingSet.has(c.url))
  if (fresh.length === 0) return 0

  const rows = fresh.map((c) => ({
    title: c.title,
    cuisine_id: c.cuisine_id ?? 'american',
    meal_type,
    slot_role,
    dietary_tags: diet === 'omnivore' ? [] : [diet],
    ingredient_main: (c.ingredient_main ?? '').toLowerCase(),
    protein_family: c.protein_family ?? null,
    style_id: null,
    flavor_id: null,
    ingredients: null,
    steps: null,
    secondary_ingredients: (c.secondary_ingredients ?? []).map((s) => s.toLowerCase()),
    prep_time_min: c.prep_time_min ?? null,
    cook_time_min: c.cook_time_min ?? null,
    servings: c.servings ?? null,
    image_url: null,
    source_url: c.url,
    source_domain: c.sourceDomain ?? domainFromUrl(c.url),
    source_kind: 'web',
    source_kind_v2: 'web',
    quality_score: Math.max(0, Math.min(100, c.quality_score ?? 75)),
  }))
  const { error } = await sb.from('recipe_bank').insert(rows)
  if (error) {
    console.warn(`  insert error: ${error.message}`)
    return 0
  }
  return rows.length
}

async function run() {
  const cells = buildCells()
  console.log(`[seed-sides] ${cells.length} cells, dry-run=${DRY_RUN}`)
  if (DRY_RUN) {
    for (const c of cells) console.log(`  ${c.meal_type}/${c.slot_role}/${c.diet}/${c.cuisine}`)
    return
  }
  let added = 0, processed = 0
  for (const cell of cells) {
    processed++
    const tag = `${cell.meal_type}/${cell.slot_role}/${cell.diet}/${cell.cuisine}`
    console.log(`[${processed}/${cells.length}] ${tag}`)
    try {
      const candidates = await generateLinks(cell)
      const n = await insertCandidates(cell, candidates)
      added += n
      console.log(`  → +${n} rows`)
    } catch (err) {
      console.warn(`  failed: ${err.message}`)
    }
    if (processed < cells.length) {
      await new Promise((r) => setTimeout(r, PACE_MS))
    }
  }
  console.log(`\n[seed-sides] processed=${processed} added=${added}`)
}

run().catch((err) => {
  console.error('[seed-sides] FATAL:', err)
  process.exit(1)
})

#!/usr/bin/env node
// scripts/seed-recipe-bank-main.mjs
//
// Targeted follow-up to seed-recipe-bank-urls.mjs.
//
// The default seeder probes `under_covered_cells()` which only emits cells
// that already have ≥1 row (the view's GROUP BY drops empty buckets). For a
// fresh bank that has never been pumped past its initial composed seed, that
// returns the same handful of cells over and over — and crucially does not
// fan out to cover all (diet × meal_type × slot_role='main') buckets the
// weekly-drop-generator needs.
//
// This script bypasses that RPC. It iterates a hardcoded matrix of
// (meal_type='*', slot_role='main', diet, cuisine) cells designed to give the
// drop generator enough variety to produce 126 unique main rows / week.
//
// Same Anthropic prompt + tool shape as the default seeder, with cuisine
// hint added to the user prompt so the model biases toward the requested
// cuisine.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
//     node scripts/seed-recipe-bank-main.mjs [--dry-run]

import { createClient } from '@supabase/supabase-js'
import { logBankSeedUsage } from './_log-bank-usage.mjs'

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

// ─── Cell matrix ──────────────────────────────────────────────────────────
// Diets the drop generator's REQUIRED_DIETS list cares about, plus omnivore.
const ALL_DIETS = [
  'omnivore',
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'kosher',
  'halal',
  'low-carb',
  'mediterranean',
]

// 8 mainstream US-friendly cuisines that home cooks search for.
const CUISINES = [
  'american',
  'italian',
  'mexican',
  'mediterranean',
  'thai',
  'japanese',
  'indian',
  'chinese',
]

// Cell list — keep moderate to stay near a couple-dollar Anthropic spend.
//
// Dinner/main: 9 diets × 4 cuisines = 36 cells. Each cell yields 1-3 URLs →
// ~50-100 new dinner/main rows (target: 70 unique).
// Lunch/main: 9 diets × 2 cuisines = 18 cells → ~25-55 new rows (target: 35).
// Breakfast/main: 9 diets × 1 cuisine = 9 cells → ~12-27 new rows (target: 21).
// Total ≈ 63 cells × $0.02 = ~$1.30 Anthropic spend.
function buildCells() {
  const dinnerCuisines = ['american', 'italian', 'mexican', 'thai']
  const lunchCuisines = ['american', 'mediterranean']
  const breakfastCuisines = ['american']

  const cells = []
  for (const diet of ALL_DIETS) {
    for (const cuisine of dinnerCuisines)   cells.push({ meal_type: 'dinner',    slot_role: 'main', diet, cuisine })
    for (const cuisine of lunchCuisines)    cells.push({ meal_type: 'lunch',     slot_role: 'main', diet, cuisine })
    for (const cuisine of breakfastCuisines) cells.push({ meal_type: 'breakfast', slot_role: 'main', diet, cuisine })
  }
  return cells
}

// ─── Anthropic plumbing (mirrors seed-recipe-bank-urls.mjs) ───────────────
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

const SYSTEM = `You search the web for ONE-to-THREE high-quality, indexable recipe URLs
that match the requested cell. Use the web_search tool. Submit via submit_links.

Rules:
- Reputable sites only (allrecipes, seriouseats, cooking.nytimes, bonappetit,
  smittenkitchen, budgetbytes, food52, foodnetwork, simplyrecipes, thekitchn,
  eatingwell, kingarthurbaking, etc.).
- URL must be the actual recipe page, NOT a category or roundup.
- Honor dietary constraints absolutely.
- DO NOT pick shawarma/kabob/falafel/hummus/tahini/za'atar/sumac/labneh
  unless cuisine is greek/persian/israeli.

Reply by calling submit_links with 1-3 candidates.`

async function generateLinks({ meal_type, slot_role, diet, cuisine }) {
  const dietStr = diet === 'omnivore' ? 'no restrictions' : diet
  const user = `Find ${cuisine} ${meal_type} ${slot_role} recipes. Diet: ${dietStr}. Pick well-known ${cuisine} dishes that home cooks would search for.`
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
      system: SYSTEM,
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
  return {
    candidates: tool?.input?.candidates ?? [],
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  }
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
  console.log(`[seed-main] ${cells.length} cells, dry-run=${DRY_RUN}`)
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
      const { candidates, tokensIn, tokensOut } = await generateLinks(cell)
      const n = await insertCandidates(cell, candidates)
      added += n
      await logBankSeedUsage(sb, { tokensIn, tokensOut, feature: `seed-main:${tag}` })
      console.log(`  → +${n} rows (in=${tokensIn} out=${tokensOut})`)
    } catch (err) {
      console.warn(`  failed: ${err.message}`)
    }
    if (processed < cells.length) {
      await new Promise((r) => setTimeout(r, PACE_MS))
    }
  }
  console.log(`\n[seed-main] processed=${processed} added=${added}`)
}

run().catch((err) => {
  console.error('[seed-main] FATAL:', err)
  process.exit(1)
})

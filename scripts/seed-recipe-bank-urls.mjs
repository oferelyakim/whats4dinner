#!/usr/bin/env node
// scripts/seed-recipe-bank-urls.mjs
//
// v2.0.0 — link-first bank seeder. Probes `under_covered_cells(target=N)`
// then asks Anthropic Haiku 4.5 (with web_search) to find reputable recipe
// URLs for each under-served (diet × meal_type × slot_role) cell.
// Inserts each as `source_kind_v2='user_import'` style row with NULL
// ingredients + NULL steps — same link-first shape the cron refresher uses.
//
// Run once after applying migration 034 to backfill the bank into a
// link-first state. Cron refresher then keeps it topped up.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
//     node scripts/seed-recipe-bank-urls.mjs --target=30 --limit=20
//
// Cost: ~$0.02 per cell × ≤20 cells = ~$0.40 worst case.

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
const TARGET = parseInt(args.target ?? '30', 10)
const LIMIT = parseInt(args.limit ?? '20', 10)
const PACE_MS = 4_000

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

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

async function generateLinks(diet, mealType, slotRole) {
  const dietStr = diet === 'omnivore' ? 'no restrictions' : diet
  const user = `Find ${mealType} ${slotRole} recipes. Diet: ${dietStr}. Pick well-known dish names that home cooks would search for.`
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
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function insertCandidates(diet, mealType, slotRole, candidates) {
  if (candidates.length === 0) return 0
  // Dedup within the batch (Anthropic occasionally repeats a URL).
  const seenUrls = new Set()
  const uniqueCandidates = candidates.filter((c) => {
    if (!c.url || seenUrls.has(c.url)) return false
    seenUrls.add(c.url)
    return true
  })
  if (uniqueCandidates.length === 0) return 0

  // Client-side dedup against rows already in the bank for this slot_role.
  // The migration-034 unique index is partial (WHERE source_url IS NOT NULL)
  // so we can't use .upsert(onConflict=...) — PostgREST rejects it. Filter
  // here, then plain insert.
  const urls = uniqueCandidates.map((c) => c.url)
  const { data: existing } = await sb
    .from('recipe_bank')
    .select('source_url')
    .eq('slot_role', slotRole)
    .in('source_url', urls)
  const existingSet = new Set((existing ?? []).map((r) => r.source_url))
  const fresh = uniqueCandidates.filter((c) => !existingSet.has(c.url))
  if (fresh.length === 0) return 0

  const rows = fresh.map((c) => ({
    title: c.title,
    cuisine_id: c.cuisine_id ?? 'american',
    meal_type: mealType,
    slot_role: slotRole,
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
  console.log(`[seed] target=${TARGET} limit=${LIMIT}`)
  const { data: cells, error } = await sb.rpc('under_covered_cells', { p_target: TARGET })
  if (error) {
    console.error('coverage probe failed:', error.message)
    process.exit(1)
  }
  console.log(`[seed] ${cells.length} under-covered cells found`)
  let added = 0
  let processed = 0
  for (const cell of cells.slice(0, LIMIT)) {
    processed++
    const { diet, meal_type, slot_role, deficit } = cell
    console.log(`[${processed}/${Math.min(cells.length, LIMIT)}] ${diet}/${meal_type}/${slot_role} (deficit=${deficit})`)
    try {
      const { candidates, tokensIn, tokensOut } = await generateLinks(diet, meal_type, slot_role)
      const n = await insertCandidates(diet, meal_type, slot_role, candidates)
      added += n
      await logBankSeedUsage(sb, { tokensIn, tokensOut, feature: `seed-urls:${diet}/${meal_type}/${slot_role}` })
      console.log(`  → +${n} rows (in=${tokensIn} out=${tokensOut})`)
    } catch (err) {
      console.warn(`  failed: ${err.message}`)
    }
    if (processed < Math.min(cells.length, LIMIT)) {
      await new Promise((r) => setTimeout(r, PACE_MS))
    }
  }
  console.log(`\n[seed] processed=${processed} added=${added}`)
}

run().catch((err) => {
  console.error('[seed] FATAL:', err)
  process.exit(1)
})

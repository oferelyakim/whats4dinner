// v3.0.1 — weekly-drop-generator.
//
// Cron-fired (Thursdays 10:00 UTC ≈ 06:00 EDT / 05:00 EST via pg_cron + pg_net,
// see migration 039) edge function that materializes the shared weekly recipe
// drop — 126 entries per week, free for all users to read.
// The drop is for the upcoming **Sunday-Saturday** week (US household
// calendar), so households see next week's plan ~3 days before it starts.
//
// Drop shape per week (7 days):
//   * 10 dinner positions per day (70 total)
//   * 5 lunch positions per day (35 total)
//   * 3 breakfast positions per day (21 total)
//
// All picks come from `recipe_bank` rows where `retired_at IS NULL` and
// `expires_at > now()`. Zero AI calls in this hot path — the bank is the
// authoritative content source.
//
// Diversity rules:
//   * Each diet (omnivore / vegetarian / vegan / gluten-free / dairy-free /
//     kosher / halal / low-carb / mediterranean) must have ≥1 dinner option
//     per day when the bank can supply it.
//   * Cuisine spread within a single (day, meal_type) — no cuisine repeats
//     more than 2× in the 10 dinner picks.
//   * Anti-repeat — no recipe appears more than once across the whole week.
//   * Anti-repeat across weeks — no recipe from the prior 2 weeks reappears.
//
// Idempotent: if `weekly_menu_drops` already has a row for the target
// week_start, the function exits early. Manual regeneration: delete the row
// (and its `weekly_menu` cascade rows) and re-invoke.
//
// GET ?ping=1 returns { fn, version, deployedAt } for the smoke probe.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_VERSION = '3.0.1'
const DEPLOYED_AT = '2026-05-02T18:00:00Z'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

// ─── Drop shape ────────────────────────────────────────────────────────────
const DAYS = 7
const DINNER_PER_DAY = 10
const LUNCH_PER_DAY = 5
const BREAKFAST_PER_DAY = 3
const TOTAL_PER_WEEK = DAYS * (DINNER_PER_DAY + LUNCH_PER_DAY + BREAKFAST_PER_DAY) // 126

// Diets we want represented in the dinner block (one row may cover several).
const REQUIRED_DIETS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'kosher',
  'halal',
  'low-carb',
  'mediterranean',
]
// "omnivore" is implicit — any row without a tag counts as omnivore.

// Cuisine cap within a (day, meal_type) group — keep variety high.
const MAX_CUISINE_REPEAT_PER_GROUP = 2

// ─── Types matching the bank schema ────────────────────────────────────────
interface BankRow {
  id: string
  title: string
  cuisine_id: string
  meal_type: string
  slot_role: string
  dietary_tags: string[]
  ingredient_main: string
  protein_family: string | null
  prep_time_min: number | null
  popularity_score: number | null
}

// ─── Date helper: get next Sunday at 00:00 UTC ────────────────────────────
// The drop fires Thursday 10:00 UTC, and the drop is for the WEEK STARTING
// the upcoming Sunday (US household calendar — Sun-Sat week). On Thursday
// that's 3 days out; if you re-trigger manually any other day, we still
// pick the next Sunday so the math is deterministic.
function nextSundayIso(now: Date): string {
  const d = new Date(now)
  // getUTCDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat.
  // We want the upcoming Sunday — if today is Sun (0), use *today*; otherwise
  // add (7 - dow) to land on next Sun.
  const dow = d.getUTCDay()
  const daysToAdd = dow === 0 ? 0 : 7 - dow
  d.setUTCDate(d.getUTCDate() + daysToAdd)
  return d.toISOString().split('T')[0]
}

// ─── Main entry ────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  if (req.method === 'GET' && url.searchParams.get('ping')) {
    return new Response(
      JSON.stringify({ fn: 'weekly-drop-generator', version: APP_VERSION, deployedAt: DEPLOYED_AT }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const targetWeekStart = nextSundayIso(new Date())

  // Idempotent: skip if this week's drop already exists.
  const { data: existing } = await supa
    .from('weekly_menu_drops')
    .select('week_start')
    .eq('week_start', targetWeekStart)
    .maybeSingle()
  if (existing) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'drop_already_exists', week_start: targetWeekStart }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // Pull the full eligible bank (typically a few hundred rows — small).
  // Filter on retired_at + expires_at; everything else happens in memory.
  const { data: bankRows, error: bankErr } = await supa
    .from('recipe_bank')
    .select('id, title, cuisine_id, meal_type, slot_role, dietary_tags, ingredient_main, protein_family, prep_time_min, popularity_score')
    .is('retired_at', null)
    .gt('expires_at', new Date().toISOString())
  if (bankErr) {
    return new Response(JSON.stringify({ error: 'bank_query_failed', detail: bankErr.message }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
  if (!bankRows || bankRows.length === 0) {
    return new Response(
      JSON.stringify({ error: 'bank_empty', detail: 'No eligible rows in recipe_bank' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // Pull recipes used in the prior 2 weeks (anti-repeat across weeks).
  const priorWeekStarts = priorIsoMondays(targetWeekStart, 2)
  const { data: priorRows } = await supa
    .from('weekly_menu')
    .select('recipe_bank_id')
    .in('week_start', priorWeekStarts)
  const priorIds = new Set((priorRows ?? []).map((r) => r.recipe_bank_id as string))

  // Build the drop in memory, then bulk-insert.
  const items = buildWeeklyDrop(bankRows as BankRow[], priorIds)
  if (items.length !== TOTAL_PER_WEEK) {
    // Soft-fail with diet-coverage report rather than write a partial drop.
    // Caller (cron) will retry next tick; cron is daily-equivalent if we add
    // backup ticks, but for now we simply log and exit. The bank coverage
    // gap is the real story — caller should run `seed-recipe-bank-urls.mjs`.
    return new Response(
      JSON.stringify({
        error: 'insufficient_coverage',
        produced: items.length,
        target: TOTAL_PER_WEEK,
        deficit: TOTAL_PER_WEEK - items.length,
        hint: 'Run scripts/seed-recipe-bank-urls.mjs --limit=250 to top up the bank.',
      }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 1. Write the drop manifest.
  const dietCoverage = computeDietCoverage(items, bankRows as BankRow[])
  const { error: dropErr } = await supa.from('weekly_menu_drops').insert({
    week_start: targetWeekStart,
    total_recipes: items.length,
    diet_coverage: dietCoverage,
    generator_version: APP_VERSION,
  })
  if (dropErr) {
    return new Response(JSON.stringify({ error: 'drop_insert_failed', detail: dropErr.message }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  // 2. Bulk-insert the entries.
  const itemRows = items.map((it) => ({
    week_start: targetWeekStart,
    day_idx: it.day_idx,
    meal_type: it.meal_type,
    slot_role: it.slot_role,
    position: it.position,
    recipe_bank_id: it.recipe_bank_id,
  }))
  const { error: itemErr } = await supa.from('weekly_menu').insert(itemRows)
  if (itemErr) {
    // Roll back the manifest row so a retry can fully succeed.
    await supa.from('weekly_menu_drops').delete().eq('week_start', targetWeekStart)
    return new Response(JSON.stringify({ error: 'items_insert_failed', detail: itemErr.message }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      week_start: targetWeekStart,
      total_recipes: items.length,
      diet_coverage: dietCoverage,
    }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})

// ─── Pure picker ──────────────────────────────────────────────────────────

interface DropItem {
  day_idx: number
  meal_type: 'dinner' | 'lunch' | 'breakfast'
  slot_role: string
  position: number
  recipe_bank_id: string
}

function buildWeeklyDrop(bank: BankRow[], priorIds: Set<string>): DropItem[] {
  const items: DropItem[] = []
  const usedThisWeek = new Set<string>()

  for (let day = 0; day < DAYS; day++) {
    items.push(...pickGroup(bank, 'dinner', 'main', DINNER_PER_DAY, day, usedThisWeek, priorIds, true))
    items.push(...pickGroup(bank, 'lunch', 'main', LUNCH_PER_DAY, day, usedThisWeek, priorIds, false))
    items.push(...pickGroup(bank, 'breakfast', 'main', BREAKFAST_PER_DAY, day, usedThisWeek, priorIds, false))
  }
  return items
}

function pickGroup(
  bank: BankRow[],
  mealType: 'dinner' | 'lunch' | 'breakfast',
  slotRole: string,
  count: number,
  dayIdx: number,
  usedThisWeek: Set<string>,
  priorIds: Set<string>,
  enforceDiets: boolean,
): DropItem[] {
  const eligible = bank.filter(
    (r) =>
      r.meal_type === mealType &&
      r.slot_role === slotRole &&
      !usedThisWeek.has(r.id) &&
      !priorIds.has(r.id),
  )
  // If anti-repeat across weeks would starve the picker, relax it.
  const pool = eligible.length >= count
    ? eligible
    : bank.filter(
        (r) =>
          r.meal_type === mealType &&
          r.slot_role === slotRole &&
          !usedThisWeek.has(r.id),
      )

  const picked: BankRow[] = []
  const cuisineCount = new Map<string, number>()

  // Phase 1 — diet coverage (dinner only). For each required diet, pick one
  // row that carries that diet tag, respecting cuisine cap.
  if (enforceDiets) {
    for (const diet of REQUIRED_DIETS) {
      if (picked.length >= count) break
      const candidate = pickOneForDiet(pool, picked, cuisineCount, diet)
      if (candidate) {
        picked.push(candidate)
        cuisineCount.set(candidate.cuisine_id, (cuisineCount.get(candidate.cuisine_id) ?? 0) + 1)
      }
    }
  }

  // Phase 2 — fill remaining slots with cuisine spread + popularity weight.
  while (picked.length < count) {
    const candidate = pickOneSpread(pool, picked, cuisineCount)
    if (!candidate) break
    picked.push(candidate)
    cuisineCount.set(candidate.cuisine_id, (cuisineCount.get(candidate.cuisine_id) ?? 0) + 1)
  }

  // Mark as used + emit DropItems.
  return picked.map((r, i) => {
    usedThisWeek.add(r.id)
    return {
      day_idx: dayIdx,
      meal_type: mealType,
      slot_role: slotRole,
      position: i,
      recipe_bank_id: r.id,
    }
  })
}

function pickOneForDiet(
  pool: BankRow[],
  alreadyPicked: BankRow[],
  cuisineCount: Map<string, number>,
  diet: string,
): BankRow | null {
  const pickedIds = new Set(alreadyPicked.map((r) => r.id))
  const candidates = pool.filter(
    (r) =>
      !pickedIds.has(r.id) &&
      r.dietary_tags.includes(diet) &&
      (cuisineCount.get(r.cuisine_id) ?? 0) < MAX_CUISINE_REPEAT_PER_GROUP,
  )
  if (candidates.length === 0) return null
  return weightedPick(candidates)
}

function pickOneSpread(
  pool: BankRow[],
  alreadyPicked: BankRow[],
  cuisineCount: Map<string, number>,
): BankRow | null {
  const pickedIds = new Set(alreadyPicked.map((r) => r.id))
  // Strict cap first; relax if we'd starve.
  let candidates = pool.filter(
    (r) =>
      !pickedIds.has(r.id) &&
      (cuisineCount.get(r.cuisine_id) ?? 0) < MAX_CUISINE_REPEAT_PER_GROUP,
  )
  if (candidates.length === 0) {
    candidates = pool.filter((r) => !pickedIds.has(r.id))
  }
  if (candidates.length === 0) return null
  return weightedPick(candidates)
}

function weightedPick(rows: BankRow[]): BankRow {
  // Popularity-weighted random — higher score = more likely.
  const weights = rows.map((r) => Math.max(1, (r.popularity_score ?? 50)))
  const total = weights.reduce((a, b) => a + b, 0)
  let target = Math.random() * total
  for (let i = 0; i < rows.length; i++) {
    target -= weights[i]
    if (target <= 0) return rows[i]
  }
  return rows[rows.length - 1]
}

function priorIsoMondays(weekStart: string, count: number): string[] {
  const out: string[] = []
  const d = new Date(weekStart + 'T00:00:00Z')
  for (let i = 1; i <= count; i++) {
    const prev = new Date(d)
    prev.setUTCDate(d.getUTCDate() - 7 * i)
    out.push(prev.toISOString().split('T')[0])
  }
  return out
}

function computeDietCoverage(items: DropItem[], bank: BankRow[]): Record<string, number> {
  const byId = new Map(bank.map((r) => [r.id, r]))
  const counts: Record<string, number> = { omnivore: 0 }
  for (const diet of REQUIRED_DIETS) counts[diet] = 0
  for (const it of items) {
    const r = byId.get(it.recipe_bank_id)
    if (!r) continue
    if (r.dietary_tags.length === 0) {
      counts.omnivore += 1
    } else {
      for (const t of r.dietary_tags) {
        if (counts[t] !== undefined) counts[t] += 1
      }
    }
  }
  return counts
}


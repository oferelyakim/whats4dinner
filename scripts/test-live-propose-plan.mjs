#!/usr/bin/env node
// v2.5.0 — live deployment integration test for the propose-plan op.
//
// This is the test that v2.3.0 + v2.4.0 + v2.5.0 keep trying to fix:
// the "Here is your draft" page rendering blank because Anthropic's
// `propose_plan` tool returns a malformed shape that slips past whichever
// guard we last broadened. Each version added a new guard; each user-test
// uncovered a deeper failure mode.
//
// What this test does:
//   1. POSTs to the deployed `meal-engine` edge fn with op='propose-plan'
//      and a realistic answers payload (small + medium + large).
//   2. Logs the FULL raw shape returned (so we can see what Anthropic actually
//      sent, not just whether our guards fired).
//   3. Validates the shape against three things:
//      - Server didn't throw (no `propose_plan returned no slots` error).
//      - Top-level `days` is a non-empty array.
//      - At least one day has at least one meal with at least one slot
//        with at least one candidate. (This is the v2.5.0 invariant.)
//      - Every meal has a `type` and every slot has a `role` + `candidates`.
//   4. Fails loudly with the exact malformed payload if anything is wrong,
//      so we can tighten guards in the next pass.
//
// Costs: ~$0.0072 per request × 3 scenarios = ~$0.022 per full run. Cheap.
//
// Usage:
//   SUPABASE_URL=https://zgebzhvbszhqvaryfiwk.supabase.co \
//   SUPABASE_ANON_KEY=<anon> \
//   node scripts/test-live-propose-plan.mjs
//
// Optional:
//   --runs=N            run the small scenario N times (smoke variance, default 3)
//   --skip=small,medium  skip listed scenarios (default: none)
//   --verbose           dump the full response per scenario (default: only on fail)

import { writeFileSync } from 'node:fs'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://zgebzhvbszhqvaryfiwk.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_ANON_KEY) {
  console.error('FATAL: set SUPABASE_ANON_KEY env var (the public anon JWT, NOT service role).')
  process.exit(2)
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const runs = Number(args.runs ?? 3)
const verbose = Boolean(args.verbose)
const skip = String(args.skip ?? '').split(',').filter(Boolean)

// ─── Scenarios ──────────────────────────────────────────────────────────────
// Each represents a realistic answers payload from MealPlannerInterview.
// Shapes mirror what the client actually sends (see runProposePlan in
// src/components/meal-planner/MealPlannerInterview.tsx and the question tree
// in src/engine/interview/questions.ts).

function nextDates(n) {
  const out = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    out.push(x.toISOString().split('T')[0])
  }
  return out
}

const SCENARIOS = {
  // Small — mirrors the most common case the user is likely hitting:
  // 3-day plan, 1 meal per day, default headcount, no diets.
  small: {
    answers: {
      q_days: { selectedDates: nextDates(3) },
      q_meals_per_day: { perDate: Object.fromEntries(nextDates(3).map((d) => [d, ['Dinner']])) },
      q_freeform: '',
      q_headcount: { adults: 2, kids: 0 },
      q_dietary: [],
      q_dislikes: [],
      q_prep_time: 45,
      q_calories: 'balanced',
      q_cooking_skill: 'normal',
      q_themes: [],
      q_preset_per_day: {},
    },
    circleContext: '',
    recentDishes: [],
  },
  // Medium — full week, 3 meals/day with varied roles.
  medium: {
    answers: {
      q_days: { selectedDates: nextDates(7) },
      q_meals_per_day: {
        perDate: Object.fromEntries(
          nextDates(7).map((d) => [d, ['Breakfast', 'Lunch', 'Dinner']]),
        ),
      },
      q_freeform: 'we like Italian and Mediterranean food',
      q_headcount: { adults: 2, kids: 2 },
      q_dietary: ['vegetarian'],
      q_dislikes: ['mushrooms'],
      q_prep_time: 30,
      q_calories: 'balanced',
      q_cooking_skill: 'normal',
      q_themes: ['pasta-wednesday'],
      q_preset_per_day: {},
    },
    circleContext: 'Family of 4 (2 adults, 2 kids ages 6 and 9). Prefer 30-min weeknight meals.',
    recentDishes: [],
  },
  // Large — extreme: 7 days × 4 meals/day with snacks. Stress-tests
  // Anthropic's tool_use output ceiling.
  large: {
    answers: {
      q_days: { selectedDates: nextDates(7) },
      q_meals_per_day: {
        perDate: Object.fromEntries(
          nextDates(7).map((d) => [d, ['Breakfast', 'Lunch', 'Dinner', 'Snack']]),
        ),
      },
      q_freeform: '',
      q_headcount: { adults: 4, kids: 3 },
      q_dietary: [],
      q_dislikes: [],
      q_prep_time: 60,
      q_calories: 'hearty',
      q_cooking_skill: 'normal',
      q_themes: [],
      q_preset_per_day: {},
    },
    circleContext: 'Large household — 4 adults + 3 kids',
    recentDishes: [],
  },
}

// ─── Validator ──────────────────────────────────────────────────────────────

function validateShape(out) {
  const fails = []
  if (!out || typeof out !== 'object') return ['response is not an object']
  if (!Array.isArray(out.days)) fails.push('days is not an array')
  if (Array.isArray(out.days) && out.days.length === 0) fails.push('days is empty')

  let totalSlots = 0
  let totalCandidates = 0

  for (const [di, day] of (out.days ?? []).entries()) {
    if (!day || typeof day !== 'object') {
      fails.push(`days[${di}] is not an object`)
      continue
    }
    if (!day.date || typeof day.date !== 'string') fails.push(`days[${di}].date missing/non-string`)
    if (!Array.isArray(day.meals)) {
      fails.push(`days[${di}].meals is not an array`)
      continue
    }
    if (day.meals.length === 0) fails.push(`days[${di}].meals is empty`)
    for (const [mi, meal] of day.meals.entries()) {
      if (!meal || typeof meal !== 'object') {
        fails.push(`days[${di}].meals[${mi}] is not an object`)
        continue
      }
      if (!meal.type || typeof meal.type !== 'string') {
        fails.push(`days[${di}].meals[${mi}].type missing/non-string`)
      }
      if (!Array.isArray(meal.slots)) {
        fails.push(`days[${di}].meals[${mi}].slots is not an array`)
        continue
      }
      if (meal.slots.length === 0) {
        fails.push(`days[${di}].meals[${mi}].slots is EMPTY ← THIS IS THE v2.4 BLANK-DIALOG BUG`)
      }
      for (const [si, slot] of meal.slots.entries()) {
        totalSlots++
        if (!slot || typeof slot !== 'object') {
          fails.push(`days[${di}].meals[${mi}].slots[${si}] is not an object`)
          continue
        }
        if (!slot.role) fails.push(`days[${di}].meals[${mi}].slots[${si}].role missing`)
        if (!Array.isArray(slot.candidates) || slot.candidates.length === 0) {
          fails.push(`days[${di}].meals[${mi}].slots[${si}].candidates missing/empty`)
        } else {
          totalCandidates += slot.candidates.length
        }
      }
    }
  }

  return { fails, totalSlots, totalCandidates }
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function runOne(name, payload) {
  const t0 = Date.now()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/meal-engine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ op: 'propose-plan', input: payload }),
  })

  const ms = Date.now() - t0
  const text = await res.text()

  let json
  try {
    json = JSON.parse(text)
  } catch {
    return { name, ok: false, ms, status: res.status, error: 'response not JSON', body: text.slice(0, 400) }
  }

  if (!res.ok) {
    return { name, ok: false, ms, status: res.status, error: json?.error ?? 'non-2xx', body: text.slice(0, 600) }
  }

  // Edge fn responds with the op output directly OR wraps in `{result: ...}`.
  // Check both shapes.
  const out = json?.days ? json : json?.result ?? json
  const { fails, totalSlots, totalCandidates } = validateShape(out)

  return {
    name,
    ok: fails.length === 0,
    ms,
    status: res.status,
    days: out?.days?.length ?? 0,
    totalSlots,
    totalCandidates,
    fails,
    rawShape: out,
  }
}

async function main() {
  console.log(`\n=== live propose-plan integration test (v2.5.0) ===`)
  console.log(`target: ${SUPABASE_URL}/functions/v1/meal-engine`)
  console.log(`runs per scenario: ${runs}`)
  console.log(`scenarios: ${Object.keys(SCENARIOS).filter((s) => !skip.includes(s)).join(', ')}\n`)

  const results = []
  let pass = 0
  let fail = 0

  for (const [name, payload] of Object.entries(SCENARIOS)) {
    if (skip.includes(name)) continue
    const reps = name === 'small' ? runs : 1
    for (let i = 0; i < reps; i++) {
      process.stdout.write(`  ${name}#${i + 1}…  `)
      const r = await runOne(name, payload)
      results.push(r)
      if (r.ok) {
        pass++
        console.log(`✓ ${r.ms}ms  days=${r.days}  slots=${r.totalSlots}  candidates=${r.totalCandidates}`)
        if (verbose) console.log(JSON.stringify(r.rawShape, null, 2))
      } else {
        fail++
        console.log(`✗ ${r.ms}ms  status=${r.status ?? '?'}`)
        if (r.error) console.log(`     error: ${r.error}`)
        for (const f of r.fails ?? []) console.log(`     · ${f}`)
        if (r.rawShape) {
          console.log('     raw shape (truncated):')
          console.log('     ' + JSON.stringify(r.rawShape).slice(0, 600))
        } else if (r.body) {
          console.log('     body: ' + r.body)
        }
      }
      // Pace to stay under Anthropic Tier 1 50K-tok/min.
      await new Promise((r) => setTimeout(r, 4000))
    }
  }

  console.log(`\n=== summary ===`)
  console.log(`  passed: ${pass}`)
  console.log(`  failed: ${fail}`)

  // Persist results so the user (or a follow-up agent) can inspect.
  const out = `propose-plan-test-${Date.now()}.json`
  writeFileSync(out, JSON.stringify({ pass, fail, results }, null, 2))
  console.log(`\nfull results → ${out}`)

  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(2)
})

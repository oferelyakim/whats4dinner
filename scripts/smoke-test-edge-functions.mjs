#!/usr/bin/env node
// v1.16.0 — live edge-function smoke tests.
//
// Runs 10 user-style scenarios against the deployed Supabase edge functions
// and prints PASS/FAIL with the response body for each.
//
// Usage:
//   SUPABASE_URL=https://zgebzhvbszhqvaryfiwk.supabase.co \
//   SUPABASE_ANON_KEY=eyJ... \
//   SUPABASE_TEST_TOKEN=eyJ... \   # signed-in user's access_token
//   TEST_EVENT_ID=<uuid> \         # for plan-event scenarios
//   TEST_CIRCLE_ID=<uuid> \
//   node scripts/smoke-test-edge-functions.mjs
//
// Costs ~30-60K Anthropic tokens depending on path coverage. Tier 1 limit is
// 50K tokens/min — scenarios are paced to stay under it.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_TEST_TOKEN = process.env.SUPABASE_TEST_TOKEN || SUPABASE_ANON_KEY
const TEST_EVENT_ID = process.env.TEST_EVENT_ID || ''
const TEST_CIRCLE_ID = process.env.TEST_CIRCLE_ID || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY env vars.')
  process.exit(1)
}

const FN_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`

async function ping(fn) {
  const res = await fetch(`${FN_BASE}/${fn}?ping=1`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  })
  if (!res.ok) return null
  return await res.json()
}

async function callMealEngine(body, label) {
  const start = Date.now()
  const res = await fetch(`${FN_BASE}/meal-engine`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SUPABASE_TEST_TOKEN}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - start
  const text = await res.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: res.status, ok: res.ok, body: parsed, ms, label }
}

async function callPlanEvent(body, label) {
  const start = Date.now()
  const res = await fetch(`${FN_BASE}/plan-event`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SUPABASE_TEST_TOKEN}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - start
  const text = await res.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: res.status, ok: res.ok, body: parsed, ms, label }
}

function summarize(result) {
  const { label, status, ok, ms, body } = result
  const head = `[${ok ? 'PASS' : 'FAIL'}] ${label} — HTTP ${status} (${ms}ms)`
  const meta = body && typeof body === 'object' ? body._meta || body._ai_usage : null
  const tokens = meta ? `tokens=${meta.tokensIn ?? meta.tokens_in ?? '?'}/${meta.tokensOut ?? meta.tokens_out ?? '?'}` : ''
  const summary = (() => {
    if (!body || typeof body !== 'object') return ''
    if (body.error) return `error=${body.error}`
    if (body.recipe) {
      const r = body.recipe
      return `recipe.source=${r.source} title="${r.title?.slice(0, 50)}" ingredients=${r.ingredients?.length} steps=${r.steps?.length} imageUrl=${r.imageUrl ? 'yes' : 'no'}`
    }
    if (body.plan) {
      const p = body.plan
      return `plan: dishes=${p.dishes?.length ?? 0} supplies=${p.supplies?.length ?? 0} tasks=${p.tasks?.length ?? 0} activities=${p.activities?.length ?? 0} clarifying=${p.clarifying_question ? 'yes' : 'no'} fallback=${p._fallback || body._ai_usage?.fallback || 'no'}`
    }
    if (body.ingredient) return `ingredient=${body.ingredient}`
    if (body.dishName) return `dish=${body.dishName} keywords=${body.searchKeywords?.length ?? 0}`
    return JSON.stringify(body).slice(0, 200)
  })()
  return [head, tokens, summary].filter(Boolean).join('\n  ')
}

function pace(seconds) {
  return new Promise((r) => setTimeout(r, seconds * 1000))
}

async function main() {
  console.log('=== v1.16.0 edge function smoke test ===\n')

  // Health probes first.
  console.log('--- Probes ---')
  for (const fn of ['meal-engine', 'plan-event']) {
    const ping_ = await ping(fn)
    if (!ping_) console.log(`[FAIL] ${fn} ping — endpoint missing or 5xx`)
    else console.log(`[PASS] ${fn} ping — version=${ping_.version} model=${ping_.model} deployedAt=${ping_.deployedAt}`)
  }
  console.log('')

  // ─── Meal-engine scenarios ───────────────────────────────────────────────
  console.log('--- Meal-engine scenarios ---')

  const mealScenarios = [
    {
      label: '1. find-recipe happy path (Korean)',
      op: 'find-recipe',
      body: {
        op: 'find-recipe',
        dishName: 'Korean Braised Chicken Thighs',
        searchKeywords: ['korean dakdoritang chicken thighs recipe', 'korean braised chicken'],
        dietaryConstraints: [],
      },
    },
    {
      label: '2. ingredient — vegan + GF + nut-free Thai',
      op: 'ingredient',
      body: {
        op: 'ingredient',
        slotRole: 'main',
        mealType: 'dinner',
        envelope: { cuisineLabel: 'Thai', styleLabel: 'stir-fry', flavorLabel: 'bright' },
        dietaryConstraints: ['vegan', 'gluten-free', 'nut-free'],
        dislikedIngredients: ['mushrooms'],
        recentDishes: [],
      },
    },
    {
      label: '3. dish — Mexican smoky black bean',
      op: 'dish',
      body: {
        op: 'dish',
        slotRole: 'main',
        mealType: 'lunch',
        envelope: { cuisineLabel: 'Mexican', styleLabel: 'taco-wrap', flavorLabel: 'smoky' },
        ingredient: 'black beans',
        recentDishes: [],
      },
    },
    {
      label: '4. find-recipe (relative-imageUrl repro)',
      op: 'find-recipe',
      body: {
        op: 'find-recipe',
        dishName: 'Japanese Niku Jaga',
        searchKeywords: ['niku jaga recipe', 'japanese beef potato stew'],
        dietaryConstraints: [],
      },
    },
    {
      label: '5. find-recipe (force compose — obscure)',
      op: 'find-recipe',
      body: {
        op: 'find-recipe',
        dishName: 'Yupik Akutaq Berry Whip with Caribou Suet',
        searchKeywords: ['yupik akutaq recipe', 'alaskan native dessert recipe'],
        dietaryConstraints: [],
      },
    },
  ]

  for (const s of mealScenarios) {
    const r = await callMealEngine(s.body, s.label)
    console.log(summarize(r))
    // Pace between calls to avoid stacking against the 50K/min limit.
    await pace(3)
  }

  console.log('')

  // ─── Plan-event scenarios ────────────────────────────────────────────────
  if (!TEST_EVENT_ID || !TEST_CIRCLE_ID) {
    console.log('Skipping plan-event scenarios (set TEST_EVENT_ID + TEST_CIRCLE_ID env vars to run).')
    return
  }

  console.log('--- Plan-event scenarios ---')

  const eventScenarios = [
    {
      label: '6. small dinner (4 adults, anniversary)',
      body: {
        eventId: TEST_EVENT_ID,
        circleId: TEST_CIRCLE_ID,
        description: 'Anniversary dinner for 4, romantic, indoor, italian-leaning',
        headcountAdults: 4,
        headcountKids: 0,
        budget: 'medium',
        helpNeeded: ['food', 'activities'],
        keyRequirements: '',
      },
    },
    {
      label: '7. large potluck (40 mixed, kosher veg options)',
      body: {
        eventId: TEST_EVENT_ID,
        circleId: TEST_CIRCLE_ID,
        description: 'Block-party potluck, mixed ages, outdoor, late summer afternoon',
        headcountAdults: 25,
        headcountKids: 15,
        budget: 'low',
        helpNeeded: ['food', 'supplies', 'tasks'],
        keyRequirements: 'vegetarian and kosher options for ~6 people',
      },
    },
    {
      label: '8. solo dessert spread (kosher dairy)',
      body: {
        eventId: TEST_EVENT_ID,
        circleId: TEST_CIRCLE_ID,
        description: 'Solo Shavuot dessert spread for myself, dairy/kosher, just trying to bake one thing well',
        headcountAdults: 1,
        headcountKids: 0,
        budget: 'low',
        helpNeeded: ['food'],
        keyRequirements: 'kosher dairy, Shavuot',
      },
    },
    {
      label: '9. ambiguous — should clarify',
      body: {
        eventId: TEST_EVENT_ID,
        circleId: TEST_CIRCLE_ID,
        description: 'birthday',
        headcountAdults: 0,
        headcountKids: 0,
        budget: 'medium',
        helpNeeded: [],
        keyRequirements: '',
      },
    },
    {
      label: '10. very long brief (cache check, 2nd run should be faster)',
      body: {
        eventId: TEST_EVENT_ID,
        circleId: TEST_CIRCLE_ID,
        description: `Three-day weekend retreat at a rented cabin in Vermont. Adults are mostly 30-something
          friends from college plus their partners; kids range from toddlers to age 10. We will cook 5 group
          meals over the weekend (Friday dinner casual, Saturday brunch, Saturday dinner formal-ish,
          Sunday brunch, Sunday lunch on the road). 2 vegan, 1 with celiac, no shellfish anywhere. Outdoor
          activities: hiking, evening campfires, board games for rainy weather. The host wants to feel
          relaxed, not run ragged — ample DIY assignments for guests. Budget is high enough for 1 group
          dinner to be catered. Music vibe: indie folk in the morning, dance hits in the evening. Photographer
          friend is bringing a camera. Goal is to have everyone feel welcome and well-fed without the host
          stressing. Plan for 12 adults and 4 kids total.`,
        headcountAdults: 12,
        headcountKids: 4,
        budget: 'high',
        helpNeeded: ['food', 'supplies', 'activities', 'tasks'],
        keyRequirements: '2 vegan, 1 celiac, no shellfish',
      },
    },
  ]

  for (const s of eventScenarios) {
    const r = await callPlanEvent(s.body, s.label)
    console.log(summarize(r))
    await pace(4)
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err)
  process.exit(1)
})

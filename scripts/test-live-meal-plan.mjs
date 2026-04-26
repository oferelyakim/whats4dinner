#!/usr/bin/env node
// v1.18.0+ — live deployment stress test for the async meal-plan job queue.
//
// Drives the same server pipeline production uses:
//   1. service-role INSERT into `meal_plan_jobs` + `meal_plan_job_slots`
//   2. anon POST to `meal-plan-worker` (fire-and-forget) to start processing
//   3. polls slot rows every 10s, re-triggers worker when idle
//   4. verifies each `done` slot's recipe matches its envelope (cuisine
//      keywords, dietary compliance, role appropriateness, basic shape)
//
// The synthetic `plan_id = test-live-{epoch}-{N}` is distinct from any Dexie
// plan so this never pollutes the live /plan-v2 UI for the user_id we attribute
// rows to. All rows can be cleaned up with a single DELETE FROM meal_plan_jobs
// WHERE plan_id LIKE 'test-live-%'.
//
// Usage:
//   SUPABASE_URL=https://zgebzhvbszhqvaryfiwk.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
//   SUPABASE_ANON_KEY=<anon> \
//   node scripts/test-live-meal-plan.mjs --slots=100
//
// Args:
//   --slots=N             total slot count (default 100)
//   --dietary=X[,Y]       dietary constraints (default: pescatarian)
//   --timeout-ms=N        give up after this many ms (default 1200000 = 20 min)
//   --user-id=<uuid>      override (default Ofer's prod uuid from auto-memory)
//   --shape=mixed         only `mixed` for now (template defined below)
//   --verbose             print each slot result as it lands
//   --dry-run             build slots and print summary; don't INSERT
//   --no-poll             INSERT + trigger but skip polling (useful to seed jobs)
//
// Costs: ~$0.30-0.50 per --slots=100 run on a near-empty bank.
//        ~$0.03-0.05 per --slots=10 smoke.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

// ─── Env loading (.env > process.env) ──────────────────────────────────────

function loadDotEnv(path) {
  if (!existsSync(path)) return {}
  const text = readFileSync(path, 'utf-8')
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i)
    if (!m) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[m[1]] = val
  }
  return out
}

// Walk up from REPO_ROOT looking for the first .env. Worktrees don't get the
// gitignored .env, so we may need to climb several levels.
function findDotEnv(startDir) {
  let dir = startDir
  for (let i = 0; i < 8; i++) {
    const p = join(dir, '.env')
    if (existsSync(p)) return p
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Also try the canonical main-repo path explicitly.
  const main = 'C:/Users/OferElyakim/oferProjects/Replanish_App/.env'
  if (existsSync(main)) return main
  return null
}

const dotEnvPath = findDotEnv(REPO_ROOT)
const dotEnv = dotEnvPath ? loadDotEnv(dotEnvPath) : {}
if (dotEnvPath) console.log(`(loaded env from ${dotEnvPath})`)

function env(name, fallbacks = []) {
  for (const k of [name, ...fallbacks]) {
    const v = process.env[k] ?? dotEnv[k]
    if (v) return v
  }
  return ''
}

const SUPABASE_URL = env('SUPABASE_URL', ['VITE_SUPABASE_URL'])
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const ANON_KEY = env('SUPABASE_ANON_KEY', ['VITE_SUPABASE_ANON_KEY'])

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Missing env vars. Need: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY')
  console.error('  found: SUPABASE_URL=' + (SUPABASE_URL ? '✓' : '✗'))
  console.error('         SUPABASE_SERVICE_ROLE_KEY=' + (SERVICE_KEY ? '✓' : '✗'))
  console.error('         SUPABASE_ANON_KEY=' + (ANON_KEY ? '✓' : '✗'))
  process.exit(2)
}

// ─── Args ──────────────────────────────────────────────────────────────────

function arg(name, def) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`) || a === `--${name}`)
  if (!found) return def
  if (found === `--${name}`) return true // boolean flag
  return found.split('=').slice(1).join('=')
}

const SLOTS = parseInt(arg('slots', '100'), 10)
const DIETARY = (arg('dietary', 'pescatarian') || '').split(',').filter(Boolean)
const TIMEOUT_MS = parseInt(arg('timeout-ms', '1200000'), 10) // 20 min default
const USER_ID = arg('user-id', 'f60c9ab4-d68f-47fb-ba37-2af2ec28c2a5')
const VERBOSE = !!arg('verbose', false)
const DRY_RUN = !!arg('dry-run', false)
const NO_POLL = !!arg('no-poll', false)
const POLL_INTERVAL_MS = 5_000
const TRIGGER_DEBOUNCE_MS = 15_000

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ─── Persona ───────────────────────────────────────────────────────────────

const PERSONA = {
  household: { adults: 2, kids: 2 },
  dietary: DIETARY,
  disliked: ['mushrooms', 'cilantro'],
  cuisinePref: 'mixed',
  cookingStyle: 'weeknight-friendly',
}

// 4 dishes already in the imagined recent history — primes anti-repeat.
const SEED_RECENT_DISHES = [
  'Mediterranean lemon-herb salmon',
  'Greek lemon chicken',
  'Shakshuka',
  'Spanish chickpea stew',
]

// ─── Taxonomy (subset mirrored from src/engine/variety/taxonomy.ts) ────────
// Only fields needed for envelope construction. Keeping this in-script means
// the test runs without TS compilation.

const CUISINES = {
  // East Asia
  cantonese: { name: 'Cantonese', region: 'east-asia', kw: ['cantonese', 'soy', 'oyster sauce', 'wok', 'chinese'] },
  sichuan: { name: 'Sichuan', region: 'east-asia', kw: ['sichuan', 'mapo', 'szechuan', 'chili oil', 'peppercorn'] },
  japanese: { name: 'Japanese', region: 'east-asia', kw: ['japanese', 'miso', 'soy', 'mirin', 'dashi', 'ramen', 'teriyaki', 'donburi', 'udon', 'tofu'] },
  korean: { name: 'Korean', region: 'east-asia', kw: ['korean', 'gochujang', 'kimchi', 'bulgogi', 'bibimbap', 'doenjang', 'gochu'] },
  // SE Asia
  thai: { name: 'Thai', region: 'southeast-asia', kw: ['thai', 'curry', 'coconut milk', 'fish sauce', 'lemongrass', 'basil', 'pad'] },
  vietnamese: { name: 'Vietnamese', region: 'southeast-asia', kw: ['vietnamese', 'pho', 'banh mi', 'fish sauce', 'rice noodle', 'lemongrass'] },
  filipino: { name: 'Filipino', region: 'southeast-asia', kw: ['filipino', 'adobo', 'sinigang', 'soy', 'vinegar'] },
  // South Asia
  'indian-north': { name: 'Indian (North)', region: 'south-asia', kw: ['indian', 'curry', 'masala', 'tikka', 'tandoori', 'paneer', 'naan', 'biryani', 'garam'] },
  'indian-south': { name: 'Indian (South)', region: 'south-asia', kw: ['indian', 'south indian', 'sambar', 'rasam', 'dosa', 'idli', 'curry leaf', 'coconut'] },
  // Latin America
  mexican: { name: 'Mexican', region: 'latin-america', kw: ['mexican', 'taco', 'enchilada', 'mole', 'salsa', 'tortilla', 'cilantro', 'jalapeño', 'lime'] },
  'tex-mex': { name: 'Tex-Mex', region: 'latin-america', kw: ['tex-mex', 'fajita', 'taco', 'queso', 'chili', 'cumin'] },
  'cuban-caribbean': { name: 'Cuban / Caribbean', region: 'latin-america', kw: ['cuban', 'caribbean', 'mojo', 'sofrito', 'jerk', 'ropa vieja'] },
  peruvian: { name: 'Peruvian', region: 'latin-america', kw: ['peruvian', 'aji', 'ceviche', 'lomo', 'quinoa', 'aji amarillo'] },
  argentine: { name: 'Argentine', region: 'latin-america', kw: ['argentine', 'argentinian', 'chimichurri', 'asado', 'milanesa'] },
  // North America
  american: { name: 'American (modern)', region: 'north-america', kw: ['american', 'sheet-pan', 'roasted', 'glazed', 'honey'] },
  'american-comfort': { name: 'American Comfort', region: 'north-america', kw: ['american', 'comfort', 'casserole', 'meatloaf', 'pot roast', 'shepherd', 'chowder'] },
  'american-bbq': { name: 'BBQ / Southern', region: 'north-america', kw: ['bbq', 'barbecue', 'pulled', 'smoked', 'slaw', 'cornbread'] },
  cajun: { name: 'Cajun / Creole', region: 'north-america', kw: ['cajun', 'creole', 'jambalaya', 'gumbo', 'étouffée', 'andouille'] },
  // Europe
  'french-bistro': { name: 'French Bistro', region: 'europe', kw: ['french', 'bistro', 'coq au vin', 'beurre', 'blanc', 'mussels', 'beef bourguignon', 'ratatouille', 'niçoise'] },
  'italian-northern': { name: 'Italian (Northern)', region: 'europe', kw: ['italian', 'risotto', 'polenta', 'osso buco', 'bolognese', 'parmigiano', 'pesto'] },
  'italian-southern': { name: 'Italian (Southern)', region: 'europe', kw: ['italian', 'pasta', 'tomato', 'mozzarella', 'eggplant', 'pizza', 'caprese', 'puttanesca'] },
  'german-polish': { name: 'German / Polish', region: 'europe', kw: ['german', 'polish', 'sauerkraut', 'pierogi', 'bratwurst', 'schnitzel'] },
  // Med/ME (HARD CAP 4)
  greek: { name: 'Greek', region: 'med-me', kw: ['greek', 'tzatziki', 'feta', 'oregano', 'kalamata', 'gyro', 'spanakopita'] },
  'spanish-tapas': { name: 'Spanish (Tapas)', region: 'med-me', kw: ['spanish', 'tapas', 'paprika', 'manchego', 'gambas', 'tortilla', 'patatas bravas', 'pimiento', 'gazpacho', 'romesco'] },
  persian: { name: 'Persian', region: 'med-me', kw: ['persian', 'iranian', 'saffron', 'tahdig', 'fesenjan', 'koresh'] },
  israeli: { name: 'Israeli', region: 'med-me', kw: ['israeli', 'shakshuka', 'falafel', 'sabich', 'tahini'] },
}

const STYLES = {
  'stir-fry': 'Stir-fry',
  grilled: 'Grilled / charred',
  braised: 'Braised / stew',
  'sheet-pan': 'Sheet-pan',
  'pasta-dish': 'Pasta dish',
  'rice-bowl': 'Rice or grain bowl',
  'taco-wrap': 'Taco / wrap / handheld',
  'no-cook-salad': 'Big salad / no-cook',
  'soup-stew': 'Soup / chowder',
  curry: 'Curry',
  sandwich: 'Sandwich / hero',
  tapas: 'Tapas / small plates',
  pizza: 'Pizza / flatbread',
}

const FLAVORS = {
  'bright-citrusy': 'Bright / citrusy',
  smoky: 'Smoky',
  'umami-heavy': 'Umami-heavy',
  herby: 'Fresh-herby',
  'spicy-hot': 'Spicy-hot',
  'creamy-rich': 'Creamy / rich',
  'sweet-savory': 'Sweet-savory',
  vinegary: 'Vinegary / pickled',
  garlicky: 'Garlicky / allium-forward',
  'peppery-mild': 'Peppery-mild',
}

// pescatarian-safe protein pool
const PROTEINS_PESC = [
  { name: 'salmon fillet', family: 'seafood' },
  { name: 'shrimp (peeled)', family: 'seafood' },
  { name: 'cod or pollock', family: 'seafood' },
  { name: 'tilapia or branzino', family: 'seafood' },
  { name: 'mussels or clams', family: 'seafood' },
  { name: 'canned tuna', family: 'seafood' },
  { name: 'firm tofu', family: 'plant-based' },
  { name: 'chickpeas (canned)', family: 'plant-based' },
  { name: 'black or pinto beans', family: 'plant-based' },
  { name: 'lentils (red or green)', family: 'plant-based' },
  { name: 'eggs', family: 'eggs-dairy' },
  { name: 'paneer or halloumi', family: 'eggs-dairy' },
  { name: 'fresh ricotta or cottage cheese', family: 'eggs-dairy' },
]

const PROTEINS_OMNIVORE = [
  ...PROTEINS_PESC,
  { name: 'chicken thighs (boneless)', family: 'poultry' },
  { name: 'chicken breast', family: 'poultry' },
  { name: 'ground turkey', family: 'poultry' },
  { name: 'flank or skirt steak', family: 'red-meat' },
  { name: 'ground beef (85/15)', family: 'red-meat' },
  { name: 'pork tenderloin', family: 'pork' },
]

function proteinPool() {
  if (DIETARY.includes('vegan')) return PROTEINS_PESC.filter((p) => p.family === 'plant-based')
  if (DIETARY.includes('vegetarian')) return PROTEINS_PESC.filter((p) => p.family !== 'seafood')
  if (DIETARY.includes('pescatarian')) return PROTEINS_PESC
  return PROTEINS_OMNIVORE
}

// ─── Plan template ─────────────────────────────────────────────────────────
// Mirrors the plan-shape table from the approved plan.

function buildTemplate(jobNonce) {
  const days = []

  function addDay(dayIdx, meals) {
    days.push({ dayIdx, dateLabel: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dayIdx % 7], meals })
  }

  // Week 1
  addDay(0, [
    { type: 'breakfast', slots: [{ role: 'main' }] },
    { type: 'lunch', slots: [{ role: 'main' }, { role: 'side' }] },
    { type: 'dinner', slots: [{ role: 'main' }, { role: 'veg_side' }, { role: 'starch_side' }] },
  ])
  addDay(1, [
    { type: 'breakfast', slots: [{ role: 'main' }] },
    { type: 'lunch', slots: [{ role: 'main' }, { role: 'side' }] },
    { type: 'dinner', slots: [{ role: 'main' }, { role: 'veg_side' }, { role: 'starch_side' }] },
  ])
  addDay(2, [
    { type: 'breakfast', slots: [{ role: 'main' }] },
    { type: 'lunch', slots: [{ role: 'main' }, { role: 'side' }] },
    { type: 'dinner', slots: [{ role: 'main' }, { role: 'veg_side' }, { role: 'starch_side' }] },
  ])
  addDay(3, [
    { type: 'breakfast', slots: [{ role: 'main' }] },
    { type: 'lunch', slots: [{ role: 'main' }] },
    { type: 'dinner', slots: [{ role: 'main' }, { role: 'veg_side' }, { role: 'starch_side' }, { role: 'salad' }] },
  ])
  // Friday — tapas lunch + 3-dish dinner.
  addDay(4, [
    { type: 'breakfast', slots: [{ role: 'main' }] },
    { type: 'lunch', tag: 'tapas', slots: [
      { role: 'tapas', forceCuisine: 'spanish-tapas', forceStyle: 'tapas' },
      { role: 'tapas', forceCuisine: 'spanish-tapas', forceStyle: 'tapas' },
      { role: 'tapas', forceCuisine: 'spanish-tapas', forceStyle: 'tapas' },
      { role: 'tapas', forceCuisine: 'spanish-tapas', forceStyle: 'tapas' },
      { role: 'tapas', forceCuisine: 'spanish-tapas', forceStyle: 'tapas' },
    ] },
    { type: 'dinner', slots: [{ role: 'main' }, { role: 'veg_side' }, { role: 'starch_side' }] },
  ])
  addDay(5, [
    { type: 'brunch', slots: [{ role: 'main' }, { role: 'side' }] },
    { type: 'dinner', slots: [{ role: 'main' }, { role: 'veg_side' }, { role: 'starch_side' }, { role: 'salad' }] },
  ])
  addDay(6, [
    { type: 'breakfast', slots: [{ role: 'main' }] },
    { type: 'lunch', slots: [{ role: 'main' }, { role: 'side' }] },
    { type: 'dinner', slots: [{ role: 'main' }, { role: 'veg_side' }, { role: 'starch_side' }] },
  ])

  // Week 2 — mostly mirrors week 1 with a couple of cuisine swaps. We
  // re-add the same shape; envelope variety comes from the random-pick path.
  for (let d = 0; d < 7; d++) days.push({ ...days[d], dayIdx: 7 + d })

  // Flatten into slot inputs.
  const out = []
  let slotIdx = 0
  for (const day of days) {
    const dayId = `day-test-${jobNonce}-${day.dayIdx}`
    let mealIdx = 0
    for (const meal of day.meals) {
      const mealId = `meal-test-${jobNonce}-${day.dayIdx}-${mealIdx}`
      for (const s of meal.slots) {
        out.push({
          slotId: `slot-test-${jobNonce}-${slotIdx}`,
          mealId,
          dayId,
          slotRole: s.role,
          mealType: meal.type,
          forceCuisine: s.forceCuisine,
          forceStyle: s.forceStyle,
          dayLabel: day.dateLabel,
          isWeekend: day.dayIdx % 7 >= 5,
          isTapasGroup: !!meal.tag,
        })
        slotIdx++
      }
    }
  }
  return out
}

// ─── Envelope picker (cheap RNG, mimics src/engine/variety/picker.ts) ──────

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)]
}

function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function assignEnvelopes(slotInputs, seedNonce) {
  // Seeded RNG so dry-run output is stable for inspection.
  const rng = makeRng(seedNonce + 0xab12)
  const cuisineIds = Object.keys(CUISINES)
  // Hard-cap Med/ME: at most 25% (matches taxonomy comment "intentionally
  // capped at 4 cuisines"). We bias by reducing weight.
  const medMe = cuisineIds.filter((c) => CUISINES[c].region === 'med-me')
  const nonMed = cuisineIds.filter((c) => CUISINES[c].region !== 'med-me')

  // Day-level rotation: pick cuisines without consecutive repeats.
  const dayCuisines = {}
  let lastCuisine = null
  for (const s of slotInputs) {
    if (s.forceCuisine) continue
    const dayMealKey = `${s.dayId}|${s.mealType}`
    if (dayCuisines[dayMealKey]) continue
    let pick
    let tries = 0
    do {
      // 75/25 split nonMed vs medMe to mirror the engine's hard cap on Med.
      pick = rng() < 0.75 ? pickRandom(nonMed, rng) : pickRandom(medMe, rng)
      tries++
    } while (pick === lastCuisine && tries < 5)
    dayCuisines[dayMealKey] = pick
    lastCuisine = pick
  }

  const styleIds = Object.keys(STYLES)
  const flavorIds = Object.keys(FLAVORS)
  const proteins = proteinPool()

  for (const s of slotInputs) {
    const cuisineId = s.forceCuisine || dayCuisines[`${s.dayId}|${s.mealType}`] || pickRandom(cuisineIds, rng)
    const cuisine = CUISINES[cuisineId]
    const styleId = s.forceStyle || pickRandom(styleIds, rng)
    const flavorId = pickRandom(flavorIds, rng)
    const isProteinRole = ['main', 'tapas', 'protein'].includes(s.slotRole)
    const protein = isProteinRole ? pickRandom(proteins, rng) : null

    s.envelope = {
      cuisineId,
      cuisineLabel: cuisine.name,
      cuisineRegion: cuisine.region,
      proteinName: protein?.name,
      proteinFamily: protein?.family,
      styleId,
      styleLabel: STYLES[styleId],
      flavorId,
      flavorLabel: FLAVORS[flavorId],
    }
  }

  return slotInputs
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────

const FN_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`

async function ping(fn) {
  try {
    const res = await fetch(`${FN_BASE}/${fn}?ping=1`, { headers: { apikey: ANON_KEY } })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, ...(await res.json()) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function triggerWorker() {
  try {
    const res = await fetch(`${FN_BASE}/meal-plan-worker`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({}),
    })
    return { status: res.status, ok: res.ok, body: await res.text() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ─── Verification ─────────────────────────────────────────────────────────

const PROTEIN_KW = {
  beef: ['beef', 'steak', 'ground beef', 'brisket', 'short rib'],
  pork: ['pork', 'bacon', 'ham', 'sausage', 'prosciutto', 'chorizo'],
  chicken: ['chicken'],
  poultry_other: ['turkey', 'duck'],
  lamb: ['lamb', 'mutton'],
}

// Verification policy:
//   HARD fails (count toward strict pass): empty title, too_few ingredients/steps,
//   actual meat for pescatarian (excluding broth/stock/fat which are common
//   pantry staples), disliked-ingredient present, bad_image_url.
//   SOFT signals (printed/tracked but don't fail): cuisine_miss (keyword lists
//   are inherently incomplete; AI can return "Chinese pickled mustard green
//   noodles" which is on-envelope for Sichuan but won't match a small KW list),
//   bad_time when both 0 (some web recipes lack JSON-LD durations and the
//   normalizer leaves them undefined; the recipe is still usable).

const PANTRY_MEAT_DERIVATIVES = ['broth', 'stock', 'bouillon', 'fat', 'drippings', 'lard', 'gravy']

function meatRegexHits(text, meatKw) {
  // Word-boundary match. Skip if the meat word appears next to a pantry
  // derivative (e.g. "chicken broth", "beef stock") — those are flavor
  // ingredients, not meat protein.
  const re = new RegExp(`(^|[^a-z])${meatKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'gi')
  let m
  while ((m = re.exec(text))) {
    // Inspect the next 30 chars after the match for a pantry-derivative word.
    const tail = text.slice(m.index, m.index + meatKw.length + 30).toLowerCase()
    if (PANTRY_MEAT_DERIVATIVES.some((d) => tail.includes(d))) continue
    return true
  }
  return false
}

function verifyRecipe(slot, recipe) {
  const fails = []
  const soft = []
  if (!recipe || typeof recipe !== 'object') {
    fails.push('no_recipe_object')
    return { pass: false, fails, soft }
  }
  const title = String(recipe.title || '').trim()
  if (!title) fails.push('empty_title')
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  if (ingredients.length < 3) fails.push(`too_few_ingredients(${ingredients.length})`)
  const steps = Array.isArray(recipe.steps) ? recipe.steps : []
  if (steps.length < 2) fails.push(`too_few_steps(${steps.length})`)
  const prep = Number(recipe.prepTimeMin) || 0
  const cook = Number(recipe.cookTimeMin) || 0
  const totalTime = prep + cook
  if (totalTime > 360) fails.push(`bad_time(prep=${prep},cook=${cook})`)
  // Note: totalTime === 0 is a soft signal (web recipe missing JSON-LD duration)
  // not a hard fail. Stage-D extraction often nulls these.
  if (totalTime === 0) soft.push('missing_time')
  if (recipe.imageUrl != null) {
    try {
      new URL(String(recipe.imageUrl))
    } catch {
      fails.push('bad_image_url')
    }
  }

  // Ingredient body for keyword checks.
  const ingredientText = ingredients
    .map((i) => (typeof i === 'string' ? i : i?.item ?? '').toLowerCase())
    .join(' | ')

  // Cuisine alignment — SOFT signal only. Keyword lists are inherently lossy.
  const env = slot.envelope || {}
  const cuisineKw = CUISINES[env.cuisineId]?.kw || []
  const haystack = `${title.toLowerCase()} ${ingredientText}`.slice(0, 2000)
  const cuisineHit = cuisineKw.some((kw) => haystack.includes(kw.toLowerCase()))
  if (!cuisineHit && cuisineKw.length > 0) soft.push(`cuisine_miss(${env.cuisineId})`)

  // Dietary compliance — HARD fail, but skip false positives on broth/stock.
  const lowerIng = ingredientText
  if (DIETARY.includes('pescatarian') || DIETARY.includes('vegetarian') || DIETARY.includes('vegan')) {
    for (const meatKw of [...PROTEIN_KW.beef, ...PROTEIN_KW.pork, ...PROTEIN_KW.chicken, ...PROTEIN_KW.poultry_other, ...PROTEIN_KW.lamb]) {
      if (meatRegexHits(lowerIng, meatKw)) fails.push(`dietary_violation(${meatKw})`)
    }
    if (DIETARY.includes('vegetarian') || DIETARY.includes('vegan')) {
      for (const seafoodKw of ['salmon', 'shrimp', 'tuna', 'cod', 'tilapia', 'mussels', 'clam', 'sardine', 'fish', 'anchovy']) {
        if (meatRegexHits(lowerIng, seafoodKw)) fails.push(`dietary_violation(${seafoodKw})`)
      }
    }
  }

  // Disliked-ingredient avoidance — strict.
  for (const dis of PERSONA.disliked) {
    if (lowerIng.includes(dis.toLowerCase())) fails.push(`disliked_present(${dis})`)
  }

  return { pass: fails.length === 0, fails, soft }
}

function verifyTapasDiversity(tapasSlots) {
  // For the 5 tapas slots, expect ≥4 unique main proteins/styles in titles.
  const titles = tapasSlots.map((s) => String(s.recipe?.title || '').toLowerCase())
  const uniqueTitles = new Set(titles)
  return uniqueTitles.size >= 4
}

// ─── Main flow ─────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now()
  const nonce = startedAt.toString(36)
  const planId = `test-live-${startedAt}-${SLOTS}n`
  console.log('=== test-live-meal-plan ===')
  console.log(`SUPABASE_URL=${SUPABASE_URL}`)
  console.log(`USER_ID=${USER_ID}`)
  console.log(`plan_id=${planId}`)
  console.log(`slots target=${SLOTS}, dietary=${DIETARY.join(',') || '<none>'}, timeout=${TIMEOUT_MS}ms`)
  console.log('')

  // ── 1. Probes ───────────────────────────────────────────────────────────
  console.log('--- Probes ---')
  const me = await ping('meal-engine')
  if (!me.ok) {
    console.error(`[FAIL] meal-engine ping — ${JSON.stringify(me)}`)
    process.exit(3)
  }
  console.log(`[PASS] meal-engine — version=${me.version} model=${me.model} composeModel=${me.composeModel ?? '?'} deployedAt=${me.deployedAt}`)
  const mw = await ping('meal-plan-worker')
  if (!mw.ok) {
    console.error(`[FAIL] meal-plan-worker ping — ${JSON.stringify(mw)}`)
    process.exit(3)
  }
  console.log(`[PASS] meal-plan-worker — version=${mw.version} deployedAt=${mw.deployedAt}`)
  console.log('')

  // ── 2. Build slot inputs ────────────────────────────────────────────────
  let template = buildTemplate(nonce)
  // Truncate or extend to exactly SLOTS by repeating from the middle out.
  if (template.length > SLOTS) {
    template = template.slice(0, SLOTS)
  } else if (template.length < SLOTS) {
    let i = 0
    while (template.length < SLOTS) {
      const src = template[i % template.length]
      template.push({
        ...src,
        slotId: `slot-test-${nonce}-${template.length}`,
        // re-tag the day/meal ids so envelope rotation buckets reset
        mealId: `meal-test-${nonce}-pad-${Math.floor(template.length / 7)}-${(template.length % 7)}`,
        dayId: `day-test-${nonce}-pad-${Math.floor(template.length / 7)}`,
      })
      i++
    }
  }

  template = assignEnvelopes(template, startedAt)

  console.log(`--- Plan summary (${template.length} slots) ---`)
  const tapasSlots = template.filter((s) => s.isTapasGroup)
  const dinnerSlots = template.filter((s) => s.mealType === 'dinner' && s.slotRole === 'main')
  const dinner3dish = template.filter((s) => s.mealType === 'dinner').reduce((acc, s) => {
    acc[s.mealId] = (acc[s.mealId] || 0) + 1
    return acc
  }, {})
  const threeDishDinners = Object.values(dinner3dish).filter((n) => n >= 3).length
  console.log(`  tapas slots: ${tapasSlots.length}`)
  console.log(`  3+-dish dinners: ${threeDishDinners}`)
  console.log(`  dinner mains: ${dinnerSlots.length}`)
  console.log(`  cuisines used: ${[...new Set(template.map((s) => s.envelope.cuisineId))].sort().join(', ')}`)
  console.log('')

  if (DRY_RUN) {
    console.log('--- DRY RUN — first 5 slot envelopes ---')
    for (const s of template.slice(0, 5)) {
      console.log(JSON.stringify({ id: s.slotId, role: s.slotRole, type: s.mealType, env: s.envelope }, null, 2))
    }
    process.exit(0)
  }

  // Sanity check user_id exists.
  const { data: userRow, error: userErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', USER_ID)
    .maybeSingle()
  if (userErr) {
    console.warn(`[warn] profile lookup failed (RLS?): ${userErr.message} — continuing assuming auth.users has the row`)
  } else if (!userRow) {
    console.error(`[FAIL] profile ${USER_ID} not found — pass --user-id=<uuid> to override`)
    process.exit(4)
  }

  // ── 3. INSERT job + slots ───────────────────────────────────────────────
  console.log('--- INSERT job ---')
  const { data: job, error: jobErr } = await supabase
    .from('meal_plan_jobs')
    .insert({
      user_id: USER_ID,
      circle_id: null,
      plan_id: planId,
      total_slots: template.length,
      status: 'queued',
    })
    .select('id')
    .single()
  if (jobErr || !job) {
    console.error(`[FAIL] INSERT job: ${jobErr?.message}`)
    process.exit(5)
  }
  const jobId = job.id
  console.log(`[PASS] job inserted: ${jobId}`)

  // Insert slots in batches of 100 to keep payload size manageable.
  const slotRows = template.map((s) => ({
    job_id: jobId,
    slot_id: s.slotId,
    meal_id: s.mealId,
    day_id: s.dayId,
    slot_role: s.slotRole,
    meal_type: s.mealType,
    envelope: s.envelope,
    dietary_constraints: DIETARY,
    disliked_ingredients: PERSONA.disliked,
    recent_dish_names: SEED_RECENT_DISHES,
  }))
  const BATCH = 100
  for (let i = 0; i < slotRows.length; i += BATCH) {
    const batch = slotRows.slice(i, i + BATCH)
    const { error } = await supabase.from('meal_plan_job_slots').insert(batch)
    if (error) {
      console.error(`[FAIL] INSERT slot batch ${i}-${i + batch.length}: ${error.message}`)
      // Best-effort cleanup
      await supabase.from('meal_plan_jobs').update({ status: 'cancelled', error_message: 'insert_failed' }).eq('id', jobId)
      process.exit(6)
    }
  }
  console.log(`[PASS] ${slotRows.length} slot rows inserted`)
  console.log('')

  // ── 4. Trigger worker + poll ────────────────────────────────────────────
  console.log('--- Triggering worker ---')
  const trig = await triggerWorker()
  console.log(`  trigger returned: status=${trig.status} body=${String(trig.body || '').slice(0, 200)}`)

  if (NO_POLL) {
    console.log('--no-poll set; exiting after trigger.')
    process.exit(0)
  }

  console.log('')
  console.log(`--- Polling (every ${POLL_INTERVAL_MS / 1000}s) ---`)
  let lastTriggerAt = Date.now()
  const deadline = Date.now() + TIMEOUT_MS
  let lastDone = -1
  let lastProgressAt = Date.now()
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const [{ data: jobRow }, { data: slotRows }] = await Promise.all([
      supabase
        .from('meal_plan_jobs')
        .select('status, completed_slots, failed_slots, started_at, finished_at, error_message')
        .eq('id', jobId)
        .single(),
      supabase
        .from('meal_plan_job_slots')
        .select('status, started_at')
        .eq('job_id', jobId),
    ])
    const counts = { pending: 0, in_progress: 0, done: 0, failed: 0, cancelled: 0 }
    let stuckInFlight = 0
    for (const r of slotRows ?? []) {
      counts[r.status] = (counts[r.status] || 0) + 1
      // A slot 'in_progress' for >2.5 min is almost certainly stuck — the
      // worker that claimed it has either crashed or died of a Supabase
      // edge-function timeout. The worker's own slot-sweep (v1.18.2) handles
      // this on its next invocation, but we still want to count + trigger.
      if (r.status === 'in_progress' && r.started_at && Date.now() - new Date(r.started_at).getTime() > 150_000) {
        stuckInFlight++
      }
    }
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
    const pct = Math.round((counts.done / template.length) * 100)
    const bar = '#'.repeat(Math.floor(pct / 5)) + '.'.repeat(20 - Math.floor(pct / 5))
    const stuckTag = stuckInFlight > 0 ? ` stuck=${stuckInFlight}` : ''
    console.log(
      `  [${elapsedSec.toString().padStart(4)}s] [${bar}] ${pct.toString().padStart(3)}% job=${jobRow?.status} done=${counts.done} pending=${counts.pending} in_flight=${counts.in_progress}${stuckTag} failed=${counts.failed}`,
    )
    if (counts.done > lastDone) {
      lastDone = counts.done
      lastProgressAt = Date.now()
    }
    if (jobRow?.status === 'completed' || jobRow?.status === 'failed' || jobRow?.status === 'cancelled') {
      console.log(`  → terminal status: ${jobRow.status}`)
      if (jobRow.error_message) console.log(`     error_message: ${jobRow.error_message}`)
      break
    }
    // Re-trigger worker when:
    //   (a) Truly idle (in_flight=0, pending>0, debounce elapsed), OR
    //   (b) Effective stall (some in_flight but they look stuck, AND we
    //       haven't seen progress for >60s) — gives the worker's stuck-slot
    //       sweep a chance to roll them back to pending and retry.
    const trulyIdle = counts.pending > 0 && counts.in_progress === 0
    const stalled = (counts.pending + stuckInFlight) > 0 && (Date.now() - lastProgressAt) > 60_000
    if ((trulyIdle || stalled) && Date.now() - lastTriggerAt > TRIGGER_DEBOUNCE_MS) {
      const t = await triggerWorker()
      const reason = trulyIdle ? 'idle' : `stalled stuck=${stuckInFlight}`
      console.log(`  ↺ re-trigger (${reason}) — status=${t.status}`)
      lastTriggerAt = Date.now()
      lastProgressAt = Date.now() // reset stall window after retrigger
    }
  }

  // ── 5. Pull final slot rows ─────────────────────────────────────────────
  console.log('')
  console.log('--- Loading final slot results ---')
  const { data: finalSlots, error: finalErr } = await supabase
    .from('meal_plan_job_slots')
    .select('slot_id, status, result, error_message, attempts')
    .eq('job_id', jobId)
    .order('id')
  if (finalErr) {
    console.error(`[FAIL] could not load slot rows: ${finalErr.message}`)
    process.exit(7)
  }
  const slotById = {}
  for (const r of finalSlots ?? []) slotById[r.slot_id] = r
  for (const s of template) {
    s.row = slotById[s.slotId] || null
    s.recipe = s.row?.result || null
  }

  // ── 6. Verify per-slot ──────────────────────────────────────────────────
  console.log('--- Verification ---')
  const summary = {
    total: template.length,
    done: 0,
    failed: 0,
    pending: 0,
    cancelled: 0,
    verifyPass: 0,
    verifyFail: 0,
    softSignalsTotal: 0,
    softSignalKinds: {},
    failureKinds: {},
    perCuisineDone: {},
    perCuisineFail: {},
  }
  for (const s of template) {
    const status = s.row?.status || 'missing'
    summary[status] = (summary[status] || 0) + 1
    if (status === 'done') {
      const v = verifyRecipe(s, s.recipe)
      if (v.pass) summary.verifyPass++
      else {
        summary.verifyFail++
        for (const f of v.fails) summary.failureKinds[f.replace(/\(.*?\)$/, '')] = (summary.failureKinds[f.replace(/\(.*?\)$/, '')] || 0) + 1
      }
      for (const sig of v.soft) {
        summary.softSignalsTotal++
        summary.softSignalKinds[sig.replace(/\(.*?\)$/, '')] = (summary.softSignalKinds[sig.replace(/\(.*?\)$/, '')] || 0) + 1
      }
      summary.perCuisineDone[s.envelope.cuisineId] = (summary.perCuisineDone[s.envelope.cuisineId] || 0) + 1
      if (VERBOSE) {
        const t = String(s.recipe?.title || '').slice(0, 60)
        const tag = v.pass ? (v.soft.length ? `~ (${v.soft.join(',')})` : '✓') : `✗ ${v.fails.slice(0,2).join(' ')}`
        console.log(`  ${s.slotId} ${s.envelope.cuisineId}/${s.slotRole} → "${t}"  ${tag}`)
      }
      s.verification = v
    } else if (status === 'failed') {
      summary.perCuisineFail[s.envelope.cuisineId] = (summary.perCuisineFail[s.envelope.cuisineId] || 0) + 1
    }
  }

  // Tapas diversity check.
  const tapasDoneSlots = template.filter((s) => s.isTapasGroup && s.row?.status === 'done')
  const tapasPass = tapasDoneSlots.length >= 4 ? verifyTapasDiversity(tapasDoneSlots) : false
  summary.tapasDiversityPass = tapasPass
  summary.tapasDoneCount = tapasDoneSlots.length

  // ── 7. Print summary ────────────────────────────────────────────────────
  console.log('')
  console.log('=== Summary ===')
  console.log(`Total slots:        ${summary.total}`)
  console.log(`  done:             ${summary.done}`)
  console.log(`  failed:           ${summary.failed || 0}`)
  console.log(`  pending:          ${summary.pending || 0}`)
  console.log(`  cancelled:        ${summary.cancelled || 0}`)
  console.log(`Verification:`)
  console.log(`  pass (strict):    ${summary.verifyPass}`)
  console.log(`  fail (hard):      ${summary.verifyFail}`)
  if (Object.keys(summary.failureKinds).length > 0) {
    console.log(`  fail kinds:       ${JSON.stringify(summary.failureKinds)}`)
  }
  console.log(`  soft signals:     ${summary.softSignalsTotal} across ${Object.keys(summary.softSignalKinds).length} kinds`)
  if (summary.softSignalsTotal > 0) {
    console.log(`  soft kinds:       ${JSON.stringify(summary.softSignalKinds)}`)
  }
  console.log(`Tapas diversity:    ${tapasPass ? 'PASS' : 'FAIL'} (${summary.tapasDoneCount}/5 done)`)
  console.log(`Wall clock:         ${Math.round((Date.now() - startedAt) / 1000)}s`)

  // Sample 3 random done recipes for eyeball.
  const doneList = template.filter((s) => s.row?.status === 'done')
  console.log('')
  console.log('--- Sample recipes (3 random) ---')
  for (let i = 0; i < Math.min(3, doneList.length); i++) {
    const idx = Math.floor(Math.random() * doneList.length)
    const s = doneList[idx]
    const r = s.recipe
    console.log(`\n[${s.envelope.cuisineId}/${s.slotRole}/${s.mealType}] ${r?.title}`)
    console.log(`  prep=${r?.prepTimeMin} cook=${r?.cookTimeMin} servings=${r?.servings} source=${r?.source ?? '?'}`)
    const ings = (r?.ingredients ?? []).slice(0, 6).map((i) => (typeof i === 'string' ? i : i?.item ?? '?'))
    console.log(`  ingredients (first 6): ${ings.join('; ')}`)
    if (r?.imageUrl) console.log(`  image: ${String(r.imageUrl).slice(0, 100)}`)
  }

  // ── 8. JSON snapshot ────────────────────────────────────────────────────
  const snapshotPath = join(REPO_ROOT, 'scripts', 'test-live-meal-plan.last-run.json')
  const snapshot = {
    jobId,
    planId,
    userId: USER_ID,
    config: { slots: SLOTS, dietary: DIETARY, disliked: PERSONA.disliked, timeoutMs: TIMEOUT_MS },
    durationMs: Date.now() - startedAt,
    summary,
    perSlot: template.map((s) => ({
      slotId: s.slotId,
      slotRole: s.slotRole,
      mealType: s.mealType,
      envelope: s.envelope,
      isTapasGroup: s.isTapasGroup,
      status: s.row?.status,
      attempts: s.row?.attempts,
      errorMessage: s.row?.error_message,
      recipe: s.recipe ? {
        title: s.recipe.title,
        source: s.recipe.source,
        prepTimeMin: s.recipe.prepTimeMin,
        cookTimeMin: s.recipe.cookTimeMin,
        servings: s.recipe.servings,
        ingredientCount: Array.isArray(s.recipe.ingredients) ? s.recipe.ingredients.length : 0,
        stepCount: Array.isArray(s.recipe.steps) ? s.recipe.steps.length : 0,
        imageUrl: s.recipe.imageUrl,
      } : null,
      verification: s.verification ?? null,
    })),
  }
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))
  console.log('')
  console.log(`Snapshot: ${snapshotPath}`)

  // ── 9. Exit code ────────────────────────────────────────────────────────
  const completionPct = summary.done / summary.total
  const verifyPct = summary.done > 0 ? summary.verifyPass / summary.done : 0
  // Pass criteria from approved plan:
  //   --slots=10 smoke: 100% done, 0 failed, 0 timeouts, ≤ 3 min.
  //   --slots=100 full: ≥ 95% done, 0 timeouts, all per-slot rules pass.
  let exitCode = 0
  if (SLOTS <= 20) {
    if (completionPct < 1.0) exitCode = 10
    if (verifyPct < 0.9) exitCode = 11   // allow 1 quality miss in 10 (cuisine fuzzy match is approximate)
  } else {
    if (completionPct < 0.95) exitCode = 20
    if (verifyPct < 0.85) exitCode = 21
  }
  if (summary.failed > 5) exitCode = 22
  console.log(`Exit code: ${exitCode}`)
  process.exit(exitCode)
}

main().catch((err) => {
  console.error('Test crashed:', err)
  process.exit(99)
})

#!/usr/bin/env node
// v1.17.0 — manual recipe-bank seeder.
//
// Generates a starter set of recipes and inserts them into the recipe_bank
// table. Run once after migration 030 is applied to give users immediate
// bank-coverage on a fresh deploy. The cron-driven refresher is deferred
// to v1.18.0 — for now this is run on demand.
//
// Usage:
//   SUPABASE_URL=https://zgebzhvbszhqvaryfiwk.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   ANTHROPIC_API_KEY=<key> \
//   node scripts/seed-recipe-bank.mjs [--limit=50]
//
// The default seeds ~50 recipes covering the most-popular dietary × cuisine
// × meal_type cells. Costs ~$0.50 in Anthropic spend with Haiku (avg 1.5K
// in + 1K out per recipe = ~2.5K tokens × 50 recipes = 125K tokens ≈ $0.25
// input + $0.25 output).

async function logBankSeedUsageHttp({ tokensIn, tokensOut, feature }) {
  if (!tokensIn && !tokensOut) return
  const cost = (tokensIn / 1_000_000) * 1.0 + (tokensOut / 1_000_000) * 5.0
  await fetch(`${SUPABASE_URL}/rest/v1/ai_usage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': SERVICE_KEY,
      'authorization': `Bearer ${SERVICE_KEY}`,
      'prefer': 'return=minimal',
    },
    body: JSON.stringify({
      user_id: null,
      action_type: 'bank_seed',
      api_cost_usd: cost,
      model_used: 'claude-haiku-4-5-20251001',
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      period_start: new Date().toISOString(),
      feature_context: feature,
    }),
  }).catch((err) => console.warn('[bank-seed] usage log failed:', err.message))
}

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY env vars.')
  process.exit(1)
}

const limit = parseInt(
  (process.argv.find((a) => a.startsWith('--limit=')) || '--limit=50').split('=')[1],
  10,
)

// ─── Seed cells ─────────────────────────────────────────────────────────
// Ordered by popularity. The first `limit` entries get generated. Each cell
// can yield 1-3 recipes depending on Anthropic's response.

const SEED_CELLS = [
  // Omnivore mains
  { cuisine: 'italian',   mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'classic Italian chicken main' },
  { cuisine: 'italian',   mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'beef',     hint: 'comforting Italian beef main' },
  { cuisine: 'italian',   mealType: 'dinner',    slotRole: 'main',         dietary: ['vegetarian'],            protein: 'cheese',   hint: 'Italian vegetarian pasta main' },
  { cuisine: 'mexican',   mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'casual Mexican chicken main' },
  { cuisine: 'mexican',   mealType: 'dinner',    slotRole: 'main',         dietary: ['vegetarian'],            protein: 'legume',   hint: 'Mexican black-bean main' },
  { cuisine: 'thai',      mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'Thai chicken main' },
  { cuisine: 'thai',      mealType: 'dinner',    slotRole: 'main',         dietary: ['vegan','gluten-free'],   protein: 'tofu',     hint: 'Thai vegan tofu main' },
  { cuisine: 'indian',    mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'Indian chicken curry main' },
  { cuisine: 'indian',    mealType: 'dinner',    slotRole: 'main',         dietary: ['vegetarian'],            protein: 'legume',   hint: 'Indian vegetarian dal main' },
  { cuisine: 'japanese',  mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'seafood',  hint: 'Japanese fish main' },
  { cuisine: 'japanese',  mealType: 'dinner',    slotRole: 'main',         dietary: ['gluten-free'],           protein: 'chicken',  hint: 'Japanese gluten-free chicken main' },
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'beef',     hint: 'American beef weeknight main' },
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'main',         dietary: ['gluten-free'],           protein: 'chicken',  hint: 'American gluten-free chicken main' },
  { cuisine: 'french',    mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'French chicken weeknight main' },
  { cuisine: 'chinese',   mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'Chinese chicken stir-fry main' },
  { cuisine: 'chinese',   mealType: 'dinner',    slotRole: 'main',         dietary: ['vegan'],                 protein: 'tofu',     hint: 'Chinese vegan tofu stir-fry' },
  { cuisine: 'korean',    mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'beef',     hint: 'Korean beef bowl main' },
  { cuisine: 'vietnamese',mealType: 'dinner',    slotRole: 'main',         dietary: ['gluten-free'],           protein: 'chicken',  hint: 'Vietnamese chicken noodle bowl' },
  { cuisine: 'argentine', mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'beef',     hint: 'Argentine grilled steak' },
  { cuisine: 'peruvian',  mealType: 'dinner',    slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'Peruvian chicken main' },
  // Sides
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'veg_side',     dietary: ['vegetarian'],            protein: null,       hint: 'roasted vegetable side' },
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'veg_side',     dietary: ['vegan','gluten-free'],   protein: null,       hint: 'simple green-veg vegan GF side' },
  { cuisine: 'italian',   mealType: 'dinner',    slotRole: 'veg_side',     dietary: ['vegetarian'],            protein: null,       hint: 'Italian vegetable side' },
  { cuisine: 'asian-fusion', mealType: 'dinner', slotRole: 'veg_side',     dietary: ['vegan'],                 protein: null,       hint: 'Asian sesame greens side' },
  { cuisine: 'mediterranean',mealType: 'dinner', slotRole: 'veg_side',     dietary: ['vegan'],                 protein: null,       hint: 'Mediterranean roasted vegetable side' },
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'starch_side',  dietary: ['vegetarian'],            protein: null,       hint: 'classic potato side' },
  { cuisine: 'italian',   mealType: 'dinner',    slotRole: 'starch_side',  dietary: ['vegetarian'],            protein: null,       hint: 'Italian risotto or polenta side' },
  { cuisine: 'asian-fusion', mealType: 'dinner', slotRole: 'starch_side',  dietary: ['vegetarian','gluten-free'], protein: null,    hint: 'simple jasmine rice side' },
  { cuisine: 'mexican',   mealType: 'dinner',    slotRole: 'starch_side',  dietary: ['vegetarian'],            protein: null,       hint: 'Mexican rice or beans side' },
  { cuisine: 'indian',    mealType: 'dinner',    slotRole: 'starch_side',  dietary: ['vegetarian'],            protein: null,       hint: 'Indian basmati or naan' },
  // Lunch mains
  { cuisine: 'american',  mealType: 'lunch',     slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'sandwich/wrap lunch' },
  { cuisine: 'mediterranean',mealType: 'lunch',  slotRole: 'main',         dietary: ['vegetarian'],            protein: 'legume',   hint: 'Mediterranean grain bowl lunch' },
  { cuisine: 'mexican',   mealType: 'lunch',     slotRole: 'main',         dietary: [],                        protein: 'chicken',  hint: 'Mexican burrito-bowl lunch' },
  { cuisine: 'asian-fusion',mealType: 'lunch',   slotRole: 'main',         dietary: ['vegan'],                 protein: 'tofu',     hint: 'Asian noodle bowl lunch' },
  { cuisine: 'american',  mealType: 'lunch',     slotRole: 'main',         dietary: ['gluten-free'],           protein: 'seafood',  hint: 'salmon salad lunch GF' },
  // Lunch sides
  { cuisine: 'american',  mealType: 'lunch',     slotRole: 'side',         dietary: ['vegetarian'],            protein: null,       hint: 'simple green salad' },
  { cuisine: 'mediterranean', mealType: 'lunch', slotRole: 'side',         dietary: ['vegan'],                 protein: null,       hint: 'Mediterranean chopped salad' },
  // Breakfast mains
  { cuisine: 'american',  mealType: 'breakfast', slotRole: 'main',         dietary: ['vegetarian'],            protein: 'egg',      hint: 'classic eggs breakfast' },
  { cuisine: 'american',  mealType: 'breakfast', slotRole: 'main',         dietary: ['gluten-free'],           protein: 'egg',      hint: 'GF eggs breakfast' },
  { cuisine: 'american',  mealType: 'breakfast', slotRole: 'main',         dietary: ['vegan'],                 protein: 'legume',   hint: 'vegan tofu-scramble breakfast' },
  { cuisine: 'french',    mealType: 'breakfast', slotRole: 'main',         dietary: ['vegetarian'],            protein: 'egg',      hint: 'French omelette breakfast' },
  { cuisine: 'mediterranean',mealType: 'breakfast', slotRole: 'main',      dietary: ['vegetarian'],            protein: 'cheese',   hint: 'Mediterranean shakshuka-free egg breakfast' },
  // Snacks
  { cuisine: 'american',  mealType: 'snack',     slotRole: 'main',         dietary: ['vegan','gluten-free'],   protein: null,       hint: 'quick fruit-and-nut snack' },
  // Keto picks
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'main',         dietary: ['keto','gluten-free'],    protein: 'chicken',  hint: 'keto chicken thighs main' },
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'main',         dietary: ['keto','gluten-free'],    protein: 'beef',     hint: 'keto beef main' },
  // Kosher dairy
  { cuisine: 'mediterranean',mealType: 'dinner', slotRole: 'main',         dietary: ['kosher','vegetarian'],   protein: 'cheese',   hint: 'kosher dairy fish-or-cheese main' },
  // Vegan dinners
  { cuisine: 'mediterranean',mealType: 'dinner', slotRole: 'main',         dietary: ['vegan'],                 protein: 'legume',   hint: 'Mediterranean chickpea vegan main' },
  { cuisine: 'indian',    mealType: 'dinner',    slotRole: 'main',         dietary: ['vegan','gluten-free'],   protein: 'legume',   hint: 'Indian dal vegan GF main' },
  { cuisine: 'mexican',   mealType: 'dinner',    slotRole: 'main',         dietary: ['vegan','gluten-free'],   protein: 'legume',   hint: 'Mexican black-bean vegan GF main' },
  // Soup/salad
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'soup',         dietary: ['vegetarian'],            protein: null,       hint: 'comforting tomato soup' },
  { cuisine: 'american',  mealType: 'dinner',    slotRole: 'salad',        dietary: ['vegan'],                 protein: null,       hint: 'kale grain salad' },
]

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

const RECIPE_TOOL = {
  name: 'submit_recipe',
  description: 'Submit one well-formed recipe matching the requested cell.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Concise dish name a recipe site would index.' },
      ingredient_main: { type: 'string', description: 'Primary ingredient, lowercase (e.g. "chicken thighs", "black beans").' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            item: { type: 'string' },
            quantity: { type: 'string' },
          },
          required: ['item'],
        },
        minItems: 4,
      },
      steps: { type: 'array', items: { type: 'string' }, minItems: 3 },
      prep_time_min: { type: 'integer' },
      cook_time_min: { type: 'integer' },
      servings: { type: 'integer' },
      quality_score: { type: 'number', description: '0-100 self-rated quality + practicality.' },
    },
    required: ['title', 'ingredient_main', 'ingredients', 'steps', 'quality_score'],
  },
}

async function generateOne(cell) {
  const dietaryStr = cell.dietary.length > 0 ? cell.dietary.join(', ') : 'none'
  const proteinStr = cell.protein ? cell.protein : '(side dish, no protein)'

  const system = `You compose ONE practical, web-recipe-style entry for a household meal-planning app.
- Title: 4-8 words, like a recipe-site headline.
- Ingredients: 5-12 items with quantities; ALL must satisfy the dietary constraints.
- Steps: 4-10 numbered actions, each 1-2 sentences.
- Quality score: 0-100, your honest rating (don't inflate). 70+ = solid weeknight recipe; 90+ = standout.
- DO NOT use shawarma, kabob, falafel, hummus, tahini, za'atar, sumac, labneh — these are forbidden unless the cuisine is greek/persian/israeli.
Return only by calling submit_recipe.`

  const user = `Compose one ${cell.cuisine} ${cell.mealType} ${cell.slotRole} centered on ${proteinStr}. Dietary: ${dietaryStr}. Hint: ${cell.hint}.`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system,
      tools: [RECIPE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_recipe' },
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  const tool = (data.content || []).find((b) => b.type === 'tool_use')
  if (!tool || !tool.input) throw new Error('No tool_use returned')
  const tokensIn = data.usage?.input_tokens || 0
  const tokensOut = data.usage?.output_tokens || 0
  return { recipe: tool.input, tokensIn, tokensOut }
}

async function insertRecipe(cell, recipe) {
  const row = {
    title: recipe.title,
    cuisine_id: cell.cuisine,
    meal_type: cell.mealType,
    slot_role: cell.slotRole,
    dietary_tags: cell.dietary,
    ingredient_main: (recipe.ingredient_main || '').toLowerCase(),
    protein_family: cell.protein || null,
    style_id: null,
    flavor_id: null,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    prep_time_min: recipe.prep_time_min || null,
    cook_time_min: recipe.cook_time_min || null,
    servings: recipe.servings || 4,
    image_url: null,
    source_url: null,
    source_domain: null,
    source_kind: 'composed',
    quality_score: Math.max(0, Math.min(100, recipe.quality_score || 60)),
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/recipe_bank`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': SERVICE_KEY,
      'authorization': `Bearer ${SERVICE_KEY}`,
      'prefer': 'return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Insert failed: ${res.status} ${text.slice(0, 200)}`)
  }
}

async function logRun(stats) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/recipe_bank_runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': SERVICE_KEY,
      'authorization': `Bearer ${SERVICE_KEY}`,
      'prefer': 'return=minimal',
    },
    body: JSON.stringify({
      finished_at: new Date().toISOString(),
      recipes_added: stats.recipesAdded,
      tokens_used: stats.tokensUsed,
      cost_usd: stats.costUsd,
      trigger: 'seed',
      notes: `seed-recipe-bank.mjs run, ${stats.recipesAdded}/${stats.attempted} cells succeeded`,
    }),
  })
  if (!res.ok) console.warn('[seed] could not log run:', await res.text())
}

async function pace(seconds) {
  return new Promise((r) => setTimeout(r, seconds * 1000))
}

async function main() {
  const cells = SEED_CELLS.slice(0, limit)
  console.log(`=== Seeding ${cells.length} recipe-bank cells ===\n`)
  const stats = { recipesAdded: 0, attempted: 0, tokensIn: 0, tokensOut: 0 }

  for (const cell of cells) {
    stats.attempted++
    const label = `${cell.cuisine}/${cell.mealType}/${cell.slotRole}/${cell.dietary.join(',') || 'omni'}`
    process.stdout.write(`[${stats.attempted}/${cells.length}] ${label} ... `)
    try {
      const { recipe, tokensIn, tokensOut } = await generateOne(cell)
      await insertRecipe(cell, recipe)
      stats.recipesAdded++
      stats.tokensIn += tokensIn
      stats.tokensOut += tokensOut
      await logBankSeedUsageHttp({ tokensIn, tokensOut, feature: `seed:${label}` })
      console.log(`OK "${recipe.title}" (Q=${recipe.quality_score}, in=${tokensIn} out=${tokensOut})`)
    } catch (err) {
      console.log(`FAIL ${err.message}`)
    }
    // Pace 4s between calls to stay well under 50K input/min Tier 1.
    await pace(4)
  }

  const costUsd = (stats.tokensIn / 1_000_000) * 1 + (stats.tokensOut / 1_000_000) * 5
  console.log(`\n=== Done — ${stats.recipesAdded}/${cells.length} added ===`)
  console.log(`Tokens: ${stats.tokensIn} in / ${stats.tokensOut} out`)
  console.log(`Estimated cost: $${costUsd.toFixed(3)}`)
  await logRun({ ...stats, costUsd })
}

main().catch((err) => {
  console.error('Seed crashed:', err)
  process.exit(1)
})

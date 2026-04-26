// v1.19.0 — recipe-bank-refresher.
//
// Cron-fired (every 6 hours via pg_cron + pg_net — see migration 032) edge
// function that tops up under-served (cuisine × meal_type × slot_role × diet)
// cells in `recipe_bank` so the bank-first hot path in
// `MealPlanEngine.tryFillSlotFromBank` keeps a high hit rate without manual
// seeding.
//
// Each invocation:
//   1. Identify the lowest-coverage cells (count(*) < TARGET_PER_CELL).
//   2. For each cell, call Anthropic Haiku with the same `submit_recipe` tool
//      shape as `scripts/seed-recipe-bank.mjs` (prompts copy-pasted from the
//      seeder so behavior matches manual seed).
//   3. Insert each generated recipe into `recipe_bank`.
//   4. Log a row to `recipe_bank_runs` with totals.
//   5. Stop after 60s self-budget so the deno isolate doesn't get killed.
//
// 429 handling: Anthropic 429s short-circuit the rest of the run; cron picks
// it up next tick. No reliance on retry-after — the next 6-hour tick is
// already long enough to recover.
//
// GET ?ping=1 returns { fn, version, model, deployedAt } for the smoke probe.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const APP_VERSION = '2.0.0'
const DEPLOYED_AT = '2026-04-26T18:00:00Z'
const MODEL = 'claude-haiku-4-5-20251001'

const INVOCATION_BUDGET_MS = 60_000
// Each cell aims for at least TARGET_PER_CELL recipes. Cron tops up cells
// below this threshold; runs stop early when budget runs out.
const TARGET_PER_CELL = 3
// Pace between Anthropic calls (under Tier 1 50K input tok/min). Conservative
// 4s leaves headroom for concurrent meal-engine traffic.
const PACE_MS = 4_000

// v2.0.0: BANK_MODE controls whether the refresher generates link-first
// (web URL discovery via Claude search) or composed (full content) rows.
//   'link-first'        → web search → URL rows, no ingredient/steps in DB
//   'composed-fallback' → web search first, fall back to composed if no URLs
//   'composed-legacy'   → v1.19.x behavior (always composed); revert switch
const BANK_MODE = (Deno.env.get('BANK_MODE') ?? 'link-first') as
  | 'link-first'
  | 'composed-fallback'
  | 'composed-legacy'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

// ─── Cell catalog ─────────────────────────────────────────────────────────
// Mirror of the SEED_CELLS array in `scripts/seed-recipe-bank.mjs`, but kept
// here so the edge function is self-contained. When the catalog changes,
// update both — they're a deliberate copy.

interface Cell {
  cuisine: string
  mealType: string
  slotRole: string
  dietary: string[]
  protein: string | null
  hint: string
}

const CELLS: Cell[] = [
  // Omnivore mains
  { cuisine: 'italian', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'classic Italian chicken main' },
  { cuisine: 'italian', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'beef', hint: 'comforting Italian beef main' },
  { cuisine: 'italian', mealType: 'dinner', slotRole: 'main', dietary: ['vegetarian'], protein: 'cheese', hint: 'Italian vegetarian pasta main' },
  { cuisine: 'mexican', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'casual Mexican chicken main' },
  { cuisine: 'mexican', mealType: 'dinner', slotRole: 'main', dietary: ['vegetarian'], protein: 'legume', hint: 'Mexican black-bean main' },
  { cuisine: 'thai', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'Thai chicken main' },
  { cuisine: 'thai', mealType: 'dinner', slotRole: 'main', dietary: ['vegan', 'gluten-free'], protein: 'tofu', hint: 'Thai vegan tofu main' },
  { cuisine: 'indian', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'Indian chicken curry main' },
  { cuisine: 'indian', mealType: 'dinner', slotRole: 'main', dietary: ['vegetarian'], protein: 'legume', hint: 'Indian vegetarian dal main' },
  { cuisine: 'japanese', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'seafood', hint: 'Japanese fish main' },
  { cuisine: 'japanese', mealType: 'dinner', slotRole: 'main', dietary: ['gluten-free'], protein: 'chicken', hint: 'Japanese gluten-free chicken main' },
  { cuisine: 'american', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'beef', hint: 'American beef weeknight main' },
  { cuisine: 'american', mealType: 'dinner', slotRole: 'main', dietary: ['gluten-free'], protein: 'chicken', hint: 'American gluten-free chicken main' },
  { cuisine: 'french', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'French chicken weeknight main' },
  { cuisine: 'chinese', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'Chinese chicken stir-fry main' },
  { cuisine: 'chinese', mealType: 'dinner', slotRole: 'main', dietary: ['vegan'], protein: 'tofu', hint: 'Chinese vegan tofu stir-fry' },
  { cuisine: 'korean', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'beef', hint: 'Korean beef bowl main' },
  { cuisine: 'vietnamese', mealType: 'dinner', slotRole: 'main', dietary: ['gluten-free'], protein: 'chicken', hint: 'Vietnamese chicken noodle bowl' },
  { cuisine: 'argentine', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'beef', hint: 'Argentine grilled steak' },
  { cuisine: 'peruvian', mealType: 'dinner', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'Peruvian chicken main' },
  // Sides
  { cuisine: 'american', mealType: 'dinner', slotRole: 'veg_side', dietary: ['vegetarian'], protein: null, hint: 'roasted vegetable side' },
  { cuisine: 'american', mealType: 'dinner', slotRole: 'veg_side', dietary: ['vegan', 'gluten-free'], protein: null, hint: 'simple green-veg vegan GF side' },
  { cuisine: 'italian', mealType: 'dinner', slotRole: 'veg_side', dietary: ['vegetarian'], protein: null, hint: 'Italian vegetable side' },
  { cuisine: 'asian-fusion', mealType: 'dinner', slotRole: 'veg_side', dietary: ['vegan'], protein: null, hint: 'Asian sesame greens side' },
  { cuisine: 'mediterranean', mealType: 'dinner', slotRole: 'veg_side', dietary: ['vegan'], protein: null, hint: 'Mediterranean roasted vegetable side' },
  { cuisine: 'american', mealType: 'dinner', slotRole: 'starch_side', dietary: ['vegetarian'], protein: null, hint: 'classic potato side' },
  { cuisine: 'italian', mealType: 'dinner', slotRole: 'starch_side', dietary: ['vegetarian'], protein: null, hint: 'Italian risotto or polenta side' },
  { cuisine: 'asian-fusion', mealType: 'dinner', slotRole: 'starch_side', dietary: ['vegetarian', 'gluten-free'], protein: null, hint: 'simple jasmine rice side' },
  { cuisine: 'mexican', mealType: 'dinner', slotRole: 'starch_side', dietary: ['vegetarian'], protein: null, hint: 'Mexican rice or beans side' },
  { cuisine: 'indian', mealType: 'dinner', slotRole: 'starch_side', dietary: ['vegetarian'], protein: null, hint: 'Indian basmati or naan' },
  // Lunch mains
  { cuisine: 'american', mealType: 'lunch', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'sandwich/wrap lunch' },
  { cuisine: 'mediterranean', mealType: 'lunch', slotRole: 'main', dietary: ['vegetarian'], protein: 'legume', hint: 'Mediterranean grain bowl lunch' },
  { cuisine: 'mexican', mealType: 'lunch', slotRole: 'main', dietary: [], protein: 'chicken', hint: 'Mexican burrito-bowl lunch' },
  { cuisine: 'asian-fusion', mealType: 'lunch', slotRole: 'main', dietary: ['vegan'], protein: 'tofu', hint: 'Asian noodle bowl lunch' },
  { cuisine: 'american', mealType: 'lunch', slotRole: 'main', dietary: ['gluten-free'], protein: 'seafood', hint: 'salmon salad lunch GF' },
  // Lunch sides
  { cuisine: 'american', mealType: 'lunch', slotRole: 'side', dietary: ['vegetarian'], protein: null, hint: 'simple green salad' },
  { cuisine: 'mediterranean', mealType: 'lunch', slotRole: 'side', dietary: ['vegan'], protein: null, hint: 'Mediterranean chopped salad' },
  // Breakfast mains
  { cuisine: 'american', mealType: 'breakfast', slotRole: 'main', dietary: ['vegetarian'], protein: 'egg', hint: 'classic eggs breakfast' },
  { cuisine: 'american', mealType: 'breakfast', slotRole: 'main', dietary: ['gluten-free'], protein: 'egg', hint: 'GF eggs breakfast' },
  { cuisine: 'american', mealType: 'breakfast', slotRole: 'main', dietary: ['vegan'], protein: 'legume', hint: 'vegan tofu-scramble breakfast' },
  { cuisine: 'french', mealType: 'breakfast', slotRole: 'main', dietary: ['vegetarian'], protein: 'egg', hint: 'French omelette breakfast' },
  { cuisine: 'mediterranean', mealType: 'breakfast', slotRole: 'main', dietary: ['vegetarian'], protein: 'cheese', hint: 'Mediterranean shakshuka-free egg breakfast' },
  // Snacks
  { cuisine: 'american', mealType: 'snack', slotRole: 'main', dietary: ['vegan', 'gluten-free'], protein: null, hint: 'quick fruit-and-nut snack' },
  // Keto picks
  { cuisine: 'american', mealType: 'dinner', slotRole: 'main', dietary: ['keto', 'gluten-free'], protein: 'chicken', hint: 'keto chicken thighs main' },
  { cuisine: 'american', mealType: 'dinner', slotRole: 'main', dietary: ['keto', 'gluten-free'], protein: 'beef', hint: 'keto beef main' },
  // Kosher dairy
  { cuisine: 'mediterranean', mealType: 'dinner', slotRole: 'main', dietary: ['kosher', 'vegetarian'], protein: 'cheese', hint: 'kosher dairy fish-or-cheese main' },
  // Vegan dinners
  { cuisine: 'mediterranean', mealType: 'dinner', slotRole: 'main', dietary: ['vegan'], protein: 'legume', hint: 'Mediterranean chickpea vegan main' },
  { cuisine: 'indian', mealType: 'dinner', slotRole: 'main', dietary: ['vegan', 'gluten-free'], protein: 'legume', hint: 'Indian dal vegan GF main' },
  { cuisine: 'mexican', mealType: 'dinner', slotRole: 'main', dietary: ['vegan', 'gluten-free'], protein: 'legume', hint: 'Mexican black-bean vegan GF main' },
  // Soup/salad
  { cuisine: 'american', mealType: 'dinner', slotRole: 'soup', dietary: ['vegetarian'], protein: null, hint: 'comforting tomato soup' },
  { cuisine: 'american', mealType: 'dinner', slotRole: 'salad', dietary: ['vegan'], protein: null, hint: 'kale grain salad' },
  // Pescatarian dinners (added v1.19.0 — common diet, was thinly covered by seeder)
  { cuisine: 'mediterranean', mealType: 'dinner', slotRole: 'main', dietary: ['pescatarian'], protein: 'seafood', hint: 'Mediterranean salmon main' },
  { cuisine: 'thai', mealType: 'dinner', slotRole: 'main', dietary: ['pescatarian'], protein: 'seafood', hint: 'Thai shrimp curry' },
  { cuisine: 'japanese', mealType: 'dinner', slotRole: 'main', dietary: ['pescatarian'], protein: 'seafood', hint: 'Japanese cod donburi' },
  { cuisine: 'spanish-tapas', mealType: 'lunch', slotRole: 'tapas', dietary: ['pescatarian'], protein: 'seafood', hint: 'Spanish tapas plate with shrimp or anchovies' },
  { cuisine: 'spanish-tapas', mealType: 'lunch', slotRole: 'tapas', dietary: ['vegetarian'], protein: 'cheese', hint: 'Spanish tapas plate with manchego or tortilla española' },
]

// ─── Anthropic tool ───────────────────────────────────────────────────────

const RECIPE_TOOL = {
  name: 'submit_recipe',
  description: 'Submit one well-formed recipe matching the requested cell.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Concise dish name a recipe site would index.' },
      ingredient_main: { type: 'string', description: 'Primary ingredient, lowercase.' },
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
      quality_score: { type: 'number' },
    },
    required: ['title', 'ingredient_main', 'ingredients', 'steps', 'quality_score'],
  },
}

interface RecipeOut {
  title: string
  ingredient_main: string
  ingredients: { item: string; quantity?: string }[]
  steps: string[]
  prep_time_min?: number
  cook_time_min?: number
  servings?: number
  quality_score: number
}

interface AnthropicCallResult {
  recipe: RecipeOut
  tokensIn: number
  tokensOut: number
}

class AnthropicRateLimitError extends Error {
  constructor() {
    super('anthropic 429')
    this.name = 'AnthropicRateLimitError'
  }
}

async function generateOne(cell: Cell): Promise<AnthropicCallResult> {
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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  if (res.status === 429) throw new AnthropicRateLimitError()
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  const tool = (data.content || []).find((b: { type: string }) => b.type === 'tool_use')
  if (!tool || !tool.input) throw new Error('No tool_use returned')
  return {
    recipe: tool.input as RecipeOut,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  }
}

// ─── v2.0.0: Link-first generation via Claude web search ──────────────────
//
// For under-served cells, ask Claude (with `web_search_20250305`) to find
// 1-3 reputable recipe URLs that match the cell. We persist URL + sparse
// metadata only — NO ingredients/steps in the bank. Recipes hydrate on
// user-open via meal-engine's `fetch-recipe-url` op.

const SUBMIT_LINKS_TOOL = {
  name: 'submit_links',
  description: 'Submit 1-3 reputable recipe URLs that match the requested cell.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          required: ['title', 'url', 'ingredient_main'],
          properties: {
            title: { type: 'string', description: 'Dish name as it appears on the source page.' },
            url: { type: 'string', description: 'Full https URL of the recipe page.' },
            sourceDomain: { type: 'string', description: 'Domain like "seriouseats.com".' },
            ingredient_main: { type: 'string', description: 'Primary ingredient, lowercase.' },
            secondary_ingredients: { type: 'array', items: { type: 'string' }, description: 'Up to 3 additional lead ingredients, lowercase.' },
            protein_family: { type: 'string', description: 'chicken|beef|pork|seafood|legume|tofu|cheese|egg|grain|other' },
            prep_time_min: { type: 'integer' },
            cook_time_min: { type: 'integer' },
            servings: { type: 'integer' },
            quality_score: { type: 'number', description: '0-100, honest rating of recipe quality.' },
          },
        },
      },
    },
    required: ['candidates'],
  },
}

interface LinkCandidate {
  title: string
  url: string
  sourceDomain?: string
  ingredient_main: string
  secondary_ingredients?: string[]
  protein_family?: string
  prep_time_min?: number
  cook_time_min?: number
  servings?: number
  quality_score?: number
}

interface LinkGenResult {
  candidates: LinkCandidate[]
  tokensIn: number
  tokensOut: number
}

async function generateLinks(cell: Cell): Promise<LinkGenResult> {
  const dietaryStr = cell.dietary.length > 0 ? cell.dietary.join(', ') : 'none'
  const proteinStr = cell.protein ? cell.protein : '(side dish, no protein)'

  const system = `You search the web for ONE-to-THREE high-quality, indexable recipe URLs that
match the requested cell. Use the web_search tool. Then submit the URLs via
submit_links.

Rules:
- Prefer reputable sites (allrecipes.com, seriouseats.com, cooking.nytimes.com,
  bonappetit.com, smittenkitchen.com, budgetbytes.com, food52.com, foodnetwork.com,
  simplyrecipes.com, thekitchn.com, eatingwell.com, kingarthurbaking.com, etc.).
- Title and URL must be the actual recipe page, not a category or roundup.
- ingredient_main = the primary ingredient (lowercase), e.g. "chicken thighs".
- secondary_ingredients = up to 3 additional anchor ingredients (lowercase).
- DO NOT pick shawarma/kabob/falafel/hummus/tahini/za'atar/sumac/labneh
  unless cuisine is greek/persian/israeli.
- Honor dietary constraints absolutely.

Reply by calling submit_links with 1-3 candidates.`

  const user = `Find ${cell.cuisine} ${cell.mealType} ${cell.slotRole} recipes centered on ${proteinStr}. Dietary: ${dietaryStr}. Hint: ${cell.hint}.`

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
      system,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
        SUBMIT_LINKS_TOOL,
      ],
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (res.status === 429) throw new AnthropicRateLimitError()
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  // The model may emit web_search blocks first, then submit_links — pick the latter.
  const tool = (data.content || []).find(
    (b: { type: string; name?: string }) => b.type === 'tool_use' && b.name === 'submit_links',
  )
  const tokensIn = data.usage?.input_tokens ?? 0
  const tokensOut = data.usage?.output_tokens ?? 0
  if (!tool || !tool.input) {
    return { candidates: [], tokensIn, tokensOut }
  }
  const out = tool.input as { candidates?: LinkCandidate[] }
  return { candidates: out.candidates ?? [], tokensIn, tokensOut }
}

async function insertWebRows(
  supabase: ReturnType<typeof createClient>,
  cell: Cell,
  candidates: LinkCandidate[],
): Promise<number> {
  if (candidates.length === 0) return 0
  const rows = candidates.map((c) => ({
    title: c.title,
    cuisine_id: cell.cuisine,
    meal_type: cell.mealType,
    slot_role: cell.slotRole,
    dietary_tags: cell.dietary,
    ingredient_main: c.ingredient_main.toLowerCase(),
    protein_family: c.protein_family ?? cell.protein ?? null,
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
    quality_score: Math.max(0, Math.min(100, c.quality_score ?? 70)),
  }))
  // UPSERT on (source_url, slot_role) so re-runs don't dup-spam.
  const { error } = await supabase.from('recipe_bank').upsert(rows, {
    onConflict: 'source_url,slot_role',
    ignoreDuplicates: true,
  })
  if (error) {
    console.warn(`[refresher] insertWebRows failed for ${cell.cuisine}/${cell.mealType}: ${error.message}`)
    return 0
  }
  return rows.length
}

function domainFromUrl(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ─── Coverage probe ───────────────────────────────────────────────────────

interface CellWithCount extends Cell {
  count: number
}

async function pickUnderservedCells(
  supabase: ReturnType<typeof createClient>,
): Promise<CellWithCount[]> {
  // For each cell, count rows in recipe_bank that match the (cuisine_id,
  // meal_type, slot_role, dietary_tags) tuple. Skip cells already at target.
  const out: CellWithCount[] = []
  for (const cell of CELLS) {
    let q = supabase
      .from('recipe_bank')
      .select('id', { count: 'exact', head: true })
      .eq('cuisine_id', cell.cuisine)
      .eq('meal_type', cell.mealType)
      .eq('slot_role', cell.slotRole)
    if (cell.dietary.length > 0) {
      q = q.contains('dietary_tags', cell.dietary)
    } else {
      // For omnivore cells, accept rows with empty dietary_tags. Postgrest
      // doesn't have a simple "= empty array" filter via REST, so we fetch
      // with no dietary filter and rely on the cell catalog ordering for
      // reasonable behaviour. Since omnivore rows usually have dietary_tags
      // = '{}', this keeps the count honest enough for a cron heuristic.
    }
    const { count } = await q
    const c = count ?? 0
    if (c < TARGET_PER_CELL) {
      out.push({ ...cell, count: c })
    }
  }
  // Sort lowest-coverage first so we top up the thinnest cells first.
  out.sort((a, b) => a.count - b.count)
  return out
}

// ─── DB writes ────────────────────────────────────────────────────────────

async function insertRecipe(
  supabase: ReturnType<typeof createClient>,
  cell: Cell,
  recipe: RecipeOut,
): Promise<void> {
  const row = {
    title: recipe.title,
    cuisine_id: cell.cuisine,
    meal_type: cell.mealType,
    slot_role: cell.slotRole,
    dietary_tags: cell.dietary,
    ingredient_main: (recipe.ingredient_main || '').toLowerCase(),
    protein_family: cell.protein,
    style_id: null,
    flavor_id: null,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    prep_time_min: recipe.prep_time_min ?? null,
    cook_time_min: recipe.cook_time_min ?? null,
    servings: recipe.servings ?? 4,
    image_url: null,
    source_url: null,
    source_domain: null,
    source_kind: 'composed',
    quality_score: Math.max(0, Math.min(100, recipe.quality_score || 60)),
  }
  const { error } = await supabase.from('recipe_bank').insert(row)
  if (error) throw new Error(`recipe_bank insert: ${error.message}`)
}

interface RunStats {
  recipesAdded: number
  attempted: number
  tokensIn: number
  tokensOut: number
  cellsConsidered: number
  rateLimited: boolean
  notes: string
}

async function logRun(
  supabase: ReturnType<typeof createClient>,
  stats: RunStats,
): Promise<void> {
  const costUsd = (stats.tokensIn / 1_000_000) * 1 + (stats.tokensOut / 1_000_000) * 5
  const { error } = await supabase.from('recipe_bank_runs').insert({
    finished_at: new Date().toISOString(),
    recipes_added: stats.recipesAdded,
    tokens_used: stats.tokensIn + stats.tokensOut,
    cost_usd: costUsd,
    trigger: 'cron',
    notes: stats.notes,
  })
  if (error) console.warn('[refresher] could not log run:', error.message)
}

// ─── Handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.method === 'GET') {
    const url = new URL(req.url)
    if (url.searchParams.get('ping') === '1') {
      return new Response(
        JSON.stringify({
          fn: 'recipe-bank-refresher',
          version: APP_VERSION,
          model: MODEL,
          deployedAt: DEPLOYED_AT,
        }),
        { headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const startMs = Date.now()
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const stats: RunStats = {
    recipesAdded: 0,
    attempted: 0,
    tokensIn: 0,
    tokensOut: 0,
    cellsConsidered: 0,
    rateLimited: false,
    notes: '',
  }

  let cells: CellWithCount[] = []
  try {
    cells = await pickUnderservedCells(supabase)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    stats.notes = `coverage probe failed: ${message}`
    await logRun(supabase, stats)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  stats.cellsConsidered = cells.length
  if (cells.length === 0) {
    stats.notes = 'all cells at or above target — no work'
    await logRun(supabase, stats)
    return new Response(
      JSON.stringify({ ok: true, message: 'all cells covered', stats }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // Process cells until budget exhausted or 429.
  for (const cell of cells) {
    if (Date.now() - startMs > INVOCATION_BUDGET_MS) {
      stats.notes = `budget exhausted after ${stats.attempted} cells`
      break
    }
    stats.attempted++
    try {
      let added = 0
      // v2.0.0 routing.
      if (BANK_MODE === 'composed-legacy') {
        const { recipe, tokensIn, tokensOut } = await generateOne(cell)
        await insertRecipe(supabase, cell, recipe)
        added = 1
        stats.tokensIn += tokensIn
        stats.tokensOut += tokensOut
      } else {
        // 'link-first' or 'composed-fallback': try web search first.
        const links = await generateLinks(cell)
        stats.tokensIn += links.tokensIn
        stats.tokensOut += links.tokensOut
        added = await insertWebRows(supabase, cell, links.candidates)
        // Fallback if no usable URLs returned and mode allows.
        if (added === 0 && BANK_MODE === 'composed-fallback') {
          try {
            const { recipe, tokensIn, tokensOut } = await generateOne(cell)
            await insertRecipe(supabase, cell, recipe)
            added = 1
            stats.tokensIn += tokensIn
            stats.tokensOut += tokensOut
          } catch (err) {
            if (err instanceof AnthropicRateLimitError) throw err
            console.warn(`[refresher] composed fallback failed for cell:`, err)
          }
        }
      }
      stats.recipesAdded += added
    } catch (err) {
      if (err instanceof AnthropicRateLimitError) {
        stats.rateLimited = true
        stats.notes = `rate-limited after ${stats.attempted} cells; cron retries`
        break
      }
      // Other errors (insert fail, no tool_use) — log and continue.
      console.warn(`[refresher] cell ${cell.cuisine}/${cell.mealType}/${cell.slotRole} failed:`, err)
    }
    // Pace between calls to stay under Tier 1 50K input tok/min.
    if (Date.now() - startMs + PACE_MS < INVOCATION_BUDGET_MS) {
      await new Promise((r) => setTimeout(r, PACE_MS))
    } else {
      stats.notes = `pace would exceed budget after ${stats.attempted} cells`
      break
    }
  }

  // ─── v2.0.0: end-of-tick retirement sweep ──────────────────────────────
  // Soft-retires rows that have never been served in 30+ days OR have
  // popularity < 10. Logs as a separate runs entry for ops visibility.
  let retiredCount = 0
  try {
    const { data, error } = await supabase.rpc('retire_stale_recipes')
    if (error) {
      console.warn('[refresher] retire_stale_recipes failed:', error.message)
    } else {
      retiredCount = typeof data === 'number' ? data : 0
    }
  } catch (err) {
    console.warn('[refresher] retire RPC threw:', err)
  }
  if (retiredCount > 0) {
    await supabase.from('recipe_bank_runs').insert({
      finished_at: new Date().toISOString(),
      recipes_added: 0,
      tokens_used: 0,
      cost_usd: 0,
      trigger: 'cron-retire',
      notes: `retired ${retiredCount} stale rows`,
    })
  }

  if (!stats.notes) stats.notes = `processed ${stats.attempted} cells (mode=${BANK_MODE}, retired=${retiredCount})`
  else stats.notes = `${stats.notes}; retired=${retiredCount}`
  await logRun(supabase, stats)

  return new Response(
    JSON.stringify({ ok: true, stats, mode: BANK_MODE, retiredCount }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})

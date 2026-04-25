// Replanish meal-planning engine — server-side proxy for the slot-based pipeline.
//
// v3 changes (2026-04-25):
//   - Stage A/B prompts consume a variety ENVELOPE (cuisine + protein + style + flavor)
//     chosen client-side. The model's job shrinks from "imagine a meal" to "fill in
//     the named slot" — this kills the Mediterranean/Middle-Eastern training-prior bias.
//   - Anthropic calls retry with backoff on 429/529/5xx (3 attempts, 0/0.5s/1.5s).
//   - opFindRecipe enforces a 30s budget with graceful AI-fallback short-circuit.
//   - opDish dedups searchKeywords server-side before returning.
//
// Operations:
//   - "ingredient" (Stage A): pick an ingredient via Anthropic tool_use, envelope-aware
//   - "dish" (Stage B): name dish + search keywords, envelope-aware
//   - "find-recipe" (Stage C+D): web_search → fetch HTML → JSON-LD → rank or extract
//   - "extract" (Stage D direct): explicit fallback extraction from supplied HTML

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// ─── Anthropic helpers ────────────────────────────────────────────────────

interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

interface AnthropicContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  id?: string
}

interface AnthropicResponse {
  content: AnthropicContentBlock[]
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}

const RETRY_DELAYS_MS = [0, 500, 1500]

async function anthropic(body: Record<string, unknown>): Promise<AnthropicResponse> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  let lastErr: unknown = null
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i] > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]))
    }
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })
      if (res.ok) return (await res.json()) as AnthropicResponse
      const status = res.status
      const text = await res.text().catch(() => '')
      lastErr = new Error(`Anthropic ${status}: ${text}`)
      // Non-retriable client errors short-circuit.
      if (status !== 429 && status !== 529 && status < 500) throw lastErr
    } catch (err) {
      lastErr = err
      if (i === RETRY_DELAYS_MS.length - 1) throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Anthropic call failed')
}

function pickToolUse(resp: AnthropicResponse, name: string): Record<string, unknown> | null {
  for (const block of resp.content) {
    if (block.type === 'tool_use' && block.name === name && block.input) {
      return block.input
    }
  }
  return null
}

// ─── Envelope helpers ─────────────────────────────────────────────────────

interface Envelope {
  cuisineId?: string
  cuisineLabel?: string
  cuisineRegion?: string
  proteinName?: string
  proteinFamily?: string
  styleId?: string
  styleLabel?: string
  flavorId?: string
  flavorLabel?: string
}

function envelopeBlock(env: Envelope | undefined): string {
  if (!env || !env.cuisineLabel) return ''
  const lines = [
    `<envelope>`,
    `cuisine: ${env.cuisineLabel} (id=${env.cuisineId ?? '?'}, region=${env.cuisineRegion ?? '?'})`,
    env.proteinName ? `protein hint: ${env.proteinName} (family=${env.proteinFamily ?? '?'})` : '',
    `cooking style: ${env.styleLabel}`,
    `flavor profile: ${env.flavorLabel}`,
    `</envelope>`,
  ]
    .filter(Boolean)
    .join('\n')
  return lines
}

// ─── Stage A: ingredient ──────────────────────────────────────────────────

const PICK_INGREDIENT_TOOL: ToolDef = {
  name: 'pick_ingredient',
  description: 'Choose ONE ingredient that anchors a single slot of a meal.',
  input_schema: {
    type: 'object',
    properties: {
      ingredient: {
        type: 'string',
        description: 'The chosen primary ingredient, in plain English (e.g. "chicken thighs", "shiitake mushrooms").',
      },
      rationale: {
        type: 'string',
        description: 'One short sentence on why this ingredient suits the envelope.',
      },
    },
    required: ['ingredient', 'rationale'],
  },
}

const STAGE_A_SYSTEM = `You pick ONE specific anchor ingredient for a single slot in a meal plan.

You are working inside a CONSTRAINT ENVELOPE chosen by the planner upstream:
- cuisine, protein family, cooking style, and flavor profile are FIXED.
- Your job is to pick the most natural specific ingredient that fits the envelope.
- You MUST respect the envelope. Do not "drift" toward a different cuisine because
  it feels more natural to you.
- The envelope was chosen to maximize variety across the user's plan. Picking a
  different cuisine defeats the entire system.

CRITICAL DIVERSITY RULES:
1. Mediterranean and Middle-Eastern dishes are heavily over-represented in your
   training data. Unless the envelope's cuisine is "greek", "spanish-tapas",
   "persian", or "israeli", DO NOT propose ingredients that telegraph those
   cuisines (no shawarma, kabob, shakshuka, hummus, falafel, tahini, za'atar,
   sumac, labneh, tabbouleh, fattoush, baba ganoush, kibbeh).
2. The recentDishes list shows what the user has had recently across ALL their
   plans — not just this one. NEVER propose an ingredient that would lead to a
   dish similar to anything in recentDishes.
3. If the envelope provides a "protein hint", your ingredient MUST be that
   protein verbatim (or its closest direct match).
4. If the slot role is a veg_side, salad, starch_side, soup, bread, or drink
   role, pick an ingredient that complements (not duplicates) the cuisine —
   e.g. Korean → bok choy or sesame greens; Mexican → charred corn or black beans.

Honor dietary constraints absolutely.
Honor slot notes (user override; takes precedence over envelope flavor/style — but
NEVER overrides cuisine unless the user explicitly named a different cuisine).
Reply only by calling the pick_ingredient tool.`

async function opIngredient(input: Record<string, unknown>): Promise<unknown> {
  const env = (input.envelope ?? {}) as Envelope
  const userPayload = JSON.stringify({
    envelope: env,
    slot: {
      role: input.slotRole,
      notes: input.notes,
      mealType: input.mealType,
    },
    diet: input.dietaryConstraints,
    dislikes: input.dislikedIngredients,
    pantry: input.pantryItems,
    recentDishesGlobal: input.recentDishes,
    siblings: input.siblingSlots,
  })

  const resp = await anthropic({
    model: MODEL,
    max_tokens: 400,
    system: STAGE_A_SYSTEM,
    tools: [PICK_INGREDIENT_TOOL],
    tool_choice: { type: 'tool', name: 'pick_ingredient' },
    messages: [
      {
        role: 'user',
        content: `${envelopeBlock(env)}\n\nDETAILS:\n${userPayload}`,
      },
    ],
  })

  const out = pickToolUse(resp, 'pick_ingredient')
  if (!out) throw new Error('Stage A: model did not call pick_ingredient')
  return out
}

// ─── Stage B: dish ────────────────────────────────────────────────────────

const NAME_DISH_TOOL: ToolDef = {
  name: 'name_dish',
  description: 'Given an anchor ingredient + envelope, name a specific, searchable dish and 2-5 search keywords.',
  input_schema: {
    type: 'object',
    properties: {
      dishName: {
        type: 'string',
        description: 'Specific dish name in English, suitable as a recipe-site search query.',
      },
      searchKeywords: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 5,
        description: 'Ordered most-specific to most-general. The first item should be a tight search query.',
      },
    },
    required: ['dishName', 'searchKeywords'],
  },
}

const STAGE_B_SYSTEM = `You name a specific, searchable dish given (a) an anchor ingredient already
chosen and (b) a constraint envelope (cuisine + style + flavor profile).

The dish name MUST:
- Use the supplied ingredient as the anchor.
- Match the envelope's cuisine. Examples:
    cuisine=korean,    style=braised,   ingredient=chicken thighs
      -> "Korean Braised Chicken Thighs (Dakdoritang)" — not "Chicken Marbella"
    cuisine=mexican,   style=taco-wrap, ingredient=cod
      -> "Baja-Style Fish Tacos with Cabbage Slaw" — not "Cod Provençal"
    cuisine=cantonese, style=stir-fry,  ingredient=tofu
      -> "Cantonese Mapo-Style Tofu" — not "Mediterranean Herb-Crusted Tofu"
- Match the cooking style verbatim (do not name a stir-fry when the envelope says braised).
- Match the flavor profile (smoky -> grilled/charred adjectives; bright -> citrus/herb).

CRITICAL DIVERSITY GUARDS:
- DO NOT default to Mediterranean or Middle-Eastern dish names unless the envelope's
  cuisine is "greek", "spanish-tapas", "persian", or "israeli".
- The dish name must be DIFFERENT in core concept from any item in recentDishes.
  If recentDishes contains "Korean braised chicken thighs", you may not propose
  another braised chicken thigh dish even with a different cuisine name.
- The first searchKeywords item should be the tightest possible query for a recipe
  site (e.g. "korean dakdoritang chicken thighs recipe").

Honor dietary constraints absolutely.
Honor slot notes — they are the user's override and trump the envelope's flavor/style
(but never the dietary or cuisine constraints).
Reply only by calling the name_dish tool.`

async function opDish(input: Record<string, unknown>): Promise<unknown> {
  const env = (input.envelope ?? {}) as Envelope
  const userPayload = JSON.stringify({
    envelope: env,
    slot: { role: input.slotRole, notes: input.notes, mealType: input.mealType },
    ingredient: input.ingredient,
    diet: input.dietaryConstraints,
    recentDishesGlobal: input.recentDishes,
  })

  const resp = await anthropic({
    model: MODEL,
    max_tokens: 400,
    system: STAGE_B_SYSTEM,
    tools: [NAME_DISH_TOOL],
    tool_choice: { type: 'tool', name: 'name_dish' },
    messages: [
      {
        role: 'user',
        content: `${envelopeBlock(env)}\n\nDETAILS:\n${userPayload}`,
      },
    ],
  })

  const out = pickToolUse(resp, 'name_dish') as
    | { dishName?: string; searchKeywords?: string[] }
    | null
  if (!out?.dishName) throw new Error('Stage B: model did not return a dishName')

  // Server-side dedup so the client schema never trips on duplicates.
  const seen = new Set<string>()
  const dedup: string[] = []
  for (const s of out.searchKeywords ?? []) {
    const trimmed = s.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    dedup.push(trimmed)
  }
  const keywords = dedup.length > 0 ? dedup.slice(0, 5) : [out.dishName]
  return { dishName: out.dishName, searchKeywords: keywords }
}

// ─── Stage C: find-recipe (web search + JSON-LD + rank or fallback) ───────

interface Candidate {
  title: string
  url: string
  domain: string
  snippet: string
  hasJsonLd: boolean
  jsonLd?: ExtractedRecipe
  html?: string
}

interface ExtractedRecipe {
  title: string
  ingredients: { item: string; quantity?: string }[]
  steps: string[]
  prepTimeMin?: number
  cookTimeMin?: number
  servings?: number
  imageUrl?: string
}

const RECIPE_DOMAIN_HINTS = [
  'recipe', 'cook', 'food', 'kitchen', 'eat', 'bake', 'meal',
  'tasty', 'gourmet', 'bonappetit', 'epicurious', 'allrecipes',
  'seriouseats', 'simplyrecipes', 'nytimes', 'foodnetwork',
  'thekitchn', 'budgetbytes', 'minimalistbaker', 'smittenkitchen',
  'half-baked',
]

function looksLikeRecipeDomain(domain: string): boolean {
  const d = domain.toLowerCase()
  return RECIPE_DOMAIN_HINTS.some((h) => d.includes(h))
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function searchUrlsViaClaude(
  dishName: string,
  keywords: string[],
  remainingBudgetMs: number,
): Promise<{ title: string; url: string; snippet: string }[]> {
  if (remainingBudgetMs < 4000) return []

  const RETURN_TOOL: ToolDef = {
    name: 'return_results',
    description: 'Return up to 8 candidate recipe URLs found via web search.',
    input_schema: {
      type: 'object',
      properties: {
        candidates: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
            },
            required: ['title', 'url'],
          },
        },
      },
      required: ['candidates'],
    },
  }

  const system = `You search the web for real recipe pages and return their URLs.
Rules:
- Use the web_search tool to find pages.
- Prefer reputable recipe sites that publish JSON-LD (allrecipes, seriouseats, simplyrecipes, bonappetit, nytimes/cooking, foodnetwork, thekitchn, budgetbytes, smittenkitchen).
- Return up to 8 candidate URLs by calling return_results.
- Prefer specific dish pages over category/listing pages.`

  const user = `Find recipe pages for: ${dishName}\nSearch keywords (try the first, then broaden): ${keywords.join(' | ')}`

  try {
    const resp = await anthropic({
      model: MODEL,
      max_tokens: 1500,
      system,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 4 } as unknown as ToolDef,
        RETURN_TOOL,
      ],
      messages: [{ role: 'user', content: user }],
    })
    const out = pickToolUse(resp, 'return_results')
    if (out && Array.isArray(out.candidates)) {
      return (out.candidates as { title: string; url: string; snippet?: string }[]).map((c) => ({
        title: c.title,
        url: c.url,
        snippet: c.snippet ?? '',
      }))
    }
  } catch (err) {
    console.warn('[meal-engine] web search failed:', err)
  }
  return []
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; ReplanishBot/1.0; +https://replanish.app)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function extractJsonLdRecipe(html: string): ExtractedRecipe | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      let data: unknown = JSON.parse(m[1])
      if (data && typeof data === 'object' && '@graph' in (data as Record<string, unknown>)) {
        data = (data as Record<string, unknown>)['@graph']
      }
      const arr = Array.isArray(data) ? data : [data]
      for (const item of arr as Record<string, unknown>[]) {
        const t = item['@type']
        const isRecipe = t === 'Recipe' || (Array.isArray(t) && (t as string[]).includes('Recipe'))
        if (!isRecipe) continue
        const result = normalizeJsonLdRecipe(item)
        if (result) return result
      }
    } catch {
      // continue
    }
  }
  return null
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'url' in (v as Record<string, unknown>)) {
    const url = (v as Record<string, unknown>).url
    if (typeof url === 'string') return url
  }
  return undefined
}

function isoDurationToMin(iso: unknown): number | undefined {
  if (typeof iso !== 'string') return undefined
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return undefined
  const h = m[1] ? parseInt(m[1], 10) : 0
  const min = m[2] ? parseInt(m[2], 10) : 0
  const total = h * 60 + min
  return total > 0 ? total : undefined
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === 'string') return x
        if (x && typeof x === 'object') {
          const r = x as Record<string, unknown>
          if (typeof r.text === 'string') return r.text
          if (typeof r.name === 'string') return r.name
        }
        return ''
      })
      .filter((s) => s.length > 0)
  }
  if (typeof v === 'string') return [v]
  return []
}

function flattenInstructions(v: unknown): string[] {
  if (typeof v === 'string') {
    return v
      .split(/\n|\r|\.[\s]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4)
  }
  if (Array.isArray(v)) {
    const out: string[] = []
    for (const item of v) {
      if (typeof item === 'string') out.push(item)
      else if (item && typeof item === 'object') {
        const r = item as Record<string, unknown>
        if (r['@type'] === 'HowToSection' && Array.isArray(r.itemListElement)) {
          out.push(...flattenInstructions(r.itemListElement))
        } else if (typeof r.text === 'string') {
          out.push(r.text)
        } else if (typeof r.name === 'string') {
          out.push(r.name)
        }
      }
    }
    return out.filter((s) => s.length > 0)
  }
  return []
}

function normalizeJsonLdRecipe(item: Record<string, unknown>): ExtractedRecipe | null {
  const title = typeof item.name === 'string' ? item.name : undefined
  if (!title) return null

  const ingStrings = asStringArray(item.recipeIngredient)
  if (ingStrings.length === 0) return null

  const ingredients = ingStrings.map((s) => ({ item: s }))
  const steps = flattenInstructions(item.recipeInstructions)
  if (steps.length === 0) return null

  return {
    title,
    ingredients,
    steps,
    prepTimeMin: isoDurationToMin(item.prepTime),
    cookTimeMin: isoDurationToMin(item.cookTime),
    servings:
      typeof item.recipeYield === 'string'
        ? parseInt(item.recipeYield, 10) || undefined
        : typeof item.recipeYield === 'number'
          ? Math.floor(item.recipeYield)
          : undefined,
    imageUrl: asString(item.image),
  }
}

const RANK_TOOL: ToolDef = {
  name: 'pick_best_recipe',
  description: 'Pick the best recipe candidate from a list of indices.',
  input_schema: {
    type: 'object',
    properties: {
      bestIndex: { type: 'integer', minimum: 0 },
      reason: { type: 'string' },
    },
    required: ['bestIndex'],
  },
}

async function rankCandidates(dishName: string, candidates: Candidate[]): Promise<number> {
  if (candidates.length <= 1) return 0
  const summary = candidates.map((c, i) => ({
    i,
    title: c.title,
    url: c.url,
    domain: c.domain,
    snippet: c.snippet,
    hasJsonLd: c.hasJsonLd,
  }))
  const resp = await anthropic({
    model: MODEL,
    max_tokens: 300,
    system: `You pick the best recipe page for the requested dish. Prefer pages that have JSON-LD (hasJsonLd:true) and reputable cooking domains. Return only by calling pick_best_recipe.`,
    tools: [RANK_TOOL],
    tool_choice: { type: 'tool', name: 'pick_best_recipe' },
    messages: [
      {
        role: 'user',
        content: `Dish: ${dishName}\nCandidates:\n${JSON.stringify(summary, null, 2)}`,
      },
    ],
  })
  const out = pickToolUse(resp, 'pick_best_recipe')
  if (!out || typeof out.bestIndex !== 'number') return 0
  const idx = Math.max(0, Math.min(candidates.length - 1, Math.floor(out.bestIndex as number)))
  return idx
}

function trimHtmlForExtraction(html: string, max = 30000): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  let body = bodyMatch ? bodyMatch[1] : html
  body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  body = body.replace(/<!--([\s\S]*?)-->/g, '')
  body = body.replace(/\s+/g, ' ').trim()
  return body.length > max ? body.slice(0, max) : body
}

const EXTRACT_TOOL: ToolDef = {
  name: 'extract_recipe',
  description: 'Extract a structured recipe from supplied HTML content.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
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
        minItems: 1,
      },
      steps: { type: 'array', items: { type: 'string' }, minItems: 1 },
      prepTimeMin: { type: 'integer', minimum: 0 },
      cookTimeMin: { type: 'integer', minimum: 0 },
      servings: { type: 'integer', minimum: 1 },
      imageUrl: { type: 'string' },
    },
    required: ['title', 'ingredients', 'steps'],
  },
}

async function extractRecipeFromHtml(url: string, html: string): Promise<ExtractedRecipe | null> {
  const trimmed = trimHtmlForExtraction(html)
  try {
    const resp = await anthropic({
      model: MODEL,
      max_tokens: 2000,
      system: `Extract a structured recipe from the supplied HTML. Return only by calling extract_recipe. Do not invent steps or ingredients that are not present.`,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_recipe' },
      messages: [
        {
          role: 'user',
          content: `URL: ${url}\n\nHTML:\n${trimmed}`,
        },
      ],
    })
    const out = pickToolUse(resp, 'extract_recipe')
    if (!out) return null
    return out as unknown as ExtractedRecipe
  } catch (err) {
    console.warn('[meal-engine] extract failed:', err)
    return null
  }
}

const FALLBACK_TOOL: ToolDef = {
  name: 'compose_recipe',
  description: 'Compose a plausible recipe from scratch when no source HTML is available.',
  input_schema: EXTRACT_TOOL.input_schema,
}

async function composeFallbackRecipe(
  dishName: string,
  notes?: string,
  dietary?: string[],
): Promise<ExtractedRecipe | null> {
  try {
    const resp = await anthropic({
      model: MODEL,
      max_tokens: 1500,
      system: `Compose a clear, practical recipe for the requested dish. Honor dietary constraints. Return only by calling compose_recipe.`,
      tools: [FALLBACK_TOOL],
      tool_choice: { type: 'tool', name: 'compose_recipe' },
      messages: [
        {
          role: 'user',
          content: `Dish: ${dishName}\nNotes: ${notes ?? '(none)'}\nDietary: ${(dietary ?? []).join(', ') || '(none)'}`,
        },
      ],
    })
    const out = pickToolUse(resp, 'compose_recipe')
    if (!out) return null
    return out as unknown as ExtractedRecipe
  } catch {
    return null
  }
}

const FIND_RECIPE_BUDGET_MS = 30_000

async function opFindRecipe(input: Record<string, unknown>): Promise<unknown> {
  const dishName = String(input.dishName ?? '')
  const keywords = Array.isArray(input.searchKeywords) ? (input.searchKeywords as string[]) : [dishName]
  const dietary = Array.isArray(input.dietaryConstraints) ? (input.dietaryConstraints as string[]) : []
  const notes = typeof input.notes === 'string' ? (input.notes as string) : undefined

  const deadline = Date.now() + FIND_RECIPE_BUDGET_MS
  const remaining = () => deadline - Date.now()

  // 1. Search via Claude web_search (≤15s realistically)
  const rawCandidates = await searchUrlsViaClaude(dishName, keywords, remaining())

  // 2. Filter to recipe-likely domains, cap at 5
  const filtered: Candidate[] = []
  const seen = new Set<string>()
  for (const c of rawCandidates) {
    const domain = getDomain(c.url)
    if (!domain || seen.has(domain)) continue
    seen.add(domain)
    if (filtered.length < 6 && (looksLikeRecipeDomain(domain) || filtered.length < 3)) {
      filtered.push({
        title: c.title,
        url: c.url,
        domain,
        snippet: c.snippet,
        hasJsonLd: false,
      })
    }
    if (filtered.length >= 5) break
  }

  // 3. If we don't have enough budget left to fetch + parse, jump to fallback.
  if (remaining() < 10_000) {
    const composed = await composeFallbackRecipe(dishName, notes, dietary)
    if (composed) return { recipe: { ...composed, source: 'ai-fallback' as const } }
    throw new Error('Out of time and no fallback could be composed')
  }

  // 4. Fetch each in parallel and parse JSON-LD
  if (filtered.length > 0) {
    const fetchTimeout = Math.max(3000, Math.min(8000, Math.floor(remaining() / 2)))
    await Promise.all(
      filtered.map(async (c) => {
        const html = await fetchHtml(c.url, fetchTimeout)
        if (!html) return
        c.html = html
        const json = extractJsonLdRecipe(html)
        if (json) {
          c.hasJsonLd = true
          c.jsonLd = json
        }
      }),
    )
  }

  const withJsonLd = filtered.filter((c) => c.hasJsonLd && c.jsonLd)

  // 5. Pick best from JSON-LD candidates
  if (withJsonLd.length >= 2 && remaining() > 5000) {
    const idx = await rankCandidates(dishName, withJsonLd)
    const best = withJsonLd[idx]
    return {
      recipe: {
        ...best.jsonLd!,
        source: 'web' as const,
        url: best.url,
        sourceDomain: best.domain,
      },
    }
  }

  if (withJsonLd.length >= 1) {
    const best = withJsonLd[0]
    return {
      recipe: {
        ...best.jsonLd!,
        source: 'web' as const,
        url: best.url,
        sourceDomain: best.domain,
      },
    }
  }

  // 6. Stage D extraction on the strongest candidate's HTML — only if budget allows
  if (remaining() > 8000) {
    const strongest = filtered.find((c) => c.html)
    if (strongest && strongest.html) {
      const extracted = await extractRecipeFromHtml(strongest.url, strongest.html)
      if (extracted) {
        return {
          recipe: {
            ...extracted,
            source: 'web' as const,
            url: strongest.url,
            sourceDomain: strongest.domain,
          },
        }
      }
    }
  }

  // 7. Last-resort: AI-composed recipe
  const composed = await composeFallbackRecipe(dishName, notes, dietary)
  if (composed) {
    return { recipe: { ...composed, source: 'ai-fallback' as const } }
  }

  throw new Error('Could not produce a recipe for this dish')
}

// ─── Stage D direct ───────────────────────────────────────────────────────

async function opExtract(input: Record<string, unknown>): Promise<unknown> {
  const url = String(input.url ?? '')
  const html = String(input.htmlContent ?? '')
  if (!html) throw new Error('htmlContent is required')

  const json = extractJsonLdRecipe(html)
  if (json) {
    return { recipe: { ...json, source: 'web' as const, url, sourceDomain: getDomain(url) } }
  }
  const extracted = await extractRecipeFromHtml(url, html)
  if (!extracted) throw new Error('Could not extract recipe from HTML')
  return { recipe: { ...extracted, source: 'web' as const, url, sourceDomain: getDomain(url) } }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  const op = String(body.op ?? '')
  try {
    let result: unknown
    switch (op) {
      case 'ingredient':
        result = await opIngredient(body)
        break
      case 'dish':
        result = await opDish(body)
        break
      case 'find-recipe':
        result = await opFindRecipe(body)
        break
      case 'extract':
        result = await opExtract(body)
        break
      default:
        return new Response(JSON.stringify({ error: `Unknown op: ${op}` }), {
          status: 400,
          headers: { ...corsHeaders, 'content-type': 'application/json' },
        })
    }
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[meal-engine] op=${op} error:`, message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})

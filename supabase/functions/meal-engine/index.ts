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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  anthropicWithRetry,
  AnthropicRateLimitError,
  type AnthropicResponse,
  type AnthropicCallMeta,
} from '../_shared/anthropic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = 'claude-haiku-4-5-20251001'
/**
 * v1.16.0: composed-recipe fallback uses Sonnet 4.5 for higher quality on the
 * worst-case path (no web recipe found). Marginal cost ~$0.018 extra per
 * fallback slot — worth it because this is the user's last-resort experience.
 * Override with COMPOSE_MODEL env var if needed (e.g. to revert to Haiku).
 */
const COMPOSE_MODEL = Deno.env.get('COMPOSE_MODEL') ?? 'claude-sonnet-4-5-20250929'
const APP_VERSION = '2.4.0'
const DEPLOYED_AT = '2026-04-26T18:00:00Z'

// v1.17.0: recipe bank wiring — service-role Supabase client used for the
// `sample-from-bank` op. Anonymous client would also work via RLS but
// service-role lets us call the security-definer RPC without forwarding the
// caller's JWT (the caller is already auth'd at the edge function boundary).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

// ─── Anthropic helpers ────────────────────────────────────────────────────

interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/**
 * v1.16.0: thin wrapper around the shared `anthropicWithRetry` so the rest
 * of this file stays unchanged. Surfaces rate-limit awareness through the
 * module-level `lastCallMeta` so the dispatcher can include it in `_meta`
 * on the response (clients use this to throttle).
 */
let lastCallMeta: AnthropicCallMeta | null = null
async function anthropic(body: Record<string, unknown>): Promise<AnthropicResponse> {
  const result = await anthropicWithRetry(ANTHROPIC_API_KEY ?? '', body)
  lastCallMeta = result._meta
  return result
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

function extractJsonLdRecipe(html: string, baseUrl?: string): ExtractedRecipe | null {
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
        const result = normalizeJsonLdRecipe(item, baseUrl)
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

/**
 * v1.16.0: image URL normalizer that tolerates the messy reality of JSON-LD.
 * Handles strings, `{url|contentUrl}` objects, arrays, relative + protocol-relative
 * paths, oversized data: URIs (>16KB are dropped — they bloat Dexie). Final
 * value is always either a valid absolute URL string or `undefined` — never throws.
 */
const MAX_DATA_URI_BYTES = 16_000
function normalizeImageUrl(v: unknown, baseUrl?: string): string | undefined {
  // Unwrap arrays — JSON-LD often returns image as `[{url:'...'}, '...']`.
  if (Array.isArray(v)) {
    for (const item of v) {
      const out = normalizeImageUrl(item, baseUrl)
      if (out) return out
    }
    return undefined
  }
  // Unwrap `{url|contentUrl}` objects.
  let raw: unknown = v
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    raw = (typeof r.url === 'string' && r.url) || (typeof r.contentUrl === 'string' && r.contentUrl) || undefined
  }
  if (typeof raw !== 'string') return undefined
  let s = raw.trim()
  if (!s) return undefined
  // Drop oversized data URIs (would bloat Dexie + hit network when rendered).
  if (s.startsWith('data:') && s.length > MAX_DATA_URI_BYTES) return undefined
  // Drop unsafe schemes — only http(s), data:, blob: are allowed.
  if (s.startsWith('javascript:') || s.startsWith('vbscript:') || s.startsWith('file:')) return undefined
  // Resolve protocol-relative `//cdn/foo.jpg` → `https://cdn/foo.jpg`.
  if (s.startsWith('//')) s = `https:${s}`
  // Resolve relative paths against the recipe page URL.
  if (baseUrl && !/^[a-z][a-z0-9+\-.]*:/i.test(s) && !s.startsWith('data:') && !s.startsWith('blob:')) {
    try {
      s = new URL(s, baseUrl).toString()
    } catch {
      return undefined
    }
  }
  // Final validation.
  try {
    const u = new URL(s)
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'data:' || u.protocol === 'blob:') {
      return s
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * v1.16.0: extended duration parser. Accepts ISO-8601 (`PT1H30M`), human
 * (`30 minutes`, `1 hr 15 min`), `H:MM` clock format, and plain numbers
 * (treated as minutes). Clamps to [0, 24h]; returns `undefined` for garbage.
 */
function isoDurationToMin(iso: unknown): number | undefined {
  if (typeof iso === 'number' && Number.isFinite(iso)) {
    const min = Math.floor(iso)
    return min > 0 && min <= 1440 ? min : undefined
  }
  if (typeof iso !== 'string') return undefined
  const s = iso.trim()
  if (!s) return undefined
  // ISO-8601 PT...
  const isoMatch = s.match(/^P(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+)S)?)?$/i)
  if (isoMatch) {
    const h = isoMatch[1] ? parseFloat(isoMatch[1]) : 0
    const m = isoMatch[2] ? parseFloat(isoMatch[2]) : 0
    const total = Math.round(h * 60 + m)
    return total > 0 && total <= 1440 ? total : undefined
  }
  // H:MM clock format.
  const clockMatch = s.match(/^(\d+):(\d{1,2})$/)
  if (clockMatch) {
    const total = parseInt(clockMatch[1], 10) * 60 + parseInt(clockMatch[2], 10)
    return total > 0 && total <= 1440 ? total : undefined
  }
  // Human format: "1 hr 30 min", "30 minutes", "2 hours", "90m".
  let total = 0
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i)
  if (hMatch) total += Math.round(parseFloat(hMatch[1]) * 60)
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i)
  if (mMatch) total += Math.round(parseFloat(mMatch[1]))
  if (total > 0) return total <= 1440 ? total : undefined
  // Bare number → minutes.
  const num = s.match(/^(\d+(?:\.\d+)?)$/)
  if (num) {
    const min = Math.round(parseFloat(num[1]))
    return min > 0 && min <= 1440 ? min : undefined
  }
  return undefined
}

/**
 * v1.16.0: every return path through opFindRecipe / opExtract / compose should
 * pass through this function so the same imageUrl/time/servings normalization
 * applies regardless of source. Single source of truth — keeps client-side
 * zod transforms unloaded for the happy path.
 */
type RecipePayload = ExtractedRecipe & {
  source: 'web' | 'ai-fallback' | 'composed'
  url?: string
  sourceDomain?: string
}
function repairAndValidate<T extends RecipePayload>(recipe: T, baseUrl?: string): T {
  const out: T = { ...recipe }
  // imageUrl — repair against the source page when relative.
  out.imageUrl = normalizeImageUrl(out.imageUrl, baseUrl ?? out.url)
  // times + servings — re-clamp in case AI extraction returned junk.
  out.prepTimeMin = isoDurationToMin(out.prepTimeMin)
  out.cookTimeMin = isoDurationToMin(out.cookTimeMin)
  out.servings = parseServings(out.servings)
  // sourceUrl — must be a valid http(s) URL or absent.
  if (out.url) {
    try {
      const u = new URL(out.url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') out.url = undefined
    } catch {
      out.url = undefined
    }
  }
  // Drop empty quantity strings (clutter, no signal).
  if (Array.isArray(out.ingredients)) {
    out.ingredients = out.ingredients
      .filter((i) => i && typeof i === 'object' && typeof i.item === 'string' && i.item.trim().length > 0)
      .map((i) => {
        const q = typeof i.quantity === 'string' ? i.quantity.trim() : undefined
        return q ? { item: i.item.trim(), quantity: q } : { item: i.item.trim() }
      })
  }
  if (Array.isArray(out.steps)) {
    out.steps = out.steps.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
  }
  return out
}

/**
 * v1.16.0: forgiving servings parser. Accepts `4`, `"4-6"`, `"makes 12"`,
 * `"serves 4 people"`, arrays. Clamps to [1, 100].
 */
function parseServings(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.floor(v)
    return n >= 1 && n <= 100 ? n : undefined
  }
  if (Array.isArray(v) && v.length > 0) return parseServings(v[0])
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!s) return undefined
  // Take the first integer in the string (handles "4-6", "serves 4", "makes 12 cookies").
  const m = s.match(/(\d+)/)
  if (!m) return undefined
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n)) return undefined
  return n >= 1 && n <= 100 ? n : undefined
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

function normalizeJsonLdRecipe(item: Record<string, unknown>, baseUrl?: string): ExtractedRecipe | null {
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
    servings: parseServings(item.recipeYield),
    imageUrl: normalizeImageUrl(item.image, baseUrl),
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
    // v1.16.0: Sonnet 4.5 for the last-resort path. ~3x marginal cost per
    // fallback slot but the result is what the user actually sees when web
    // search fails — quality > cost (per user instruction, "5¢ should be
    // 10¢ if it raises the floor").
    const resp = await anthropic({
      model: COMPOSE_MODEL,
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
    if (composed) {
      return { recipe: repairAndValidate({ ...composed, source: 'composed' as const }) }
    }
    throw new Error('Out of time and no fallback could be composed')
  }

  // 4. Fetch each in parallel and parse JSON-LD (`c.url` is threaded as baseUrl
  //     so relative imageUrl paths get resolved against the page they came from).
  if (filtered.length > 0) {
    const fetchTimeout = Math.max(3000, Math.min(8000, Math.floor(remaining() / 2)))
    await Promise.all(
      filtered.map(async (c) => {
        const html = await fetchHtml(c.url, fetchTimeout)
        if (!html) return
        c.html = html
        const json = extractJsonLdRecipe(html, c.url)
        if (json) {
          c.hasJsonLd = true
          c.jsonLd = json
        }
      }),
    )
  }

  const withJsonLd = filtered.filter((c) => c.hasJsonLd && c.jsonLd)

  // 5. Pick best from JSON-LD candidates.
  //    Deterministic short-circuits (v1.16.0) avoid an AI call when the answer
  //    is obvious — saves ~300 tokens/slot when triggered.
  const TIER1_DOMAINS = new Set([
    'allrecipes.com',
    'seriouseats.com',
    'cooking.nytimes.com',
    'nytimes.com',
    'bonappetit.com',
    'smittenkitchen.com',
    'budgetbytes.com',
    'food52.com',
    'foodnetwork.com',
    'simplyrecipes.com',
    'thekitchn.com',
  ])
  function pickWinningJsonLd(cands: Candidate[]): Candidate {
    if (cands.length === 1) return cands[0]
    // Tier-1 domain wins when present.
    const tier1 = cands.find((c) => TIER1_DOMAINS.has(c.domain))
    if (tier1) return tier1
    return cands[0]
  }

  if (withJsonLd.length >= 2 && remaining() > 5000) {
    // Skip AI rank when one candidate is on a tier-1 domain.
    const tier1 = withJsonLd.find((c) => TIER1_DOMAINS.has(c.domain))
    const best = tier1 ?? withJsonLd[await rankCandidates(dishName, withJsonLd)]
    return {
      recipe: repairAndValidate(
        {
          ...best.jsonLd!,
          source: 'web' as const,
          url: best.url,
          sourceDomain: best.domain,
        },
        best.url,
      ),
    }
  }

  if (withJsonLd.length >= 1) {
    const best = pickWinningJsonLd(withJsonLd)
    return {
      recipe: repairAndValidate(
        {
          ...best.jsonLd!,
          source: 'web' as const,
          url: best.url,
          sourceDomain: best.domain,
        },
        best.url,
      ),
    }
  }

  // 6. Stage D extraction on the strongest candidate's HTML — only if budget allows.
  //    Score by (length, mentions of ingredient/dishName) so we pick the page
  //    most likely to contain real recipe content, not the first that fetched.
  if (remaining() > 8000) {
    const ingredient = String(input.ingredient ?? '').toLowerCase()
    const dishLower = dishName.toLowerCase()
    const score = (html: string): number => {
      let s = Math.min(html.length, 60_000) // length cap so a 200KB blog doesn't dominate
      const lower = html.toLowerCase()
      if (ingredient && lower.includes(ingredient)) s += 10_000
      if (dishLower && lower.includes(dishLower)) s += 5000
      return s
    }
    const ranked = filtered
      .filter((c) => c.html)
      .sort((a, b) => score(b.html!) - score(a.html!))
    const strongest = ranked[0]
    if (strongest && strongest.html) {
      const extracted = await extractRecipeFromHtml(strongest.url, strongest.html)
      if (extracted) {
        return {
          recipe: repairAndValidate(
            {
              ...extracted,
              source: 'web' as const,
              url: strongest.url,
              sourceDomain: strongest.domain,
            },
            strongest.url,
          ),
        }
      }
    }
  }

  // 7. Last-resort: AI-composed recipe (Sonnet — see composeFallbackRecipe).
  //    `source: 'composed'` so the UI can show a "Composed by AI" badge.
  const composed = await composeFallbackRecipe(dishName, notes, dietary)
  if (composed) {
    return { recipe: repairAndValidate({ ...composed, source: 'composed' as const }) }
  }

  throw new Error('Could not produce a recipe for this dish')
}

// ─── Stage D direct ───────────────────────────────────────────────────────

async function opExtract(input: Record<string, unknown>): Promise<unknown> {
  const url = String(input.url ?? '')
  const html = String(input.htmlContent ?? '')
  if (!html) throw new Error('htmlContent is required')

  const json = extractJsonLdRecipe(html, url)
  if (json) {
    return {
      recipe: repairAndValidate(
        { ...json, source: 'web' as const, url, sourceDomain: getDomain(url) },
        url,
      ),
    }
  }
  const extracted = await extractRecipeFromHtml(url, html)
  if (!extracted) throw new Error('Could not extract recipe from HTML')
  return {
    recipe: repairAndValidate(
      { ...extracted, source: 'web' as const, url, sourceDomain: getDomain(url) },
      url,
    ),
  }
}

// ─── Op: sample-from-bank (v1.17.0) ───────────────────────────────────────
// Look up candidate recipes from the recipe_bank table. Returns 0..N matches.
// Caller (client) decides which one to use; if 0, falls through to AI generation.
//
// Input shape:
//   {
//     op: 'sample-from-bank',
//     mealType: 'dinner',
//     slotRole: 'main',
//     cuisineIds: ['italian', 'thai'] | [],   // empty = any cuisine
//     dietaryTags: ['vegan', 'gluten-free'] | [],
//     dislikedIngredients: [],
//     recentDishNames: ['Spaghetti carbonara', ...],
//     limit: 5
//   }
async function opSampleFromBank(input: Record<string, unknown>): Promise<unknown> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { candidates: [], _diag: 'no_supabase_env' }
  }
  const mealType = String(input.mealType ?? '')
  const slotRole = String(input.slotRole ?? '')
  if (!mealType || !slotRole) {
    return { candidates: [], _diag: 'missing_meal_or_role' }
  }
  const cuisineIds = Array.isArray(input.cuisineIds) ? (input.cuisineIds as string[]) : []
  const dietaryTags = Array.isArray(input.dietaryTags) ? (input.dietaryTags as string[]) : []
  const dislikedIngredients = Array.isArray(input.dislikedIngredients)
    ? (input.dislikedIngredients as string[])
    : []
  const recentDishNames = Array.isArray(input.recentDishNames)
    ? (input.recentDishNames as string[])
    : []
  const limit = typeof input.limit === 'number' ? Math.max(1, Math.min(20, input.limit)) : 5

  const sb = getServiceClient()
  const { data, error } = await sb.rpc('sample_recipes_for_slot', {
    p_meal_type: mealType,
    p_slot_role: slotRole,
    p_cuisine_ids: cuisineIds,
    p_dietary_tags: dietaryTags,
    p_disliked_ingredients: dislikedIngredients,
    p_recent_dish_names: recentDishNames,
    p_limit: limit,
  })
  if (error) {
    console.warn('[meal-engine] sample-from-bank rpc error:', error.message)
    return { candidates: [], _diag: `rpc_error:${error.message}` }
  }
  // Map DB rows to the client-side Recipe shape.
  // v2.0.0: also exposes source_kind_v2 / secondary_ingredients /
  // composed_payload so the client can route link-first vs full-content.
  const candidates = (data ?? []).map((r: Record<string, unknown>) => {
    const sourceKindV2 = (r.source_kind_v2 ?? r.source_kind) as string
    const ingredients = r.ingredients as unknown
    const steps = r.steps as unknown
    return {
      bankId: r.id,
      title: r.title,
      cuisineId: r.cuisine_id,
      ingredientMain: r.ingredient_main,
      proteinFamily: r.protein_family,
      styleId: r.style_id,
      flavorId: r.flavor_id,
      dietaryTags: r.dietary_tags,
      qualityScore: r.quality_score,
      // v2.0.0 link-first metadata
      sourceKindV2,
      secondaryIngredients: r.secondary_ingredients ?? [],
      composedPayload: r.composed_payload ?? undefined,
      recipe: {
        title: r.title,
        source: sourceKindV2 === 'web' || sourceKindV2 === 'user_import' ? 'web' : 'composed',
        url: r.source_url ?? undefined,
        sourceDomain: r.source_domain ?? undefined,
        ingredients: Array.isArray(ingredients) ? ingredients : null,
        steps: Array.isArray(steps) ? steps : null,
        prepTimeMin: r.prep_time_min ?? undefined,
        cookTimeMin: r.cook_time_min ?? undefined,
        servings: r.servings ?? undefined,
        imageUrl: r.image_url ?? undefined,
      },
    }
  })
  return { candidates }
}

// ─── Op: day-plan (v1.17.0) ───────────────────────────────────────────────
// Batched Stage A+B: takes a description of one day's meals and returns
// {ingredient, dishName, searchKeywords} for every slot in a SINGLE Anthropic
// call. Cuts a 7-day plan from ~14 calls (Stage A+B per slot) down to 7 calls.
//
// Input shape:
//   {
//     op: 'day-plan',
//     day: { date: 'YYYY-MM-DD', theme?: string, isWeekend: boolean },
//     prefs: { dietaryConstraints, dislikedIngredients, pantryItems },
//     recentDishes: ['Spaghetti carbonara', ...],
//     meals: [
//       {
//         mealId: 'meal-uuid', type: 'dinner',
//         slots: [{ slotId, role: 'main', envelope: {...} }, ...]
//       },
//       ...
//     ]
//   }
//
// Output shape: { slots: [{ slotId, ingredient, dishName, searchKeywords }, ...] }

const DAY_PLAN_TOOL: ToolDef = {
  name: 'plan_day',
  description:
    'Fill ingredient + dish + search keywords for every slot in one day, respecting each slot envelope and avoiding sibling repetition.',
  input_schema: {
    type: 'object',
    properties: {
      slots: {
        type: 'array',
        description: 'One entry per slot in the same order as the input.',
        items: {
          type: 'object',
          properties: {
            slotId: { type: 'string' },
            ingredient: { type: 'string', description: 'A single primary ingredient.' },
            dishName: { type: 'string', description: 'Concise dish name a recipe site would index.' },
            searchKeywords: {
              type: 'array',
              items: { type: 'string' },
              description: '3-5 strings to find this recipe on the web.',
            },
            rationale: { type: 'string', description: 'One-sentence why this fits.' },
          },
          required: ['slotId', 'ingredient', 'dishName', 'searchKeywords'],
        },
      },
    },
    required: ['slots'],
  },
}

interface DayPlanSlotInput {
  slotId: string
  role: string
  envelope?: Envelope
}

async function opDayPlan(input: Record<string, unknown>): Promise<unknown> {
  const day = (input.day as Record<string, unknown>) ?? {}
  const prefs = (input.prefs as Record<string, unknown>) ?? {}
  const recentDishes = Array.isArray(input.recentDishes) ? (input.recentDishes as string[]) : []
  const meals = Array.isArray(input.meals) ? (input.meals as Record<string, unknown>[]) : []

  if (meals.length === 0) {
    return { slots: [] }
  }

  // Flatten slots in order, preserving meal context.
  const allSlots: { slotId: string; mealType: string; role: string; envelope?: Envelope }[] = []
  for (const meal of meals) {
    const mealType = String(meal.type ?? 'meal')
    const slots = Array.isArray(meal.slots) ? (meal.slots as DayPlanSlotInput[]) : []
    for (const s of slots) {
      allSlots.push({
        slotId: s.slotId,
        mealType,
        role: s.role,
        envelope: s.envelope,
      })
    }
  }

  if (allSlots.length === 0) {
    return { slots: [] }
  }

  // Build a compact text representation of every slot's context.
  const slotsBlock = allSlots
    .map((s, i) => {
      const env = s.envelope
      const envStr = env
        ? `cuisine=${env.cuisineLabel ?? '?'} style=${env.styleLabel ?? '?'} flavor=${env.flavorLabel ?? '?'}${env.proteinName ? ` protein-hint=${env.proteinName}` : ''}`
        : '(no envelope)'
      return `${i + 1}. slotId=${s.slotId} meal=${s.mealType} role=${s.role}: ${envStr}`
    })
    .join('\n')

  const dietary = Array.isArray(prefs.dietaryConstraints) ? (prefs.dietaryConstraints as string[]) : []
  const disliked = Array.isArray(prefs.dislikedIngredients) ? (prefs.dislikedIngredients as string[]) : []
  const pantry = Array.isArray(prefs.pantryItems) ? (prefs.pantryItems as string[]) : []

  const system = `You are filling a day of meals for one household. For EACH slot you must propose one ingredient, one dish name, and 3-5 web-search keywords.

CRITICAL RULES:
1. Honor each slot's envelope as authoritative — cuisine, style, flavor are FIXED, do NOT drift to a different cuisine.
2. Within ONE meal, do not repeat the same protein family across slots (so chicken main + chicken side is wrong; chicken main + green-veg side + rice side is right).
3. Respect dietary constraints + disliked ingredients across ALL slots in the day.
4. Avoid the recent-dishes list (these were generated in the last 14 days).
5. Return EXACTLY ONE entry per input slot, in the same order, by calling plan_day.

The model bias toward Mediterranean/Middle-Eastern cuisines (kabob, shakshuka, falafel, hummus, tahini, za'atar, sumac) is FORBIDDEN unless the slot envelope explicitly names greek/persian/israeli/spanish-tapas as the cuisine.`

  const user = `Plan ${allSlots.length} slot(s) for day ${day.date ?? 'TBD'}${day.theme ? ` (theme: ${day.theme})` : ''}${day.isWeekend ? ' [weekend]' : ''}.

Slots:
${slotsBlock}

Dietary constraints (apply to ALL slots): ${dietary.join(', ') || 'none'}
Disliked ingredients (avoid in ALL slots): ${disliked.join(', ') || 'none'}
Pantry items the user has on hand: ${pantry.join(', ') || 'none'}
Recent dishes (avoid these — they were generated in the last 14 days): ${recentDishes.slice(0, 30).join(', ') || 'none'}

Call plan_day with one slot entry per input slot, in the same order.`

  const resp = await anthropic({
    model: MODEL,
    max_tokens: 2500,
    system,
    tools: [DAY_PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'plan_day' },
    messages: [{ role: 'user', content: user }],
  })

  const out = pickToolUse(resp, 'plan_day')
  if (!out || !Array.isArray(out.slots)) {
    throw new Error('Model did not return slots array')
  }

  // Normalize + dedup keywords server-side (same as opDish).
  const result = (out.slots as Record<string, unknown>[]).map((s) => {
    const slotId = String(s.slotId ?? '')
    const ingredient = String(s.ingredient ?? '').trim()
    const dishName = String(s.dishName ?? '').trim()
    const rawKeywords = Array.isArray(s.searchKeywords) ? (s.searchKeywords as string[]) : []
    const seen = new Set<string>()
    const dedup: string[] = []
    for (const k of rawKeywords) {
      const v = (typeof k === 'string' ? k : '').trim()
      if (!v) continue
      const key = v.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      dedup.push(v)
    }
    return {
      slotId,
      ingredient,
      dishName,
      searchKeywords: dedup.length > 0 ? dedup.slice(0, 5) : [dishName],
    }
  })

  return { slots: result }
}

// ─── Op: parse-intake (v2.0.0) ────────────────────────────────────────────
// Reads the user's freeform meal-planning blurb + circle context and returns
// (a) which subsequent questions the dialog can skip, and (b) what answer
// to prefill for them. ~500 input tokens, 1 Haiku call.
//
// The dialog hard-asks q_days, q_meals_per_day, q_freeform; everything else
// is potentially skippable.

const PARSE_INTAKE_TOOL: ToolDef = {
  name: 'parse_intake',
  description: 'Parse the user freeform meal-planning blurb into a skip-list and prefilled answers. Skip a question only when the freeform unambiguously answers it. Never invent.',
  input_schema: {
    type: 'object',
    required: ['skip', 'prefill'],
    properties: {
      skip: {
        type: 'array',
        description: 'Question ids whose answer is unambiguously contained in the freeform.',
        items: {
          type: 'string',
          enum: [
            'q_headcount',
            'q_dietary',
            'q_dislikes',
            'q_prep_time',
            'q_calories',
            'q_cooking_skill',
            'q_themes',
            'q_preset_per_day',
          ],
        },
      },
      prefill: {
        type: 'object',
        description: 'Answer values extracted from the freeform. Only include fields you are confident about.',
        properties: {
          headcountAdults: { type: 'integer', minimum: 1, maximum: 50 },
          headcountKids: { type: 'integer', minimum: 0, maximum: 20 },
          diets: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'vegetarian','vegan','gluten-free','dairy-free',
                'pescatarian','keto','kosher','halal',
              ],
            },
          },
          dislikes: { type: 'array', items: { type: 'string' } },
          maxPrepMin: { type: 'integer', minimum: 5, maximum: 240 },
          calories: { type: 'string', enum: ['light', 'balanced', 'hearty'] },
          skill: { type: 'string', enum: ['easy', 'normal', 'challenge'] },
          themes: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'meatless-monday','taco-tuesday','pasta-wednesday','pizza-friday',
                'slow-cooker','one-pot','burger','greek','asian',
              ],
            },
          },
        },
      },
    },
  },
}

const PARSE_INTAKE_SYSTEM = `You are parsing a user's meal-planning request into structured answers
so a wizard can skip questions the user has already answered. Rules:

- Only emit "skip" for questions the freeform UNAMBIGUOUSLY answers.
- Only emit "prefill" fields you are confident about. When in doubt, leave it
  out — the wizard will ask.
- "kids hate fish" → diets=[], dislikes=["fish"], skip=["q_dislikes"]
- "vegetarian dinner only" → diets=["vegetarian"], skip=["q_dietary"]
- "Meatless Monday" / "Taco Tuesday" → themes=[…], skip=["q_themes"]
- "30 min max" / "weeknight quick" → maxPrepMin=30, skip=["q_prep_time"]
- "family of 4" / "two adults two kids" → headcountAdults+Kids, skip=["q_headcount"]
- Never skip q_review, q_days, q_meals_per_day, or q_freeform.

Reply only by calling the parse_intake tool.`

async function opParseIntake(input: Record<string, unknown>): Promise<unknown> {
  const freeform = String(input.freeform ?? '').trim()
  const circleContext = String(input.circleContext ?? '')
  if (!freeform) {
    return { skip: [], prefill: {} }
  }
  const userPayload = JSON.stringify({ freeform, circleContext })

  const resp = await anthropic({
    model: MODEL,
    max_tokens: 600,
    system: PARSE_INTAKE_SYSTEM,
    tools: [PARSE_INTAKE_TOOL],
    tool_choice: { type: 'tool', name: 'parse_intake' },
    messages: [{ role: 'user', content: userPayload }],
  })

  const out = pickToolUse(resp, 'parse_intake') as
    | { skip?: string[]; prefill?: Record<string, unknown> }
    | null
  if (!out) return { skip: [], prefill: {} }
  return { skip: out.skip ?? [], prefill: out.prefill ?? {} }
}

// ─── Op: propose-plan (v2.0.0) ────────────────────────────────────────────
// Given the full interview answer map, returns 1-3 candidate dish-name
// strings per slot. The client matches each candidate against the recipe
// bank with `tryFillSlotFromBank`. First hit wins. Misses fall through to
// the existing async worker.

const PROPOSE_PLAN_TOOL: ToolDef = {
  name: 'propose_plan',
  description: 'Propose 1-3 candidate dish titles per slot. The client looks them up in a recipe bank.',
  input_schema: {
    type: 'object',
    required: ['days'],
    properties: {
      days: {
        type: 'array',
        items: {
          type: 'object',
          required: ['date', 'meals'],
          properties: {
            date: { type: 'string' },
            theme: { type: 'string' },
            meals: {
              type: 'array',
              items: {
                type: 'object',
                required: ['type', 'slots'],
                properties: {
                  type: { type: 'string' },
                  slots: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['role', 'candidates'],
                      properties: {
                        role: { type: 'string' },
                        candidates: {
                          type: 'array',
                          minItems: 1,
                          maxItems: 3,
                          items: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

const PROPOSE_PLAN_SYSTEM = `You design a week of meals as candidate DISH NAMES — not full recipes.
Each candidate is a short, well-known title that recipe sites would index
(e.g. "Korean Braised Chicken Thighs", "Sheet-Pan Greek Chicken & Veggies").

Rules:
- Propose 1-3 candidates per slot, in priority order. The client tries each
  in order against a recipe bank and uses the first hit.
- Variety across the week:
    * No protein-family repeats in the same meal (e.g. don't put chicken main
      and chicken side in the same dinner).
    * No cuisine repeats on adjacent days.
    * No more than 2 of any single protein family across the week.
- Honor user dietary constraints absolutely.
- Honor q_themes: Monday → vegetarian, Tuesday → tacos, Wednesday → pasta,
  Friday → pizza, etc., when the theme is in the user's selected themes.
- Ground on the <circle_context> block — household size, kids' ages, diet
  defaults — when present.
- No medical or nutritional advice. Don't comment on calories or claim
  health benefits.

Reply only by calling the propose_plan tool.`

async function opProposePlan(input: Record<string, unknown>): Promise<unknown> {
  const answers = input.answers ?? {}
  const circleContext = String(input.circleContext ?? '')
  const recentDishes = Array.isArray(input.recentDishes)
    ? (input.recentDishes as string[])
    : []
  const userPayload = JSON.stringify({ answers, recentDishes })

  const resp = await anthropic({
    model: MODEL,
    max_tokens: 2200,
    system: PROPOSE_PLAN_SYSTEM,
    tools: [PROPOSE_PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'propose_plan' },
    messages: [
      {
        role: 'user',
        content: circleContext ? `${circleContext}\n\nANSWERS:\n${userPayload}` : userPayload,
      },
    ],
  })

  const out = pickToolUse(resp, 'propose_plan') as
    | { days?: unknown[] }
    | null
  // v2.3.0: surface a real error instead of returning an empty plan. The
  // client previously rendered an empty review page when this happened
  // because zod's `.default([])` swallowed the failure shape.
  // v2.4.0: also throw when days exist but every day has an empty meals array
  // (Anthropic returned partial structure with no actual content).
  if (!out?.days || (Array.isArray(out.days) && out.days.length === 0)) {
    throw new Error('propose_plan returned no days')
  }
  if (
    Array.isArray(out.days) &&
    (out.days as Array<{ meals?: unknown[] }>).every(
      (d) => !d.meals || d.meals.length === 0,
    )
  ) {
    throw new Error('propose_plan returned days with no meals')
  }
  return { days: out.days }
}

// ─── Op: fetch-recipe-url (v2.0.0) ────────────────────────────────────────
// Lazy hydration for `link_ready` slots — fetches a known URL server-side
// (no CORS), prefers JSON-LD, falls back to HTML extraction. Single-purpose
// op so the client doesn't have to thread a URL through the find-recipe
// pipeline. Reuses opExtract internals.

async function opFetchRecipeUrl(input: Record<string, unknown>): Promise<unknown> {
  const url = String(input.url ?? '')
  if (!url) throw new Error('url is required')

  // Server-side fetch — bypasses CORS that the browser would hit.
  let html: string
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!resp.ok) {
      throw new Error(`fetch ${url}: HTTP ${resp.status}`)
    }
    html = await resp.text()
  } catch (err) {
    throw new Error(`Failed to fetch recipe URL: ${(err as Error).message}`)
  }

  // Try JSON-LD first.
  const json = extractJsonLdRecipe(html, url)
  if (json) {
    return {
      recipe: repairAndValidate(
        { ...json, source: 'web' as const, url, sourceDomain: getDomain(url) },
        url,
      ),
    }
  }
  // Fall back to AI HTML extraction.
  const extracted = await extractRecipeFromHtml(url, html)
  if (!extracted) throw new Error('Could not extract recipe from URL')
  return {
    recipe: repairAndValidate(
      { ...extracted, source: 'web' as const, url, sourceDomain: getDomain(url) },
      url,
    ),
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // v1.16.0: health probe — `?ping=1` returns version/model so the client can
  // detect a stale Supabase deploy (the v1.15.7 plan-event "still failing"
  // bug was this exact pattern: code fixed in source, never deployed).
  if (req.method === 'GET') {
    const url = new URL(req.url)
    if (url.searchParams.get('ping') === '1') {
      return new Response(
        JSON.stringify({
          fn: 'meal-engine',
          version: APP_VERSION,
          model: MODEL,
          composeModel: COMPOSE_MODEL,
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
  // Reset per-request meta so the dispatcher only surfaces token usage from
  // *this* op's Anthropic calls.
  lastCallMeta = null
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
      // v1.17.0: bank-first sampling — no Anthropic call, just a SQL lookup.
      case 'sample-from-bank':
        result = await opSampleFromBank(body)
        break
      // v1.17.0: batched Stage A+B for one day in a single Anthropic call.
      case 'day-plan':
        result = await opDayPlan(body)
        break
      // v2.0.0: interview ops + lazy URL hydration.
      case 'parse-intake':
        result = await opParseIntake(body)
        break
      case 'propose-plan':
        result = await opProposePlan(body)
        break
      case 'fetch-recipe-url':
        result = await opFetchRecipeUrl(body)
        break
      default:
        return new Response(JSON.stringify({ error: `Unknown op: ${op}` }), {
          status: 400,
          headers: { ...corsHeaders, 'content-type': 'application/json' },
        })
    }
    // v1.16.0: surface token usage so the client TokenBudgetQueue can throttle.
    const enriched =
      result && typeof result === 'object'
        ? { ...result, _meta: lastCallMeta ?? undefined }
        : result
    return new Response(JSON.stringify(enriched), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    // v1.16.0: surface rate-limit errors with status 429 + retry-after so the
    // client can proactively back off instead of just seeing a generic 500.
    if (err instanceof AnthropicRateLimitError) {
      console.warn(`[meal-engine] op=${op} rate-limited; retry after ${err.retryAfterMs}ms`)
      return new Response(
        JSON.stringify({
          error: 'rate_limited',
          message: err.message,
          retryAfterMs: err.retryAfterMs,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'content-type': 'application/json',
            'retry-after': String(Math.ceil(err.retryAfterMs / 1000)),
          },
        },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[meal-engine] op=${op} error:`, message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})

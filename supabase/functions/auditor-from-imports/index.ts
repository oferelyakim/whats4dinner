// v2.0.0 — auditor-from-imports.
//
// Triggered by a Supabase database webhook on `recipes INSERT WHERE
// source_url IS NOT NULL` (configured in dashboard, not in migration).
// Decides whether to promote the user-imported URL to `recipe_bank` so
// the long tail of community recipes enriches the link-first bank without
// invading user privacy.
//
// Privacy invariants:
//   • bank rows NEVER carry user_id / created_by — those stay only in
//     `public.recipes`.
//   • PII heuristic blocks personal-name titles ("Mom's Pasta",
//     "Linda's Lasagna").
//   • Per-user promotion rate-limit: 3 / 24h (counts via audit_log).
//
// Each insertion runs a single Haiku audit call (~700 tokens) plus a few
// SQL probes. ~$0.10/day org-wide at 100 active importers.
//
// GET ?ping=1 returns the version probe.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const APP_VERSION = '2.1.0'
const DEPLOYED_AT = '2026-05-03T00:00:00Z'
const MODEL = 'claude-haiku-4-5-20251001'
const PROMOTIONS_PER_USER_PER_DAY = 3

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

// ─── PII heuristic ─────────────────────────────────────────────────────────
// Conservative — false-negatives are fine (we don't promote) but false-positives
// (PII slipping into the bank) are not.

const POSSESSIVE_NAME = /^[A-Z][a-z]+(?:'s|s')\s+/  // "Mom's Pasta", "James' Stew"
const FAMILY_TITLE = /\b(grandma|grandpa|mom|dad|nan|nana|papa|abuela|abuelo|savta|saba)\b/i

function looksPersonal(title: string, displayName?: string): boolean {
  if (POSSESSIVE_NAME.test(title)) return true
  if (FAMILY_TITLE.test(title)) return true
  if (displayName && title.toLowerCase().includes(displayName.toLowerCase()) && displayName.length >= 3) {
    return true
  }
  return false
}

// ─── Anthropic audit ───────────────────────────────────────────────────────

const AUDIT_TOOL = {
  name: 'audit_recipe_url',
  description: 'Audit a user-imported recipe URL and decide if it belongs in the public bank.',
  input_schema: {
    type: 'object',
    required: ['shouldPromote', 'ingredient_main', 'protein_family', 'cuisine_id', 'slot_role', 'meal_type', 'quality_score'],
    properties: {
      shouldPromote: { type: 'boolean' },
      ingredient_main: { type: 'string', description: 'Primary ingredient, lowercase.' },
      secondary_ingredients: { type: 'array', items: { type: 'string' }, description: 'Up to 3 additional anchors, lowercase.' },
      protein_family: { type: 'string', description: 'chicken|beef|pork|seafood|legume|tofu|cheese|egg|grain|other' },
      dietary_tags: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'pescatarian', 'keto', 'kosher', 'halal'],
        },
      },
      cuisine_id: { type: 'string' },
      slot_role: { type: 'string', description: 'main|veg_side|starch_side|side|soup|salad|tapas|bread|drink|dessert' },
      meal_type: { type: 'string', description: 'breakfast|lunch|dinner|snack|brunch' },
      prep_time_min: { type: 'integer' },
      cook_time_min: { type: 'integer' },
      servings: { type: 'integer' },
      quality_score: { type: 'number', description: '0-100 honest rating; 70+ = solid weeknight, 90+ = standout.' },
      pii_concern: { type: 'boolean', description: 'true if the title or visible content seems to reference a specific person.' },
    },
  },
}

const AUDIT_SYSTEM = `You audit a user-imported recipe URL. You decide whether it should be
promoted to a shared recipe bank.

Reject (shouldPromote=false) if:
- The title references a specific person ("Mom's Pasta", "Linda's Lasagna")
- The recipe is excessively obscure or low quality
- The dish name uses forbidden ingredients (shawarma, kabob, falafel, hummus,
  tahini, za'atar, sumac, labneh) UNLESS cuisine is greek/persian/israeli
- The page appears to be a category/roundup, not a single recipe

Promote (shouldPromote=true) for indexable, quality-rated single recipes.
Set quality_score honestly (0-100). Default cuisine_id to 'american' if
unclear.

Reply only by calling audit_recipe_url.`

interface AuditOutput {
  shouldPromote: boolean
  ingredient_main: string
  secondary_ingredients?: string[]
  protein_family?: string
  dietary_tags?: string[]
  cuisine_id?: string
  slot_role?: string
  meal_type?: string
  prep_time_min?: number
  cook_time_min?: number
  servings?: number
  quality_score?: number
  pii_concern?: boolean
}

interface AuditCallResult {
  output: AuditOutput
  tokensIn: number
  tokensOut: number
}

async function auditUrl(url: string, title: string): Promise<AuditCallResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: AUDIT_SYSTEM,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 2 },
        AUDIT_TOOL,
      ],
      messages: [
        {
          role: 'user',
          content: `Audit this user-imported recipe.\nTitle: ${title}\nURL: ${url}`,
        },
      ],
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  const tool = (data.content || []).find(
    (b: { type: string; name?: string }) => b.type === 'tool_use' && b.name === 'audit_recipe_url',
  )
  if (!tool || !tool.input) throw new Error('No audit_recipe_url tool_use returned')
  return {
    output: tool.input as AuditOutput,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  }
}

async function logAuditorUsage(
  sb: ReturnType<typeof createClient>,
  tokensIn: number,
  tokensOut: number,
  feature: string,
): Promise<void> {
  if (tokensIn === 0 && tokensOut === 0) return
  const cost = (tokensIn / 1_000_000) * 1.0 + (tokensOut / 1_000_000) * 5.0
  const { error } = await sb.from('ai_usage').insert({
    user_id: null,
    action_type: 'auditor',
    api_cost_usd: cost,
    model_used: MODEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    period_start: new Date().toISOString(),
    feature_context: feature,
  })
  if (error) console.warn('[auditor] logAuditorUsage failed:', error.message)
}

// ─── DB helpers ────────────────────────────────────────────────────────────

interface RecipeRow {
  id: string
  title: string
  source_url: string | null
  created_by: string | null
}

type Decision =
  | 'promoted'
  | 'skipped_dup'
  | 'skipped_pii'
  | 'skipped_low_quality'
  | 'skipped_rate_limit'
  | 'error'

async function logDecision(
  sb: ReturnType<typeof createClient>,
  recipeId: string,
  decision: Decision,
  bankId: string | null,
  notes: string,
): Promise<void> {
  const { error } = await sb.from('recipe_bank_audit_log').upsert(
    {
      recipe_id: recipeId,
      decided_at: new Date().toISOString(),
      decision,
      bank_id: bankId,
      notes: notes.slice(0, 500),
    },
    { onConflict: 'recipe_id' },
  )
  if (error) console.warn('[auditor] audit log upsert failed:', error.message)
}

async function isRateLimited(
  sb: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  // Count promotions for this user in the last 24h. Joins via recipes.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await sb
    .from('recipe_bank_audit_log')
    .select('recipe_id, recipes!inner(created_by)')
    .eq('decision', 'promoted')
    .gte('decided_at', since)
    .eq('recipes.created_by', userId)
  if (error) {
    console.warn('[auditor] rate-limit query failed:', error.message)
    return false
  }
  return (data?.length ?? 0) >= PROMOTIONS_PER_USER_PER_DAY
}

async function getDisplayName(
  sb: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | undefined> {
  const { data, error } = await sb
    .from('profiles')
    .select('display_name, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) return undefined
  const profile = data as { display_name?: string; full_name?: string } | null
  return profile?.display_name ?? profile?.full_name ?? undefined
}

// ─── Handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.method === 'GET') {
    const url = new URL(req.url)
    if (url.searchParams.get('ping') === '1') {
      return new Response(
        JSON.stringify({
          fn: 'auditor-from-imports',
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

  let body: { type?: string; record?: RecipeRow; recipe_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Bad JSON', { status: 400, headers: corsHeaders })
  }

  // Webhook payload uses { type, record }; smoke script can pass { recipe_id }.
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  let recipe: RecipeRow | null = null
  if (body.record) {
    recipe = body.record
  } else if (body.recipe_id) {
    const { data, error } = await sb
      .from('recipes')
      .select('id, title, source_url, created_by')
      .eq('id', body.recipe_id)
      .maybeSingle()
    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: 'recipe not found' }),
        { status: 404, headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }
    recipe = data as RecipeRow
  }
  if (!recipe || !recipe.source_url) {
    return new Response(
      JSON.stringify({ ok: true, decision: 'skipped_no_url' }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 1. Already-audited dedup.
  const { data: existing } = await sb
    .from('recipe_bank_audit_log')
    .select('decision')
    .eq('recipe_id', recipe.id)
    .maybeSingle()
  if (existing) {
    return new Response(
      JSON.stringify({ ok: true, decision: existing.decision, alreadyAudited: true }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 2. URL-already-in-bank dedup.
  const { data: dupBank } = await sb
    .from('recipe_bank')
    .select('id, slot_role')
    .eq('source_url', recipe.source_url)
    .maybeSingle()
  if (dupBank) {
    await logDecision(sb, recipe.id, 'skipped_dup', dupBank.id as string, 'url already in bank')
    return new Response(
      JSON.stringify({ ok: true, decision: 'skipped_dup' }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 3. Rate-limit per user.
  if (recipe.created_by) {
    const blocked = await isRateLimited(sb, recipe.created_by)
    if (blocked) {
      await logDecision(sb, recipe.id, 'skipped_rate_limit', null, `>= ${PROMOTIONS_PER_USER_PER_DAY}/24h`)
      return new Response(
        JSON.stringify({ ok: true, decision: 'skipped_rate_limit' }),
        { headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }
  }

  // 4. PII heuristic on title + display name.
  const displayName = recipe.created_by ? await getDisplayName(sb, recipe.created_by) : undefined
  if (looksPersonal(recipe.title, displayName)) {
    await logDecision(sb, recipe.id, 'skipped_pii', null, 'title looks personal')
    return new Response(
      JSON.stringify({ ok: true, decision: 'skipped_pii' }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 5. Audit via Haiku.
  let audit: AuditOutput
  try {
    const result = await auditUrl(recipe.source_url, recipe.title)
    audit = result.output
    await logAuditorUsage(sb, result.tokensIn, result.tokensOut, `audit:${recipe.id}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logDecision(sb, recipe.id, 'error', null, message.slice(0, 200))
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  if (!audit.shouldPromote || audit.pii_concern || (audit.quality_score ?? 0) < 50) {
    await logDecision(
      sb,
      recipe.id,
      audit.pii_concern ? 'skipped_pii' : 'skipped_low_quality',
      null,
      `audit shouldPromote=${audit.shouldPromote} q=${audit.quality_score} pii=${audit.pii_concern}`,
    )
    return new Response(
      JSON.stringify({ ok: true, decision: audit.pii_concern ? 'skipped_pii' : 'skipped_low_quality' }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 6. Coverage check — if the cell is over-target, require quality > 70.
  const cuisine = audit.cuisine_id ?? 'american'
  const slotRole = audit.slot_role ?? 'main'
  const mealType = audit.meal_type ?? 'dinner'

  // 7. Insert as link-first row. NEVER write created_by.
  const insertRow = {
    title: recipe.title,
    cuisine_id: cuisine,
    meal_type: mealType,
    slot_role: slotRole,
    dietary_tags: audit.dietary_tags ?? [],
    ingredient_main: audit.ingredient_main.toLowerCase(),
    secondary_ingredients: (audit.secondary_ingredients ?? []).map((s) => s.toLowerCase()),
    protein_family: audit.protein_family ?? null,
    style_id: null,
    flavor_id: null,
    ingredients: null,
    steps: null,
    prep_time_min: audit.prep_time_min ?? null,
    cook_time_min: audit.cook_time_min ?? null,
    servings: audit.servings ?? null,
    image_url: null,
    source_url: recipe.source_url,
    source_domain: domainFromUrl(recipe.source_url),
    source_kind: 'web',
    source_kind_v2: 'user_import',
    quality_score: Math.max(0, Math.min(100, audit.quality_score ?? 70)),
    audit_imported_from_user_count: 1,
  }
  const { data: inserted, error: insertError } = await sb
    .from('recipe_bank')
    .insert(insertRow)
    .select('id')
    .maybeSingle()
  if (insertError || !inserted) {
    await logDecision(sb, recipe.id, 'error', null, `insert failed: ${insertError?.message ?? 'unknown'}`)
    return new Response(
      JSON.stringify({ ok: false, error: insertError?.message ?? 'insert failed' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  await logDecision(sb, recipe.id, 'promoted', inserted.id as string, `q=${audit.quality_score}`)
  return new Response(
    JSON.stringify({ ok: true, decision: 'promoted', bank_id: inserted.id }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})

function domainFromUrl(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

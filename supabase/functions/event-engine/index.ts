// event-engine — multi-op edge function powering the Event Planner v2.
//
// Ops:
//   • intake     — free text → structured NLU (archetype, headcount, venue, …)
//   • propose    — answers + circle context → full plan (dishes/supplies/tasks/activities)
//   • revise     — existing plan + instruction → updated plan
//   • find-vendors (reserved for v2; not implemented here)
//
// Pattern mirrors supabase/functions/meal-engine/index.ts:
//   • Uses anthropicWithRetry from _shared/anthropic.ts (429/5xx retries + retry-after).
//   • Loads circle context from _shared/circle-context.ts.
//   • Returns { _ai_usage } so the client can persist to ai_usage table.
//   • GET ?ping=1 returns version metadata for the client-side version probe.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadCircleContext } from '../_shared/circle-context.ts'
import { anthropicWithRetry, AnthropicRateLimitError } from '../_shared/anthropic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = 'claude-haiku-4-5-20251001'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INPUT_COST_PER_1M = 1.0
const OUTPUT_COST_PER_1M = 5.0
const APP_VERSION = '1.20.0'
const DEPLOYED_AT = '2026-04-26T00:00:00Z'

const MIN_INTAKE_CHARS = 12

// ─── Tool definitions ───────────────────────────────────────────────────────

const INTAKE_TOOL = {
  name: 'extract_event_signals',
  description: 'Extract structured event-planning signals from a free-text description.',
  input_schema: {
    type: 'object',
    properties: {
      archetype: {
        type: ['string', 'null'],
        enum: [
          'family-dinner',
          'holiday',
          'reunion',
          'birthday',
          'potluck',
          'picnic',
          'housewarming',
          'activity-day',
          'other',
          null,
        ],
        description: 'Best-fit archetype if the prose strongly implies one.',
      },
      headcountAdults: { type: ['integer', 'null'] },
      headcountKids: { type: ['integer', 'null'] },
      venue: { type: ['string', 'null'], enum: ['indoor', 'outdoor', 'both', null] },
      durationHours: { type: ['number', 'null'] },
      budget: {
        type: ['string', 'null'],
        enum: ['shoestring', 'modest', 'comfortable', 'premium', null],
      },
      foodStyle: {
        type: ['string', 'null'],
        enum: ['host-cooks', 'potluck', 'catered', 'guest-chef', 'mixed', 'no-food', null],
      },
      specialGuests: {
        type: 'array',
        items: { type: 'string' },
        description: 'e.g. ["local-band","guest-chef","magician"]',
      },
      kidActivities: {
        type: 'array',
        items: { type: 'string' },
        description: 'e.g. ["bouncy-house","face-painting"]',
      },
      diet: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      clarifyingQuestion: {
        type: ['string', 'null'],
        description: 'Single targeted question if the brief is genuinely too vague.',
      },
    },
    required: [],
  },
}

const PROPOSE_TOOL = {
  name: 'generate_event_plan',
  description:
    'Generate a complete event plan: dishes, supplies, tasks (with timeline), and activities. Tune everything to the structured answers + circle context.',
  input_schema: {
    type: 'object',
    properties: {
      dishes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: {
              type: 'string',
              enum: ['starter', 'main', 'side', 'dessert', 'drink', 'other'],
            },
            quantity: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'] },
            claimable: { type: 'boolean' },
          },
          required: ['name'],
        },
      },
      supplies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'] },
            claimable: { type: 'boolean' },
          },
          required: ['name'],
        },
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            due_when: {
              type: 'string',
              description:
                'e.g. "6 weeks before", "2 weeks before", "week before", "day before", "day-of"',
            },
            notes: { type: ['string', 'null'] },
            assignable: { type: 'boolean' },
          },
          required: ['name', 'due_when'],
        },
      },
      activities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            slug: { type: ['string', 'null'] },
            when: {
              type: 'string',
              enum: ['arrival', 'during meal', 'after meal', 'closing', 'pre-event', 'cleanup'],
            },
            notes: { type: ['string', 'null'] },
          },
          required: ['name', 'when'],
        },
      },
      timeline_summary: { type: 'string' },
      clarifying_question: { type: ['string', 'null'] },
    },
    required: ['dishes', 'supplies', 'tasks', 'activities', 'timeline_summary'],
  },
}

const REVISE_TOOL = {
  ...PROPOSE_TOOL,
  name: 'revise_event_plan',
  description:
    'Apply the user instruction to the existing plan and return the FULL updated plan (additions, deletions, edits — return everything that should remain).',
}

// ─── System prompts ─────────────────────────────────────────────────────────

const INTAKE_SYSTEM = `You are an extraction engine. Read the user's free-text event description and call extract_event_signals once with everything you can confidently infer.

Rules:
• If you cannot infer a field, omit it (or pass null) — do NOT guess.
• Map common phrases to canonical values:
   - "potluck"/"everyone brings" → foodStyle: "potluck"
   - "I'll cook"/"home-cooked" → foodStyle: "host-cooks"
   - "catered"/"caterer" → foodStyle: "catered"
   - "guest chef"/"private chef" → foodStyle: "guest-chef"
   - "park"/"backyard"/"garden"/"beach" → venue: "outdoor"
   - "house"/"indoors"/"restaurant" → venue: "indoor"
   - "bouncy house"/"inflatable" → kidActivities: ["bouncy-house"]
   - "magician" → kidActivities: ["magician"], specialGuests: ["magician"]
   - "band"/"live music" → specialGuests: ["local-band"]
   - "DJ" → specialGuests: ["dj"]
   - "photographer" → specialGuests: ["photographer"]
• Numbers: parse "100 people" → headcountAdults: 100. Parse "with 12 kids" → headcountKids: 12.
• Only set clarifyingQuestion if the prose is genuinely too sparse (under ~10 words OR no archetype hint). Otherwise null.
• Never invent a clarifying_question for descriptive prose just because the user didn't mention every detail.`

const PROPOSE_SYSTEM = `You are an expert event planner for Replanish, a US-first family + friends coordination app.

You will receive structured answers from a questionnaire AND optional circle context. Generate a plan tuned to the answers — never copy-paste a template.

## Output rules
• dishes — only if foodStyle ≠ no-food. Quantity scales by headcount. Tag dish.type. Mark claimable: true for items guests can bring (potluck or mixed); claimable: false when host cooks.
• supplies — practical bring-list. Quantities scale by headcount. Skip items the venue obviously already has.
• tasks — every task has due_when from this set: "6 weeks before", "4 weeks before", "3 weeks before", "2 weeks before", "week before", "day before", "day-of", "cleanup".
   - Vendors and bookings: 4-6 weeks before.
   - Invites + RSVPs: 2 weeks before.
   - Shopping + prep: day before.
   - Setup, food prep, photos: day-of.
• activities — 3-6 atmosphere moments tuned to archetype + kids + special guests. The "when" enum is non-negotiable. Use "arrival" for ice-breakers, "during meal" for toasts, "after meal" for games, "closing" for goodbyes/photos. Use "pre-event" only for vendor confirmation calls. Use "cleanup" only for breakdown tasks (rare in activities).
• timeline_summary — 2-4 sentence narrative of what to do weeks vs days vs day-of.

## Tuning
• budget=shoestring → DIY, borrow, no rentals; potluck heavy.
• budget=premium → catering, photographer, professional rentals.
• outdoor + headcount ≥ 25 → suggest tent/canopy + porta-potty + extra parking signage.
• kids ≥ 3 → at least one kid-focused activity (catalog suggestions: magician, bouncy house, face painting, treasure hunt, craft station, piñata).
• special guest = local-band/dj/speaker → AV check task, power outlet supply, sound check time.
• guest-chef → confirm dietary restrictions task, prep station supply, ingredient shopping task.
• reunion + headcount ≥ 12 → travel/lodging coordination task.

## Cultural context
Use the event description + circle context to infer cultural context — Christmas guidance for Christmas, Passover for Passover, BBQ for BBQ. Never assume from location alone.

## Clarifying question
Set clarifying_question to null unless the answers are internally contradictory (e.g. budget=shoestring + foodStyle=catered for 100 people). One short question max.`

const REVISE_SYSTEM = `You revise an existing event plan based on the user's instruction. Return the FULL updated plan (everything that should remain — additions, deletions, edits).

Rules:
• Preserve unmodified items by including them in the response unchanged.
• Honor the instruction precisely (e.g. "make it cheaper" → swap catered → potluck, drop premium vendors).
• Use the same shape as generate_event_plan.
• Set clarifying_question only when the instruction conflicts with prior answers.`

// ─── Handler ────────────────────────────────────────────────────────────────

interface IntakeRequest {
  op: 'intake'
  freeText: string
  knownAnswers?: Record<string, unknown>
}

interface ProposeRequest {
  op: 'propose'
  eventId: string
  circleId: string | null
  archetype: string
  answers: Record<string, unknown>
  existingItems?: Array<{ type: string; name: string }>
  sessionId?: string
}

interface ReviseRequest {
  op: 'revise'
  eventId: string
  circleId: string | null
  archetype: string
  answers: Record<string, unknown>
  draft: Record<string, unknown>
  instruction: string
  sessionId?: string
}

type EngineRequest = IntakeRequest | ProposeRequest | ReviseRequest

function rateLimitedResponse(err: AnthropicRateLimitError) {
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
        'Content-Type': 'application/json',
        'retry-after': String(Math.ceil(err.retryAfterMs / 1000)),
      },
    },
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method === 'GET') {
    const url = new URL(req.url)
    if (url.searchParams.get('ping') === '1') {
      return new Response(
        JSON.stringify({ fn: 'event-engine', version: APP_VERSION, model: MODEL, deployedAt: DEPLOYED_AT }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AI not configured', code: 'NO_AI_KEY' }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as EngineRequest
    if (!body || typeof body !== 'object' || !('op' in body)) {
      return new Response(JSON.stringify({ error: 'op required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.op === 'intake') return await handleIntake(body)
    if (body.op === 'propose') return await handlePropose(body, supabase)
    if (body.op === 'revise') return await handleRevise(body, supabase)

    return new Response(JSON.stringify({ error: 'Unknown op' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    if (err instanceof AnthropicRateLimitError) return rateLimitedResponse(err)
    return new Response(JSON.stringify({ error: (err as Error).message ?? 'unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Op handlers ────────────────────────────────────────────────────────────

async function handleIntake(req: IntakeRequest): Promise<Response> {
  const text = (req.freeText ?? '').trim()
  if (text.length < MIN_INTAKE_CHARS) {
    return jsonResponse({
      intake: { tags: [], clarifyingQuestion: null },
      _ai_usage: zeroUsage(),
    })
  }
  const userMessage = `Free-text event description:
${text}

Known structured answers (do not contradict): ${JSON.stringify(req.knownAnswers ?? {})}

Call extract_event_signals once with everything you can confidently infer.`

  const result = await anthropicWithRetry(ANTHROPIC_API_KEY!, {
    model: MODEL,
    max_tokens: 1024,
    system: INTAKE_SYSTEM,
    tools: [INTAKE_TOOL],
    tool_choice: { type: 'tool', name: 'extract_event_signals' },
    messages: [{ role: 'user', content: userMessage }],
  })
  const tool = result.content?.find((b) => b.type === 'tool_use')
  const intake = tool?.input ?? {}

  const tokensIn = result.usage?.input_tokens ?? 0
  const tokensOut = result.usage?.output_tokens ?? 0

  return jsonResponse({
    intake,
    _ai_usage: {
      model: MODEL,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: dollarCost(tokensIn, tokensOut),
      scope: 'event-intake',
    },
  })
}

async function handlePropose(
  req: ProposeRequest,
  supabase: ReturnType<typeof createClient>,
): Promise<Response> {
  const block = req.circleId ? (await loadCircleContext(supabase, req.circleId)).block : ''
  const userMessage = buildProposeUserMessage(req, block)

  const result = await anthropicWithRetry(ANTHROPIC_API_KEY!, {
    model: MODEL,
    max_tokens: 4096,
    system: PROPOSE_SYSTEM,
    tools: [PROPOSE_TOOL],
    tool_choice: { type: 'tool', name: 'generate_event_plan' },
    messages: [{ role: 'user', content: userMessage }],
  })

  const tool = result.content?.find((b) => b.type === 'tool_use')
  const propose = tool?.input ?? {
    dishes: [],
    supplies: [],
    tasks: [],
    activities: [],
    timeline_summary: '',
    clarifying_question:
      'I had trouble generating a plan. Could you describe the event in a sentence or two so I can try again?',
  }

  const tokensIn = result.usage?.input_tokens ?? 0
  const tokensOut = result.usage?.output_tokens ?? 0

  return jsonResponse({
    propose,
    _ai_usage: {
      model: MODEL,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: dollarCost(tokensIn, tokensOut),
      session_id: req.sessionId,
      scope: 'event-propose',
    },
  })
}

async function handleRevise(
  req: ReviseRequest,
  supabase: ReturnType<typeof createClient>,
): Promise<Response> {
  const block = req.circleId ? (await loadCircleContext(supabase, req.circleId)).block : ''
  const userMessage = `${block ? `${block}\n\n` : ''}Archetype: ${req.archetype}
Answers: ${JSON.stringify(req.answers)}
Existing draft: ${JSON.stringify(req.draft)}
Instruction: ${req.instruction}

Apply the instruction precisely and return the FULL updated plan via revise_event_plan.`

  const result = await anthropicWithRetry(ANTHROPIC_API_KEY!, {
    model: MODEL,
    max_tokens: 4096,
    system: REVISE_SYSTEM,
    tools: [REVISE_TOOL],
    tool_choice: { type: 'tool', name: 'revise_event_plan' },
    messages: [{ role: 'user', content: userMessage }],
  })
  const tool = result.content?.find((b) => b.type === 'tool_use')
  const revise = tool?.input ?? req.draft

  const tokensIn = result.usage?.input_tokens ?? 0
  const tokensOut = result.usage?.output_tokens ?? 0

  return jsonResponse({
    revise,
    _ai_usage: {
      model: MODEL,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: dollarCost(tokensIn, tokensOut),
      session_id: req.sessionId,
      scope: 'event-revise',
    },
  })
}

function buildProposeUserMessage(req: ProposeRequest, contextBlock: string): string {
  const a = req.answers
  const lines: string[] = []
  if (contextBlock) {
    lines.push(contextBlock)
    lines.push('')
    lines.push(
      'The circle context above is the source of truth — when this prompt is silent on diet/style/venue, ground on it.',
    )
    lines.push('')
  }
  lines.push(`Archetype: ${req.archetype}`)
  if (a.headcount_adults || a.headcount_kids) {
    const adults = typeof a.headcount_adults === 'number' ? a.headcount_adults : 0
    const kids = typeof a.headcount_kids === 'number' ? a.headcount_kids : 0
    lines.push(`Headcount: ${adults} adults${kids > 0 ? ` + ${kids} kids` : ''}`)
  }
  if (a.kid_age_band) lines.push(`Kid ages: ${a.kid_age_band}`)
  if (a.venue) lines.push(`Venue: ${a.venue}`)
  if (a.duration_hours) lines.push(`Duration: ~${a.duration_hours}h`)
  if (a.budget_tier) lines.push(`Budget: ${a.budget_tier}`)
  if (a.food_style) lines.push(`Food style: ${a.food_style}`)
  if (a.dietary_mix && Array.isArray(a.dietary_mix) && (a.dietary_mix as string[]).length)
    lines.push(`Dietary: ${(a.dietary_mix as string[]).join(', ')}`)
  if (a.special_guest && Array.isArray(a.special_guest) && (a.special_guest as string[]).length)
    lines.push(`Special guests: ${(a.special_guest as string[]).join(', ')}`)
  if (a.kid_activities && Array.isArray(a.kid_activities) && (a.kid_activities as string[]).length)
    lines.push(`Kid activities chosen: ${(a.kid_activities as string[]).join(', ')}`)
  if (a.rain_plan) lines.push(`Rain plan: ${a.rain_plan}`)
  if (a.parking_seating && Array.isArray(a.parking_seating))
    lines.push(`Logistics needs: ${(a.parking_seating as string[]).join(', ')}`)
  if (a.tent_canopy === true) lines.push('Tent / canopy: yes')
  if (a.power_ice === true) lines.push('Outdoor power + ice: yes')
  if (a.av_setup === true) lines.push('AV setup: yes')
  if (a.travel_lodging) lines.push(`Travel/lodging: ${a.travel_lodging}`)
  if (a.photo_keepsake === true) lines.push('Photo keepsake desired: yes')
  if (a.helpers_count) lines.push(`Helpers available: ${a.helpers_count}`)
  if (a.setup_window) lines.push(`Setup window: ${a.setup_window}`)
  if (req.existingItems?.length) {
    lines.push('')
    lines.push(
      `Existing items already on this event (do NOT duplicate): ${req.existingItems
        .map((it) => `${it.type}:${it.name}`)
        .join('; ')}`,
    )
  }
  lines.push('')
  lines.push('Generate the plan via generate_event_plan.')
  return lines.join('\n')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function dollarCost(tokensIn: number, tokensOut: number): number {
  return Math.round(
    ((tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M) *
      1_000_000,
  ) / 1_000_000
}

function zeroUsage() {
  return { model: 'none', tokens_in: 0, tokens_out: 0, cost_usd: 0 }
}

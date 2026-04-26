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
const INPUT_COST_PER_1M = 1.00
const OUTPUT_COST_PER_1M = 5.00
const APP_VERSION = '1.16.0'
const DEPLOYED_AT = '2026-04-25T00:00:00Z'

// v1.16.0: minimum brief length to attempt AI planning. Below this, return
// a clarifying question without burning a Claude call.
const MIN_BRIEF_CHARS = 20

/**
 * v1.16.0: deterministic stub plan when Anthropic returns no tool_use.
 * Better than throwing — the user gets *something* and a Refresh button.
 * Quantities scale linearly off headcount; copy is intentionally minimal.
 */
function buildStubPlan(opts: { headcountAdults: number; headcountKids: number; budget: string; title: string }) {
  const total = opts.headcountAdults + opts.headcountKids
  const safeTotal = Math.max(1, total)
  const dishCount = Math.max(1, Math.ceil(safeTotal / 5))
  return {
    dishes: Array.from({ length: dishCount }).map((_, i) => ({
      name: i === 0 ? 'Main course' : i === dishCount - 1 ? 'Dessert' : 'Side dish',
      type: i === 0 ? 'main' : i === dishCount - 1 ? 'dessert' : 'side',
      claimable: true,
      notes: `Serves ~${Math.ceil(safeTotal / dishCount)}`,
    })),
    supplies: [
      { name: 'Plates', quantity: `${safeTotal}`, claimable: false },
      { name: 'Cups', quantity: `${safeTotal * 2}`, claimable: false },
      { name: 'Napkins', quantity: `${safeTotal * 2}`, claimable: false },
      { name: 'Utensils', quantity: `${safeTotal} sets`, claimable: false },
    ],
    tasks: [
      { title: 'Send invites and confirm RSVPs', due_when: '2 weeks before', assignable: true },
      { title: 'Shop for groceries', due_when: 'day before', assignable: true },
      { title: 'Set up space and plate food', due_when: 'day of', assignable: false },
    ],
    activities: [],
    timeline_summary: 'AI did not respond — this is a minimum starter plan. Hit refresh to try again.',
    clarifying_question: null,
    _fallback: true,
  }
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

const EVENT_PLAN_TOOL = {
  name: 'generate_event_plan',
  description: 'Generate a comprehensive event plan with tasks, supplies, dishes, timeline, and optional clarifying question',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            due_when: { type: 'string', description: 'e.g. "2 weeks before", "day before", "day of"' },
            assignable: { type: 'boolean', description: 'Can be delegated to a guest' },
            notes: { type: 'string' },
          },
          required: ['title', 'due_when'],
        },
      },
      supplies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'string', description: 'e.g. "1 pack", "enough for 20 people"' },
            claimable: { type: 'boolean', description: 'Guests can volunteer to bring this' },
          },
          required: ['name'],
        },
      },
      dishes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['starter', 'main', 'side', 'dessert', 'drink', 'other'] },
            claimable: { type: 'boolean', description: 'Guests can volunteer to bring this' },
            notes: { type: 'string', description: 'Dietary notes, serves X, etc.' },
          },
          required: ['name', 'type'],
        },
      },
      activities: {
        type: 'array',
        description: 'Activities, games, ice-breakers, and atmosphere moments for the event. Tune to event type and headcount kids.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'e.g. "Musical Chairs", "Welcome cocktail toast", "Group photo on the porch"' },
            when: { type: 'string', enum: ['arrival', 'during meal', 'after meal', 'closing'] },
            notes: { type: 'string', description: 'Materials needed, age range, time required, or playlist guidance' },
          },
          required: ['name', 'when'],
        },
      },
      timeline_summary: {
        type: 'string',
        description: 'A short narrative timeline overview (2-4 sentences): what to do weeks ahead, days ahead, day of.',
      },
      clarifying_question: {
        type: ['string', 'null'],
        description: 'If the event brief is too vague to plan well, ask ONE clarifying question. Otherwise null.',
      },
    },
    required: ['tasks', 'supplies', 'dishes', 'timeline_summary'],
  },
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const EVENT_PLANNING_GUIDE = `You are an expert event planner AI for OurTable, a household coordination app.

## Your Role
Help families and households plan events of any kind — from simple birthday dinners to large outdoor gatherings, holidays, potlucks, school events, and more.

## How to Guide (not just execute)
- Read the event description carefully and infer what kind of event it is — never force it into a template.
- Flag things the user likely hasn't thought about ("for 25 people outdoors in warm weather, you'll need shade — have you considered a tent or morning timing?")
- Give a prioritized timeline: what must be done weeks ahead vs. days before vs. day of.
- Suggest practical alternatives when something seems out of scope or expensive.
- Respect the stated budget. Low budget = suggest DIY alternatives, borrow instead of buy, potluck-style food.

## Cultural Context (IMPORTANT)
- Use the event description and location to infer cultural context — never assume from the user's location alone.
- A user in Israel planning a Christmas party should get Christmas guidance.
- A user in Texas hosting a Passover seder should get Passover guidance.
- A user hosting a BBQ should get BBQ guidance regardless of where they are.
- Default to helpful general guidance when cultural context is unclear.

## Task Planning Principles
- Tasks that must be booked weeks/months ahead: venue, catering, entertainment, large tent rentals, travel.
- Tasks 1-2 weeks before: invitations/RSVPs confirmed, order specialty items, plan parking.
- Tasks days before: shop for food, prep decorations, confirm with vendors, make dish assignments.
- Day-of tasks: setup, food prep, guest logistics, cleanup crew.
- Delegate shamelessly — list tasks that guests can easily take on.

## Food Safety for Events
- For outdoor or buffet events: suggest keeping hot food hot and cold food cold. Note which dishes travel well.
- For large groups: scale ingredients conservatively (plan for 10-15% more than headcount).
- Label dishes for dietary restrictions when serving mixed groups.

## The One-Question Rule
If the event description is vague (e.g., just "birthday party" with no other context), ask ONE clarifying question that will most improve the plan. Do not ask multiple questions at once. Return it in the clarifying_question field.

## Budget Guidelines
- Low budget: potluck-style food, DIY decorations, Bluetooth speaker, borrowed items.
- Medium budget: mix of catered and homemade, rented basics, modest entertainment.
- High budget: professional catering, full venue setup, entertainment, photography.
- "No idea": plan as medium budget unless the description implies otherwise.

## Activities & Atmosphere
For any social event, suggest 3–6 activities tuned to event type, headcount, and especially \`kids\` count. Examples:
- Kids parties (ages 4-10): age-appropriate games (musical chairs, treasure hunt, craft station), cake-cutting moment, take-home favors.
- Adult dinners: ice-breaker prompts at the table, music/playlist vibe, group photo, after-dinner game (e.g. trivia, charades).
- Holiday gatherings: cultural rituals (lighting candles, toasts, prayers), shared storytelling moment.
- Outdoor events: lawn games, group activity (frisbee, photo scavenger hunt).
- Field \`when\` is one of: \`arrival\`, \`during meal\`, \`after meal\`, \`closing\`.
- Skip activities only for purely transactional events (carpool, errand, schedule). For all others, populate at least 3 entries.`

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // v1.16.0: health probe so the client can detect a stale Supabase deploy.
  // The v1.15.7 "still failing after fix" bug was exactly this: code fixed
  // in source, never deployed. Now we can spot the gap from the client.
  if (req.method === 'GET') {
    const url = new URL(req.url)
    if (url.searchParams.get('ping') === '1') {
      return new Response(
        JSON.stringify({
          fn: 'plan-event',
          version: APP_VERSION,
          model: MODEL,
          deployedAt: DEPLOYED_AT,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  if (!ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: 'AI not configured', code: 'NO_AI_KEY' }), { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const {
      eventId,
      circleId,
      description,
      headcountAdults = 0,
      headcountKids = 0,
      budget = 'medium',
      helpNeeded = [],
      keyRequirements = '',
      sessionId,
      featureContext = 'event_detail',
    } = await req.json()

    if (!eventId || !circleId) return new Response(JSON.stringify({ error: 'eventId and circleId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Fetch event details
    const { data: event } = await supabase
      .from('events')
      .select('title, date, location, description, headcount_adults, headcount_kids')
      .eq('id', eventId)
      .single()

    // Load circle purpose + structured context (event details captured at setup, diet, etc.)
    const { block: circleContextBlock } = await loadCircleContext(supabase, circleId)

    // v1.16.0: input-validation short-circuit. If the brief is too sparse to
    // generate a useful plan, ask a clarifying question instead of burning
    // a Claude call. Counts description + keyRequirements + event.description.
    const briefLen = (description ?? '').length + (keyRequirements ?? '').length + (event?.description ?? '').length
    if (briefLen < MIN_BRIEF_CHARS) {
      const stubPlan = {
        dishes: [],
        supplies: [],
        tasks: [],
        activities: [],
        timeline_summary: '',
        clarifying_question: 'Tell me more — how many guests, any dietary needs, indoor or outdoor, and what kind of vibe (formal/casual)?',
      }
      return new Response(
        JSON.stringify({
          plan: stubPlan,
          _ai_usage: {
            model: 'none',
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: 0,
            session_id: sessionId,
            feature_context: featureContext,
            scope: 'plan',
            short_circuited: 'brief_too_short',
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Build user message
    const totalHeadcount = (headcountAdults || event?.headcount_adults || 0) + (headcountKids || event?.headcount_kids || 0)

    const userMessage = `${circleContextBlock ? `${circleContextBlock}\n\nThe circle context above is the source of truth — use it to ground date/venue/style/diet decisions when this event prompt is silent.\n\n` : ''}Plan this event:
Event: ${event?.title || 'Unknown event'}
Date: ${event?.date ? new Date(event.date).toLocaleDateString() : 'TBD'}
Location: ${event?.location || 'Not specified'}
Description: ${description || event?.description || 'No description provided'}
Headcount: ${totalHeadcount > 0 ? `${headcountAdults || event?.headcount_adults || 0} adults${(headcountKids || event?.headcount_kids || 0) > 0 ? `, ${headcountKids || event?.headcount_kids} kids` : ''}` : 'Not specified'}
Budget: ${budget}
Help needed: ${helpNeeded.length > 0 ? helpNeeded.join(', ') : 'general planning'}
Key requirements: ${keyRequirements || 'none specified'}`

    // v1.16.0: shared retry helper replaces raw fetch — gives us 429/5xx
    // retry + retry-after honoring + structured rate-limit error class.
    const result = await anthropicWithRetry(ANTHROPIC_API_KEY, {
      model: MODEL,
      max_tokens: 4096,
      system: EVENT_PLANNING_GUIDE,
      tools: [EVENT_PLAN_TOOL],
      tool_choice: { type: 'tool', name: 'generate_event_plan' },
      messages: [{ role: 'user', content: userMessage }],
    })

    const toolUse = result.content?.find((block) => block.type === 'tool_use')
    let plan: Record<string, unknown>
    let isFallback = false
    if (!toolUse || !toolUse.input) {
      // v1.16.0: deterministic stub instead of throwing — user gets a usable
      // starter plan with `_fallback: true`, can hit Refresh to try again.
      console.warn('[plan-event] no tool_use; returning stub plan')
      plan = buildStubPlan({
        headcountAdults,
        headcountKids,
        budget,
        title: event?.title ?? 'event',
      })
      isFallback = true
    } else {
      plan = toolUse.input
    }

    const tokensIn = result.usage?.input_tokens || 0
    const tokensOut = result.usage?.output_tokens || 0
    const cost = (tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M

    return new Response(
      JSON.stringify({
        plan,
        _ai_usage: {
          model: MODEL,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
          session_id: sessionId,
          feature_context: featureContext,
          scope: 'plan',
          ...(isFallback ? { fallback: 'no_tool_use' } : {}),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    // v1.16.0: surface rate-limit errors with status 429 + retry-after.
    if (err instanceof AnthropicRateLimitError) {
      console.warn(`[plan-event] rate-limited; retry after ${err.retryAfterMs}ms`)
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
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

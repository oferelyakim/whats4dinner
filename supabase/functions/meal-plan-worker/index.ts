// v1.18.0 — Meal-plan async worker.
//
// Fired by:
//   (a) immediate POST from `meal-plan-jobs.ts:triggerWorker()` after a job
//       is enqueued — saves up to a 2-minute wait on first slot.
//   (b) pg_cron every 2 minutes via `33_cron_meal_plan_worker.sql` — picks
//       up stuck jobs and any work the immediate trigger missed.
//
// Each invocation:
//   1. Sweeps stuck jobs (>10 min in 'running') → mark 'failed'.
//   2. Claims one job via `claim_next_meal_plan_job()` (FOR UPDATE SKIP
//      LOCKED — safe across concurrent workers).
//   3. Processes pending slots one at a time within a 60s self-budget.
//      For each slot: bank lookup first, then chained Stage A→B→C via the
//      existing `meal-engine` edge function ops (HTTP-called, no logic
//      duplication). Writes the resulting Recipe shape into
//      `meal_plan_job_slots.result` so the client picks it up via
//      Realtime and writes it into Dexie.
//   4. On AnthropicRateLimitError: rolls slot back to 'pending', flips
//      job back to 'queued', exits with 429 + retryAfterMs so cron picks
//      it up again after the wait.
//   5. When all slots done → marks job 'completed' (or 'failed' if any
//      slot failed).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const APP_VERSION = '1.18.2'
const DEPLOYED_AT = '2026-04-26T13:00:00Z'

const INVOCATION_BUDGET_MS = 60_000
const STUCK_JOB_TIMEOUT_MS = 10 * 60_000
// Per-slot stuck timeout. If a slot has been 'in_progress' for longer than
// this, the worker that claimed it has either crashed (edge function timeout
// killed the deno isolate) or stalled (slow Anthropic call). Roll it back to
// 'pending' so the next worker invocation can retry it. v1.18.1.
const STUCK_SLOT_TIMEOUT_MS = 3 * 60_000
const MAX_SLOT_ATTEMPTS = 3

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

// ─── meal-engine HTTP client ──────────────────────────────────────────────
// We call the existing meal-engine ops via HTTP rather than re-importing them.
// Trade-off: ~50ms extra/op — negligible vs Anthropic latency, big win on
// code-duplication risk. Plus the meal-engine retry helper handles 429s.

const MEAL_ENGINE_URL = `${SUPABASE_URL}/functions/v1/meal-engine`

interface MealEngineResult {
  status: number
  ok: boolean
  retryAfterMs?: number
  body: unknown
}

async function callMealEngine(op: string, payload: Record<string, unknown>): Promise<MealEngineResult> {
  const res = await fetch(MEAL_ENGINE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Worker uses service role so it bypasses RLS where the meal-engine
      // server-side checks aren't gating user-owned data.
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: ANON_KEY || SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ op, ...payload }),
  })
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  let retryAfterMs: number | undefined
  if (res.status === 429) {
    const parsedBody = body as { retryAfterMs?: number }
    retryAfterMs = parsedBody?.retryAfterMs
    if (!retryAfterMs) {
      const headerVal = res.headers.get('retry-after')
      if (headerVal) {
        const seconds = Number(headerVal)
        if (Number.isFinite(seconds)) retryAfterMs = seconds * 1000
      }
    }
    if (!retryAfterMs) retryAfterMs = 5000
  }
  return { status: res.status, ok: res.ok, retryAfterMs, body }
}

class WorkerRateLimitedError extends Error {
  retryAfterMs: number
  constructor(retryAfterMs: number) {
    super(`Anthropic rate-limited; retry after ${retryAfterMs}ms`)
    this.name = 'WorkerRateLimitedError'
    this.retryAfterMs = retryAfterMs
  }
}

// ─── Slot generation pipeline (server-side mirror of MealPlanEngine) ──────
// Mirrors src/engine/MealPlanEngine.ts:generateSlot — bank-first, then
// Stage A → B → C. Returns a Recipe shape (matches src/engine/types.ts).

interface SlotJob {
  id: string
  job_id: string
  slot_id: string
  meal_id: string
  day_id: string
  slot_role: string
  meal_type: string
  envelope: Record<string, unknown>
  dietary_constraints: string[]
  disliked_ingredients: string[]
  recent_dish_names: string[]
  attempts: number
}

async function generateSlotResult(slot: SlotJob): Promise<Record<string, unknown>> {
  // ── Bank-first ────────────────────────────────────────────────────────
  const bankRes = await callMealEngine('sample-from-bank', {
    mealType: slot.meal_type,
    slotRole: slot.slot_role,
    cuisineIds: [],
    dietaryTags: slot.dietary_constraints,
    dislikedIngredients: slot.disliked_ingredients,
    recentDishNames: slot.recent_dish_names,
    limit: 5,
  })
  if (bankRes.ok && bankRes.body && typeof bankRes.body === 'object') {
    const candidates = (bankRes.body as { candidates: Array<Record<string, unknown>> }).candidates
    if (Array.isArray(candidates) && candidates.length > 0) {
      // Return the top candidate's recipe (sibling-conflict filtering is
      // best-effort here; client-side filter on receipt also runs).
      const c = candidates[0]
      const recipe = c.recipe as Record<string, unknown>
      return { ...recipe, _ingredient: c.ingredientMain, _bankId: c.bankId }
    }
  }

  // ── Stage A: ingredient ──────────────────────────────────────────────
  const ingRes = await callMealEngine('ingredient', {
    slotRole: slot.slot_role,
    mealType: slot.meal_type,
    envelope: slot.envelope,
    dietaryConstraints: slot.dietary_constraints,
    dislikedIngredients: slot.disliked_ingredients,
    pantryItems: [],
    recentDishes: slot.recent_dish_names,
    siblingSlots: [],
  })
  if (ingRes.status === 429 && ingRes.retryAfterMs) throw new WorkerRateLimitedError(ingRes.retryAfterMs)
  if (!ingRes.ok) throw new Error(`Stage A failed: ${ingRes.status} ${JSON.stringify(ingRes.body).slice(0, 200)}`)
  const ingredient = ((ingRes.body as { ingredient: string }).ingredient || '').trim()
  if (!ingredient) throw new Error('Stage A returned empty ingredient')

  // ── Stage B: dish + keywords ─────────────────────────────────────────
  const dishRes = await callMealEngine('dish', {
    slotRole: slot.slot_role,
    mealType: slot.meal_type,
    ingredient,
    envelope: slot.envelope,
    dietaryConstraints: slot.dietary_constraints,
    recentDishes: slot.recent_dish_names,
  })
  if (dishRes.status === 429 && dishRes.retryAfterMs) throw new WorkerRateLimitedError(dishRes.retryAfterMs)
  if (!dishRes.ok) throw new Error(`Stage B failed: ${dishRes.status} ${JSON.stringify(dishRes.body).slice(0, 200)}`)
  const dishBody = dishRes.body as { dishName: string; searchKeywords: string[] }
  const dishName = (dishBody.dishName || '').trim()
  const searchKeywords = Array.isArray(dishBody.searchKeywords) ? dishBody.searchKeywords : [dishName]
  if (!dishName) throw new Error('Stage B returned empty dishName')

  // ── Stage C: find-or-compose recipe ──────────────────────────────────
  const recipeRes = await callMealEngine('find-recipe', {
    dishName,
    searchKeywords,
    dietaryConstraints: slot.dietary_constraints,
    ingredient,
  })
  if (recipeRes.status === 429 && recipeRes.retryAfterMs) throw new WorkerRateLimitedError(recipeRes.retryAfterMs)
  if (!recipeRes.ok) throw new Error(`Stage C failed: ${recipeRes.status} ${JSON.stringify(recipeRes.body).slice(0, 200)}`)
  const recipeBody = recipeRes.body as { recipe?: Record<string, unknown> }
  if (!recipeBody?.recipe) throw new Error('Stage C returned no recipe')

  return { ...recipeBody.recipe, _ingredient: ingredient, _dishName: dishName, _searchKeywords: searchKeywords }
}

// ─── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.method === 'GET') {
    const url = new URL(req.url)
    if (url.searchParams.get('ping') === '1') {
      return new Response(
        JSON.stringify({
          fn: 'meal-plan-worker',
          version: APP_VERSION,
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

  // 1. Sweep stuck jobs.
  const stuckCutoff = new Date(Date.now() - STUCK_JOB_TIMEOUT_MS).toISOString()
  await supabase
    .from('meal_plan_jobs')
    .update({ status: 'failed', error_message: 'timeout', finished_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('started_at', stuckCutoff)

  // 1b. Sweep stuck slots — those left 'in_progress' by a crashed worker
  // beyond the per-slot timeout. Roll them back to 'pending' (without
  // bumping attempts; the previous claim already bumped it) so the next
  // worker invocation can retry. Without this, a single edge-function
  // process kill leaves a slot orphaned forever and blocks job completion.
  // v1.18.1.
  const stuckSlotCutoff = new Date(Date.now() - STUCK_SLOT_TIMEOUT_MS).toISOString()
  await supabase
    .from('meal_plan_job_slots')
    .update({ status: 'pending', started_at: null })
    .eq('status', 'in_progress')
    .lt('started_at', stuckSlotCutoff)

  // 2. Claim one queued/running job.
  const { data: claimedJob, error: claimErr } = await supabase.rpc('claim_next_meal_plan_job')
  if (claimErr) {
    console.error('[meal-plan-worker] claim error:', claimErr.message)
    return new Response(JSON.stringify({ ok: false, error: claimErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
  if (!claimedJob) {
    return new Response(JSON.stringify({ ok: true, message: 'no jobs' }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
  const jobId: string = (claimedJob as { id: string }).id

  let processedThisRun = 0
  let failedThisRun = 0

  // 3. Process slots in a tight loop within budget.
  while (Date.now() - startMs < INVOCATION_BUDGET_MS) {
    // Cancellation check.
    const { data: freshJob } = await supabase
      .from('meal_plan_jobs')
      .select('status')
      .eq('id', jobId)
      .single()
    if (freshJob?.status === 'cancelled') break

    // Claim next pending slot via FOR UPDATE SKIP LOCKED equivalent (atomic
    // status change to 'in_progress' wins the race). We do this in two steps
    // using `id` ordering for determinism.
    const { data: slot, error: slotErr } = await supabase
      .from('meal_plan_job_slots')
      .select('*')
      .eq('job_id', jobId)
      .eq('status', 'pending')
      .order('id')
      .limit(1)
      .maybeSingle<SlotJob>()

    if (slotErr || !slot) break

    // Atomic claim: only succeed if status is still 'pending' AND attempts
    // hasn't been bumped (covers concurrent worker overlap).
    const { data: claimed, error: claimSlotErr } = await supabase
      .from('meal_plan_job_slots')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        attempts: (slot.attempts ?? 0) + 1,
      })
      .eq('id', slot.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (claimSlotErr || !claimed) {
      // Another worker grabbed it — try the next.
      continue
    }

    try {
      const result = await generateSlotResult(slot)

      // Mark slot done with result.
      await supabase
        .from('meal_plan_job_slots')
        .update({ status: 'done', result, finished_at: new Date().toISOString() })
        .eq('id', slot.id)

      // Bump job counter (manual SELECT+UPDATE — no RPC).
      // The earlier `.rpc(...).catch(...)` form crashed with "supabase.rpc(...)
      // .catch is not a function" because the builder isn't a Promise until
      // you await it; the catch then bubbled out of the success path and was
      // caught by the outer handler, which marked the just-completed slot as
      // failed. v1.18.1 hot-fix.
      {
        const { data: cur } = await supabase
          .from('meal_plan_jobs')
          .select('completed_slots')
          .eq('id', jobId)
          .single()
        await supabase
          .from('meal_plan_jobs')
          .update({ completed_slots: (cur?.completed_slots ?? 0) + 1 })
          .eq('id', jobId)
      }

      processedThisRun++
    } catch (err) {
      if (err instanceof WorkerRateLimitedError) {
        // Roll the slot BACK to pending and pause the job — cron retries.
        await supabase
          .from('meal_plan_job_slots')
          .update({ status: 'pending', started_at: null })
          .eq('id', slot.id)
        await supabase
          .from('meal_plan_jobs')
          .update({ status: 'queued' })
          .eq('id', jobId)
        return new Response(
          JSON.stringify({ ok: true, message: 'rate_limited', retryAfterMs: err.retryAfterMs, processed: processedThisRun }),
          { headers: { ...corsHeaders, 'content-type': 'application/json' } },
        )
      }
      const message = err instanceof Error ? err.message : String(err)
      const newAttempts = (slot.attempts ?? 0) + 1
      // Permanent fail after MAX_SLOT_ATTEMPTS — otherwise put back to pending.
      if (newAttempts >= MAX_SLOT_ATTEMPTS) {
        await supabase
          .from('meal_plan_job_slots')
          .update({ status: 'failed', error_message: message, finished_at: new Date().toISOString() })
          .eq('id', slot.id)
        const { data: cur } = await supabase
          .from('meal_plan_jobs')
          .select('failed_slots')
          .eq('id', jobId)
          .single()
        await supabase
          .from('meal_plan_jobs')
          .update({ failed_slots: (cur?.failed_slots ?? 0) + 1 })
          .eq('id', jobId)
        failedThisRun++
      } else {
        await supabase
          .from('meal_plan_job_slots')
          .update({ status: 'pending', error_message: message })
          .eq('id', slot.id)
      }
    }
  }

  // 4. Check if all slots are done; finalize the job if so.
  const { count: pendingCount } = await supabase
    .from('meal_plan_job_slots')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .in('status', ['pending', 'in_progress'])
  if ((pendingCount ?? 0) === 0) {
    const { count: failedCount } = await supabase
      .from('meal_plan_job_slots')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .eq('status', 'failed')
    const finalStatus = (failedCount ?? 0) > 0 ? 'failed' : 'completed'
    await supabase
      .from('meal_plan_jobs')
      .update({ status: finalStatus, finished_at: new Date().toISOString() })
      .eq('id', jobId)
  } else {
    // Hand off to next worker tick.
    await supabase
      .from('meal_plan_jobs')
      .update({ status: 'running' })
      .eq('id', jobId)
  }

  return new Response(
    JSON.stringify({ ok: true, jobId, processed: processedThisRun, failed: failedThisRun }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})

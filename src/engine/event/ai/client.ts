// Event Planner v2 — edge function client.
//
// A thin façade around supabase.functions.invoke('event-engine', ...) that
// (a) accepts a per-call AbortSignal, (b) maps 429s to PlannerRateLimitedError,
// (c) lets tests inject a deterministic mock so the picker tests can pretend
// AI exists without firing a real network call.
//
// Mirrors src/engine/ai/client.ts.

import type { ProposeResult, NLUResult } from './schemas'
import { ProposeResultSchema, NLUResultSchema } from './schemas'
import { PlannerRateLimitedError } from '../errors'

export type EventEngineOp = 'intake' | 'propose' | 'revise' | 'find-vendors'

export interface IntakeRequest {
  op: 'intake'
  freeText: string
  knownAnswers?: Record<string, unknown>
}

export interface ProposeRequest {
  op: 'propose'
  eventId: string
  circleId: string | null
  archetype: string
  answers: Record<string, unknown>
  /** When set, the worker grounds on previously-applied items. */
  existingItems?: Array<{ type: string; name: string }>
  sessionId?: string
}

export interface ReviseRequest {
  op: 'revise'
  eventId: string
  circleId: string | null
  archetype: string
  answers: Record<string, unknown>
  /** Free-text instruction from the user describing the desired edit. */
  instruction: string
  /** Current draft to revise. */
  draft: ProposeResult
  sessionId?: string
}

export type EventEngineRequest = IntakeRequest | ProposeRequest | ReviseRequest

export interface EventEngineResponse {
  intake?: NLUResult
  propose?: ProposeResult
  revise?: ProposeResult
  _ai_usage?: {
    model: string
    tokens_in: number
    tokens_out: number
    cost_usd: number
  }
}

export interface EventEngineCallOptions {
  signal?: AbortSignal
  /** Used by tests via __setEventEngineMock — overrides the real call. */
  mock?: (req: EventEngineRequest) => Promise<EventEngineResponse>
}

let __mock: EventEngineCallOptions['mock'] | null = null

/** Test hook — pass null to clear. */
export function __setEventEngineMock(fn: EventEngineCallOptions['mock'] | null) {
  __mock = fn
}

interface SupabaseFunctionsLike {
  functions: {
    invoke: (
      name: string,
      opts: { body?: unknown; headers?: Record<string, string> },
    ) => Promise<{ data: unknown; error: { message?: string; status?: number; context?: { status?: number } } | null }>
  }
}

export async function callEventEngine(
  supabase: SupabaseFunctionsLike,
  req: EventEngineRequest,
  opts: EventEngineCallOptions = {},
): Promise<EventEngineResponse> {
  const mock = opts.mock ?? __mock
  if (mock) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return await mock(req)
  }

  const { data, error } = await supabase.functions.invoke('event-engine', {
    body: req,
  })

  if (error) {
    // Supabase wraps the underlying status. Look for 429 + retryAfterMs to
    // surface as a rate-limit error so the engine can pause+retry sanely.
    const status = error.status ?? error.context?.status
    const body = (data as { retryAfterMs?: number } | null) ?? null
    if (status === 429) {
      throw new PlannerRateLimitedError(
        error.message ?? 'Rate limited',
        body?.retryAfterMs ?? 5000,
      )
    }
    throw new Error(error.message ?? 'event-engine failed')
  }
  return (data ?? {}) as EventEngineResponse
}

/** Validate + return the intake NLU portion of a response. */
export function parseIntake(resp: EventEngineResponse): NLUResult {
  const block = resp.intake ?? {}
  const r = NLUResultSchema.safeParse(block)
  if (!r.success) {
    return { tags: [] }
  }
  return r.data
}

/** Validate + return the propose portion of a response. */
export function parsePropose(resp: EventEngineResponse): ProposeResult {
  const block = resp.propose ?? resp.revise ?? {}
  const r = ProposeResultSchema.safeParse(block)
  if (!r.success) {
    // Fall back to a minimal shape — the engine will surface this as a
    // partial error, never crash the UI.
    return { dishes: [], supplies: [], tasks: [], activities: [], timeline_summary: '' }
  }
  return r.data
}

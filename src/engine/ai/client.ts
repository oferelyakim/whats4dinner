import { supabase } from '@/services/supabase'
import { z } from 'zod'
import { AbortedByUserError, RateLimitedError } from '../errors'

export interface MealEngineCallResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * v1.16.0: edge function now returns `_meta` with token usage so the
 * client-side TokenBudgetQueue can throttle proactively.
 */
export interface CallMeta {
  tokensIn?: number
  tokensOut?: number
  retryAfterMs?: number
  attempts?: number
}

function getSupabaseFnUrl(): string {
  const raw = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  return raw.replace(/\/$/, '')
}

let mockHandler: ((op: string, body: unknown) => Promise<unknown>) | null = null

export function __setMealEngineMock(h: ((op: string, body: unknown) => Promise<unknown>) | null) {
  mockHandler = h
}

async function call(op: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  if (mockHandler) {
    if (signal?.aborted) throw new AbortedByUserError()
    return await mockHandler(op, body)
  }

  const { data: sessionRes } = await supabase.auth.getSession()
  const token = sessionRes.session?.access_token
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

  let res: Response
  try {
    res = await fetch(`${getSupabaseFnUrl()}/functions/v1/meal-engine`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token ?? anon}`,
        apikey: anon,
      },
      body: JSON.stringify({ op, ...(body as Record<string, unknown>) }),
      signal,
    })
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new AbortedByUserError()
    }
    throw err
  }

  // v1.16.0: 429 has a structured body — surface retryAfterMs so the engine
  // can mark the slot as `error_rate_limited` and auto-resume after backoff.
  if (res.status === 429) {
    const text = await res.text().catch(() => '')
    let retryAfterMs = 0
    try {
      const parsed = JSON.parse(text) as { retryAfterMs?: number; message?: string }
      retryAfterMs = parsed.retryAfterMs ?? 0
    } catch {
      // header fallback
      const headerVal = res.headers.get('retry-after')
      if (headerVal) {
        const seconds = Number(headerVal)
        if (Number.isFinite(seconds)) retryAfterMs = seconds * 1000
      }
    }
    if (retryAfterMs <= 0) retryAfterMs = 5000
    throw new RateLimitedError(`meal-engine ${op} rate-limited`, retryAfterMs)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`meal-engine ${op} failed: ${res.status} ${text}`)
  }
  return await res.json()
}

export async function callOp<S extends z.ZodTypeAny>(
  op: string,
  body: unknown,
  schema: S,
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  const raw = await call(op, body, signal)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Schema validation failed for ${op}: ${parsed.error.message}`)
  }
  return parsed.data
}

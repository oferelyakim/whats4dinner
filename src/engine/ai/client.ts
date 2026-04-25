import { supabase } from '@/services/supabase'
import { z } from 'zod'
import { AbortedByUserError } from '../errors'

export interface MealEngineCallResult<T> {
  ok: boolean
  data?: T
  error?: string
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

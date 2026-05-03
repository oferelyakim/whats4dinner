// Server-side AI usage cap enforcement.
//
// Mirrors the client-side `useAIAccess` gate (src/hooks/useAIAccess.ts +
// src/services/ai-usage.ts) but cannot be bypassed by direct
// `supabase.functions.invoke()` calls. Without this, a user (or attacker
// with a stolen JWT) could blow past the $4/mo cost cap by calling the
// edge function URL directly and skipping the React hook entirely.
//
// Usage from an edge function that already has a service-role client +
// authenticated user:
//
//   try {
//     await assertAIQuotaAvailable(supabase, user.id)
//   } catch (err) {
//     if (err instanceof AIQuotaExceededError) {
//       return quotaErrorResponse(err, corsHeaders)
//     }
//     throw err
//   }

import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Hard monthly spend cap per user. Mirror of `USAGE_CAP_USD` in src/services/ai-usage.ts. */
export const USAGE_CAP_USD = 4.0

export class AIQuotaExceededError extends Error {
  totalCost: number
  cap: number
  constructor(totalCost: number, cap: number) {
    super(`AI usage cap reached: $${totalCost.toFixed(2)} of $${cap.toFixed(2)}`)
    this.name = 'AIQuotaExceededError'
    this.totalCost = totalCost
    this.cap = cap
  }
}

/**
 * Throws AIQuotaExceededError when the user has reached the monthly $ cap.
 * Reads the same `get_user_monthly_usage` RPC the client uses (mig 018), so
 * server + client agree on the number.
 *
 * Fail-open on RPC failure: a transient DB error should NOT block legit users.
 * The cap is a budget guard, not a security control — if Postgres is down we
 * have bigger problems and the next call will catch over-cap usage anyway.
 *
 * @returns The user's current monthly spend in USD.
 */
export async function assertAIQuotaAvailable(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .rpc('get_user_monthly_usage', { p_user_id: userId })
    .single()
  if (error) {
    console.warn(`[ai-quota] get_user_monthly_usage RPC failed for ${userId}: ${error.message}`)
    return 0
  }
  const result = data as { total_cost: number; usage_count: number } | null
  const totalCost = Number(result?.total_cost ?? 0)
  if (totalCost >= USAGE_CAP_USD) {
    throw new AIQuotaExceededError(totalCost, USAGE_CAP_USD)
  }
  return totalCost
}

/**
 * Build a 429 Response for an AI quota error. Includes structured fields so
 * the client can render a useful upgrade prompt instead of a generic error.
 */
export function quotaErrorResponse(
  err: AIQuotaExceededError,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: 'ai_quota_exceeded',
      message: `Monthly AI usage cap reached ($${err.cap.toFixed(2)}). Try again next month or upgrade.`,
      totalCost: err.totalCost,
      cap: err.cap,
    }),
    {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
}

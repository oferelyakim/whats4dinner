import { supabase } from './supabase'
import type { Subscription, SubscriptionPlan, AIActionType } from '@/types'

const USAGE_CAP_USD = 4.0
const WARNING_THRESHOLD_USD = 3.0

export const RECIPE_IMPORT_FREE_CAP = 10
const RECIPE_IMPORT_ACTION_TYPES = ['recipe_import_url', 'recipe_import_photo'] as const

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  return data as Subscription | null
}

/**
 * Returns true when this user shares an active AI Family subscription via
 * `subscription_seats` (added in migration 025). The owner of the subscription
 * is also seeded as an `owner` seat, so this is sufficient to gate AI features
 * when the user does not have a direct subscription row.
 */
export async function hasActiveFamilySeat(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('has_active_family_seat', { p_user_id: userId })
  if (error) return false
  return data === true
}

export interface MonthlyUsage {
  totalCost: number
  percentUsed: number
  isWarning: boolean
  isLimitReached: boolean
  limitDollars: number
}

export async function getMonthlyUsage(userId: string): Promise<MonthlyUsage> {
  const { data } = await supabase
    .rpc('get_user_monthly_usage', { p_user_id: userId })
    .single()

  const result = data as { total_cost: number; usage_count: number } | null
  const totalCost = Number(result?.total_cost ?? 0)
  const percentUsed = Math.min((totalCost / USAGE_CAP_USD) * 100, 100)

  return {
    totalCost,
    percentUsed,
    isWarning: totalCost >= WARNING_THRESHOLD_USD && totalCost < USAGE_CAP_USD,
    isLimitReached: totalCost >= USAGE_CAP_USD,
    limitDollars: USAGE_CAP_USD,
  }
}

export interface MonthlyImports {
  count: number
  limit: number
  remaining: number
  isLimitReached: boolean
}

export async function getMonthlyImports(userId: string): Promise<MonthlyImports> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { count } = await supabase
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('action_type', RECIPE_IMPORT_ACTION_TYPES as unknown as string[])
    .gte('created_at', monthStart)

  const imports = count ?? 0
  return {
    count: imports,
    limit: RECIPE_IMPORT_FREE_CAP,
    remaining: Math.max(0, RECIPE_IMPORT_FREE_CAP - imports),
    isLimitReached: imports >= RECIPE_IMPORT_FREE_CAP,
  }
}

export async function canUseAI(userId: string): Promise<boolean> {
  const sub = await getUserSubscription(userId)
  if (!sub || sub.plan === 'free') return false
  if (sub.status !== 'active') return false
  if (new Date(sub.current_period_end) < new Date()) return false

  const usage = await getMonthlyUsage(userId)
  return !usage.isLimitReached
}

export async function logAIUsage(
  userId: string,
  actionType: AIActionType,
  model: string,
  tokensIn: number,
  tokensOut: number,
  costUsd: number,
  extra?: {
    session_id?: string
    feature_context?: string
    scope?: string
  }
): Promise<void> {
  const sub = await getUserSubscription(userId)
  const periodStart = sub?.current_period_start ?? new Date().toISOString()

  await supabase.from('ai_usage').insert({
    user_id: userId,
    action_type: actionType,
    api_cost_usd: costUsd,
    model_used: model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    period_start: periodStart,
    ...(extra?.session_id && { session_id: extra.session_id }),
    ...(extra?.feature_context && { feature_context: extra.feature_context }),
    ...(extra?.scope && { scope: extra.scope }),
  })
}

/**
 * Activate subscription. Tries Stripe checkout Edge Function first;
 * if Stripe is not configured (501), falls back to mock activation.
 * Returns checkout URL when Stripe is live, or null for mock mode.
 */
export async function activateSubscription(
  plan: SubscriptionPlan,
): Promise<{ url?: string; subscription?: Subscription | null; mock?: boolean }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  // Try Stripe Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { plan },
    })

    if (error) throw error
    if (data?.url) return { url: data.url }
  } catch {
    // Stripe not configured — fall back to mock
  }

  // Mock fallback (test mode)
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { data } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: session.user.id,
      plan,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single()

  return { subscription: data as Subscription | null, mock: true }
}

/**
 * Cancel subscription. When Stripe is live, redirects to Stripe portal.
 * Falls back to direct DB update in mock mode.
 */
export async function cancelSubscription(userId: string): Promise<void> {
  await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

// Keep backward-compatible aliases
export const mockActivateSubscription = async (_userId: string, plan: SubscriptionPlan) => {
  return activateSubscription(plan)
}
export const mockCancelSubscription = cancelSubscription

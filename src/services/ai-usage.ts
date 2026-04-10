import { supabase } from './supabase'
import type { Subscription, SubscriptionPlan, AIActionType } from '@/types'

const USAGE_CAP_USD = 4.0
const WARNING_THRESHOLD_USD = 3.0

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  return data as Subscription | null
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
  })
}

// TODO: Replace with Stripe checkout
export async function mockActivateSubscription(
  userId: string,
  plan: SubscriptionPlan,
): Promise<Subscription | null> {
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { data } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      plan,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single()

  return data as Subscription | null
}

// TODO: Replace with Stripe cancellation
export async function mockCancelSubscription(userId: string): Promise<void> {
  await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

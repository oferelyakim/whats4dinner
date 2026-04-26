// v1.18.0 — Async meal-plan job queue client.
//
// `MealPlanEngine.generatePlanAsync` calls `createMealPlanJob` to enqueue,
// `triggerWorker` to fire the worker immediately (no 2-min cron wait), then
// `subscribeJob` to receive Realtime UPDATEs as the worker fills slots.

import { supabase } from './supabase'
import type { SlotEnvelopeSnapshot } from '@/engine/types'

export interface SlotJobInput {
  slotId: string
  mealId: string
  dayId: string
  slotRole: string
  mealType: string
  envelope: SlotEnvelopeSnapshot
  dietaryConstraints: string[]
  dislikedIngredients: string[]
  recentDishNames: string[]
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type SlotStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled'

export interface MealPlanJobRow {
  id: string
  user_id: string
  circle_id: string | null
  plan_id: string
  status: JobStatus
  total_slots: number
  completed_slots: number
  failed_slots: number
  started_at: string | null
  finished_at: string | null
  error_message: string | null
  created_at: string
}

export interface MealPlanJobSlotRow {
  id: string
  job_id: string
  slot_id: string
  meal_id: string
  day_id: string
  slot_role: string
  meal_type: string
  status: SlotStatus
  result: Record<string, unknown> | null
  error_message: string | null
  attempts: number
  started_at: string | null
  finished_at: string | null
}

export async function createMealPlanJob(
  planId: string,
  circleId: string | null,
  slots: SlotJobInput[],
): Promise<{ jobId: string; totalSlots: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: job, error: jobErr } = await supabase
    .from('meal_plan_jobs')
    .insert({
      user_id: user.id,
      circle_id: circleId,
      plan_id: planId,
      total_slots: slots.length,
      status: 'queued' as JobStatus,
    })
    .select('id')
    .single()

  if (jobErr || !job) throw new Error(jobErr?.message ?? 'Failed to create job')

  const slotRows = slots.map((s) => ({
    job_id: job.id,
    slot_id: s.slotId,
    meal_id: s.mealId,
    day_id: s.dayId,
    slot_role: s.slotRole,
    meal_type: s.mealType,
    envelope: s.envelope,
    dietary_constraints: s.dietaryConstraints,
    disliked_ingredients: s.dislikedIngredients,
    recent_dish_names: s.recentDishNames,
  }))
  const { error: slotsErr } = await supabase.from('meal_plan_job_slots').insert(slotRows)
  if (slotsErr) throw new Error(slotsErr.message)

  return { jobId: job.id, totalSlots: slots.length }
}

export interface JobSubscription {
  unsubscribe: () => void
}

export function subscribeJob(
  jobId: string,
  onSlotUpdate: (slotRow: MealPlanJobSlotRow) => void,
  onJobUpdate: (jobRow: Partial<MealPlanJobRow>) => void,
): JobSubscription {
  const channel = supabase
    .channel(`meal-plan-job:${jobId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'meal_plan_job_slots', filter: `job_id=eq.${jobId}` },
      (payload) => {
        onSlotUpdate(payload.new as MealPlanJobSlotRow)
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'meal_plan_jobs', filter: `id=eq.${jobId}` },
      (payload) => {
        onJobUpdate(payload.new as Partial<MealPlanJobRow>)
      },
    )
    .subscribe()

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel)
    },
  }
}

export async function cancelJob(jobId: string): Promise<void> {
  await supabase.from('meal_plan_jobs').update({ status: 'cancelled' as JobStatus }).eq('id', jobId)
  // Cancel any pending slots (worker stops claiming new ones via the
  // job-status check at the top of its loop).
  await supabase
    .from('meal_plan_job_slots')
    .update({ status: 'cancelled' as SlotStatus })
    .eq('job_id', jobId)
    .eq('status', 'pending')
}

export async function triggerWorker(): Promise<void> {
  // Fire-and-forget — saves the up-to-2-minute wait for the next cron tick.
  await supabase.functions
    .invoke('meal-plan-worker', { body: {} })
    .catch(() => {
      /* worker fires anyway via cron — swallow */
    })
}

export async function getActiveJobForPlan(planId: string): Promise<MealPlanJobRow | null> {
  const { data } = await supabase
    .from('meal_plan_jobs')
    .select('*')
    .eq('plan_id', planId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<MealPlanJobRow>()
  return data ?? null
}

export async function listJobSlots(jobId: string): Promise<MealPlanJobSlotRow[]> {
  const { data } = await supabase
    .from('meal_plan_job_slots')
    .select('*')
    .eq('job_id', jobId)
    .order('id')
  return (data ?? []) as MealPlanJobSlotRow[]
}

export async function getJob(jobId: string): Promise<MealPlanJobRow | null> {
  const { data } = await supabase
    .from('meal_plan_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle<MealPlanJobRow>()
  return data ?? null
}

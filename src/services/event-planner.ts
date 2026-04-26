import { supabase } from './supabase'

export interface EventPlanResult {
  tasks: Array<{ title: string; due_when: string; assignable?: boolean; notes?: string }>
  supplies: Array<{ name: string; quantity?: string; claimable?: boolean }>
  dishes: Array<{ name: string; type: string; claimable?: boolean; notes?: string }>
  activities?: Array<{ name: string; when: 'arrival' | 'during meal' | 'after meal' | 'closing'; notes?: string }>
  timeline_summary: string
  clarifying_question?: string | null
}

export interface EventPlanRequest {
  eventId: string
  circleId: string
  description?: string
  headcountAdults?: number
  headcountKids?: number
  budget?: 'low' | 'medium' | 'high' | 'no_idea'
  helpNeeded?: string[]
  keyRequirements?: string
  sessionId?: string
}

export async function planEvent(request: EventPlanRequest): Promise<{
  plan: EventPlanResult
  _ai_usage: {
    model: string
    tokens_in: number
    tokens_out: number
    cost_usd: number
    session_id?: string
    feature_context?: string
    scope?: string
  }
}> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const { data, error } = await supabase.functions.invoke('plan-event', {
    body: { ...request, featureContext: 'event_detail' },
  })

  if (error) throw error
  return data
}

import { supabase } from './supabase'

export interface Chore {
  id: string
  circle_id: string
  name: string
  description: string | null
  icon: string
  assigned_to: string | null
  assigned_name: string | null
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'once'
  recurrence_days: number[]
  due_time: string | null
  points: number
  created_by: string
  created_at: string
  updated_at: string
  // Joined data
  profile?: { display_name: string }
  latest_completion?: ChoreCompletion | null
}

export interface ChoreCompletion {
  id: string
  chore_id: string
  completed_by: string | null
  completed_name: string | null
  completed_at: string
  due_date: string
  notes: string | null
}

export async function getChores(circleId: string): Promise<Chore[]> {
  const { data, error } = await supabase
    .from('chores')
    .select('*, profile:profiles!chores_assigned_to_fkey(display_name)')
    .eq('circle_id', circleId)
    .order('name')

  if (error) throw error
  return data as Chore[]
}

export async function createChore(input: {
  circle_id: string
  name: string
  description?: string
  icon?: string
  assigned_name?: string
  frequency?: string
  recurrence_days?: number[]
  due_time?: string
  points?: number
}): Promise<Chore> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('chores')
    .insert({
      circle_id: input.circle_id,
      name: input.name,
      description: input.description || null,
      icon: input.icon || '🧹',
      assigned_name: input.assigned_name || null,
      frequency: input.frequency || 'daily',
      recurrence_days: input.recurrence_days || [],
      due_time: input.due_time || null,
      points: input.points || 0,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) throw error
  return data as Chore
}

export async function updateChore(id: string, input: {
  name?: string
  description?: string
  icon?: string
  assigned_name?: string
  frequency?: string
  recurrence_days?: number[]
  due_time?: string | null
  points?: number
}): Promise<Chore> {
  const { data, error } = await supabase
    .from('chores')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Chore
}

export async function deleteChore(id: string): Promise<void> {
  const { error } = await supabase.from('chores').delete().eq('id', id)
  if (error) throw error
}

export async function completeChore(
  choreId: string,
  dueDate: string,
  completedName?: string,
): Promise<ChoreCompletion> {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('chore_completions')
    .insert({
      chore_id: choreId,
      completed_by: user?.id || null,
      completed_name: completedName || null,
      due_date: dueDate,
    })
    .select()
    .single()

  if (error) throw error
  return data as ChoreCompletion
}

export async function getChoreCompletions(
  choreId: string,
  startDate?: string,
  endDate?: string,
): Promise<ChoreCompletion[]> {
  let query = supabase
    .from('chore_completions')
    .select('*')
    .eq('chore_id', choreId)
    .order('due_date', { ascending: false })

  if (startDate) query = query.gte('due_date', startDate)
  if (endDate) query = query.lte('due_date', endDate)

  const { data, error } = await query
  if (error) throw error
  return data as ChoreCompletion[]
}

export async function getCompletionsForChores(
  choreIds: string[],
  date: string,
): Promise<ChoreCompletion[]> {
  if (choreIds.length === 0) return []
  const { data, error } = await supabase
    .from('chore_completions')
    .select('*')
    .in('chore_id', choreIds)
    .eq('due_date', date)

  if (error) throw error
  return data as ChoreCompletion[]
}

export async function getWeekCompletions(
  choreIds: string[],
  startDate: string,
  endDate: string,
): Promise<ChoreCompletion[]> {
  if (choreIds.length === 0) return []
  const { data, error } = await supabase
    .from('chore_completions')
    .select('*')
    .in('chore_id', choreIds)
    .gte('due_date', startDate)
    .lte('due_date', endDate)

  if (error) throw error
  return data as ChoreCompletion[]
}

// Helpers

const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  once: 'One-time',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatFrequency(chore: Chore): string {
  if (chore.frequency === 'weekly' || chore.frequency === 'biweekly') {
    const days = chore.recurrence_days.map((d) => DAY_NAMES[d]).join(', ')
    if (days) {
      return chore.frequency === 'biweekly'
        ? `Every other ${days}`
        : `Every ${days}`
    }
  }
  return FREQ_LABELS[chore.frequency] ?? chore.frequency
}

export function isChoreCompletedToday(
  choreId: string,
  completions: ChoreCompletion[],
): boolean {
  const today = new Date().toISOString().split('T')[0]
  return completions.some(
    (c) => c.chore_id === choreId && c.due_date === today,
  )
}

export function getChoreStreak(
  choreId: string,
  completions: ChoreCompletion[],
): number {
  const choreCompletions = completions
    .filter((c) => c.chore_id === choreId)
    .map((c) => c.due_date)
    .sort()
    .reverse()

  if (choreCompletions.length === 0) return 0

  let streak = 0
  const today = new Date()
  const current = new Date(today)

  for (let i = 0; i < 365; i++) {
    const dateStr = current.toISOString().split('T')[0]
    if (choreCompletions.includes(dateStr)) {
      streak++
    } else if (i > 0) {
      break
    }
    current.setDate(current.getDate() - 1)
  }

  return streak
}

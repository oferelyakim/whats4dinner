import { supabase } from './supabase'

export interface Participant {
  name: string
  role: 'participant' | 'escort' | 'driver' | 'supervisor'
}

export interface BringItem {
  name: string
  checked: boolean
}

export interface Reminder {
  amount: number
  unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months'
}

export interface Activity {
  id: string
  circle_id: string
  name: string
  description: string | null
  category: string
  location: string | null
  assigned_to: string | null
  assigned_name: string | null
  recurrence_type: 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom'
  recurrence_days: number[]
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  exclude_holidays: boolean
  color: string | null
  notes: string | null
  participants: Participant[]
  bring_items: BringItem[]
  reminders: Reminder[]
  created_by: string
  created_at: string
  profile?: { display_name: string }
}

export interface ActivityDuty {
  id: string
  activity_id: string
  duty_date: string
  duty_type: string
  assigned_to: string | null
  assigned_name: string | null
  notes: string | null
  status: 'pending' | 'confirmed' | 'done'
  profile?: { display_name: string }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatRecurrence(activity: Activity): string {
  if (activity.recurrence_type === 'once') return 'One-time'
  if (activity.recurrence_type === 'daily') return 'Daily'
  if (activity.recurrence_type === 'monthly') return 'Monthly'
  if (activity.recurrence_type === 'yearly') return 'Yearly'
  if (activity.recurrence_type === 'biweekly') {
    const days = activity.recurrence_days.map((d) => DAY_NAMES[d]).join(', ')
    return `Every other ${days}`
  }
  if (activity.recurrence_type === 'weekly' || activity.recurrence_type === 'custom') {
    const days = activity.recurrence_days.map((d) => DAY_NAMES[d]).join(', ')
    return `Every ${days}`
  }
  return activity.recurrence_type
}

export function formatTimeRange(activity: Activity): string {
  const parts: string[] = []
  if (activity.start_time) parts.push(activity.start_time.slice(0, 5))
  if (activity.end_time) parts.push(activity.end_time.slice(0, 5))
  return parts.join(' - ')
}

export async function getActivities(circleId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*, profile:profiles(display_name)')
    .eq('circle_id', circleId)
    .order('start_date')

  if (error) throw error
  // Parse JSON fields
  return (data ?? []).map((a: Record<string, unknown>) => ({
    ...a,
    participants: Array.isArray(a.participants) ? a.participants : [],
    bring_items: Array.isArray(a.bring_items) ? a.bring_items : [],
    reminders: Array.isArray(a.reminders) ? a.reminders : [],
  })) as Activity[]
}

export async function createActivity(input: {
  circle_id: string
  name: string
  description?: string
  category?: string
  location?: string
  assigned_name?: string
  recurrence_type?: string
  recurrence_days?: number[]
  start_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  exclude_holidays?: boolean
  color?: string
  notes?: string
  participants?: Participant[]
  bring_items?: BringItem[]
  reminders?: Reminder[]
}): Promise<Activity> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('activities')
    .insert({
      ...input,
      created_by: user.id,
      recurrence_type: input.recurrence_type || 'once',
      recurrence_days: input.recurrence_days || [],
      category: input.category || 'other',
      participants: input.participants || [],
      bring_items: input.bring_items || [],
      reminders: input.reminders || [],
    })
    .select()
    .single()

  if (error) throw error
  return data as Activity
}

export async function updateActivity(id: string, input: {
  name?: string
  description?: string
  category?: string
  location?: string
  assigned_name?: string
  recurrence_type?: string
  recurrence_days?: number[]
  start_date?: string
  end_date?: string | null
  start_time?: string | null
  end_time?: string | null
  exclude_holidays?: boolean
  color?: string
  notes?: string | null
  participants?: Participant[]
  bring_items?: BringItem[]
  reminders?: Reminder[]
}): Promise<Activity> {
  const { data, error } = await supabase
    .from('activities')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Activity
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', id)
  if (error) throw error
}

// Duties

export async function getActivityDuties(activityId: string, startDate?: string, endDate?: string): Promise<ActivityDuty[]> {
  let query = supabase
    .from('activity_duties')
    .select('*, profile:profiles(display_name)')
    .eq('activity_id', activityId)
    .order('duty_date')

  if (startDate) query = query.gte('duty_date', startDate)
  if (endDate) query = query.lte('duty_date', endDate)

  const { data, error } = await query
  if (error) throw error
  return data as ActivityDuty[]
}

export async function addDuty(activityId: string, input: {
  duty_date: string
  duty_type?: string
  assigned_name?: string
  notes?: string
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('activity_duties').insert({
    activity_id: activityId,
    duty_date: input.duty_date,
    duty_type: input.duty_type || 'general',
    assigned_to: user?.id || null,
    assigned_name: input.assigned_name || null,
    notes: input.notes || null,
  })

  if (error) throw error
}

export async function claimDuty(dutyId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('activity_duties')
    .update({ assigned_to: user.id, status: 'confirmed' })
    .eq('id', dutyId)

  if (error) throw error
}

export async function updateDutyStatus(dutyId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('activity_duties')
    .update({ status })
    .eq('id', dutyId)

  if (error) throw error
}

// Generate upcoming occurrences for a recurring activity
export function getUpcomingOccurrences(activity: Activity, daysAhead: number = 14): string[] {
  const dates: string[] = []
  const today = new Date()
  const endLimit = new Date(today)
  endLimit.setDate(endLimit.getDate() + daysAhead)

  const activityEnd = activity.end_date ? new Date(activity.end_date + 'T23:59:59') : endLimit

  if (activity.recurrence_type === 'once') {
    return [activity.start_date]
  }

  const current = new Date(Math.max(
    new Date(activity.start_date + 'T00:00:00').getTime(),
    today.getTime()
  ))

  while (current <= endLimit && current <= activityEnd) {
    const dayOfWeek = current.getDay()

    if (activity.recurrence_type === 'daily') {
      dates.push(current.toISOString().split('T')[0])
    } else if (
      activity.recurrence_type === 'weekly' ||
      activity.recurrence_type === 'custom'
    ) {
      if (activity.recurrence_days.includes(dayOfWeek)) {
        dates.push(current.toISOString().split('T')[0])
      }
    }

    current.setDate(current.getDate() + 1)
  }

  return dates
}

// Check if an activity occurs on a given date
export function activityOccursOnDate(activity: Activity, date: string): boolean {
  const d = new Date(date + 'T12:00:00')
  const startDate = new Date(activity.start_date + 'T00:00:00')
  const endDate = activity.end_date ? new Date(activity.end_date + 'T23:59:59') : null

  if (d < startDate) return false
  if (endDate && d > endDate) return false

  if (activity.recurrence_type === 'once') {
    return activity.start_date === date
  }
  if (activity.recurrence_type === 'daily') return true
  if (activity.recurrence_type === 'weekly' || activity.recurrence_type === 'custom') {
    return activity.recurrence_days.includes(d.getDay())
  }
  if (activity.recurrence_type === 'biweekly') {
    if (!activity.recurrence_days.includes(d.getDay())) return false
    const diffWeeks = Math.floor((d.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
    return diffWeeks % 2 === 0
  }
  if (activity.recurrence_type === 'monthly') {
    return d.getDate() === startDate.getDate()
  }
  if (activity.recurrence_type === 'yearly') {
    return d.getMonth() === startDate.getMonth() && d.getDate() === startDate.getDate()
  }
  return false
}

// Get upcoming reminders for activities in the next N days
export function getUpcomingReminders(
  activities: Activity[],
  daysAhead: number = 7
): Array<{ activity: Activity; reminder: Reminder; triggerDate: string }> {
  const result: Array<{ activity: Activity; reminder: Reminder; triggerDate: string }> = []
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const endLimit = new Date(today)
  endLimit.setDate(endLimit.getDate() + daysAhead)
  const endStr = endLimit.toISOString().split('T')[0]

  for (const activity of activities) {
    if (!activity.reminders || activity.reminders.length === 0) continue

    // Find next occurrence
    const current = new Date(today)
    for (let i = 0; i <= daysAhead + 60; i++) {
      const dateStr = current.toISOString().split('T')[0]
      if (activityOccursOnDate(activity, dateStr)) {
        // Check each reminder
        for (const reminder of activity.reminders) {
          const triggerDate = new Date(current)
          switch (reminder.unit) {
            case 'minutes': triggerDate.setMinutes(triggerDate.getMinutes() - reminder.amount); break
            case 'hours': triggerDate.setHours(triggerDate.getHours() - reminder.amount); break
            case 'days': triggerDate.setDate(triggerDate.getDate() - reminder.amount); break
            case 'weeks': triggerDate.setDate(triggerDate.getDate() - reminder.amount * 7); break
            case 'months': triggerDate.setMonth(triggerDate.getMonth() - reminder.amount); break
          }
          const triggerStr = triggerDate.toISOString().split('T')[0]
          if (triggerStr >= todayStr && triggerStr <= endStr) {
            result.push({ activity, reminder, triggerDate: triggerStr })
          }
        }
        break // Only look at the next occurrence
      }
      current.setDate(current.getDate() + 1)
    }
  }

  return result.sort((a, b) => a.triggerDate.localeCompare(b.triggerDate))
}

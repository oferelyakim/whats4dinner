// send-scheduled-push — combined scheduled push-notification sender.
//
// Triggered by pg_cron every minute (migration 044).
// Deploy with --no-verify-jwt (cron POSTs without a bearer token).
//
// Two independent sections, each wrapped in try/catch so a failure in one
// does not abort the other:
//
//   1. Chores  — matches due_time (exact minute) + frequency/recurrence_days
//   2. Activities — v1: recurrence_type='once' with an upcoming reminder;
//                   weekly/biweekly with reminder offset (TODO: monthly/yearly)
//
// Returns { chores_sent, activities_sent, stale_pruned, errors }
//
// Dedup: every (chore|activity, date) pair gets one row in push_notification_log.
// ON CONFLICT DO NOTHING + checking rows-inserted means the cron can fire
// safely every minute without double-sending.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushNotification, type PushSubscription } from '../_shared/web-push.ts'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_VERSION        = '1.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ─── ET time helpers ──────────────────────────────────────────────────────

/**
 * Returns current Eastern Time as { hhmm: "HH:MM", dayOfWeek: 0-6, dateStr: "YYYY-MM-DD" }
 * Day of week: 0=Sunday … 6=Saturday (matches JS Date).
 */
function getETNow(): { hhmm: string; dayOfWeek: number; dateStr: string } {
  // Intl.DateTimeFormat gives us ET-aware date parts without importing tz libs.
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    weekday:  'short',
  }).formatToParts(now)

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''

  const hour    = get('hour').padStart(2, '0')
  const minute  = get('minute').padStart(2, '0')
  // Normalize "24" (midnight) to "00"
  const hhmm    = `${hour === '24' ? '00' : hour}:${minute}`
  const year    = get('year')
  const month   = get('month')
  const day     = get('day')
  const dateStr = `${year}-${month}-${day}`

  // Derive day-of-week from a date that's unambiguously in ET.
  const etDate  = new Date(`${dateStr}T${hhmm}:00`)
  const dayOfWeek = etDate.getDay()  // 0=Sunday

  return { hhmm, dayOfWeek, dateStr }
}

// ─── Subscription helpers ─────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>

/** Fetch all push subscriptions for a user. Returns [] on error. */
async function getSubsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<PushSubscription[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('user_id', userId)

  if (error) {
    console.error(`push_subscriptions fetch error for user ${userId}:`, error.message)
    return []
  }
  return (data ?? []) as PushSubscription[]
}

/**
 * Send payload to all subscriptions for a user.
 * Deletes stale subs (404/410). Updates last_used_at on success.
 * Returns { sent, stale_pruned }.
 */
async function sendToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; tag?: string; url?: string },
): Promise<{ sent: number; stale_pruned: number }> {
  const subs = await getSubsForUser(supabase, userId)
  let sent = 0
  let stale_pruned = 0

  for (const sub of subs) {
    try {
      const result = await sendPushNotification(sub, payload)
      if (result === 'stale') {
        // Provider says this endpoint is gone — clean it up.
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', sub.endpoint)
        stale_pruned++
      } else {
        // Success — update last_used_at.
        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('endpoint', sub.endpoint)
        sent++
      }
    } catch (err) {
      console.error(
        `sendPushNotification error for user ${userId} endpoint ${sub.endpoint.slice(0, 60)}:`,
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  return { sent, stale_pruned }
}

/**
 * Attempt to insert a dedup row. Returns true if this is the first send
 * (row was inserted), false if already sent (conflict).
 */
async function tryDedup(supabase: SupabaseClient, dedupKey: string): Promise<boolean> {
  const { error, count } = await supabase
    .from('push_notification_log')
    .insert({ dedup_key: dedupKey })
    .select('id', { count: 'exact', head: true })

  if (error) {
    // 23505 = unique_violation — already sent today.
    if (error.code === '23505') return false
    // Other error — log and skip to be safe (don't double-send on DB errors).
    console.error('push_notification_log insert error:', error.message)
    return false
  }
  return (count ?? 0) > 0 || !error
}

// ─── Resolve user IDs from assigned_to / assigned_name ───────────────────

interface AssignedRow {
  assigned_to:   string | null
  assigned_name: string | null
}

async function resolveUserIds(
  supabase: SupabaseClient,
  row: AssignedRow,
): Promise<string[]> {
  if (row.assigned_to) return [row.assigned_to]

  if (row.assigned_name) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('display_name', row.assigned_name)

    return (data ?? []).map((r: { id: string }) => r.id)
  }

  return []
}

// ─── Chore section ────────────────────────────────────────────────────────

async function processChores(
  supabase: SupabaseClient,
  hhmm: string,
  dayOfWeek: number,
  dateStr: string,
): Promise<{ sent: number; stale_pruned: number; errors: string[] }> {
  let totalSent = 0
  let totalStale = 0
  const errors: string[] = []

  // Cast hhmm to ::time for exact minute match.
  // recurrence_days is stored as int[] (0=Sun … 6=Sat).
  const { data: chores, error } = await supabase
    .from('chores')
    .select('id, name, icon, frequency, recurrence_days, assigned_to, assigned_name')
    .not('due_time', 'is', null)
    .eq('due_time', `${hhmm}:00`)  // time column stored as HH:MM:SS
    .or(`frequency.eq.daily,and(frequency.eq.weekly,recurrence_days.cs.{${dayOfWeek}})`)

  if (error) {
    errors.push(`chores query: ${error.message}`)
    return { sent: totalSent, stale_pruned: totalStale, errors }
  }

  for (const chore of (chores ?? [])) {
    try {
      const dedupKey = `chore:${chore.id}:${dateStr}`
      const isFirst = await tryDedup(supabase, dedupKey)
      if (!isFirst) continue

      const userIds = await resolveUserIds(supabase, chore)

      const payload = {
        title: `${chore.icon ?? ''} ${chore.name}`.trim(),
        body:  'Due now',
        tag:   `chore:${chore.id}`,
        url:   '/household/chores',
      }

      for (const userId of userIds) {
        const { sent, stale_pruned } = await sendToUser(supabase, userId, payload)
        totalSent  += sent
        totalStale += stale_pruned
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`chore ${chore.id}: ${msg}`)
    }
  }

  return { sent: totalSent, stale_pruned: totalStale, errors }
}

// ─── Activity section ─────────────────────────────────────────────────────
//
// v1 scope:
//   • recurrence_type='once': fire when today == start_date - reminder.amount (days/weeks)
//   • recurrence_type IN ('weekly','biweekly'): fire when today == next_occurrence - reminder.amount (days/weeks)
//   • TODO v1.1: monthly, yearly recurrence types
//
// Activity reminders are stored as jsonb[] on each activity row:
//   [{ "amount": 1, "unit": "days" }, { "amount": 1, "unit": "weeks" }]
//
// We fire the cron once per minute, so "today" means ET date. An activity
// reminder fires on the calendar day it's due — this fn is called every minute
// but the dedup key includes the trigger_date, so it fires at most once per day
// per (activity, reminder).

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Returns the next occurrence date string (≥ today) for a weekly/biweekly activity.
 *  recurrenceDays: int[] of day-of-week (0=Sun).
 *  biweekly: only every other week. For v1 we ignore biweekly offset and just
 *  find the nearest matching weekday ≥ today. */
function nextOccurrence(
  today: string,
  recurrenceDays: number[],
  _biweekly: boolean,
): string | null {
  if (!recurrenceDays.length) return null
  const base = new Date(`${today}T12:00:00`)
  for (let i = 0; i <= 13; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    if (recurrenceDays.includes(d.getDay())) {
      return d.toISOString().slice(0, 10)
    }
  }
  return null
}

async function processActivities(
  supabase: SupabaseClient,
  dateStr: string,
): Promise<{ sent: number; stale_pruned: number; errors: string[] }> {
  let totalSent = 0
  let totalStale = 0
  const errors: string[] = []

  // Fetch activities with reminders. Scope to once/weekly/biweekly for v1.
  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, name, start_date, recurrence_type, recurrence_days, reminders, assigned_to, assigned_name')
    .not('reminders', 'is', null)
    .in('recurrence_type', ['once', 'weekly', 'biweekly'])

  if (error) {
    errors.push(`activities query: ${error.message}`)
    return { sent: totalSent, stale_pruned: totalStale, errors }
  }

  for (const activity of (activities ?? [])) {
    const reminders: Array<{ amount: number; unit: 'days' | 'weeks' }> =
      Array.isArray(activity.reminders) ? activity.reminders : []

    if (!reminders.length) continue

    for (const reminder of reminders) {
      try {
        // Compute the activity date relevant to this reminder.
        const reminderDays = reminder.unit === 'weeks'
          ? reminder.amount * 7
          : reminder.amount

        let activityDate: string | null = null

        if (activity.recurrence_type === 'once') {
          activityDate = activity.start_date ?? null
        } else {
          // weekly / biweekly: find next occurrence ≥ today, then check if
          // today is exactly reminderDays before it.
          const days: number[] = Array.isArray(activity.recurrence_days)
            ? activity.recurrence_days
            : []
          activityDate = nextOccurrence(dateStr, days, activity.recurrence_type === 'biweekly')
        }

        if (!activityDate) continue

        // The trigger date is reminderDays before the activity.
        const triggerDate = addDays(activityDate, -reminderDays)
        if (triggerDate !== dateStr) continue

        const dedupKey = `activity:${activity.id}:${triggerDate}`
        const isFirst = await tryDedup(supabase, dedupKey)
        if (!isFirst) continue

        const userIds = await resolveUserIds(supabase, activity)

        const unitLabel = reminder.unit === 'weeks'
          ? `${reminder.amount} week${reminder.amount !== 1 ? 's' : ''}`
          : `${reminder.amount} day${reminder.amount !== 1 ? 's' : ''}`

        const payload = {
          title: activity.name,
          body:  `Coming up — ${unitLabel} from now`,
          tag:   `activity:${activity.id}`,
          url:   '/household/activities',
        }

        for (const userId of userIds) {
          const { sent, stale_pruned } = await sendToUser(supabase, userId, payload)
          totalSent  += sent
          totalStale += stale_pruned
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`activity ${activity.id} reminder ${reminder.amount}${reminder.unit}: ${msg}`)
      }
    }
  }

  // TODO v1.1: handle recurrence_type IN ('monthly', 'yearly')

  return { sent: totalSent, stale_pruned: totalStale, errors }
}

// ─── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method === 'GET' && new URL(req.url).searchParams.get('ping') === '1') {
    return json(200, { fn: 'send-scheduled-push', version: APP_VERSION })
  }

  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { hhmm, dayOfWeek, dateStr } = getETNow()

  // Run both sections independently — a chore failure must not abort activities.
  const choreResult = await (async () => {
    try {
      return await processChores(supabase, hhmm, dayOfWeek, dateStr)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('processChores threw:', msg)
      return { sent: 0, stale_pruned: 0, errors: [msg] }
    }
  })()

  const activityResult = await (async () => {
    try {
      return await processActivities(supabase, dateStr)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('processActivities threw:', msg)
      return { sent: 0, stale_pruned: 0, errors: [msg] }
    }
  })()

  return json(200, {
    ok:               true,
    et_time:          `${dateStr} ${hhmm}`,
    chores_sent:      choreResult.sent,
    activities_sent:  activityResult.sent,
    stale_pruned:     choreResult.stale_pruned + activityResult.stale_pruned,
    errors:           [...choreResult.errors, ...activityResult.errors],
  })
})

import { supabase } from './supabase'

export interface Seat {
  id: string
  subscription_id: string
  user_id: string | null
  pending_email: string | null
  role: 'owner' | 'member'
  added_at: string
  invited_at: string | null
  profile?: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
  } | null
}

export interface ActiveSubscription {
  id: string
  billing_period: 'monthly' | 'annual'
  status: string
  current_period_end: string
  trial_end: string | null
}

export class SeatCapReachedError extends Error {
  constructor() {
    super('Seat cap reached: this subscription already has 4 members.')
    this.name = 'SeatCapReachedError'
  }
}

const SEAT_CAP = 4

/** Return the current user's active subscription (any plan with active status). */
export async function getMyActiveSubscription(): Promise<ActiveSubscription | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, billing_period, plan, status, current_period_end, trial_end')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('current_period_end', new Date().toISOString())
    .single()

  if (error || !data) return null

  // Normalise legacy plan names to billing_period values
  const rawPlan = (data as Record<string, unknown>).plan as string | null
  const rawBillingPeriod = (data as Record<string, unknown>).billing_period as string | null
  const billingPeriod: 'monthly' | 'annual' =
    rawBillingPeriod === 'annual' || rawPlan === 'annual'
      ? 'annual'
      : 'monthly'

  return {
    id: data.id as string,
    billing_period: billingPeriod,
    status: data.status as string,
    current_period_end: data.current_period_end as string,
    trial_end: (data.trial_end as string | null) ?? null,
  }
}

/**
 * List all seats on the current user's active subscription, joining profile
 * data for confirmed (non-pending) seats.
 */
export async function listMySeats(): Promise<Seat[]> {
  const sub = await getMyActiveSubscription()
  if (!sub) return []

  const { data, error } = await supabase
    .from('subscription_seats')
    .select(`
      id,
      subscription_id,
      user_id,
      pending_email,
      role,
      added_at,
      invited_at,
      profiles:user_id (
        id,
        email,
        display_name,
        avatar_url
      )
    `)
    .eq('subscription_id', sub.id)
    .order('added_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => {
    const profilesField = row.profiles as unknown
    const profileRaw =
      (Array.isArray(profilesField) ? profilesField[0] : profilesField) as {
        id: string
        email: string
        display_name: string | null
        avatar_url: string | null
      } | null
        | undefined

    return {
      id: row.id as string,
      subscription_id: row.subscription_id as string,
      user_id: (row.user_id as string | null) ?? null,
      pending_email: (row.pending_email as string | null) ?? null,
      role: row.role as 'owner' | 'member',
      added_at: row.added_at as string,
      invited_at: (row.invited_at as string | null) ?? null,
      profile: profileRaw
        ? {
            id: profileRaw.id,
            email: profileRaw.email,
            full_name: profileRaw.display_name ?? null,
            avatar_url: profileRaw.avatar_url ?? null,
          }
        : null,
    } satisfies Seat
  })
}

/** Count current seats on the given subscription (confirmed + pending). */
async function countSeats(subscriptionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('subscription_seats')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_id', subscriptionId)

  if (error) throw error
  return count ?? 0
}

/**
 * Add a confirmed member by their Supabase user ID.
 * Throws SeatCapReachedError if already at 4 seats.
 */
export async function addSeatByUserId(userId: string): Promise<Seat> {
  const sub = await getMyActiveSubscription()
  if (!sub) throw new Error('No active subscription found.')

  const current = await countSeats(sub.id)
  if (current >= SEAT_CAP) throw new SeatCapReachedError()

  const { data, error } = await supabase
    .from('subscription_seats')
    .insert({ subscription_id: sub.id, user_id: userId, role: 'member' })
    .select()
    .single()

  if (error) throw error
  return {
    id: data.id as string,
    subscription_id: data.subscription_id as string,
    user_id: (data.user_id as string | null) ?? null,
    pending_email: null,
    role: data.role as 'owner' | 'member',
    added_at: data.added_at as string,
    invited_at: null,
    profile: null,
  }
}

/**
 * Invite a member by email address.
 * - Lowercases the email before all comparisons.
 * - If a profile with that email already exists → calls addSeatByUserId directly.
 * - Otherwise inserts a pending-invite row with pending_email + invited_at.
 * Throws SeatCapReachedError if already at 4 seats.
 */
export async function inviteSeatByEmail(email: string): Promise<Seat> {
  const normalisedEmail = email.trim().toLowerCase()
  const sub = await getMyActiveSubscription()
  if (!sub) throw new Error('No active subscription found.')

  const current = await countSeats(sub.id)
  if (current >= SEAT_CAP) throw new SeatCapReachedError()

  // Check if there is already a profile with this email
  const { data: profileMatch } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', normalisedEmail)
    .maybeSingle()

  if (profileMatch?.id) {
    // User already exists — add confirmed seat
    return addSeatByUserId(profileMatch.id)
  }

  // No profile found — insert a pending-invite row
  const { data, error } = await supabase
    .from('subscription_seats')
    .insert({
      subscription_id: sub.id,
      pending_email: normalisedEmail,
      invited_at: new Date().toISOString(),
      role: 'member',
    })
    .select()
    .single()

  if (error) throw error
  return {
    id: data.id as string,
    subscription_id: data.subscription_id as string,
    user_id: null,
    pending_email: normalisedEmail,
    role: data.role as 'owner' | 'member',
    added_at: data.added_at as string,
    invited_at: (data.invited_at as string | null) ?? null,
    profile: null,
  }
}

/** Remove a seat by its seat ID (owner only — enforced by RLS). */
export async function removeSeat(seatId: string): Promise<void> {
  const { error } = await supabase
    .from('subscription_seats')
    .delete()
    .eq('id', seatId)

  if (error) throw error
}

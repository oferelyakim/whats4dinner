import { supabase } from './supabase'
import type { Circle, CircleContext, CircleMember, CircleType } from '@/types'

export interface CreateCircleInput {
  name: string
  icon: string
  purpose?: string | null
  circle_type?: CircleType | null
  context?: CircleContext | null
  skin_id?: string | null
}

export async function getMyCircles(): Promise<Circle[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Circle[]
}

export async function getCircleMembers(circleId: string): Promise<CircleMember[]> {
  const { data, error } = await supabase
    .from('circle_members')
    .select('*, profile:profiles(*)')
    .eq('circle_id', circleId)

  if (error) throw error
  return data as CircleMember[]
}

export async function createCircle(input: CreateCircleInput | string, icon?: string): Promise<Circle> {
  // Backwards-compatible: callers used to pass (name, icon).
  const payload: CreateCircleInput =
    typeof input === 'string' ? { name: input, icon: icon ?? '👨‍👩‍👧‍👦' } : input

  const { data, error } = await supabase
    .rpc('create_circle_with_owner', {
      p_name: payload.name,
      p_icon: payload.icon,
      p_purpose: payload.purpose ?? null,
      p_circle_type: payload.circle_type ?? null,
      p_context: payload.context ?? {},
    })

  if (error) throw error
  const circle = data as Circle

  // The RPC predates skin support — apply skin_id as a follow-up update.
  if (payload.skin_id && payload.skin_id !== circle.skin_id) {
    const { data: updated, error: skinError } = await supabase
      .from('circles')
      .update({ skin_id: payload.skin_id })
      .eq('id', circle.id)
      .select()
      .single()
    if (skinError) throw skinError
    return updated as Circle
  }
  return circle
}

export async function updateCircleSkin(circleId: string, skinId: string): Promise<void> {
  const { error } = await supabase
    .from('circles')
    .update({ skin_id: skinId })
    .eq('id', circleId)
  if (error) throw error
}

export async function updateCircleContext(
  circleId: string,
  patch: { purpose?: string | null; circle_type?: CircleType | null; context?: CircleContext | null },
): Promise<void> {
  const { error } = await supabase
    .from('circles')
    .update(patch)
    .eq('id', circleId)
  if (error) throw error
}

export async function joinCircleByInviteCode(inviteCode: string): Promise<Circle> {
  const { data, error } = await supabase
    .rpc('join_circle_by_invite', { p_code: inviteCode.trim() })

  if (error) {
    if (error.message.includes('Invalid invite code')) throw new Error('Invalid invite code')
    if (error.message.includes('already') || error.code === '23505') throw new Error('Already a member of this circle')
    throw error
  }

  return data as Circle
}

export async function inviteByEmail(circleId: string, email: string): Promise<void> {
  const { error } = await supabase
    .rpc('invite_to_circle_by_email', { p_circle_id: circleId, p_email: email })

  if (error) {
    // Extract readable message from Postgres error
    const msg = error.message || 'Failed to invite user'
    throw new Error(msg)
  }
}

export async function leaveCircle(circleId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', user.id)

  if (error) throw error
}

export async function deleteCircle(circleId: string): Promise<void> {
  const { error } = await supabase.from('circles').delete().eq('id', circleId)
  if (error) throw error
}

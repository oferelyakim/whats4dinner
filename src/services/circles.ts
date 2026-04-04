import { supabase } from './supabase'
import type { Circle, CircleMember } from '@/types'

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

export async function createCircle(name: string, icon: string): Promise<Circle> {
  const { data, error } = await supabase
    .rpc('create_circle_with_owner', { p_name: name, p_icon: icon })

  if (error) throw error
  return data as Circle
}

export async function joinCircleByInviteCode(inviteCode: string): Promise<Circle> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Find circle by invite code
  const { data: circle, error: findError } = await supabase
    .from('circles')
    .select('*')
    .eq('invite_code', inviteCode.trim())
    .single()

  if (findError || !circle) throw new Error('Invalid invite code')

  // Join as member
  const { error: joinError } = await supabase
    .from('circle_members')
    .insert({ circle_id: circle.id, user_id: user.id, role: 'member' })

  if (joinError) {
    if (joinError.code === '23505') throw new Error('Already a member of this circle')
    throw joinError
  }

  return circle as Circle
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

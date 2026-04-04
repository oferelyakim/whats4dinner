import { supabase } from './supabase'

export interface Event {
  id: string
  name: string
  description: string | null
  event_date: string | null
  location: string | null
  created_by: string
  circle_id: string | null
  invite_code: string
  created_at: string
}

export interface EventParticipant {
  id: string
  event_id: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  status: 'invited' | 'attending' | 'declined'
  profile?: { display_name: string; email: string }
}

export interface EventAssignment {
  id: string
  event_id: string
  assigned_to: string | null
  guest_name: string | null
  dish_name: string
  recipe_id: string | null
  category: string
  notes: string | null
  status: 'pending' | 'confirmed' | 'completed'
  profile?: { display_name: string }
  recipe?: { title: string }
}

export async function getEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data as Event[]
}

export async function getEvent(id: string): Promise<Event> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Event
}

export async function createEvent(input: {
  name: string
  description?: string
  event_date?: string
  location?: string
  circle_id?: string
}): Promise<Event> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('events')
    .insert({ ...input, created_by: user.id })
    .select()
    .single()

  if (error) throw error

  // Add creator as attending participant
  await supabase.from('event_participants').insert({
    event_id: data.id,
    user_id: user.id,
    status: 'attending',
  })

  return data as Event
}

export async function getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('*, profile:profiles(display_name, email)')
    .eq('event_id', eventId)

  if (error) throw error
  return data as EventParticipant[]
}

export async function getEventAssignments(eventId: string): Promise<EventAssignment[]> {
  const { data, error } = await supabase
    .from('event_assignments')
    .select('*, profile:profiles(display_name), recipe:recipes(title)')
    .eq('event_id', eventId)
    .order('category')

  if (error) throw error
  return data as EventAssignment[]
}

export async function addAssignment(eventId: string, input: {
  dish_name: string
  category: string
  recipe_id?: string
  notes?: string
}): Promise<void> {
  const { error } = await supabase
    .from('event_assignments')
    .insert({ event_id: eventId, ...input })

  if (error) throw error
}

export async function claimAssignment(assignmentId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('event_assignments')
    .update({ assigned_to: user.id, status: 'confirmed' })
    .eq('id', assignmentId)

  if (error) throw error
}

export async function joinEvent(eventId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('event_participants')
    .upsert({ event_id: eventId, user_id: user.id, status: 'attending' })

  if (error) throw error
}

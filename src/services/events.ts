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

export interface EventItem {
  id: string
  event_id: string
  type: 'dish' | 'supply' | 'task'
  name: string
  category: string
  quantity: number | null
  recipe_id: string | null
  meal_slot: string | null
  assigned_to: string | null
  guest_name: string | null
  notes: string | null
  due_at: string | null
  status: 'unclaimed' | 'claimed' | 'in_progress' | 'done'
  sort_order: number
  created_at: string
  profile?: { display_name: string }
  recipe?: { title: string }
}

export interface EventOrganizer {
  event_id: string
  user_id: string
  profile?: { display_name: string }
}

// Events CRUD

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
  const { data, error } = await supabase.rpc('create_event_with_organizer', {
    p_name: input.name,
    p_description: input.description || null,
    p_event_date: input.event_date || null,
    p_location: input.location || null,
    p_circle_id: input.circle_id || null,
  })

  if (error) throw error
  return data as Event
}

export async function updateEvent(id: string, input: Partial<{
  name: string
  description: string
  event_date: string
  location: string
}>): Promise<void> {
  const { error } = await supabase.from('events').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) throw error
}

// Participants

export async function getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('*, profile:profiles(display_name, email)')
    .eq('event_id', eventId)

  if (error) throw error
  return data as EventParticipant[]
}

export async function joinEvent(eventId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('event_participants')
    .upsert({ event_id: eventId, user_id: user.id, status: 'attending' })

  if (error) throw error
}

export async function joinEventByInvite(code: string): Promise<Event> {
  const { data, error } = await supabase.rpc('join_event_by_invite', { p_code: code.trim() })

  if (error) {
    if (error.message.includes('Invalid')) throw new Error('Invalid event code')
    throw error
  }
  return data as Event
}

export async function updateParticipantStatus(participantId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('event_participants')
    .update({ status })
    .eq('id', participantId)

  if (error) throw error
}

// Event Items (dishes, supplies, tasks)

export async function getEventItems(eventId: string): Promise<EventItem[]> {
  const { data, error } = await supabase
    .from('event_items')
    .select('*, profile:profiles(display_name), recipe:recipes(title)')
    .eq('event_id', eventId)
    .order('sort_order')

  if (error) throw error
  return data as EventItem[]
}

export async function addEventItem(eventId: string, input: {
  type: 'dish' | 'supply' | 'task'
  name: string
  category?: string
  quantity?: number
  recipe_id?: string
  meal_slot?: string
  notes?: string
  due_at?: string
}): Promise<void> {
  const { error } = await supabase
    .from('event_items')
    .insert({
      event_id: eventId,
      type: input.type,
      name: input.name,
      category: input.category || 'other',
      quantity: input.quantity || null,
      recipe_id: input.recipe_id || null,
      meal_slot: input.meal_slot || null,
      notes: input.notes || null,
      due_at: input.due_at || null,
    })

  if (error) throw error
}

export async function claimItem(itemId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('event_items')
    .update({ assigned_to: user.id, status: 'claimed' })
    .eq('id', itemId)

  if (error) throw error
}

export async function unclaimItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('event_items')
    .update({ assigned_to: null, status: 'unclaimed' })
    .eq('id', itemId)

  if (error) throw error
}

export async function updateItemStatus(itemId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('event_items')
    .update({ status })
    .eq('id', itemId)

  if (error) throw error
}

export async function deleteEventItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('event_items').delete().eq('id', itemId)
  if (error) throw error
}

// Organizers

export async function getEventOrganizers(eventId: string): Promise<EventOrganizer[]> {
  const { data, error } = await supabase
    .from('event_organizers')
    .select('*, profile:profiles(display_name)')
    .eq('event_id', eventId)

  if (error) throw error
  return data as EventOrganizer[]
}

export async function addOrganizer(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('event_organizers')
    .insert({ event_id: eventId, user_id: userId })

  if (error) throw error
}

export async function removeOrganizer(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('event_organizers')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId)

  if (error) throw error
}

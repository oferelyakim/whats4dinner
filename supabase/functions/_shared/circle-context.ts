// Loads a circle's purpose + structured context and renders an AI-friendly block.
// Used by generate-meal-plan, plan-event, ai-chat to ground prompts in the
// circle's onboarding answers.

// Looser SupabaseLike — accepts the full client; we only call narrow shapes.
// deno-lint-ignore no-explicit-any
type SupabaseLike = any

interface CircleRow {
  name?: string
  icon?: string
  purpose?: string | null
  circle_type?: string | null
  context?: Record<string, unknown> | null
}

interface EventRow {
  id: string
  name: string
  event_date: string | null
  location: string | null
}

export interface CircleContextSummary {
  row: CircleRow | null
  events: EventRow[]
  block: string
}

export async function loadCircleContext(
  supabase: SupabaseLike,
  circleId: string,
): Promise<CircleContextSummary> {
  const { data } = await supabase
    .from('circles')
    .select('name, icon, purpose, circle_type, context')
    .eq('id', circleId)
    .maybeSingle()

  // Pull upcoming events so the assistant can resolve names like
  // "Sarah's birthday" → a real /events/{id}/plan link without guessing.
  // Best-effort: any error or missing rows just means no events block.
  let events: EventRow[] = []
  try {
    const todayIso = new Date().toISOString().slice(0, 10)
    const { data: rows } = await supabase
      .from('events')
      .select('id, name, event_date, location')
      .eq('circle_id', circleId)
      .or(`event_date.gte.${todayIso},event_date.is.null`)
      .order('event_date', { ascending: true, nullsFirst: false })
      .limit(15)
    if (Array.isArray(rows)) events = rows as EventRow[]
  } catch {
    // ignore
  }

  return {
    row: data ?? null,
    events,
    block: renderCircleContextBlock(data ?? null, events),
  }
}

export function renderCircleContextBlock(
  circle: CircleRow | null,
  events: EventRow[] = [],
): string {
  if (!circle && events.length === 0) return ''
  const lines: string[] = ['<circle_context>']
  if (!circle) {
    // events-only block (still useful so the assistant can resolve names)
    lines.push(...renderEventLines(events))
    lines.push('</circle_context>')
    return lines.length > 2 ? lines.join('\n') : ''
  }
  if (circle.name) lines.push(`Name: ${circle.name}`)
  if (circle.circle_type) lines.push(`Type: ${circle.circle_type}`)
  if (circle.purpose) lines.push(`Purpose: ${circle.purpose}`)

  const ctx = (circle.context ?? {}) as Record<string, unknown>
  const diet = ctx.diet as string[] | undefined
  if (diet?.length) lines.push(`Diet: ${diet.join(', ')}`)
  const allergies = ctx.allergies as string[] | undefined
  if (allergies?.length) lines.push(`Allergies: ${allergies.join(', ')}`)
  const dislikes = ctx.dislikes as string[] | undefined
  if (dislikes?.length) lines.push(`Avoid: ${dislikes.join(', ')}`)

  const cooking = ctx.cooking as Record<string, unknown> | undefined
  if (cooking) {
    const parts: string[] = []
    if (cooking.skill) parts.push(`skill ${cooking.skill}/5`)
    if (cooking.time_pref) parts.push(`prefers ${cooking.time_pref} cook time`)
    if (cooking.spice) parts.push(`spice ${cooking.spice}/5`)
    const cuisines = cooking.cuisines as string[] | undefined
    if (cuisines?.length) parts.push(`cuisines: ${cuisines.join(', ')}`)
    if (parts.length) lines.push(`Cooking: ${parts.join(', ')}`)
  }

  const household = ctx.household as Record<string, unknown> | undefined
  if (household) {
    const parts: string[] = []
    if (typeof household.adults === 'number') parts.push(`${household.adults} adults`)
    const kidsAges = household.kids_ages as number[] | undefined
    if (kidsAges?.length) parts.push(`${kidsAges.length} kids (ages ${kidsAges.join(', ')})`)
    if (parts.length) lines.push(`Household: ${parts.join(', ')}`)
  }

  const event = ctx.event as Record<string, unknown> | undefined
  if (event) {
    const parts: string[] = []
    if (event.date) parts.push(`date ${event.date}`)
    if (event.location) parts.push(`at ${event.location}`)
    if (event.venue) parts.push(`${event.venue}`)
    if (typeof event.headcount === 'number') parts.push(`~${event.headcount} guests`)
    if (event.age_mix) parts.push(`${event.age_mix}`)
    if (event.style) parts.push(`style: ${String(event.style).replace('_', ' ')}`)
    if (event.vibe) parts.push(`vibe: ${event.vibe}`)
    if (parts.length) lines.push(`Event: ${parts.join(', ')}`)
  }

  if (ctx.cadence) lines.push(`Cadence: ${ctx.cadence}`)
  if (ctx.notes) lines.push(`Notes: ${ctx.notes}`)

  lines.push(...renderEventLines(events))

  lines.push('</circle_context>')
  return lines.length > 2 ? lines.join('\n') : ''
}

function renderEventLines(events: EventRow[]): string[] {
  if (!events.length) return []
  const out: string[] = ['', 'Events in this circle (use these IDs to navigate to /events/{id}/plan):']
  for (const e of events) {
    const date = e.event_date ? ` (${e.event_date})` : ''
    const loc = e.location ? ` @ ${e.location}` : ''
    out.push(`  - ${e.name}${date}${loc} [id: ${e.id}]`)
  }
  return out
}

// Loads a circle's purpose + structured context and renders an AI-friendly block.
// Used by generate-meal-plan, plan-event, ai-chat to ground prompts in the
// circle's onboarding answers.

interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: CircleRow | null; error: unknown }>
      }
    }
  }
}

interface CircleRow {
  name?: string
  icon?: string
  purpose?: string | null
  circle_type?: string | null
  context?: Record<string, unknown> | null
}

export interface CircleContextSummary {
  row: CircleRow | null
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

  return { row: data ?? null, block: renderCircleContextBlock(data ?? null) }
}

export function renderCircleContextBlock(circle: CircleRow | null): string {
  if (!circle) return ''
  const lines: string[] = ['<circle_context>']
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

  lines.push('</circle_context>')
  return lines.length > 2 ? lines.join('\n') : ''
}

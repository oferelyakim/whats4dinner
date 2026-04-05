// Generate .ics calendar file and trigger download

interface CalendarEvent {
  title: string
  description?: string
  location?: string
  startDate: Date
  endDate?: Date
  allDay?: boolean
}

function formatIcsDate(date: Date, allDay?: boolean): string {
  if (allDay) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}${m}${d}`
  }
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function generateIcs(events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GatherPlate//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const event of events) {
    const end = event.endDate ?? new Date(event.startDate.getTime() + 2 * 60 * 60 * 1000) // Default 2hr

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${crypto.randomUUID()}@gatherplate`)
    lines.push(`DTSTAMP:${formatIcsDate(new Date())}`)

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.startDate, true)}`)
      const nextDay = new Date(end)
      nextDay.setDate(nextDay.getDate() + 1)
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(nextDay, true)}`)
    } else {
      lines.push(`DTSTART:${formatIcsDate(event.startDate)}`)
      lines.push(`DTEND:${formatIcsDate(end)}`)
    }

    lines.push(`SUMMARY:${escapeIcs(event.title)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`)
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(events: CalendarEvent[], filename: string = 'event.ics') {
  const ics = generateIcs(events)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Export a single event
export function exportEventToCalendar(event: {
  name: string
  description?: string | null
  event_date?: string | null
  location?: string | null
}) {
  if (!event.event_date) return

  downloadIcs([{
    title: event.name,
    description: event.description || undefined,
    location: event.location || undefined,
    startDate: new Date(event.event_date),
  }], `${event.name.replace(/\s+/g, '-')}.ics`)
}

// Export meal plan week to calendar
export function exportMealPlanToCalendar(plans: Array<{
  plan_date: string
  meal_type: string
  recipe?: { title: string } | null
  menu?: { name: string } | null
  notes?: string | null
}>) {
  const events: CalendarEvent[] = plans
    .filter((p) => p.recipe?.title || p.menu?.name || p.notes)
    .map((p) => {
      const title = p.recipe?.title || p.menu?.name || p.notes || 'Meal'
      const mealTime = p.meal_type === 'breakfast' ? 8 : p.meal_type === 'lunch' ? 12 : p.meal_type === 'dinner' ? 18 : 15
      const start = new Date(`${p.plan_date}T${String(mealTime).padStart(2, '0')}:00:00`)
      return {
        title: `${p.meal_type.charAt(0).toUpperCase() + p.meal_type.slice(1)}: ${title}`,
        startDate: start,
        endDate: new Date(start.getTime() + 60 * 60 * 1000), // 1 hour
      }
    })

  if (events.length) {
    downloadIcs(events, 'meal-plan.ics')
  }
}

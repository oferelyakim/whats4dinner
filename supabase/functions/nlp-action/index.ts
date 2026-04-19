import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = 'claude-haiku-4-5-20251001'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const INPUT_COST_PER_1M = 1.00
const OUTPUT_COST_PER_1M = 5.00

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AI not configured' }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { text, circleId } = await req.json()
    if (!text) {
      return new Response(
        JSON.stringify({ error: 'text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date()
    const todayIso = now.toISOString().split('T')[0]
    const todayWeekday = now.toLocaleDateString('en-US', { weekday: 'long' })
    const todayFriendly = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    const prompt = `You are a family household management assistant for the app "Replanish".

Today is ${todayWeekday}, ${todayFriendly} (ISO: ${todayIso}). Resolve all relative dates ("tomorrow", "this Monday", "next week") and holidays (Christmas=Dec 25, etc.) to concrete YYYY-MM-DD dates — use the nearest FUTURE occurrence if the date has already passed this year.

Parse the user's natural language request and return a structured action.

Supported actions:
1. "add_to_list" — Add items to a shopping list (e.g., "add milk and eggs to my list")
2. "add_activity" — Schedule an activity (e.g., "soccer practice Tuesday at 4pm")
3. "add_chore" — Create a chore (e.g., "remind me to take out the trash daily")
4. "search_recipe" — Search for a recipe (e.g., "find a pasta recipe")

Return JSON with:
{
  "action": "add_to_list" | "add_activity" | "add_chore" | "search_recipe",
  "params": { ... action-specific parameters },
  "confirmation": "Human-readable confirmation message"
}

For "add_to_list": params = { "items": ["item1", "item2"] }
For "add_activity": params = {
  "name": "activity name",
  "day_of_week": "tuesday",
  "start_time": "17:00",
  "end_time": null,
  "recurrence": "weekly",
  "end_date": "2026-06-30",
  "assigned_to": "Daniel"
}
Notes for add_activity:
- day_of_week: lowercase full day name (e.g., "tuesday")
- start_time / end_time: 24h HH:MM format, null if not mentioned
- recurrence: weekly/biweekly/daily/monthly/once
- end_date: YYYY-MM-DD format, null if not specified. Parse "until June" as last day of June in the current or next year. "until June 2026" → "2026-06-30"
- assigned_to: person name string, null if not specified
For "add_chore": params = { "name": "...", "frequency": "daily|weekly|once" }
For "search_recipe": params = { "query": "..." }

If the request doesn't match any action, return:
{ "action": "unknown", "params": {}, "confirmation": "I'm not sure what to do with that. Try something like 'add milk to my list' or 'schedule soccer practice on Tuesday'." }

User request: "${text}"

Return ONLY valid JSON.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Claude API error: ${await response.text()}`)
    }

    const result = await response.json()
    const responseText = result.content[0]?.text || '{}'
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: 'unknown', params: {}, confirmation: 'Could not parse response' }

    // Execute the action if possible
    if (parsed.action === 'add_to_list' && parsed.params.items?.length > 0) {
      // Resolve the circle to scope the list lookup to lists the user owns
      let resolvedCircleId: string | null = circleId ?? null

      if (!resolvedCircleId) {
        // Fall back: find any circle the authenticated user belongs to
        const { data: memberships } = await supabase
          .from('circle_members')
          .select('circle_id')
          .eq('user_id', user.id)
          .limit(1)
        resolvedCircleId = memberships?.[0]?.circle_id ?? null
      }

      if (!resolvedCircleId) {
        // No circle found — skip execution, return parsed response as-is
        parsed.executed = false
      } else {
        // Find the most recent active list scoped to the resolved circle
        const { data: lists } = await supabase
          .from('shopping_lists')
          .select('id')
          .eq('circle_id', resolvedCircleId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)

        if (lists && lists.length > 0) {
          const listId = lists[0].id
          for (const item of parsed.params.items) {
            await supabase.from('shopping_list_items').insert({
              list_id: listId,
              name: item,
              checked: false,
              sort_order: 0,
            })
          }
          parsed.executed = true
          parsed.confirmation += ` (Added to your active list)`
        }
      }
    }

    if (parsed.action === 'add_activity' && parsed.params.name) {
      // Try to match assigned_to with a circle member
      let assignedUserId: string | null = null
      let assignedName: string | null = parsed.params.assigned_to || null

      if (circleId && assignedName) {
        const { data: members } = await supabase
          .from('circle_members')
          .select('user_id, profiles(display_name, full_name)')
          .eq('circle_id', circleId)

        if (members) {
          for (const member of members) {
            const profile = member.profiles as { display_name?: string; full_name?: string } | null
            const memberName = (profile?.display_name || profile?.full_name || '').toLowerCase()
            if (memberName && assignedName.toLowerCase().includes(memberName.split(' ')[0])) {
              assignedUserId = member.user_id
              assignedName = profile?.display_name || profile?.full_name || assignedName
              break
            }
          }
        }
      }

      // Map day name to recurrence_days number
      const dayMap: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      }
      const dayName = (parsed.params.day_of_week || parsed.params.day || '').toLowerCase()
      const dayNumber = dayMap[dayName] ?? null
      const recurrenceDays = dayNumber !== null ? [dayNumber] : []

      // Calculate start_date: next occurrence of the day
      const today = new Date()
      let startDate = new Date(today)
      if (dayNumber !== null) {
        const daysUntil = (dayNumber - today.getDay() + 7) % 7
        startDate.setDate(today.getDate() + (daysUntil === 0 ? 7 : daysUntil))
      }

      const circleIdToUse: string | null = circleId || (
        await supabase
          .from('circle_members')
          .select('circle_id')
          .eq('user_id', user.id)
          .limit(1)
          .then((r) => r.data?.[0]?.circle_id ?? null)
      )

      if (circleIdToUse) {
        const activityData: Record<string, unknown> = {
          circle_id: circleIdToUse,
          name: parsed.params.name,
          recurrence_type: parsed.params.recurrence || 'weekly',
          recurrence_days: recurrenceDays,
          start_date: startDate.toISOString().split('T')[0],
          start_time: parsed.params.start_time || null,
          end_time: parsed.params.end_time || null,
          end_date: parsed.params.end_date || null,
          created_by: user.id,
        }

        if (assignedUserId) {
          activityData.assigned_to = assignedUserId
          activityData.assigned_name = assignedName
        } else if (assignedName) {
          activityData.assigned_name = assignedName
        }

        const { error: activityError } = await supabase.from('activities').insert(activityData)
        if (!activityError) {
          parsed.executed = true
          const dayDisplay = dayName ? dayName.charAt(0).toUpperCase() + dayName.slice(1) : ''
          parsed.confirmation = `Added "${parsed.params.name}"${dayDisplay ? ` every ${dayDisplay}` : ''}${parsed.params.start_time ? ` at ${parsed.params.start_time}` : ''}${parsed.params.end_date ? ` until ${parsed.params.end_date}` : ''}`
          if (assignedName) parsed.confirmation += ` for ${assignedName}`
        }
      }
    }

    const tokensIn = result.usage?.input_tokens || 0
    const tokensOut = result.usage?.output_tokens || 0
    const cost = (tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M

    return new Response(
      JSON.stringify({
        ...parsed,
        _ai_usage: { model: MODEL, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

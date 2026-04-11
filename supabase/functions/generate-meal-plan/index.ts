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

// Pricing per 1M tokens (Claude Haiku 4.5)
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
    // Verify auth
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

    const { circleId, dates, preferences } = await req.json()
    if (!circleId || !dates || !Array.isArray(dates)) {
      return new Response(
        JSON.stringify({ error: 'circleId and dates[] required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch user's recipes for context
    const { data: recipes } = await supabase
      .from('recipes')
      .select('id, title, tags, prep_time_min, cook_time_min, servings')
      .eq('circle_id', circleId)
      .is('type', null) // Only actual recipes, not supply kits
      .order('created_at', { ascending: false })
      .limit(50)

    const recipeList = (recipes || [])
      .map((r: any) => `- ${r.title} (${r.tags?.join(', ') || 'no tags'}, ${(r.prep_time_min || 0) + (r.cook_time_min || 0)}min)`)
      .join('\n')

    const prompt = `You are a meal planning assistant for a family. Generate a weekly meal plan.

Available recipes from the family's collection:
${recipeList || '(No saved recipes yet — suggest common family-friendly meals)'}

Dates to plan: ${dates.join(', ')}
${preferences ? `Preferences: ${preferences}` : ''}

Generate a JSON array of meal assignments. Each entry:
{ "date": "YYYY-MM-DD", "meal_type": "breakfast"|"lunch"|"dinner", "recipe_title": "...", "recipe_id": "..." (if from list, otherwise null) }

Rules:
- Plan breakfast, lunch, and dinner for each date
- Prefer recipes from the family's collection when possible
- Vary meals across the week (don't repeat the same recipe on consecutive days)
- Consider prep time — suggest quicker meals on weekdays
- If suggesting new meals not in the collection, set recipe_id to null

Return ONLY valid JSON array, no explanation.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Claude API error: ${err}`)
    }

    const result = await response.json()
    const text = result.content[0]?.text || '[]'

    // Parse the JSON from Claude's response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const mealPlan = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    // Calculate usage
    const tokensIn = result.usage?.input_tokens || 0
    const tokensOut = result.usage?.output_tokens || 0
    const cost = (tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M

    return new Response(
      JSON.stringify({
        plan: mealPlan,
        _ai_usage: { model: MODEL, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

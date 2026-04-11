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

// ─── Tool Definition for Structured Output ──────────────────────────────────

const MEAL_PLAN_TOOL = {
  name: 'generate_meal_plan',
  description: 'Generate a weekly meal plan for a family',
  input_schema: {
    type: 'object',
    properties: {
      meals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
            meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
            recipe_title: { type: 'string' },
            recipe_id: { type: ['string', 'null'], description: 'UUID from saved recipes, null if suggested' },
            quick_description: { type: 'string', description: 'One line: why this meal fits this slot' },
            estimated_time_min: { type: ['integer', 'null'], description: 'Estimated total cook time in minutes' },
          },
          required: ['date', 'meal_type', 'recipe_title'],
        },
      },
      shopping_suggestions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key ingredients to buy for the week',
      },
      notes: {
        type: 'string',
        description: 'Meal prep tips, batch cooking opportunities, or other helpful notes',
      },
    },
    required: ['meals'],
  },
}

const SYSTEM_PROMPT = `You are a family meal planning assistant for OurTable, a household coordination app popular in Israel.

Your job is to create practical, varied weekly meal plans that families will actually cook.

Guidelines:
- Prefer recipes from the family's saved collection when they fit — use exact recipe_id
- For new suggestions (recipe_id: null), suggest real, specific dishes — not generic "grilled chicken"
- Balance nutrition across the week: proteins, grains, vegetables, legumes
- Weekday meals should be practical (under 45 min total time)
- Weekend meals can be more elaborate or fun (baking projects, slow-cooked dishes)
- Don't repeat the same main protein on consecutive days
- Consider Israeli/Mediterranean cuisine as default — shakshuka, hummus, schnitzel, couscous, etc.
- Breakfast can be simple: yogurt + granola, toast + eggs, overnight oats
- Include at least 2 vegetarian dinners per week for variety
- If the family has few saved recipes, supplement with popular family-friendly dishes
- Provide a concise shopping list of key ingredients needed for the plan
- Add practical notes: batch cooking opportunities, prep-ahead suggestions`

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

    // Fetch user's recipes with more context for better suggestions
    const { data: recipes } = await supabase
      .from('recipes')
      .select('id, title, tags, prep_time_min, cook_time_min, servings, description')
      .eq('circle_id', circleId)
      .is('type', null) // Only actual recipes, not supply kits
      .order('created_at', { ascending: false })
      .limit(50)

    // Format recipes with useful context
    const recipeList = (recipes || [])
      .map((r: Record<string, unknown>) => {
        const totalTime = ((r.prep_time_min as number) || 0) + ((r.cook_time_min as number) || 0)
        const tags = (r.tags as string[])?.join(', ') || 'no tags'
        return `- [${r.id}] ${r.title} (${tags}, ${totalTime || '?'}min, serves ${r.servings || '?'})`
      })
      .join('\n')

    // Fetch recent meal plans to avoid repetition
    const { data: recentPlans } = await supabase
      .from('meal_plans')
      .select('date, meal_type, recipe:recipes(title)')
      .eq('circle_id', circleId)
      .gte('date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(30)

    const recentMeals = (recentPlans || [])
      .map((p: Record<string, unknown>) => {
        const recipe = p.recipe as Record<string, unknown> | null
        return `${p.date} ${p.meal_type}: ${recipe?.title || 'unknown'}`
      })
      .join('\n')

    const userMessage = `Plan meals for these dates: ${dates.join(', ')}

${recipeList ? `Family's saved recipes (use recipe_id when suggesting these):\n${recipeList}` : 'No saved recipes yet — suggest popular family-friendly meals.'}

${recentMeals ? `Recent meals (avoid repeating these):\n${recentMeals}` : ''}

${preferences ? `Family preferences/requests: ${preferences}` : ''}

Generate breakfast, lunch, and dinner for each date.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [MEAL_PLAN_TOOL],
        tool_choice: { type: 'tool', name: 'generate_meal_plan' },
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Claude API error: ${err}`)
    }

    const result = await response.json()

    // Extract structured output from tool_use
    const toolUse = result.content?.find((block: { type: string }) => block.type === 'tool_use')
    const mealPlan = toolUse?.input?.meals || []
    const shoppingSuggestions = toolUse?.input?.shopping_suggestions || []
    const notes = toolUse?.input?.notes || ''

    // Calculate usage
    const tokensIn = result.usage?.input_tokens || 0
    const tokensOut = result.usage?.output_tokens || 0
    const cost = (tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M

    return new Response(
      JSON.stringify({
        plan: mealPlan,
        shopping_suggestions: shoppingSuggestions,
        notes,
        _ai_usage: {
          model: MODEL,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

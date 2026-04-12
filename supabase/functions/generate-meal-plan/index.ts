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

// ─── Helper: Determine Season from Date ─────────────────────────────────────

function getSeason(dateStr: string): string {
  const month = new Date(dateStr).getMonth() + 1 // 1-12
  // Northern hemisphere seasons (Israel-based)
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

// ─── Tool Definition for Structured Output ──────────────────────────────────

const MEAL_PLAN_TOOL = {
  name: 'generate_meal_plan',
  description: 'Generate a weekly meal plan for a family with full recipe details for new dishes',
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
            recipe_id: {
              type: ['string', 'null'],
              description: 'UUID from saved recipes if reusing an existing one, null if this is a new suggestion',
            },
            quick_description: {
              type: 'string',
              description: '1-2 sentences: what the dish is and why it fits this slot',
            },
            estimated_time_min: {
              type: ['integer', 'null'],
              description: 'Total cook + prep time in minutes',
            },
            ingredients: {
              type: 'array',
              description: 'Full ingredient list — required for new recipes (recipe_id: null). Empty array for existing recipes.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  quantity: { type: ['number', 'null'] },
                  unit: { type: 'string', description: 'e.g. cup, tbsp, g, kg, ml, piece — empty string if count' },
                },
                required: ['name'],
              },
            },
            instructions: {
              type: 'string',
              description: 'Brief numbered steps for new recipes. Empty string if recipe_id is provided.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Dietary and category tags: e.g. vegetarian, vegan, gluten-free, quick, kid-friendly, batch-cook, mediterranean',
            },
            servings: {
              type: ['integer', 'null'],
              description: 'Number of servings this recipe yields',
            },
          },
          required: ['date', 'meal_type', 'recipe_title', 'ingredients', 'instructions', 'tags', 'servings'],
        },
      },
      shopping_suggestions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key ingredients to buy for the week that the family likely does not have on hand',
      },
      notes: {
        type: 'string',
        description: 'Practical tips: batch cooking opportunities, prep-ahead suggestions, storage advice',
      },
    },
    required: ['meals'],
  },
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert family meal planner for OurTable, a household coordination app used primarily in Israel.

Your goal is to create practical, varied, and delicious weekly meal plans that families will actually cook — not aspirational plans they will abandon.

## Cuisine & Cultural Context
- Default to Israeli/Mediterranean cuisine: shakshuka, hummus dishes, schnitzel, couscous, falafel, sabich, roast chicken with lemon and garlic, burekas, lentil soup, jachnun on weekends, etc.
- Incorporate seasonal vegetables and flavours naturally.
- Respect any stated cuisine preferences — if a family prefers Asian or Italian, pivot accordingly.
- Include dishes from a variety of origins (Ashkenazi, Mizrahi, Arab-Israeli, global) for variety.

## Meal Structure
- **Breakfast**: Keep practical. Options: shakshuka, toast with labneh/avo/eggs, overnight oats, yogurt + granola + fruit, French toast, smoothie bowl.
- **Lunch**: Mid-weight meals. Good for leftovers from dinner. Sandwiches, grain bowls, soups, pasta, salads with protein.
- **Dinner**: The main event. Vary proteins — chicken, beef, fish, legumes, eggs. At least 2 fully vegetarian dinners per week.

## Weekday vs Weekend Pacing
- **Weekdays (Mon–Fri)**: Prioritise speed. Dinners under 45 min total. Quick lunches. Simple breakfasts.
- **Weekends (Sat–Sun/Fri evening)**: Allow more elaborate cooking — slow braises, homemade bread, baked goods, social meals like charcuterie or mezze spreads.

## Nutrition Balance
- Spread proteins across the week: do not repeat the same main protein on consecutive dinners.
- Include vegetables in most meals — roasted, raw, or as the main component.
- Balance heavier meals with lighter ones in the same day.
- Suggest batch-cooking opportunities where one cook session feeds multiple meals.

## Dietary Compliance
- If dietary restrictions are provided, STRICTLY exclude non-compliant ingredients.
- If calorie targets are given, size portions and dish richness accordingly.
- If cooking skill level is basic, avoid techniques like deglazing, tempering, or complex pastry.

## Seasonal Awareness
- Summer: Light, fresh dishes. Cold soups, salads, grilled foods, raw vegetable dishes.
- Winter: Warm, comforting dishes. Stews, roasts, hot soups, baked pasta.
- Spring/Autumn: Transition foods — some warming, some fresh.

## New Recipe Requirements
For every meal where recipe_id is null, you MUST provide:
- A complete ingredient list with quantities and units
- Clear numbered cooking instructions (concise but complete)
- Accurate estimated_time_min
- Realistic servings count
- Relevant dietary tags

## Saved Recipe Reuse
When a saved recipe fits a slot well, use it (set recipe_id). Set ingredients to [] and instructions to "" for those — the family already has the recipe.

## Budget Awareness
Mix premium and budget-friendly meals across the week. Do not plan expensive proteins every night. Legume-based meals are affordable and nutritious — include them.`

// ─── Main Handler ────────────────────────────────────────────────────────────

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

    const {
      circleId,
      dates,
      preferences,
    }: {
      circleId: string
      dates: string[]
      preferences?: {
        dietary_restrictions?: string
        calorie_target?: string
        cuisine_preferences?: string
        skill_level?: string
        weekday_time_budget_min?: number
        weekend_time_budget_min?: number
        servings?: number
        special_requests?: string
      }
    } = await req.json()

    if (!circleId || !dates || !Array.isArray(dates)) {
      return new Response(
        JSON.stringify({ error: 'circleId and dates[] required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch user's recipes with context for better suggestions
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

    // Determine season from the first requested date
    const season = getSeason(dates[0])

    // Build structured preferences block
    const prefsBlock = `User preferences:
- Dietary restrictions: ${preferences?.dietary_restrictions || 'none specified'}
- Calorie target: ${preferences?.calorie_target || 'not specified'}
- Cuisine preferences: ${preferences?.cuisine_preferences || 'Israeli/Mediterranean default'}
- Cooking skill level: ${preferences?.skill_level || 'intermediate'}
- Time budget weekdays: ${preferences?.weekday_time_budget_min ? `under ${preferences.weekday_time_budget_min} min` : 'under 45 min'}
- Time budget weekends: ${preferences?.weekend_time_budget_min ? `under ${preferences.weekend_time_budget_min} min` : 'flexible'}
- Number of people: ${preferences?.servings || 'not specified — assume 4'}
- Special requests: ${preferences?.special_requests || 'none'}`

    const userMessage = `Plan meals for these dates: ${dates.join(', ')}
Current season: ${season}

${prefsBlock}

${recipeList ? `Family's saved recipes (use recipe_id when suggesting these):\n${recipeList}` : 'No saved recipes yet — suggest popular family-friendly meals with full details.'}

${recentMeals ? `Recent meals from the past 2 weeks (avoid repeating):\n${recentMeals}` : ''}

Generate breakfast, lunch, and dinner for each date. For new recipes (recipe_id: null), provide the complete ingredient list, instructions, tags, and servings.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
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

    // Calculate usage and cost
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

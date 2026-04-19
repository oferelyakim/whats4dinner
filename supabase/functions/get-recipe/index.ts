import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MODEL = 'claude-haiku-4-5-20251001'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecipeIngredient {
  name: string
  quantity: number | null
  unit: string
}

interface RecipeOutput {
  title: string
  ingredients: RecipeIngredient[]
  instructions: string[]
  servings: number | null
  prep_time_min: number | null
  cook_time_min: number | null
  estimated_time_min: number | null
  tags: string[]
  from_web: boolean
  source_url?: string
  thumbnail?: string
}

// ─── TheMealDB helpers ────────────────────────────────────────────────────────

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 0.3333,
  '⅔': 0.6667,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

function parseMeasure(measure: string): { quantity: number | null; unit: string } {
  const cleaned = (measure || '').trim()
  if (!cleaned) return { quantity: null, unit: '' }

  // Unicode fractions (e.g. "½", "1½ cups")
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (cleaned.includes(ch)) {
      const rest = cleaned.replace(ch, '').trim()
      const wholeMatch = rest.match(/^(\d+)(.*)$/)
      const whole = wholeMatch ? parseInt(wholeMatch[1]) : 0
      const unit = wholeMatch ? wholeMatch[2].trim() : rest
      return { quantity: whole + val, unit }
    }
  }

  // Mixed fraction: "1 1/2 cups"
  const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/)
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1])
    const frac = parseInt(mixedMatch[2]) / parseInt(mixedMatch[3])
    return { quantity: whole + frac, unit: mixedMatch[4].trim() }
  }

  // Slash fraction: "1/2" or "3/4 tsp"
  const slashMatch = cleaned.match(/^(\d+)\/(\d+)\s*(.*)$/)
  if (slashMatch) {
    return {
      quantity: parseInt(slashMatch[1]) / parseInt(slashMatch[2]),
      unit: slashMatch[3].trim(),
    }
  }

  // Plain number: "2 cups"
  const numMatch = cleaned.match(/^([\d.]+)\s*(.*)$/)
  if (numMatch) {
    return { quantity: parseFloat(numMatch[1]), unit: numMatch[2].trim() }
  }

  return { quantity: null, unit: cleaned }
}

function parseMealDbRecipe(meal: Record<string, string>): RecipeOutput {
  const ingredients: RecipeIngredient[] = []
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] || '').trim()
    const measure = (meal[`strMeasure${i}`] || '').trim()
    if (!name) continue
    const { quantity, unit } = parseMeasure(measure)
    ingredients.push({ name, quantity, unit })
  }

  const rawInstructions = meal.strInstructions || ''
  const instructions = rawInstructions
    .split(/\r?\n\r?\n|\r?\n(?=\d+[\.\)])|(?<=\.)\s+(?=[A-Z])/)
    .map((s: string) => s.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter((s: string) => s.length > 10)
    .slice(0, 20)

  const estimatedTimeMin = Math.max(20, Math.min(120, instructions.length * 5))

  return {
    title: meal.strMeal,
    ingredients,
    instructions: instructions.length > 0 ? instructions : ['Follow standard preparation method.'],
    servings: 4,
    prep_time_min: null,
    cook_time_min: null,
    estimated_time_min: estimatedTimeMin,
    tags: [meal.strCategory, meal.strArea].filter(Boolean),
    from_web: true,
    source_url: meal.strSource || '',
    thumbnail: meal.strMealThumb || '',
  }
}

function dishNamesOverlap(requested: string, found: string): boolean {
  const reqWords = requested.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const foundWords = found.toLowerCase().split(/\s+/)
  const matches = reqWords.filter((w) =>
    foundWords.some((fw) => fw.includes(w) || w.includes(fw))
  )
  return matches.length > 0
}

// ─── Claude fallback ──────────────────────────────────────────────────────────

const SINGLE_RECIPE_TOOL = {
  name: 'create_recipe',
  description: 'Create a complete single recipe with all details',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: ['number', 'null'] },
            unit: { type: 'string' },
          },
          required: ['name'],
        },
      },
      instructions: { type: 'array', items: { type: 'string' } },
      servings: { type: ['integer', 'null'] },
      prep_time_min: { type: ['integer', 'null'] },
      cook_time_min: { type: ['integer', 'null'] },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'ingredients', 'instructions'],
  },
}

async function generateWithClaude(
  dishName: string,
  tags: string[],
  preferences: string | undefined,
): Promise<RecipeOutput> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('AI not configured')
  }

  const tagsPart = tags.length > 0 ? `Tags: ${tags.join(', ')}.` : ''
  const prefsPart = preferences ? `Dietary notes: ${preferences}` : ''
  const userMessage = `Create a complete recipe for: "${dishName}". ${tagsPart} ${prefsPart}`.trim()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system:
        'You are an expert chef. Create practical family recipes. Default to Mediterranean/Middle-Eastern style unless specified otherwise. Use metric measurements.',
      tools: [SINGLE_RECIPE_TOOL],
      tool_choice: { type: 'tool', name: 'create_recipe' },
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error: ${errorText}`)
  }

  const result = await response.json()
  const toolUse = result.content?.find((b: { type: string }) => b.type === 'tool_use')
  if (!toolUse?.input) {
    throw new Error('No recipe returned from Claude')
  }

  const input = toolUse.input as {
    title: string
    ingredients: RecipeIngredient[]
    instructions: string[]
    servings?: number | null
    prep_time_min?: number | null
    cook_time_min?: number | null
    tags?: string[]
  }

  const prepTime = input.prep_time_min ?? null
  const cookTime = input.cook_time_min ?? null
  const estimatedTime =
    prepTime !== null && cookTime !== null
      ? prepTime + cookTime
      : prepTime ?? cookTime ?? null

  return {
    title: input.title,
    ingredients: input.ingredients || [],
    instructions: input.instructions || [],
    servings: input.servings ?? null,
    prep_time_min: prepTime,
    cook_time_min: cookTime,
    estimated_time_min: estimatedTime,
    tags: input.tags || tags,
    from_web: false,
  }
}

// ─── TheMealDB fetch ──────────────────────────────────────────────────────────

async function fetchFromMealDb(dishName: string): Promise<RecipeOutput | null> {
  const encoded = encodeURIComponent(dishName)
  const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encoded}`

  const response = await fetch(url, {
    headers: { 'User-Agent': 'OurTable-App/1.0' },
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) return null

  const data = await response.json()
  const meal = data?.meals?.[0]
  if (!meal) return null

  if (!dishNamesOverlap(dishName, meal.strMeal)) return null

  return parseMealDbRecipe(meal as Record<string, string>)
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Parse body
    const body = await req.json()
    const {
      dish_name,
      tags = [],
      source_preference,
      preferences,
    } = body as {
      dish_name: string
      tags?: string[]
      source_preference?: 'web' | 'generate'
      preferences?: string
    }

    if (!dish_name || typeof dish_name !== 'string' || !dish_name.trim()) {
      return new Response(
        JSON.stringify({ error: 'dish_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let recipe: RecipeOutput | null = null

    // Phase 1: Try TheMealDB unless caller prefers AI generation
    if (source_preference !== 'generate') {
      try {
        recipe = await fetchFromMealDb(dish_name.trim())
      } catch {
        // Network error — silently fall through to Claude
      }
    }

    // Phase 2: Claude fallback
    if (!recipe) {
      try {
        recipe = await generateWithClaude(dish_name.trim(), tags, preferences)
      } catch (claudeErr: unknown) {
        const message = claudeErr instanceof Error ? claudeErr.message : 'Unknown error'
        return new Response(
          JSON.stringify({ error: 'Could not generate recipe', detail: message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    return new Response(
      JSON.stringify(recipe),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

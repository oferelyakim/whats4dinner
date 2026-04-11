import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = 'claude-haiku-4-5-20251001'

// Pricing per 1M tokens (Claude Haiku 4.5)
const INPUT_COST_PER_1M = 1.00
const OUTPUT_COST_PER_1M = 5.00

// ─── Types ──────────────────────────────────────────────────────────────────

interface Ingredient {
  name: string
  quantity: number | null
  unit: string
}

interface ExtractedRecipe {
  title: string
  description?: string
  instructions?: string
  image_url?: string | null
  prep_time_min?: number | null
  cook_time_min?: number | null
  servings?: number | null
  ingredients: Ingredient[]
  tags?: string[]
}

interface AIUsage {
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
}

// ─── JSON-LD Extraction (No AI needed) ──────────────────────────────────────

function extractJsonLdRecipe(html: string): ExtractedRecipe | null {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match

  while ((match = regex.exec(html)) !== null) {
    try {
      let data = JSON.parse(match[1])

      // Handle @graph wrapper (Dotdash Meredith sites: allrecipes, simplyrecipes, seriouseats)
      if (data['@graph']) data = data['@graph']

      // Handle arrays — find the Recipe type
      if (Array.isArray(data)) {
        data = data.find(
          (item: Record<string, unknown>) =>
            item['@type'] === 'Recipe' ||
            (Array.isArray(item['@type']) && (item['@type'] as string[]).includes('Recipe'))
        )
      }

      // Handle nested in WebPage mainEntity
      if (data?.['@type'] === 'WebPage' && data.mainEntity?.['@type'] === 'Recipe') {
        data = data.mainEntity
      }

      if (!data) continue
      const type = data['@type']
      if (type !== 'Recipe' && !(Array.isArray(type) && type.includes('Recipe'))) continue

      // Parse ingredients
      const ingredients = (data.recipeIngredient || []).map((raw: string) => parseIngredientString(stripHtml(raw)))

      // Parse instructions — handle HowToStep, HowToSection, and plain strings
      const instructions = parseInstructions(data.recipeInstructions)

      // Parse image — can be string, array, or ImageObject
      let imageUrl: string | null = null
      if (typeof data.image === 'string') {
        imageUrl = data.image
      } else if (Array.isArray(data.image)) {
        imageUrl = typeof data.image[0] === 'string' ? data.image[0] : data.image[0]?.url || null
      } else if (data.image?.url) {
        imageUrl = data.image.url
      }

      return {
        title: stripHtml(data.name || 'Untitled Recipe'),
        description: data.description ? stripHtml(data.description) : undefined,
        instructions: instructions || undefined,
        image_url: imageUrl,
        prep_time_min: parseDuration(data.prepTime),
        cook_time_min: parseDuration(data.cookTime),
        servings: parseServings(data.recipeYield),
        ingredients,
        tags: extractTags(data),
      }
    } catch {
      continue
    }
  }

  return null
}

function parseInstructions(raw: unknown): string | undefined {
  if (!raw) return undefined

  if (typeof raw === 'string') return stripHtml(raw)

  if (Array.isArray(raw)) {
    return raw
      .map((step: unknown) => {
        if (typeof step === 'string') return stripHtml(step)
        const s = step as Record<string, unknown>
        if (s.text) return stripHtml(s.text as string)
        // HowToSection — contains grouped steps
        if (s['@type'] === 'HowToSection') {
          const sectionName = s.name ? `${stripHtml(s.name as string)}:\n` : ''
          const items = (s.itemListElement as Record<string, unknown>[]) || []
          const sectionSteps = items
            .map((i) => (typeof i === 'string' ? stripHtml(i) : stripHtml((i.text as string) || '')))
            .filter(Boolean)
            .join('\n')
          return sectionName + sectionSteps
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return undefined
}

function extractTags(data: Record<string, unknown>): string[] {
  const tags: string[] = []
  if (data.recipeCategory) {
    const cats = Array.isArray(data.recipeCategory) ? data.recipeCategory : [data.recipeCategory]
    tags.push(...cats.map((c: string) => c.toLowerCase()))
  }
  if (data.recipeCuisine) {
    const cuisines = Array.isArray(data.recipeCuisine) ? data.recipeCuisine : [data.recipeCuisine]
    tags.push(...cuisines.map((c: string) => c.toLowerCase()))
  }
  if (data.keywords) {
    const kw = typeof data.keywords === 'string'
      ? data.keywords.split(',').map((k: string) => k.trim().toLowerCase())
      : (data.keywords as string[]).map((k: string) => k.toLowerCase())
    tags.push(...kw.slice(0, 5)) // Limit to 5 keyword tags
  }
  return [...new Set(tags)].slice(0, 10)
}

// ─── HTML Preprocessing ─────────────────────────────────────────────────────

function preprocessHtml(rawHtml: string): string {
  let html = rawHtml

  // 1. Remove script (except JSON-LD, already extracted), style, and non-content elements
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '')
  html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, '')

  // 2. Remove structural noise
  html = html.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  html = html.replace(/<footer[\s\S]*?<\/footer>/gi, '')
  html = html.replace(/<header[\s\S]*?<\/header>/gi, '')
  html = html.replace(/<aside[\s\S]*?<\/aside>/gi, '')
  html = html.replace(/<!--[\s\S]*?-->/g, '')

  // 3. Try to extract just the recipe area
  const recipeArea = extractRecipeArea(html)
  if (recipeArea && recipeArea.length > 300) {
    html = recipeArea
  }

  // 4. Strip HTML attributes (keep only href and src to reduce noise)
  html = html.replace(/ (?:class|id|style|data-\w+|onclick|onload|aria-\w+)="[^"]*"/gi, '')

  // 5. Remove empty elements and collapse whitespace
  html = html.replace(/<(\w+)[^>]*>\s*<\/\1>/g, '')
  html = html.replace(/\n\s*\n/g, '\n')
  html = html.replace(/\s{2,}/g, ' ')

  // 6. Trim to reasonable size — cleaned HTML should be much smaller
  if (html.length > 15000) {
    html = html.substring(0, 15000)
  }

  return html.trim()
}

function extractRecipeArea(html: string): string | null {
  // Priority order — recipe plugins first, then generic containers
  const patterns = [
    // WordPress recipe plugins (most specific)
    /<div[^>]*class="[^"]*wprm-recipe-container[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i,
    /<div[^>]*class="[^"]*tasty-recipes[^"]*"[\s\S]*?<\/div>\s*<\/div>/i,
    /<div[^>]*class="[^"]*mv-create-card[^"]*"[\s\S]*?<\/div>\s*<\/div>/i,
    // Schema.org microdata
    /itemtype="[^"]*schema\.org\/Recipe"[\s\S]*?<\/(?:div|article|section)>/i,
    // Generic recipe containers
    /<(?:article|div|section)[^>]*(?:class|id)="[^"]*recipe[^"]*"[\s\S]*?<\/(?:article|div|section)>/i,
    // Content area fallback
    /<article[^>]*>[\s\S]*?<\/article>/i,
    /<main[^>]*>[\s\S]*?<\/main>/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[0].length > 300) {
      return match[0]
    }
  }

  return null
}

// ─── AI Extraction (Claude API with Structured Output) ──────────────────────

const RECIPE_TOOL = {
  name: 'extract_recipe',
  description: 'Extract structured recipe data from the provided content',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Recipe name in its original language' },
      description: { type: 'string', description: 'Brief 1-2 sentence description' },
      instructions: { type: 'string', description: 'Step-by-step instructions, each step on a new line' },
      image_url: { type: ['string', 'null'], description: 'URL of recipe image, or null' },
      prep_time_min: { type: ['integer', 'null'], description: 'Prep time in minutes' },
      cook_time_min: { type: ['integer', 'null'], description: 'Cook time in minutes' },
      servings: { type: ['integer', 'null'], description: 'Number of servings' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ingredient name without quantity/unit/prep notes' },
            quantity: { type: ['number', 'null'], description: 'Numeric quantity, null if unspecified' },
            unit: { type: 'string', description: 'Normalized unit (cup, tbsp, tsp, g, kg, ml, l, oz, lb, piece, can, pack, bunch, clove), empty if unitless' },
          },
          required: ['name', 'quantity', 'unit'],
        },
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Auto-detected tags: cuisine, diet, meal type',
      },
    },
    required: ['title', 'ingredients'],
  },
}

const SYSTEM_PROMPT = `You are a recipe extraction expert for a bilingual (English/Hebrew) cooking application.

Extract structured recipe data from the provided content (HTML or image).

Rules:
- Extract ALL ingredients with precise quantities and units
- Preserve the original language — do not translate Hebrew to English or vice versa
- Parse fraction quantities: 1/2→0.5, 1/3→0.333, 1/4→0.25, 3/4→0.75, ½→0.5, ⅓→0.333, ¼→0.25, ¾→0.75
- Parse ranges: "2-3 cups" → use the lower number (2)
- Parse compound fractions: "1 1/2 cups" → 1.5
- Separate prep instructions from ingredient name: "1 onion, finely diced" → name: "onion"
- For ingredients with no quantity (e.g., "salt to taste", "מלח לפי הטעם"), set quantity to null, unit to ""
- Normalize units: tablespoon→tbsp, teaspoon→tsp, ounce→oz, pound→lb
- Hebrew units: כוס→cup, כף→tbsp, כפית→tsp, גרם→g, קילו/ק"ג→kg, ליטר→l, מ"ל→ml
- Hebrew fractions: חצי→0.5, שליש→0.333, רבע→0.25, "כוס וחצי"→quantity:1.5 unit:cup
- Hebrew imprecise: מעט/קורט/קמצוץ → quantity: null
- Instructions: clear steps, one per line, no numbering prefix
- If content is not a recipe, return title "Not a recipe" with empty ingredients array`

async function extractWithAI(
  content: { type: string; text?: string; source?: object }[],
  apiKey: string,
): Promise<{ recipe: ExtractedRecipe | null; usage: AIUsage }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [RECIPE_TOOL],
      tool_choice: { type: 'tool', name: 'extract_recipe' },
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('Claude API error:', err)
    throw new Error('AI service error')
  }

  const data = await response.json()

  // Extract token usage
  const tokensIn = data.usage?.input_tokens ?? 0
  const tokensOut = data.usage?.output_tokens ?? 0
  const costUsd = (tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M

  const usage: AIUsage = {
    model: MODEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
  }

  // Extract recipe from tool_use response
  const toolUse = data.content?.find((block: { type: string }) => block.type === 'tool_use')
  if (!toolUse?.input?.title || toolUse.input.title === 'Not a recipe') {
    return { recipe: null, usage }
  }

  return { recipe: toolUse.input as ExtractedRecipe, usage }
}

// ─── Ingredient Parsing (for JSON-LD strings) ──────────────────────────────

function parseIngredientString(raw: string): Ingredient {
  const text = normalizeUnicodeFractions(raw.trim())

  // Try Hebrew patterns first
  const hebrewResult = parseHebrewIngredient(text)
  if (hebrewResult) return hebrewResult

  // English pattern: "1 1/2 cups all-purpose flour, sifted"
  const match = text.match(
    /^([\d./\s½⅓¼¾⅔]+)?\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lb|lbs?|pounds?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|bunch(?:es)?|cloves?|cans?|packs?|packages?|bags?|bottles?|boxes?|jars?|slices?|pieces?|heads?|stalks?|sprigs?|pinch(?:es)?|dash(?:es)?)\b\.?\s*(?:of\s+)?(.+)$/i
  )

  if (match) {
    const qtyStr = match[1]?.trim()
    const quantity = qtyStr ? parseQuantity(qtyStr) : null
    const unit = normalizeUnit(match[2])
    const name = cleanIngredientName(match[3])
    return { name, quantity, unit }
  }

  // Simple numeric prefix: "3 large eggs"
  const simpleMatch = text.match(/^([\d./\s]+)\s+(.+)$/i)
  if (simpleMatch) {
    const quantity = parseQuantity(simpleMatch[1].trim())
    const name = cleanIngredientName(simpleMatch[2])
    return { name, quantity, unit: '' }
  }

  return { name: cleanIngredientName(text), quantity: null, unit: '' }
}

function parseHebrewIngredient(text: string): Ingredient | null {
  // Check if text contains Hebrew characters
  if (!/[\u0590-\u05FF]/.test(text)) return null

  // Pattern: "כוס וחצי קמח" (cup and a half flour)
  const cupAndHalfMatch = text.match(/^(כוס|כף|כפית)\s+וחצי\s+(.+)$/i)
  if (cupAndHalfMatch) {
    return {
      name: cleanIngredientName(cupAndHalfMatch[2]),
      quantity: 1.5,
      unit: normalizeHebrewUnit(cupAndHalfMatch[1]),
    }
  }

  // Pattern: "חצי/שליש/רבע כוס סוכר" (half cup sugar)
  const fractionUnitMatch = text.match(/^(חצי|שליש|רבע|שלושה רבעי|שני שלישים)\s+(כוס|כוסות|כף|כפות|כפית|כפיות|ליטר|מ"ל|ק"ג)\s+(.+)$/i)
  if (fractionUnitMatch) {
    return {
      name: cleanIngredientName(fractionUnitMatch[3]),
      quantity: parseHebrewFraction(fractionUnitMatch[1]),
      unit: normalizeHebrewUnit(fractionUnitMatch[2]),
    }
  }

  // Pattern: "2 כוסות קמח" (2 cups flour)
  const numUnitMatch = text.match(/^([\d./]+)\s+(כוס|כוסות|כף|כפות|כפית|כפיות|גרם|קילו|ק"ג|ליטר|מ"ל|חבילה|חבילות|פחית|פחיות|יחידה|יחידות|פרוסה|פרוסות|צרור|אגודה)\s+(.+)$/i)
  if (numUnitMatch) {
    return {
      name: cleanIngredientName(numUnitMatch[3]),
      quantity: parseQuantity(numUnitMatch[1]),
      unit: normalizeHebrewUnit(numUnitMatch[2]),
    }
  }

  // Pattern: "3 שיני שום" (3 cloves garlic)
  const cloveMatch = text.match(/^([\d./]+)\s+שיני?\s+(.+)$/i)
  if (cloveMatch) {
    return {
      name: cleanIngredientName(cloveMatch[2]),
      quantity: parseQuantity(cloveMatch[1]),
      unit: 'clove',
    }
  }

  // Pattern: "כף שמן זית" (tablespoon olive oil — implied quantity 1)
  const impliedOneMatch = text.match(/^(כוס|כף|כפית|חבילה|פחית|צרור|אגודה)\s+(.+)$/i)
  if (impliedOneMatch) {
    return {
      name: cleanIngredientName(impliedOneMatch[2]),
      quantity: 1,
      unit: normalizeHebrewUnit(impliedOneMatch[1]),
    }
  }

  // Pattern: "200 גרם חזה עוף" (200g chicken breast)
  const gramMatch = text.match(/^([\d./]+)\s+(גרם|ג'|מ"ל|ml|g)\s+(.+)$/i)
  if (gramMatch) {
    return {
      name: cleanIngredientName(gramMatch[3]),
      quantity: parseQuantity(gramMatch[1]),
      unit: normalizeHebrewUnit(gramMatch[2]),
    }
  }

  // Pattern: imprecise quantities — "מעט פלפל", "קורט מלח"
  const impreciseMatch = text.match(/^(מעט|קורט|קמצוץ)\s+(.+)$/i)
  if (impreciseMatch) {
    return {
      name: cleanIngredientName(impreciseMatch[2]),
      quantity: null,
      unit: '',
    }
  }

  // Pattern: "מלח ופלפל לפי הטעם" (salt and pepper to taste)
  if (/לפי הטעם/.test(text)) {
    return {
      name: cleanIngredientName(text.replace(/,?\s*לפי הטעם/, '')),
      quantity: null,
      unit: '',
    }
  }

  // Simple Hebrew numeric: "3 ביצים"
  const simpleHebrew = text.match(/^([\d./]+)\s+(.+)$/i)
  if (simpleHebrew) {
    return {
      name: cleanIngredientName(simpleHebrew[2]),
      quantity: parseQuantity(simpleHebrew[1]),
      unit: '',
    }
  }

  return null
}

function parseHebrewFraction(word: string): number {
  const map: Record<string, number> = {
    'חצי': 0.5,
    'שליש': 0.333,
    'רבע': 0.25,
    'שלושה רבעי': 0.75,
    'שני שלישים': 0.667,
  }
  return map[word] ?? 1
}

function normalizeHebrewUnit(unit: string): string {
  const map: Record<string, string> = {
    'כוס': 'cup', 'כוסות': 'cup',
    'כף': 'tbsp', 'כפות': 'tbsp',
    'כפית': 'tsp', 'כפיות': 'tsp',
    'גרם': 'g', "ג'": 'g',
    'קילו': 'kg', 'ק"ג': 'kg',
    'ליטר': 'l',
    'מ"ל': 'ml', 'ml': 'ml', 'g': 'g',
    'חבילה': 'pack', 'חבילות': 'pack',
    'פחית': 'can', 'פחיות': 'can',
    'יחידה': 'piece', 'יחידות': 'piece',
    'פרוסה': 'piece', 'פרוסות': 'piece',
    'צרור': 'bunch', 'אגודה': 'bunch',
  }
  return map[unit] ?? unit
}

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().replace(/\.$/, '')
  const map: Record<string, string> = {
    'cup': 'cup', 'cups': 'cup',
    'tbsp': 'tbsp', 'tablespoon': 'tbsp', 'tablespoons': 'tbsp',
    'tsp': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp',
    'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz',
    'lb': 'lb', 'lbs': 'lb', 'pound': 'lb', 'pounds': 'lb',
    'g': 'g', 'gram': 'g', 'grams': 'g',
    'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
    'ml': 'ml', 'milliliter': 'ml', 'milliliters': 'ml',
    'l': 'l', 'liter': 'l', 'liters': 'l',
    'bunch': 'bunch', 'bunches': 'bunch',
    'clove': 'clove', 'cloves': 'clove',
    'can': 'can', 'cans': 'can',
    'pack': 'pack', 'packs': 'pack', 'package': 'pack', 'packages': 'pack',
    'bag': 'pack', 'bags': 'pack',
    'bottle': 'bottle', 'bottles': 'bottle',
    'box': 'box', 'boxes': 'box',
    'jar': 'jar', 'jars': 'jar',
    'slice': 'piece', 'slices': 'piece',
    'piece': 'piece', 'pieces': 'piece',
    'head': 'piece', 'heads': 'piece',
    'stalk': 'piece', 'stalks': 'piece',
    'sprig': 'piece', 'sprigs': 'piece',
    'pinch': 'pinch', 'pinches': 'pinch',
    'dash': 'dash', 'dashes': 'dash',
  }
  return map[u] ?? u
}

function parseQuantity(str: string): number {
  const trimmed = str.trim()
  if (!trimmed) return 1

  // Handle compound fractions: "1 1/2" or "2 3/4"
  const compoundMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (compoundMatch) {
    return parseInt(compoundMatch[1]) + parseInt(compoundMatch[2]) / parseInt(compoundMatch[3])
  }

  // Handle simple fractions: "1/2", "3/4"
  if (trimmed.includes('/')) {
    const [num, den] = trimmed.split('/')
    return parseInt(num) / parseInt(den)
  }

  // Handle ranges: "2-3" → use lower
  if (trimmed.includes('-')) {
    return parseFloat(trimmed.split('-')[0])
  }

  return parseFloat(trimmed) || 1
}

function normalizeUnicodeFractions(text: string): string {
  return text
    .replace(/½/g, '1/2')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅛/g, '1/8')
}

function cleanIngredientName(name: string): string {
  return name
    .replace(/,\s*(finely |roughly |freshly |thinly )?(diced|chopped|minced|sliced|grated|crushed|julienned|cubed|shredded|melted|softened|sifted|toasted|peeled|cored|trimmed|beaten|whisked).*$/i, '')
    .replace(/,\s*(חתוך|קצוץ|טחון|מגורד|כתוש|פרוס|מרוסק|מומס|רך|מנופה|קלוי).*$/i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ') // Remove parenthetical notes
    .trim()
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function parseDuration(iso?: string): number | undefined {
  if (!iso) return undefined
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return undefined
  return (parseInt(m[1] || '0') * 60) + parseInt(m[2] || '0') || undefined
}

function parseServings(y?: string | string[] | number): number | undefined {
  if (typeof y === 'number') return y
  const s = Array.isArray(y) ? y[0] : y
  if (!s) return undefined
  const m = String(s).match(/(\d+)/)
  return m ? parseInt(m[1]) : undefined
}

// ─── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { url, image_base64 } = body

    if (!url && !image_base64) {
      return new Response(JSON.stringify({ error: 'URL or image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Image Import: always uses AI ──
    if (image_base64) {
      const mediaType = image_base64.startsWith('/9j/') ? 'image/jpeg'
        : image_base64.startsWith('iVBOR') ? 'image/png'
        : 'image/jpeg' // default fallback

      const { recipe, usage } = await extractWithAI([
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: image_base64,
          },
        },
        {
          type: 'text',
          text: 'Extract the recipe from this image. If it contains Hebrew text, preserve the Hebrew. If the image is at an angle or partially obscured, read it carefully.',
        },
      ], ANTHROPIC_API_KEY!)

      if (!recipe) {
        return new Response(JSON.stringify({ error: 'Could not extract recipe from image' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return jsonResponse({ ...recipe, source_url: '', _ai_usage: usage })
    }

    // ── URL Import: try JSON-LD first, then AI ──

    // Step 1: Fetch the page
    const pageResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5,he;q=0.3',
      },
    })

    if (!pageResponse.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch URL: ${pageResponse.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawHtml = await pageResponse.text()

    // Step 2: Try JSON-LD extraction (free, instant, ~99% accurate)
    const jsonLdRecipe = extractJsonLdRecipe(rawHtml)
    if (jsonLdRecipe && jsonLdRecipe.ingredients.length > 0) {
      console.log(`JSON-LD extraction succeeded for ${url} — skipping AI`)
      return jsonResponse({
        ...jsonLdRecipe,
        source_url: url,
        // No AI usage — this was free
        _ai_usage: { model: 'json-ld', tokens_in: 0, tokens_out: 0, cost_usd: 0 },
      })
    }

    // Step 3: Preprocess HTML and use AI fallback
    console.log(`No JSON-LD found for ${url} — using AI extraction`)
    const cleanedHtml = preprocessHtml(rawHtml)

    const { recipe, usage } = await extractWithAI([
      {
        type: 'text',
        text: `Extract the recipe from this web page HTML:\n\n${cleanedHtml}`,
      },
    ], ANTHROPIC_API_KEY!)

    if (!recipe) {
      return new Response(JSON.stringify({ error: 'Could not find a recipe on this page' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Try to get image from og:image if AI didn't find one
    if (!recipe.image_url) {
      recipe.image_url = extractOgImage(rawHtml)
    }

    return jsonResponse({ ...recipe, source_url: url, _ai_usage: usage })

  } catch (err) {
    console.error('Error:', (err as Error).message)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function extractOgImage(html: string): string | null {
  const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
  return match?.[1] || null
}

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

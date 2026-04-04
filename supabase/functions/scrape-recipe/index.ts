// Supabase Edge Function: scrape-recipe
// Fetches a recipe URL and extracts structured data using JSON-LD, microdata, or heuristics

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Whats4Dinner/1.0)',
        'Accept': 'text/html',
      },
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch URL: ${response.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = await response.text()

    // Try JSON-LD first (most reliable)
    let recipe = extractJsonLd(html)

    // Fallback to meta tags
    if (!recipe) {
      recipe = extractMetaTags(html, url)
    }

    // Fallback to heuristics
    if (!recipe) {
      recipe = extractHeuristic(html, url)
    }

    if (!recipe) {
      return new Response(JSON.stringify({ error: 'Could not find recipe data on this page' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(recipe), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

interface ParsedRecipe {
  title: string
  description?: string
  instructions?: string
  image_url?: string
  prep_time_min?: number
  cook_time_min?: number
  servings?: number
  source_url: string
  ingredients: { name: string; quantity?: number; unit?: string }[]
}

function extractJsonLd(html: string): ParsedRecipe | null {
  // Find all JSON-LD blocks
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match

  while ((match = regex.exec(html)) !== null) {
    try {
      let data = JSON.parse(match[1])

      // Handle @graph arrays
      if (data['@graph']) {
        data = data['@graph']
      }

      // Handle arrays
      if (Array.isArray(data)) {
        data = data.find(
          (item: any) =>
            item['@type'] === 'Recipe' ||
            (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        )
      }

      if (!data || (data['@type'] !== 'Recipe' && !(Array.isArray(data['@type']) && data['@type'].includes('Recipe')))) {
        continue
      }

      const ingredients = (data.recipeIngredient || []).map((ing: string) => parseIngredientString(ing))

      const instructions = Array.isArray(data.recipeInstructions)
        ? data.recipeInstructions
            .map((step: any) => {
              if (typeof step === 'string') return step
              if (step.text) return step.text
              if (step['@type'] === 'HowToSection') {
                return (step.itemListElement || [])
                  .map((s: any) => (typeof s === 'string' ? s : s.text || ''))
                  .join('\n')
              }
              return ''
            })
            .filter(Boolean)
            .join('\n\n')
        : typeof data.recipeInstructions === 'string'
          ? data.recipeInstructions
          : undefined

      return {
        title: data.name || 'Untitled Recipe',
        description: data.description || undefined,
        instructions,
        image_url: Array.isArray(data.image) ? data.image[0] : data.image || undefined,
        prep_time_min: parseDuration(data.prepTime),
        cook_time_min: parseDuration(data.cookTime),
        servings: parseServings(data.recipeYield),
        source_url: '',
        ingredients,
      }
    } catch {
      continue
    }
  }

  return null
}

function extractMetaTags(html: string, url: string): ParsedRecipe | null {
  const title = extractMeta(html, 'og:title') || extractMeta(html, 'title')
  if (!title) return null

  return {
    title,
    description: extractMeta(html, 'og:description') || extractMeta(html, 'description') || undefined,
    image_url: extractMeta(html, 'og:image') || undefined,
    source_url: url,
    ingredients: [],
  }
}

function extractHeuristic(html: string, url: string): ParsedRecipe | null {
  // Try to find a title in <h1>
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
  const title = h1Match ? stripHtml(h1Match[1]) : null
  if (!title) return null

  // Try to find ingredients in a list near "ingredient" text
  const ingredients: { name: string; quantity?: number; unit?: string }[] = []
  const ingSection = html.match(/ingredient[s]?[\s\S]{0,200}?<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/i)
  if (ingSection) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let li
    while ((li = liRegex.exec(ingSection[1])) !== null) {
      const text = stripHtml(li[1]).trim()
      if (text) ingredients.push(parseIngredientString(text))
    }
  }

  return {
    title,
    source_url: url,
    ingredients,
  }
}

function extractMeta(html: string, property: string): string | null {
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*?)["']`,
    'i'
  )
  const match = html.match(regex)
  if (match) return stripHtml(match[1])

  // Try reverse order (content before property)
  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*?)["'][^>]*(?:property|name)=["']${property}["']`,
    'i'
  )
  const match2 = html.match(regex2)
  return match2 ? stripHtml(match2[1]) : null
}

function parseIngredientString(raw: string): { name: string; quantity?: number; unit?: string } {
  const text = stripHtml(raw).trim()

  // Common pattern: "2 cups all-purpose flour" or "1/2 tsp salt"
  const match = text.match(
    /^([\d./\s]+)?\s*(cups?|tbsp|tsp|oz|lb|lbs?|g|kg|ml|l|bunch|cloves?|cans?|packs?|bags?|bottles?|boxes?|jars?|slices?|pieces?)?\s*(?:of\s+)?(.+)$/i
  )

  if (match) {
    const qtyStr = match[1]?.trim()
    let quantity: number | undefined
    if (qtyStr) {
      // Handle fractions like "1/2" or "1 1/2"
      const parts = qtyStr.split(/\s+/)
      quantity = parts.reduce((sum, p) => {
        if (p.includes('/')) {
          const [num, den] = p.split('/')
          return sum + parseInt(num) / parseInt(den)
        }
        return sum + parseFloat(p)
      }, 0)
    }

    return {
      name: match[3]?.trim() || text,
      quantity,
      unit: match[2]?.toLowerCase() || undefined,
    }
  }

  return { name: text }
}

function parseDuration(iso8601?: string): number | undefined {
  if (!iso8601) return undefined
  // Parse ISO 8601 duration like "PT30M" or "PT1H30M"
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return undefined
  return (parseInt(match[1] || '0') * 60) + parseInt(match[2] || '0') || undefined
}

function parseServings(yield_?: string | string[] | number): number | undefined {
  if (typeof yield_ === 'number') return yield_
  const str = Array.isArray(yield_) ? yield_[0] : yield_
  if (!str) return undefined
  const match = String(str).match(/(\d+)/)
  return match ? parseInt(match[1]) : undefined
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

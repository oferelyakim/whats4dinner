import { supabase } from './supabase'
import { logAIUsage } from './ai-usage'
import type { AIActionType } from '@/types'

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

interface AIUsageMetadata {
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
}

async function logUsageFromResponse(
  actionType: AIActionType,
  aiUsage: AIUsageMetadata | undefined,
) {
  if (!aiUsage) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await logAIUsage(
    user.id,
    actionType,
    aiUsage.model,
    aiUsage.tokens_in,
    aiUsage.tokens_out,
    aiUsage.cost_usd,
  )
}

export async function importRecipeFromImage(file: File): Promise<ParsedRecipe> {
  // Convert file to base64
  const base64 = await fileToBase64(file)

  const { data, error } = await supabase.functions.invoke('scrape-recipe', {
    body: { image_base64: base64 },
  })

  if (error || !data?.title) {
    throw new Error(error?.message || 'Could not extract recipe from image. Try a clearer photo or add manually.')
  }

  // Log AI usage in background
  logUsageFromResponse('recipe_import_photo', data._ai_usage)

  const { _ai_usage, ...recipe } = data
  return { ...recipe, source_url: '' } as ParsedRecipe
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:image/...;base64, prefix
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function importRecipeFromUrl(url: string): Promise<ParsedRecipe> {
  // Try Supabase Edge Function first (AI-powered)
  try {
    const { data, error } = await supabase.functions.invoke('scrape-recipe', {
      body: { url },
    })
    if (!error && data && data.title) {
      // Log AI usage in background
      logUsageFromResponse('recipe_import_url', data._ai_usage)

      const { _ai_usage, ...recipe } = data
      return { ...recipe, source_url: url }
    }
  } catch {
    // Edge function not deployed yet, fall back to client-side
  }

  // Client-side fallback: try multiple CORS proxies
  const proxies = [
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ]

  let response: Response | null = null
  for (const proxy of proxies) {
    try {
      const r = await fetch(proxy(url))
      if (r.ok) { response = r; break }
    } catch { continue }
  }

  if (!response) throw new Error('Could not fetch recipe page. Try adding the recipe manually.')

  const html = await response.text()

  // Try JSON-LD first
  let recipe = extractJsonLd(html)
  if (recipe) return { ...recipe, source_url: url }

  // Fallback to meta tags + heuristics
  recipe = extractFromHtml(html, url)
  if (recipe) return recipe

  throw new Error('Could not find recipe data on this page. Try adding the recipe manually.')
}

function extractJsonLd(html: string): ParsedRecipe | null {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match

  while ((match = regex.exec(html)) !== null) {
    try {
      let data = JSON.parse(match[1])

      if (data['@graph']) data = data['@graph']
      if (Array.isArray(data)) {
        data = data.find(
          (item: Record<string, unknown>) =>
            item['@type'] === 'Recipe' ||
            (Array.isArray(item['@type']) && (item['@type'] as string[]).includes('Recipe'))
        )
      }

      if (!data) continue
      const type = data['@type']
      if (type !== 'Recipe' && !(Array.isArray(type) && type.includes('Recipe'))) continue

      const ingredients = (data.recipeIngredient || []).map((ing: string) => parseIngredient(ing))

      const instructions = Array.isArray(data.recipeInstructions)
        ? data.recipeInstructions
            .map((step: Record<string, unknown> | string) => {
              if (typeof step === 'string') return step
              if (step.text) return step.text as string
              if (step['@type'] === 'HowToSection') {
                return ((step.itemListElement as Record<string, unknown>[]) || [])
                  .map((s) => (typeof s === 'string' ? s : (s.text as string) || ''))
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
        instructions: instructions || undefined,
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

function extractFromHtml(html: string, url: string): ParsedRecipe | null {
  // Get title from og:title or h1
  const ogTitle = extractMeta(html, 'og:title')
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
  const title = ogTitle || (h1Match ? strip(h1Match[1]) : null)
  if (!title) return null

  const description = extractMeta(html, 'og:description') || extractMeta(html, 'description') || undefined
  const image_url = extractMeta(html, 'og:image') || undefined

  // Try to find ingredients
  const ingredients: ParsedRecipe['ingredients'] = []
  const ingSection = html.match(/ingredient[s]?[\s\S]{0,300}?<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/i)
  if (ingSection) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let li
    while ((li = liRegex.exec(ingSection[1])) !== null) {
      const text = strip(li[1]).trim()
      if (text) ingredients.push(parseIngredient(text))
    }
  }

  return { title, description, image_url, source_url: url, ingredients }
}

function extractMeta(html: string, prop: string): string | null {
  const r1 = new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*?)["']`, 'i')
  const m1 = html.match(r1)
  if (m1) return strip(m1[1])

  const r2 = new RegExp(`<meta[^>]*content=["']([^"']*?)["'][^>]*(?:property|name)=["']${prop}["']`, 'i')
  const m2 = html.match(r2)
  return m2 ? strip(m2[1]) : null
}

function parseIngredient(raw: string): { name: string; quantity?: number; unit?: string } {
  const text = strip(raw).trim()
  const match = text.match(
    /^([\d./\s]+)?\s*(cups?|tbsp|tsp|oz|lb|lbs?|g|kg|ml|l|bunch|cloves?|cans?|packs?|bags?|bottles?|boxes?|jars?|slices?|pieces?)?\s*(?:of\s+)?(.+)$/i
  )

  if (match) {
    const qtyStr = match[1]?.trim()
    let quantity: number | undefined
    if (qtyStr) {
      const parts = qtyStr.split(/\s+/)
      quantity = parts.reduce((sum, p) => {
        if (p.includes('/')) {
          const [num, den] = p.split('/')
          return sum + parseInt(num) / parseInt(den)
        }
        return sum + parseFloat(p)
      }, 0)
    }
    return { name: match[3]?.trim() || text, quantity, unit: match[2]?.toLowerCase() }
  }

  return { name: text }
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

function strip(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

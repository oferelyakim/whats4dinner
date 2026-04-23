import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidKrogerAccessToken } from '../_shared/kroger-tokens.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const KROGER_API_BASE_URL = Deno.env.get('KROGER_API_BASE_URL')!

/** Cache TTL: 4 hours */
const CACHE_TTL_MS = 4 * 60 * 60 * 1000

interface GrocerProduct {
  id: string
  name: string
  brand?: string
  price_cents?: number
  unit_size?: string
  image_url?: string
  available: boolean
}

interface KrogerProductItem {
  productId: string
  description: string
  brand?: string
  images?: Array<{ perspective: string; sizes?: Array<{ size: string; url: string }> }>
  items?: Array<{
    itemId: string
    size?: string
    price?: { regular?: number }
    soldInStore?: boolean
    fulfillment?: { inStore?: boolean }
  }>
}

/** Normalize a search query for cache key comparison. */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Map a raw Kroger product to our GrocerProduct shape. */
function mapKrogerProduct(raw: KrogerProductItem): GrocerProduct {
  const primaryItem = raw.items?.[0]
  const priceCents = primaryItem?.price?.regular != null
    ? Math.round(primaryItem.price.regular * 100)
    : undefined

  // Prefer front-facing thumbnail
  const frontImage = raw.images?.find((img) => img.perspective === 'front')
  const thumbnail = frontImage?.sizes?.find((s) => s.size === 'thumbnail')
    ?? frontImage?.sizes?.[0]
  const imageUrl = thumbnail?.url

  const available = primaryItem?.fulfillment?.inStore === true
    || primaryItem?.soldInStore === true

  return {
    id: raw.productId,
    name: raw.description,
    brand: raw.brand ?? undefined,
    price_cents: priceCents,
    unit_size: primaryItem?.size ?? undefined,
    image_url: imageUrl,
    available,
  }
}

/**
 * POST { queries: string[], store_id: string }
 *
 * For each item name in `queries`:
 *  1. Normalize and check grocer_product_cache (provider + store + query).
 *  2. On cache miss, call the Kroger Products API and cache the result for 4h.
 *
 * Response: { results: Record<string, GrocerProduct[]> }
 * Keys are the original (non-normalized) query strings passed in.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonError('Unauthorized', 401)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return jsonError('Unauthorized', 401)
    }

    // ── Feature flag check ────────────────────────────────────────────────────
    const { data: flagEnabled, error: flagError } = await supabase
      .rpc('grocer_flag_enabled_for', { p_user_id: user.id })
    if (flagError) {
      console.error('Flag check error:', flagError)
      return jsonError('Failed to check feature flag', 500)
    }
    if (!flagEnabled) {
      return jsonError('Grocer integrations not enabled for this account', 403)
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json()
    const { queries, store_id } = body as { queries: string[]; store_id: string }

    if (!Array.isArray(queries) || queries.length === 0) {
      return jsonError('queries must be a non-empty array of strings', 400)
    }
    if (!store_id) {
      return jsonError('store_id is required', 400)
    }

    // ── Load + refresh Kroger token ───────────────────────────────────────────
    const { accessToken } = await getValidKrogerAccessToken(supabase, user.id)

    const now = new Date()
    const results: Record<string, GrocerProduct[]> = {}

    for (const originalQuery of queries) {
      const normalized = normalizeQuery(originalQuery)

      // ── Cache lookup ──────────────────────────────────────────────────────
      const { data: cached } = await supabase
        .from('grocer_product_cache')
        .select('results, expires_at')
        .eq('provider', 'kroger')
        .eq('store_id', store_id)
        .eq('query_normalized', normalized)
        .single()

      if (cached && new Date(cached.expires_at) > now) {
        results[originalQuery] = cached.results as GrocerProduct[]
        continue
      }

      // ── Cache miss: call Kroger Products API ──────────────────────────────
      const productParams = new URLSearchParams({
        'filter.term': normalized,
        'filter.locationId': store_id,
        'filter.limit': '10',
      })

      const productResp = await fetch(
        `${KROGER_API_BASE_URL}/v1/products?${productParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        },
      )

      let products: GrocerProduct[] = []

      if (productResp.ok) {
        const productData = await productResp.json()
        const rawProducts: KrogerProductItem[] = productData.data ?? []
        products = rawProducts.map(mapKrogerProduct)
      } else {
        const errText = await productResp.text()
        console.error(`Kroger products API error for "${normalized}":`, errText)
        // Return empty array for this query rather than failing the whole request
      }

      results[originalQuery] = products

      // ── Upsert into cache ─────────────────────────────────────────────────
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
      await supabase
        .from('grocer_product_cache')
        .upsert(
          {
            provider: 'kroger',
            store_id,
            query_normalized: normalized,
            results: products,
            expires_at: expiresAt,
            created_at: now.toISOString(),
          },
          { onConflict: 'provider,store_id,query_normalized' },
        )
      // Non-fatal if cache write fails — we still return results to the client
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('kroger-search error:', message)
    return jsonError(message, 500)
  }
})

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

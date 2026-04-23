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

/** Fallback Kroger cart URL if the API doesn't return a deep link. */
const KROGER_CART_FALLBACK_URL = 'https://www.kroger.com/cart'

interface CartResult {
  success: boolean
  items_added: number
  items_failed: string[]
  cart_url: string | null
}

interface GrocerProduct {
  id: string
  name: string
  available: boolean
}

interface ShoppingListItem {
  name: string
  is_checked: boolean
}

/** Normalize a query the same way kroger-search does, for cache key lookup. */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * POST { list_id: string, store_id: string }
 *
 * Reads unchecked items from the shopping list, looks up matching Kroger
 * product UPCs from the product cache (cache must be warm — no extra Kroger
 * API calls are made for lookup), and sends a PUT /v1/cart/add request.
 *
 * Response: CartResult
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
    const { list_id, store_id } = body as { list_id: string; store_id: string }

    if (!list_id) {
      return jsonError('list_id is required', 400)
    }
    if (!store_id) {
      return jsonError('store_id is required', 400)
    }

    // ── Verify user has access to this list ───────────────────────────────────
    // Service role bypasses RLS, so we re-implement the access check here:
    // user must be the list creator OR have a shopping_list_access row.
    const { data: listRow, error: listError } = await supabase
      .from('shopping_lists')
      .select('id, created_by')
      .eq('id', list_id)
      .maybeSingle()

    if (listError || !listRow) {
      return jsonError('Shopping list not found', 404)
    }

    let hasAccess = listRow.created_by === user.id
    if (!hasAccess) {
      const { data: accessRow } = await supabase
        .from('shopping_list_access')
        .select('list_id')
        .eq('list_id', list_id)
        .eq('user_id', user.id)
        .maybeSingle()
      hasAccess = !!accessRow
    }

    if (!hasAccess) {
      return jsonError('You do not have access to this shopping list', 403)
    }

    // ── Load unchecked items ──────────────────────────────────────────────────
    const { data: items, error: itemsError } = await supabase
      .from('shopping_list_items')
      .select('name, is_checked')
      .eq('list_id', list_id)
      .eq('is_checked', false)

    if (itemsError) {
      console.error('Failed to load list items:', itemsError)
      return jsonError('Failed to load shopping list items', 500)
    }

    const uncheckedItems: ShoppingListItem[] = items ?? []
    if (uncheckedItems.length === 0) {
      const result: CartResult = {
        success: true,
        items_added: 0,
        items_failed: [],
        cart_url: KROGER_CART_FALLBACK_URL,
      }
      return jsonOk(result)
    }

    // ── Look up UPCs from product cache ───────────────────────────────────────
    const now = new Date()
    const itemsToAdd: Array<{ upc: string; name: string; quantity: number }> = []
    const itemsFailed: string[] = []

    for (const item of uncheckedItems) {
      const normalized = normalizeQuery(item.name)

      const { data: cached } = await supabase
        .from('grocer_product_cache')
        .select('results, expires_at')
        .eq('provider', 'kroger')
        .eq('store_id', store_id)
        .eq('query_normalized', normalized)
        .single()

      if (!cached || new Date(cached.expires_at) <= now) {
        // Cache miss or stale — cannot add without a prior search
        itemsFailed.push(item.name)
        continue
      }

      const products = cached.results as GrocerProduct[]
      const firstAvailable = products.find((p) => p.available) ?? products[0]

      if (!firstAvailable) {
        itemsFailed.push(item.name)
        continue
      }

      // Kroger Products API uses productId as the UPC in the cart endpoint
      itemsToAdd.push({ upc: firstAvailable.id, name: item.name, quantity: 1 })
    }

    // ── Load + refresh Kroger token ───────────────────────────────────────────
    const { accessToken } = await getValidKrogerAccessToken(supabase, user.id)

    // ── Call Kroger cart add API ──────────────────────────────────────────────
    let itemsAdded = 0

    if (itemsToAdd.length > 0) {
      const cartBody = {
        items: itemsToAdd.map((item) => ({
          upc: item.upc,
          quantity: { requested: item.quantity },
        })),
      }

      const cartResp = await fetch(`${KROGER_API_BASE_URL}/v1/cart/add`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(cartBody),
      })

      if (cartResp.ok) {
        itemsAdded = itemsToAdd.length
      } else {
        const errText = await cartResp.text()
        console.error('Kroger cart add API error:', errText)
        // Move all attempted items to failed
        itemsFailed.push(...itemsToAdd.map((i) => i.name))
        itemsAdded = 0
      }
    }

    const result: CartResult = {
      success: itemsAdded > 0 || (itemsToAdd.length === 0 && itemsFailed.length === 0),
      items_added: itemsAdded,
      items_failed: itemsFailed,
      cart_url: KROGER_CART_FALLBACK_URL,
    }

    return jsonOk(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('kroger-add-to-cart error:', message)
    return jsonError(message, 500)
  }
})

function jsonOk(data: unknown): Response {
  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

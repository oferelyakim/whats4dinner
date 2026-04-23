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

interface KrogerLocation {
  locationId: string
  name: string
  address: {
    addressLine1: string
    city: string
    state: string
    zipCode: string
  }
  geolocation?: {
    latitude: number
    longitude: number
  }
}

interface GrocerStore {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  distance_miles?: number
}

/**
 * POST { zip: string }
 *
 * Returns up to 10 Kroger store locations within 10 miles of the given ZIP code.
 * Automatically refreshes the access token if it is expiring within 5 minutes.
 *
 * Response: { stores: GrocerStore[] }
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
    const { zip } = body as { zip: string }

    if (!zip || !/^\d{5}$/.test(zip.trim())) {
      return jsonError('A valid 5-digit ZIP code is required', 400)
    }

    // ── Load + refresh Kroger token ───────────────────────────────────────────
    const { accessToken } = await getValidKrogerAccessToken(supabase, user.id)

    // ── Call Kroger Locations API ─────────────────────────────────────────────
    const locationsParams = new URLSearchParams({
      'filter.zipCode': zip.trim(),
      'filter.radiusInMiles': '10',
      'filter.limit': '10',
    })

    const locationsResp = await fetch(
      `${KROGER_API_BASE_URL}/v1/locations?${locationsParams.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      },
    )

    if (!locationsResp.ok) {
      const errText = await locationsResp.text()
      console.error('Kroger locations API error:', errText)
      return jsonError('Failed to fetch store locations from Kroger', 502)
    }

    const locationsData = await locationsResp.json()
    const rawLocations: KrogerLocation[] = locationsData.data ?? []

    const stores: GrocerStore[] = rawLocations.map((loc) => ({
      id: loc.locationId,
      name: loc.name,
      address: loc.address?.addressLine1 ?? '',
      city: loc.address?.city ?? '',
      state: loc.address?.state ?? '',
      zip: loc.address?.zipCode ?? '',
    }))

    return new Response(
      JSON.stringify({ stores }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('kroger-stores error:', message)
    return jsonError(message, 500)
  }
})

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const KROGER_CLIENT_ID = Deno.env.get('KROGER_CLIENT_ID')!
const KROGER_API_BASE_URL = Deno.env.get('KROGER_API_BASE_URL')!
const KROGER_REDIRECT_URI = Deno.env.get('KROGER_REDIRECT_URI')!

/**
 * POST {} — no body required.
 *
 * Generates a random state token and returns the Kroger authorization URL.
 * The caller stores the state in sessionStorage and later passes it to
 * kroger-oauth-callback for CSRF verification.
 *
 * Response: { auth_url: string, state: string }
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

    // ── Build OAuth URL ───────────────────────────────────────────────────────
    // 16-byte random hex state for CSRF protection. Persisted server-side so
    // the callback can verify it (defense against forged callback POSTs).
    const stateBytes = crypto.getRandomValues(new Uint8Array(16))
    const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, '0')).join('')

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min TTL
    const { error: stateInsertError } = await supabase
      .from('grocer_oauth_states')
      .insert({ state, user_id: user.id, provider: 'kroger', expires_at: expiresAt })
    if (stateInsertError) {
      console.error('Failed to persist OAuth state:', stateInsertError)
      return jsonError('Failed to start OAuth flow', 500)
    }

    const scope = 'product.compact cart.basic:write profile.compact'
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: KROGER_CLIENT_ID,
      redirect_uri: KROGER_REDIRECT_URI,
      scope,
      state,
    })

    const authUrl = `${KROGER_API_BASE_URL}/v1/connect/oauth2/authorize?${params.toString()}`

    return new Response(
      JSON.stringify({ auth_url: authUrl, state }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('kroger-oauth-start error:', message)
    return jsonError(message, 500)
  }
})

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

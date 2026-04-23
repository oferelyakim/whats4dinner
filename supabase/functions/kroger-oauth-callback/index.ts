import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encrypt } from '../_shared/encrypt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const KROGER_CLIENT_ID = Deno.env.get('KROGER_CLIENT_ID')!
const KROGER_CLIENT_SECRET = Deno.env.get('KROGER_CLIENT_SECRET')!
const KROGER_API_BASE_URL = Deno.env.get('KROGER_API_BASE_URL')!
const KROGER_REDIRECT_URI = Deno.env.get('KROGER_REDIRECT_URI')!

interface KrogerTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

/**
 * POST { code: string, state: string }
 *
 * Exchanges the authorization code for tokens, encrypts them, and upserts
 * into grocer_connections. State verification is done client-side against
 * sessionStorage before calling this function (the edge function trusts the
 * authenticated user's code).
 *
 * Response: { provider: 'kroger', connected: true, store_id: null, store_name: null }
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
    const { code, state } = body as { code: string; state: string }

    if (!code) {
      return jsonError('code is required', 400)
    }
    if (!state) {
      return jsonError('state is required', 400)
    }

    // ── Verify OAuth state server-side ────────────────────────────────────────
    // The row was created by kroger-oauth-start. Match on (state, user_id,
    // provider) and check expiry. Delete after read so each state is one-shot.
    const { data: stateRow, error: stateError } = await supabase
      .from('grocer_oauth_states')
      .select('state, expires_at')
      .eq('state', state)
      .eq('user_id', user.id)
      .eq('provider', 'kroger')
      .maybeSingle()

    if (stateError) {
      console.error('OAuth state lookup error:', stateError)
      return jsonError('Failed to verify OAuth state', 500)
    }
    if (!stateRow) {
      return jsonError('Invalid OAuth state', 400)
    }
    if (new Date(stateRow.expires_at) < new Date()) {
      await supabase.from('grocer_oauth_states').delete().eq('state', state)
      return jsonError('OAuth state expired', 400)
    }
    // One-shot: delete now so a replayed callback fails.
    await supabase.from('grocer_oauth_states').delete().eq('state', state)

    // ── Exchange code for tokens ──────────────────────────────────────────────
    const credentials = btoa(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`)

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: KROGER_REDIRECT_URI,
    })

    const tokenResp = await fetch(`${KROGER_API_BASE_URL}/v1/connect/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    })

    if (!tokenResp.ok) {
      const errText = await tokenResp.text()
      console.error('Kroger token exchange failed:', errText)
      return jsonError('Failed to exchange authorization code with Kroger', 502)
    }

    const tokenData = await tokenResp.json() as KrogerTokenResponse

    // ── Encrypt tokens ────────────────────────────────────────────────────────
    // Both tokens share the same IV to save one DB column. A unique IV is
    // generated per encrypt call so they are encrypted independently.
    const accessEncrypted = await encrypt(tokenData.access_token)
    const refreshEncrypted = await encrypt(tokenData.refresh_token)

    // Encode both IVs together (access_iv:refresh_iv) in a single column.
    const combinedIv = `${accessEncrypted.iv}:${refreshEncrypted.iv}`

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    // ── Upsert into grocer_connections ────────────────────────────────────────
    const { error: upsertError } = await supabase
      .from('grocer_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'kroger',
          access_token_enc: accessEncrypted.ciphertext,
          refresh_token_enc: refreshEncrypted.ciphertext,
          token_iv: combinedIv,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' },
      )

    if (upsertError) {
      console.error('Failed to persist grocer connection:', upsertError)
      return jsonError('Failed to save connection', 500)
    }

    return new Response(
      JSON.stringify({
        provider: 'kroger',
        connected: true,
        store_id: null,
        store_name: null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('kroger-oauth-callback error:', message)
    return jsonError(message, 500)
  }
})

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

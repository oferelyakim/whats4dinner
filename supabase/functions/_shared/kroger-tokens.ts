/**
 * Shared helper for loading, decrypting, and auto-refreshing Kroger OAuth tokens.
 * Used by kroger-stores, kroger-search, and kroger-add-to-cart.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encrypt, decrypt } from './encrypt.ts'

const KROGER_CLIENT_ID = Deno.env.get('KROGER_CLIENT_ID')!
const KROGER_CLIENT_SECRET = Deno.env.get('KROGER_CLIENT_SECRET')!
const KROGER_API_BASE_URL = Deno.env.get('KROGER_API_BASE_URL')!

export interface KrogerConnection {
  id: string
  user_id: string
  access_token_enc: string
  refresh_token_enc: string
  token_iv: string
  expires_at: string
  store_id: string | null
  store_name: string | null
  store_zip: string | null
}

interface KrogerTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * Load the user's Kroger connection, refresh the access token if it expires
 * within 5 minutes, and return a valid decrypted access token.
 *
 * Throws if no connection is found or refresh fails.
 */
export async function getValidKrogerAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ accessToken: string; connection: KrogerConnection }> {
  // Load the connection row
  const { data: connection, error: loadError } = await supabase
    .from('grocer_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'kroger')
    .single()

  if (loadError || !connection) {
    throw new Error('No Kroger connection found. Please connect your Kroger account first.')
  }

  const conn = connection as KrogerConnection

  // Check if the token needs refreshing (expires within 5 minutes)
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
  const expiresAt = new Date(conn.expires_at)

  if (expiresAt <= fiveMinutesFromNow) {
    // Decrypt refresh token — IV format is "access_iv:refresh_iv"
    const [, refreshIv] = conn.token_iv.split(':')
    const refreshToken = await decrypt(conn.refresh_token_enc, refreshIv)

    // Call Kroger token endpoint with refresh_token grant
    const credentials = btoa(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`)
    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    const refreshResp = await fetch(`${KROGER_API_BASE_URL}/v1/connect/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    })

    if (!refreshResp.ok) {
      const errText = await refreshResp.text()
      console.error('Kroger token refresh failed:', errText)
      throw new Error('Failed to refresh Kroger access token. Please reconnect your account.')
    }

    const tokenData = await refreshResp.json() as KrogerTokenResponse

    // Encrypt new tokens
    const accessEncrypted = await encrypt(tokenData.access_token)
    const refreshEncrypted = await encrypt(tokenData.refresh_token)
    const combinedIv = `${accessEncrypted.iv}:${refreshEncrypted.iv}`
    const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    // Persist refreshed tokens
    const { error: updateError } = await supabase
      .from('grocer_connections')
      .update({
        access_token_enc: accessEncrypted.ciphertext,
        refresh_token_enc: refreshEncrypted.ciphertext,
        token_iv: combinedIv,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'kroger')

    if (updateError) {
      console.error('Failed to persist refreshed tokens:', updateError)
      // Non-fatal: return the new access token even if persist failed
    }

    return {
      accessToken: tokenData.access_token,
      connection: {
        ...conn,
        access_token_enc: accessEncrypted.ciphertext,
        refresh_token_enc: refreshEncrypted.ciphertext,
        token_iv: combinedIv,
        expires_at: newExpiresAt,
      },
    }
  }

  // Token still valid — decrypt and return
  const [accessIv] = conn.token_iv.split(':')
  const accessToken = await decrypt(conn.access_token_enc, accessIv)
  return { accessToken, connection: conn }
}

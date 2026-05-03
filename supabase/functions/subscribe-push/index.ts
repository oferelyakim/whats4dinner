// subscribe-push — client-facing VAPID subscription management.
//
// Deploy WITH JWT verification (default — do NOT add --no-verify-jwt).
// The RLS-bound supabase client ensures user_id = auth.uid() at the DB level.
//
// POST { endpoint, keys: { p256dh, auth }, userAgent? }
//   → upserts into push_subscriptions; returns { ok: true, id }
//
// DELETE { endpoint }
//   → removes the subscription for the calling user; returns { ok: true }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Build the JWT-bound supabase client so RLS applies and auth.uid() is set.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'missing_bearer_token' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  // Confirm the caller is authenticated.
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json(401, { error: 'unauthorized', detail: authError?.message })
  }

  try {
    if (req.method === 'POST') {
      let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; userAgent?: string }
      try {
        body = await req.json()
      } catch {
        return json(400, { error: 'invalid_json' })
      }

      const { endpoint, keys, userAgent } = body
      if (!endpoint || typeof endpoint !== 'string') {
        return json(400, { error: 'missing_endpoint' })
      }
      if (!keys?.p256dh || !keys?.auth) {
        return json(400, { error: 'missing_keys', detail: 'keys.p256dh and keys.auth are required' })
      }

      // Upsert: same endpoint rotates keys → update last_used_at. New endpoint
      // inserts a fresh row.
      const { data, error } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id:     user.id,
            endpoint,
            p256dh:      keys.p256dh,
            auth_key:    keys.auth,
            user_agent:  userAgent ?? null,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,endpoint' },
        )
        .select('id')
        .single()

      if (error) return json(500, { error: 'upsert_failed', detail: error.message })

      return json(200, { ok: true, id: data.id })
    }

    if (req.method === 'DELETE') {
      let body: { endpoint?: string }
      try {
        body = await req.json()
      } catch {
        return json(400, { error: 'invalid_json' })
      }

      const { endpoint } = body
      if (!endpoint || typeof endpoint !== 'string') {
        return json(400, { error: 'missing_endpoint' })
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', endpoint)

      if (error) return json(500, { error: 'delete_failed', detail: error.message })

      return json(200, { ok: true })
    }

    return json(405, { error: 'method_not_allowed' })
  } catch (err) {
    return json(500, {
      error: 'handler_threw',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

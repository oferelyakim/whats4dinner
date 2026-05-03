// admin-ai-stats — password-gated AI usage rollups for the owner dashboard
// hosted on the marketing site (replanish.app/admin).
//
// Auth: x-admin-password header must equal env ADMIN_DASHBOARD_PASSWORD.
// On match, calls SECURITY DEFINER RPC `admin_ai_usage_summary(from, to)`
// using the service-role key and returns the JSON rollup.
//
// Deploy:
//   npx supabase secrets set ADMIN_DASHBOARD_PASSWORD=<pick a strong password>
//   npx supabase functions deploy admin-ai-stats --no-verify-jwt
//
// GET ?from=<iso>&to=<iso>      → rollup
// GET ?ping=1                    → version probe (no password required)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_VERSION = '1.0.0'
const DEPLOYED_AT = '2026-05-03T00:00:00Z'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_PASSWORD        = Deno.env.get('ADMIN_DASHBOARD_PASSWORD') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)

  if (url.searchParams.get('ping') === '1') {
    return new Response(
      JSON.stringify({ fn: 'admin-ai-stats', version: APP_VERSION, deployedAt: DEPLOYED_AT }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Password gate — constant-time comparison to avoid timing leaks.
  const supplied = req.headers.get('x-admin-password') ?? ''
  if (!ADMIN_PASSWORD || !timingSafeEqual(supplied, ADMIN_PASSWORD)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const fromParam = url.searchParams.get('from')
  const toParam   = url.searchParams.get('to')

  // Default to last 30 days if not specified.
  const now  = new Date()
  const to   = toParam   ? new Date(toParam)   : now
  const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return new Response(JSON.stringify({ error: 'invalid_date_range' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data, error } = await supabase.rpc('admin_ai_usage_summary', {
    p_from: from.toISOString(),
    p_to:   to.toISOString(),
  })

  if (error) {
    return new Response(JSON.stringify({ error: 'rpc_failed', detail: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      version: APP_VERSION,
      generated_at: new Date().toISOString(),
      caveats: [
        'Bank seeding scripts (scripts/seed-recipe-bank-*.mjs) and the weekly-drop / recipe-bank-refresher cron functions write to recipe_bank directly via service-role and do NOT log to ai_usage. Their Anthropic spend is visible only in the Anthropic console.',
        'meal-engine slot generation logs only when the client logs from the response — server-side per-slot calls during background jobs may not be captured.',
        'Geographic data is not stored; only timestamps + user IDs.',
      ],
      result: data,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})

// admin-ai-stats — password-gated owner dashboard endpoint for replanish.app/admin.
//
// Despite the historical name, this is now a MULTI-PURPOSE admin API. New tabs
// on the dashboard add their own `op` rather than spinning up a new edge fn,
// so the marketing site only ever has one URL + one password to manage.
//
// Auth: every op (except ?ping=1) requires `x-admin-password` header equal to
// env ADMIN_DASHBOARD_PASSWORD. Constant-time compare to avoid timing leaks.
//
// Ops (set via ?op=...; default = ai-usage for backward compat):
//   GET  ?op=ai-usage&from=<iso>&to=<iso>     → AI spend rollup (admin_ai_usage_summary RPC)
//   GET  ?op=summary                          → headline numbers for tab badges
//   GET  ?op=bug-reports
//        &status=open|investigating|resolved|dismissed|all
//        &severity=crash|bug|feedback|all
//        &limit=50                            → list of bug_reports
//   POST ?op=bug-update                       → update one report's status
//        body: {"id":"<uuid>","status":"resolved|investigating|open|dismissed"}
//   GET  ?ping=1                              → version probe (no password)
//
// Service-role key bypasses RLS so the dashboard sees ALL bug reports
// regardless of who submitted them. Authentication is the password header.
//
// Deploy:
//   npx supabase secrets set ADMIN_DASHBOARD_PASSWORD=<pick a strong password>
//   npx supabase functions deploy admin-ai-stats --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_VERSION = '2.0.0'
const DEPLOYED_AT = '2026-05-03T12:00:00Z'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_PASSWORD        = Deno.env.get('ADMIN_DASHBOARD_PASSWORD') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

function authorized(req: Request): boolean {
  const supplied = req.headers.get('x-admin-password') ?? ''
  return !!ADMIN_PASSWORD && timingSafeEqual(supplied, ADMIN_PASSWORD)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)

  if (url.searchParams.get('ping') === '1') {
    return json(200, {
      fn: 'admin-ai-stats',
      version: APP_VERSION,
      deployedAt: DEPLOYED_AT,
      ops: ['ai-usage', 'summary', 'bug-reports', 'bug-update'],
    })
  }

  if (!authorized(req)) {
    return json(401, { error: 'unauthorized' })
  }

  const op = url.searchParams.get('op') ?? 'ai-usage'
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    switch (op) {
      case 'ai-usage':
        if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
        return await handleAIUsage(supabase, url)

      case 'summary':
        if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
        return await handleSummary(supabase)

      case 'bug-reports':
        if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' })
        return await handleBugReports(supabase, url)

      case 'bug-update':
        if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
        return await handleBugUpdate(supabase, req)

      default:
        return json(400, { error: 'unknown_op', op })
    }
  } catch (err) {
    return json(500, {
      error: 'handler_threw',
      op,
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleAIUsage(
  supabase: ReturnType<typeof createClient>,
  url: URL,
): Promise<Response> {
  const fromParam = url.searchParams.get('from')
  const toParam   = url.searchParams.get('to')

  // Default to last 30 days if not specified.
  const now  = new Date()
  const to   = toParam   ? new Date(toParam)   : now
  const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return json(400, { error: 'invalid_date_range' })
  }

  const { data, error } = await supabase.rpc('admin_ai_usage_summary', {
    p_from: from.toISOString(),
    p_to:   to.toISOString(),
  })

  if (error) return json(500, { error: 'rpc_failed', detail: error.message })

  return json(200, {
    ok: true,
    version: APP_VERSION,
    generated_at: new Date().toISOString(),
    caveats: [
      'Bank seeding scripts and the weekly-drop / recipe-bank-refresher cron functions write to recipe_bank directly via service-role and (in v3.5.0+) DO log to ai_usage under bank_seed/bank_refresh/auditor buckets — but anything before v3.5.0 was not captured. For pre-v3.5 spend, check the Anthropic console.',
      'meal-engine slot generation logs only when the client logs from the response — server-side per-slot calls during background jobs may not be captured.',
      'Geographic data is not stored; only timestamps + user IDs.',
    ],
    result: data,
  })
}

async function handleSummary(
  supabase: ReturnType<typeof createClient>,
): Promise<Response> {
  // Tab badge counters. Cheap queries — no RPC needed.
  const now = new Date()
  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [openBugs, last24Crashes, totalReports, last30AISpend] = await Promise.all([
    supabase.from('bug_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('bug_reports').select('id', { count: 'exact', head: true })
      .eq('severity', 'crash')
      .gte('created_at', day),
    supabase.from('bug_reports').select('id', { count: 'exact', head: true }),
    supabase.rpc('admin_ai_usage_summary', {
      p_from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      p_to:   now.toISOString(),
    }),
  ])

  // last30AISpend.data shape comes from admin_ai_usage_summary RPC; we only
  // need the headline total. Fall back to null on shape mismatch.
  let totalCostUSD: number | null = null
  const rollup = last30AISpend.data as Record<string, unknown> | null
  if (rollup && typeof rollup === 'object') {
    const v = (rollup.total_cost_usd ?? rollup.totalCostUsd ?? rollup.total_cost) as unknown
    if (typeof v === 'number') totalCostUSD = v
  }

  return json(200, {
    ok: true,
    version: APP_VERSION,
    generated_at: new Date().toISOString(),
    bugs: {
      open: openBugs.count ?? 0,
      crashes_last_24h: last24Crashes.count ?? 0,
      total: totalReports.count ?? 0,
    },
    ai_usage: {
      total_cost_usd_last_30d: totalCostUSD,
    },
  })
}

async function handleBugReports(
  supabase: ReturnType<typeof createClient>,
  url: URL,
): Promise<Response> {
  const status   = url.searchParams.get('status')   ?? 'all'
  const severity = url.searchParams.get('severity') ?? 'all'
  const limit    = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500)

  let q = supabase.from('bug_reports').select('*').order('created_at', { ascending: false })
  if (status   !== 'all') q = q.eq('status', status)
  if (severity !== 'all') q = q.eq('severity', severity)
  q = q.limit(limit)

  const { data, error } = await q
  if (error) return json(500, { error: 'query_failed', detail: error.message })

  return json(200, {
    ok: true,
    version: APP_VERSION,
    generated_at: new Date().toISOString(),
    count: data?.length ?? 0,
    reports: data ?? [],
  })
}

async function handleBugUpdate(
  supabase: ReturnType<typeof createClient>,
  req: Request,
): Promise<Response> {
  let body: { id?: string; status?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const validStatuses = ['open', 'investigating', 'resolved', 'dismissed']
  if (!body.id || typeof body.id !== 'string') return json(400, { error: 'missing_id' })
  if (!body.status || !validStatuses.includes(body.status)) {
    return json(400, { error: 'invalid_status', valid: validStatuses })
  }

  const patch: Record<string, unknown> = { status: body.status }
  if (body.status === 'resolved' || body.status === 'dismissed') {
    patch.resolved_at = new Date().toISOString()
  } else {
    patch.resolved_at = null
  }

  const { error } = await supabase.from('bug_reports').update(patch).eq('id', body.id)
  if (error) return json(500, { error: 'update_failed', detail: error.message })

  return json(200, { ok: true, id: body.id, status: body.status })
}

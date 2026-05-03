// Bug reports service — submit + list + admin actions.
//
// User-facing: createBugReport (used by BugReportDialog + ErrorBoundary).
// Admin-facing: listBugReports + updateBugReportStatus + deleteBugReport
//   (used by AdminPage; gated server-side by is_app_admin() RLS policy).

import { supabase } from './supabase'
import { APP_VERSION } from '@/lib/version'

export type BugSeverity = 'crash' | 'bug' | 'feedback'
export type BugStatus = 'open' | 'investigating' | 'resolved' | 'dismissed'

export interface BugReport {
  id: string
  user_id: string | null
  circle_id: string | null
  message: string
  url: string | null
  user_agent: string | null
  app_version: string | null
  severity: BugSeverity
  status: BugStatus
  resolved_at: string | null
  created_at: string
}

export interface CreateBugReportInput {
  message: string
  severity?: BugSeverity
  /** Defaults to current location.href + navigator.userAgent. */
  url?: string
  user_agent?: string
  /** Active circle id, if known. Optional. */
  circle_id?: string | null
}

export async function createBugReport(input: CreateBugReportInput): Promise<BugReport> {
  const { data: { user } } = await supabase.auth.getUser()
  const row = {
    user_id: user?.id ?? null,
    circle_id: input.circle_id ?? null,
    message: input.message.trim().slice(0, 4000),
    url: input.url ?? (typeof window !== 'undefined' ? window.location.href : null),
    user_agent: input.user_agent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    app_version: APP_VERSION,
    severity: input.severity ?? 'bug',
  }
  const { data, error } = await supabase
    .from('bug_reports')
    .insert(row)
    .select()
    .single()
  if (error) throw error
  return data as BugReport
}

export async function listBugReports(opts: {
  status?: BugStatus | 'all'
  severity?: BugSeverity | 'all'
  limit?: number
} = {}): Promise<BugReport[]> {
  let q = supabase.from('bug_reports').select('*').order('created_at', { ascending: false })
  if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status)
  if (opts.severity && opts.severity !== 'all') q = q.eq('severity', opts.severity)
  q = q.limit(opts.limit ?? 200)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as BugReport[]
}

export async function updateBugReportStatus(
  id: string,
  status: BugStatus,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'resolved' || status === 'dismissed') {
    patch.resolved_at = new Date().toISOString()
  } else {
    patch.resolved_at = null
  }
  const { error } = await supabase.from('bug_reports').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteBugReport(id: string): Promise<void> {
  const { error } = await supabase.from('bug_reports').delete().eq('id', id)
  if (error) throw error
}

/**
 * Server-side admin check via the is_app_admin() RPC (mig 042). Mirrors the
 * RLS policy — useful for hiding/showing admin UI without round-tripping a
 * SELECT first.
 */
export async function isAppAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_app_admin')
  if (error) return false
  return data === true
}

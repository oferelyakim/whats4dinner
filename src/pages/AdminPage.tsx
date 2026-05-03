// /admin — bug reports triage dashboard.
//
// Server-side gated by RLS (mig 042 is_app_admin()). Non-admins still see
// the route but get the "not authorized" state because all SELECTs return 0
// rows (RLS filter). UI also calls `isAppAdmin()` to render an explicit
// 403-style page rather than an empty list.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw, Trash2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import {
  deleteBugReport,
  isAppAdmin,
  listBugReports,
  updateBugReportStatus,
  type BugReport,
  type BugSeverity,
  type BugStatus,
} from '@/services/bugReports'

const STATUS_OPTIONS: Array<BugStatus | 'all'> = ['open', 'investigating', 'resolved', 'dismissed', 'all']
const SEVERITY_OPTIONS: Array<BugSeverity | 'all'> = ['crash', 'bug', 'feedback', 'all']

export function AdminPage() {
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [statusFilter, setStatusFilter] = useState<BugStatus | 'all'>('open')
  const [severityFilter, setSeverityFilter] = useState<BugSeverity | 'all'>('all')
  const toast = useToast()
  const qc = useQueryClient()

  useEffect(() => {
    isAppAdmin().then(setAdmin)
  }, [])

  const { data: reports = [], isLoading, refetch } = useQuery({
    queryKey: ['bug-reports', statusFilter, severityFilter],
    queryFn: () => listBugReports({ status: statusFilter, severity: severityFilter, limit: 200 }),
    enabled: admin === true,
  })

  const counts = useMemo(() => {
    const c = { crash: 0, bug: 0, feedback: 0 }
    for (const r of reports) c[r.severity]++
    return c
  }, [reports])

  async function handleStatusChange(id: string, status: BugStatus) {
    try {
      await updateBugReportStatus(id, status)
      qc.invalidateQueries({ queryKey: ['bug-reports'] })
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this report permanently?')) return
    try {
      await deleteBugReport(id)
      qc.invalidateQueries({ queryKey: ['bug-reports'] })
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : undefined)
    }
  }

  if (admin === null) {
    return (
      <div className="min-h-screen bg-rp-bg flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-rp-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!admin) {
    return (
      <div className="min-h-screen bg-rp-bg text-rp-ink flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="font-display italic text-3xl text-rp-ink">Not authorized</h1>
          <p className="text-sm text-rp-ink-mute">
            This page is only accessible to Replanish admins.
          </p>
          <Link to="/" className="inline-block text-rp-brand underline underline-offset-2">
            Go home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-rp-bg text-rp-ink">
      <header className="sticky top-0 z-10 bg-rp-bg/90 backdrop-blur border-b border-rp-line">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/profile"
            className="rounded-full p-2 hover:bg-rp-bg-soft transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-display italic text-2xl text-rp-ink flex-1">Bug reports</h1>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Filter bar */}
        <Card className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-rp-ink-mute text-xs font-medium">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BugStatus | 'all')}
              className="rounded-lg border border-rp-line bg-rp-bg px-2 py-1 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-rp-ink-mute text-xs font-medium">Severity</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as BugSeverity | 'all')}
              className="rounded-lg border border-rp-line bg-rp-bg px-2 py-1 text-sm"
            >
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="ms-auto text-xs text-rp-ink-mute">
            {reports.length} reports · {counts.crash} crashes · {counts.bug} bugs · {counts.feedback} feedback
          </div>
        </Card>

        {isLoading && (
          <div className="text-center py-12 text-rp-ink-mute text-sm">Loading…</div>
        )}

        {!isLoading && reports.length === 0 && (
          <div className="text-center py-12 text-rp-ink-mute text-sm">
            No reports match the current filters. 🎉
          </div>
        )}

        {reports.map((r) => <ReportRow key={r.id} report={r} onStatus={handleStatusChange} onDelete={handleDelete} />)}
      </main>
    </div>
  )
}

function ReportRow({
  report,
  onStatus,
  onDelete,
}: {
  report: BugReport
  onStatus: (id: string, status: BugStatus) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const severityColor =
    report.severity === 'crash' ? 'text-red-600 bg-red-50 border-red-200'
    : report.severity === 'bug' ? 'text-rp-brand bg-rp-brand/10 border-rp-brand/30'
    : 'text-blue-600 bg-blue-50 border-blue-200'
  const statusColor =
    report.status === 'open' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : report.status === 'investigating' ? 'text-purple-700 bg-purple-50 border-purple-200'
    : report.status === 'resolved' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : 'text-slate-500 bg-slate-50 border-slate-200'

  return (
    <Card className="overflow-hidden">
      <div
        className="px-4 py-3 cursor-pointer hover:bg-rp-bg-soft transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <ChevronDown
            className={
              expanded
                ? 'h-4 w-4 text-rp-ink-mute mt-1 rotate-180 transition-transform shrink-0'
                : 'h-4 w-4 text-rp-ink-mute mt-1 transition-transform shrink-0'
            }
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${severityColor}`}>
                {report.severity}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>
                {report.status}
              </span>
              <span className="text-[10px] text-rp-ink-mute">
                v{report.app_version} · {new Date(report.created_at).toLocaleString()}
              </span>
            </div>
            <p className="text-sm text-rp-ink line-clamp-2">{report.message.split('\n')[0]}</p>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 border-t border-rp-line bg-rp-bg-soft text-xs space-y-2">
          {report.url && (
            <div>
              <div className="text-rp-ink-mute font-medium mb-0.5">URL</div>
              <div className="text-rp-ink break-all">{report.url}</div>
            </div>
          )}
          {report.user_agent && (
            <div>
              <div className="text-rp-ink-mute font-medium mb-0.5">User agent</div>
              <div className="text-rp-ink break-all">{report.user_agent}</div>
            </div>
          )}
          {report.user_id && (
            <div>
              <div className="text-rp-ink-mute font-medium mb-0.5">User</div>
              <div className="text-rp-ink font-mono">{report.user_id}</div>
            </div>
          )}
          <div>
            <div className="text-rp-ink-mute font-medium mb-0.5">Message</div>
            <pre className="text-rp-ink whitespace-pre-wrap font-mono text-[11px] bg-rp-bg p-2 rounded border border-rp-line">
              {report.message}
            </pre>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <select
              value={report.status}
              onChange={(e) => onStatus(report.id, e.target.value as BugStatus)}
              className="rounded-lg border border-rp-line bg-rp-bg px-2 py-1 text-xs"
            >
              {(['open', 'investigating', 'resolved', 'dismissed'] as BugStatus[]).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={() => onDelete(report.id)}
              className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded inline-flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

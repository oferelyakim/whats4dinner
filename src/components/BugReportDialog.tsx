// User-facing bug report dialog.
//
// Used by:
//   - MorePage "Report a problem" link
//   - ErrorBoundary fallback (auto-pre-filled with the error)
//
// Captures URL + user-agent + app version automatically. User picks severity
// (bug | feedback) and types a message. POST → bug_reports via createBugReport.

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Bug, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/ui/Toast'
import { useAppStore } from '@/stores/appStore'
import { createBugReport, type BugSeverity } from '@/services/bugReports'

export interface BugReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional pre-fill — used when the dialog is auto-opened from ErrorBoundary. */
  initialMessage?: string
  /** Optional severity override — ErrorBoundary uses 'crash'. */
  initialSeverity?: BugSeverity
  /** Callback fired after a successful submission, before the dialog auto-closes. */
  onSubmitted?: () => void
}

export function BugReportDialog({
  open,
  onOpenChange,
  initialMessage = '',
  initialSeverity = 'bug',
  onSubmitted,
}: BugReportDialogProps) {
  const { t } = useI18n()
  const toast = useToast()
  const { activeCircle } = useAppStore()

  const [message, setMessage] = useState(initialMessage)
  const [severity, setSeverity] = useState<BugSeverity>(initialSeverity)
  const [submitting, setSubmitting] = useState(false)

  // Reset state whenever the dialog opens with new initial values.
  function handleOpenChange(next: boolean) {
    if (next) {
      setMessage(initialMessage)
      setSeverity(initialSeverity)
    }
    onOpenChange(next)
  }

  async function handleSubmit() {
    const trimmed = message.trim()
    if (trimmed.length < 5) {
      toast.error(t('bug.tooShort'))
      return
    }
    setSubmitting(true)
    try {
      await createBugReport({
        message: trimmed,
        severity,
        circle_id: activeCircle?.id ?? null,
      })
      toast.success(t('bug.thanks'))
      onSubmitted?.()
      onOpenChange(false)
      setMessage('')
    } catch (err) {
      toast.error(t('bug.failed'), err instanceof Error ? err.message : undefined)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-2xl p-6 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-bold text-rp-ink flex items-center gap-2">
              <Bug className="h-4 w-4 text-rp-brand" />
              {t('bug.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label={t('common.close')}
                className="rounded-full p-1 text-rp-ink-mute hover:bg-rp-bg-soft transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-rp-ink-mute mb-4">
            {t('bug.description')}
          </Dialog.Description>

          {/* Severity selector */}
          <div className="mb-3">
            <label className="text-xs font-medium text-rp-ink-mute block mb-1.5">
              {t('bug.severity')}
            </label>
            <div className="flex gap-2">
              {([
                { value: 'bug' as const, label: t('bug.severity.bug') },
                { value: 'feedback' as const, label: t('bug.severity.feedback') },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSeverity(opt.value)}
                  aria-pressed={severity === opt.value}
                  className={
                    severity === opt.value
                      ? 'rounded-full px-3 py-1.5 text-xs font-semibold bg-rp-brand text-white'
                      : 'rounded-full px-3 py-1.5 text-xs font-medium bg-rp-bg-soft text-rp-ink hover:bg-rp-bg-deep transition-colors'
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <label className="text-xs font-medium text-rp-ink-mute block mb-1.5" htmlFor="bug-message">
            {t('bug.message')}
          </label>
          <textarea
            id="bug-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('bug.messagePlaceholder')}
            rows={6}
            className="w-full rounded-lg border border-rp-line bg-rp-bg px-3 py-2 text-sm text-rp-ink focus:outline-none focus:ring-2 focus:ring-rp-brand/40"
          />
          <p className="text-[11px] text-rp-ink-mute mt-1.5">
            {t('bug.autoIncluded')}
          </p>

          <div className="flex justify-end gap-2 mt-5">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || message.trim().length < 5}>
              {submitting ? t('common.loading') : t('bug.submit')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

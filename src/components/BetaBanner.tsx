// Beta banner — top-of-app notice that the product is in beta.
//
// Dismissible, but the dismiss is keyed by APP_VERSION so a fresh deploy
// re-shows the banner once. Persists in localStorage. Tapping the message
// also opens BugReportDialog so users have a 1-tap path to flag issues.

import { useEffect, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { APP_VERSION } from '@/lib/version'
import { BugReportDialog } from '@/components/BugReportDialog'

const STORAGE_KEY = 'replanish.betaBanner.dismissedVersion'

export function BetaBanner() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = window.localStorage.getItem(STORAGE_KEY)
    setVisible(dismissed !== APP_VERSION)
  }, [])

  function dismiss() {
    setVisible(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, APP_VERSION)
    }
  }

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-rp-brand text-white text-xs px-4 py-2 flex items-center gap-2"
    >
      <Megaphone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <button
        onClick={() => setReportOpen(true)}
        className="flex-1 text-start min-w-0 hover:underline underline-offset-2"
      >
        <span className="font-semibold">{t('beta.label')}:</span>{' '}
        <span className="opacity-90">{t('beta.body')}</span>
      </button>
      <button
        onClick={dismiss}
        aria-label={t('common.dismiss')}
        className="text-white/70 hover:text-white p-1 shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <BugReportDialog open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  )
}

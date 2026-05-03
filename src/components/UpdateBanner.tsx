// Floating "Update available" banner. Mounted globally in App.tsx so it
// surfaces from any route the moment Workbox finishes downloading a new SW.
//
// Visible above the bottom nav, dismissible. Tapping Refresh activates the
// new SW + reloads (we have skipWaiting + clientsClaim, so no tab-close).

import { useAppUpdate } from '@/hooks/useAppUpdate'
import { useI18n } from '@/lib/i18n'
import { RefreshCw, X } from 'lucide-react'

export function UpdateBanner() {
  const { needRefresh, applyUpdate, dismiss } = useAppUpdate()
  const { t } = useI18n()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,28rem)] rounded-2xl bg-rp-ink text-rp-bg shadow-rp-hero px-4 py-3 flex items-center gap-3"
    >
      <RefreshCw className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{t('update.available.title')}</p>
        <p className="text-xs opacity-80 truncate">{t('update.available.body')}</p>
      </div>
      <button
        onClick={applyUpdate}
        className="rounded-full bg-rp-brand text-white px-3 py-1.5 text-xs font-semibold whitespace-nowrap hover:bg-rp-brand-deep transition-colors"
      >
        {t('update.available.refresh')}
      </button>
      <button
        onClick={dismiss}
        aria-label={t('common.dismiss')}
        className="text-rp-bg/60 hover:text-rp-bg transition-colors p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { useAIAccess } from '@/hooks/useAIAccess'
import { useI18n } from '@/lib/i18n'

export function AppShell() {
  const ai = useAIAccess()
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(false)

  const showBanner = !dismissed && ai.hasAI && (ai.isWarning || ai.isLimitReached)

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto relative">
      <Header />
      {showBanner && (
        <div className={`flex items-center gap-2 px-4 py-2 text-xs font-medium ${
          ai.isLimitReached
            ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
            : 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400'
        }`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            {ai.isLimitReached ? t('ai.limitReachedBanner') : t('ai.usageWarningBanner')}
          </span>
          <button onClick={() => setDismissed(true)} className="shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <main className="flex-1 pb-safe animate-page-enter">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

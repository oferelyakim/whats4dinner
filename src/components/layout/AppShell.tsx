import { lazy, Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { CirclePickerSheet } from './CirclePickerSheet'
import { useAIAccess } from '@/hooks/useAIAccess'
import { useI18n } from '@/lib/i18n'

const ChatFAB = lazy(() => import('@/components/chat/ChatFAB').then((m) => ({ default: m.ChatFAB })))
const ChatDialog = lazy(() => import('@/components/chat/ChatDialog').then((m) => ({ default: m.ChatDialog })))

export function AppShell() {
  const ai = useAIAccess()
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(false)

  const [circlePickerOpen, setCirclePickerOpen] = useState(false)
  const showBanner = !dismissed && ai.hasAI && (ai.isWarning || ai.isLimitReached)

  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:dark:bg-surface-dark-base focus:text-slate-900 focus:dark:text-slate-100 focus:rounded focus:shadow-lg"
      >
        {t('common.skipToContent')}
      </a>
      <Header onCircleSelect={() => setCirclePickerOpen(true)} />
      <CirclePickerSheet open={circlePickerOpen} onOpenChange={setCirclePickerOpen} />
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
      <main id="main-content" className="flex-1 pb-safe animate-page-enter">
        <Outlet />
      </main>
      <BottomNav />
      <Suspense>
        <ChatFAB />
        <ChatDialog />
      </Suspense>
    </div>
  )
}

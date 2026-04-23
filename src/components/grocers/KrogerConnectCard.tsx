import { useState } from 'react'
import { ShoppingCart, ChevronRight, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/lib/i18n'
import { startKrogerOAuth } from '@/services/grocers/service'

export function KrogerConnectCard() {
  const { t } = useI18n()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')

  async function handleConnect() {
    setIsConnecting(true)
    setError('')

    try {
      const { auth_url, state } = await startKrogerOAuth()
      sessionStorage.setItem('grocer_oauth_state', state)
      window.location.href = auth_url
    } catch (err) {
      setError(err instanceof Error ? err.message : t('grocer.connectError'))
      setIsConnecting(false)
    }
  }

  return (
    <Card
      variant="elevated"
      className="p-4 cursor-pointer active:scale-[0.98] transition-transform"
      onClick={handleConnect}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
          <ShoppingCart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('grocer.connectKroger')}
          </p>
          <p className="text-xs text-slate-500 truncate">{t('grocer.connectKrogerDesc')}</p>
        </div>
        {isConnecting ? (
          <Loader2 className="h-4 w-4 text-slate-400 animate-spin shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0 rtl-flip" />
        )}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </Card>
  )
}

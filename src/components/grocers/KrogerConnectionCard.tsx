import { useState } from 'react'
import { ShoppingCart, Store, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { disconnectGrocer, updateGrocerStore } from '@/services/grocers/service'
import { StorePickerModal } from './StorePickerModal'
import type { GrocerConnectionRow } from '@/types'
import type { GrocerStore } from '@/services/grocers/types'

interface KrogerConnectionCardProps {
  connection: GrocerConnectionRow
  onDisconnected: () => void
  onStoreChanged: () => void
}

export function KrogerConnectionCard({ connection, onDisconnected, onStoreChanged }: KrogerConnectionCardProps) {
  const { t } = useI18n()
  const [showStorePicker, setShowStorePicker] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isSavingStore, setIsSavingStore] = useState(false)
  const [error, setError] = useState('')

  async function handleDisconnect() {
    setIsDisconnecting(true)
    setError('')

    try {
      await disconnectGrocer('kroger')
      onDisconnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
    } finally {
      setIsDisconnecting(false)
      setShowDisconnectConfirm(false)
    }
  }

  async function handleStoreSelected(store: GrocerStore) {
    setIsSavingStore(true)
    setError('')

    try {
      await updateGrocerStore('kroger', {
        store_id: store.id,
        store_name: store.name,
        store_zip: store.zip,
      })
      onStoreChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
    } finally {
      setIsSavingStore(false)
    }
  }

  return (
    <>
      <Card variant="elevated" className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Kroger</p>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                {t('grocer.connected')}
              </span>
            </div>
            {connection.store_name ? (
              <p className="text-xs text-slate-500 truncate">
                {connection.store_name}
              </p>
            ) : (
              <p className="text-xs text-slate-400">{t('grocer.noStoreSelected')}</p>
            )}
          </div>
          {isSavingStore && <Loader2 className="h-4 w-4 text-slate-400 animate-spin shrink-0" />}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setShowStorePicker(true)}
          >
            <Store className="h-3.5 w-3.5" />
            {connection.store_name ? t('grocer.changeStore') : t('grocer.selectStore')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={() => setShowDisconnectConfirm(true)}
          >
            {t('grocer.disconnect')}
          </Button>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        {showDisconnectConfirm && (
          <div className="rounded-xl bg-slate-50 dark:bg-surface-dark-overlay p-3 space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-300">{t('grocer.disconnectConfirm')}</p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setShowDisconnectConfirm(false)}
                disabled={isDisconnecting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-danger border-danger/30"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('grocer.disconnect')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <StorePickerModal
        open={showStorePicker}
        onOpenChange={setShowStorePicker}
        initialZip={connection.store_zip ?? ''}
        onSelect={handleStoreSelected}
      />
    </>
  )
}

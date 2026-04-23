import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Link, Unlink, Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { linkListToStore, unlinkList } from '@/services/grocers/service'
import type { GrocerConnectionRow, ListGrocerLink } from '@/types'

interface ListStoreLinkerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  listId: string
  currentLink: ListGrocerLink | null
  connections: GrocerConnectionRow[]
  onChanged: () => void
}

export function ListStoreLinkerModal({
  open,
  onOpenChange,
  listId,
  currentLink,
  connections,
  onChanged,
}: ListStoreLinkerModalProps) {
  const { t } = useI18n()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const krogerConnection = connections.find((c) => c.provider === 'kroger')

  async function handleLink() {
    if (!krogerConnection?.store_id) return
    setIsSaving(true)
    setError('')

    try {
      await linkListToStore(listId, 'kroger', krogerConnection.store_id, krogerConnection.store_name)
      onChanged()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUnlink() {
    setIsSaving(true)
    setError('')

    try {
      await unlinkList(listId)
      onChanged()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
    } finally {
      setIsSaving(false)
    }
  }

  const hasKrogerStore = !!krogerConnection?.store_id
  const isLinked = !!currentLink

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40 animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">
              {t('grocer.linkStore')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* No Kroger connection */}
          {!krogerConnection && (
            <p className="text-sm text-slate-500 mb-4">{t('grocer.connectFirst')}</p>
          )}

          {/* Kroger connected but no store selected */}
          {krogerConnection && !hasKrogerStore && (
            <p className="text-sm text-slate-500 mb-4">{t('grocer.noStoreSelected')}</p>
          )}

          {/* Current link info */}
          {isLinked && currentLink && (
            <div className="rounded-xl bg-blue-50 dark:bg-blue-500/10 px-4 py-3 mb-4">
              <p className="text-xs text-slate-500">{t('grocer.linkedTo')}</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {currentLink.store_name ?? currentLink.store_id}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-danger mb-4">{error}</p>}

          <div className="flex flex-col gap-2">
            {hasKrogerStore && !isLinked && (
              <Button onClick={handleLink} disabled={isSaving} className="gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                {t('grocer.linkThisList')} — {krogerConnection!.store_name}
              </Button>
            )}

            {isLinked && (
              <Button
                variant="outline"
                onClick={handleUnlink}
                disabled={isSaving}
                className="gap-2 text-danger border-danger/30"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                {t('grocer.removeLink')}
              </Button>
            )}

            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {t('common.cancel')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

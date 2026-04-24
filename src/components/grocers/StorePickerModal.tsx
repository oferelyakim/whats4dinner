import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, MapPin, Search, Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { getKrogerStores } from '@/services/grocers/service'
import type { GrocerStore } from '@/services/grocers/types'

interface StorePickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialZip?: string
  onSelect: (store: GrocerStore) => void
}

export function StorePickerModal({ open, onOpenChange, initialZip = '', onSelect }: StorePickerModalProps) {
  const { t } = useI18n()
  const [zip, setZip] = useState(initialZip)
  const [stores, setStores] = useState<GrocerStore[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  async function handleSearch() {
    if (!zip.trim()) return
    setIsSearching(true)
    setSearchError('')
    setHasSearched(false)

    try {
      const results = await getKrogerStores(zip.trim())
      setStores(results)
      setHasSearched(true)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
      setStores([])
    } finally {
      setIsSearching(false)
    }
  }

  function handleSelect(store: GrocerStore) {
    onSelect(store)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40 animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-rp-card rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-bold text-rp-ink">
              {t('grocer.findStores')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* ZIP input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('grocer.enterZip')}
              className="flex-1 rounded-xl border border-rp-hairline bg-rp-bg-soft px-3 py-2.5 text-sm text-rp-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <Button onClick={handleSearch} disabled={isSearching || !zip.trim()} size="sm">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {/* Error */}
          {searchError && (
            <p className="text-sm text-danger mb-4">{searchError}</p>
          )}

          {/* Store list */}
          {hasSearched && stores.length === 0 && !isSearching && (
            <p className="text-sm text-slate-500 text-center py-4">{t('grocer.noStoresFound')}</p>
          )}

          <div className="space-y-2">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => handleSelect(store)}
                className="w-full text-start flex items-start gap-3 px-4 py-3 rounded-xl border border-rp-hairline hover:border-brand-500 active:scale-[0.98] transition-all"
              >
                <MapPin className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-rp-ink truncate">{store.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {store.address}, {store.city}, {store.state} {store.zip}
                  </p>
                  {store.distance_miles !== undefined && (
                    <p className="text-xs text-slate-400">
                      {t('grocer.storeDistance').replace('{distance}', store.distance_miles.toFixed(1))}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

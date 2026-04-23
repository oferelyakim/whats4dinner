import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, ShoppingCart, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { searchListItems, addListToCart } from '@/services/grocers/service'
import type { GrocerProduct, CartResult } from '@/types'

interface CartPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  listId: string
  storeId: string
  storeName: string | null
  itemNames: string[]
  onSuccess?: (result: CartResult) => void
}

interface PreviewEntry {
  query: string
  products: GrocerProduct[]
}

export function CartPreviewModal({
  open,
  onOpenChange,
  listId,
  storeId,
  storeName,
  itemNames,
  onSuccess,
}: CartPreviewModalProps) {
  const { t } = useI18n()
  const [preview, setPreview] = useState<PreviewEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isAddingToCart, setIsAddingToCart] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [cartResult, setCartResult] = useState<CartResult | null>(null)
  const [cartError, setCartError] = useState('')

  useEffect(() => {
    if (!open || itemNames.length === 0) return

    let cancelled = false

    async function loadPreview() {
      setIsSearching(true)
      setSearchError('')
      setPreview([])
      setCartResult(null)
      setCartError('')

      try {
        const results = await searchListItems(itemNames, storeId)
        if (!cancelled) {
          const entries: PreviewEntry[] = itemNames.map((name) => ({
            query: name,
            products: results[name] ?? results[name.toLowerCase()] ?? [],
          }))
          setPreview(entries)
        }
      } catch (err) {
        if (!cancelled) {
          setSearchError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
        }
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [open, itemNames, storeId, t])

  async function handleAddAllToCart() {
    setIsAddingToCart(true)
    setCartError('')

    try {
      const result = await addListToCart(listId, storeId)
      setCartResult(result)
      onSuccess?.(result)
    } catch (err) {
      setCartError(err instanceof Error ? err.message : t('grocer.cartFailed'))
    } finally {
      setIsAddingToCart(false)
    }
  }

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40 animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl max-h-[85vh] overflow-y-auto animate-slide-up">
          <div className="sticky top-0 bg-white dark:bg-surface-dark-elevated px-6 pt-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">
                {t('grocer.cartPreview')}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
            {storeName && (
              <p className="text-xs text-slate-500 mt-0.5">{storeName}</p>
            )}
          </div>

          <div className="px-6 py-4 space-y-4">
            {/* Loading */}
            {isSearching && (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            )}

            {/* Search error */}
            {searchError && (
              <div className="flex items-center gap-2 text-danger text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {searchError}
              </div>
            )}

            {/* Cart success */}
            {cartResult?.success && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-2">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {t('grocer.cartSuccess')}
                </p>
                <p className="text-xs text-slate-500">
                  {cartResult.items_added} items added
                  {cartResult.items_failed.length > 0 && `, ${cartResult.items_failed.length} not found`}
                </p>
                {cartResult.cart_url && (
                  <a
                    href={cartResult.cart_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400"
                  >
                    {t('grocer.openKrogerCart')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {/* Cart error */}
            {cartError && (
              <div className="flex items-center gap-2 text-danger text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {cartError}
              </div>
            )}

            {/* Product list */}
            {!isSearching && preview.map((entry) => {
              const topProduct = entry.products[0]

              return (
                <div key={entry.query} className="flex items-center gap-3">
                  {topProduct?.image_url ? (
                    <img
                      src={topProduct.image_url}
                      alt={topProduct.name}
                      className="h-10 w-10 rounded-lg object-contain bg-slate-100 dark:bg-surface-dark-overlay shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-surface-dark-overlay shrink-0 flex items-center justify-center">
                      <ShoppingCart className="h-4 w-4 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {entry.query}
                    </p>
                    {topProduct ? (
                      <p className="text-xs text-slate-500 truncate">
                        {topProduct.brand && `${topProduct.brand} · `}
                        {topProduct.price_cents !== undefined
                          ? `${formatPrice(topProduct.price_cents)} ${t('grocer.pricePerUnit')}`
                          : topProduct.unit_size}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">{t('grocer.notFound')}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer action */}
          {!isSearching && preview.length > 0 && !cartResult?.success && (
            <div className="sticky bottom-0 bg-white dark:bg-surface-dark-elevated border-t border-slate-100 dark:border-slate-800 px-6 py-4">
              <Button
                className="w-full gap-2"
                onClick={handleAddAllToCart}
                disabled={isAddingToCart}
              >
                {isAddingToCart ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('grocer.sendingToCart')}
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" />
                    {t('grocer.addAllToCart')}
                  </>
                )}
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

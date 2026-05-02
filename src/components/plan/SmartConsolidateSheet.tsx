// v3.0.0 — Smart shopping consolidation (paid AI hook).
//
// Walks the visible week's selected recipes' ingredients, dedupes via
// `computeIngredientsFromSlots`, renders an editable consolidation view,
// then lets the user add the result to an existing active shopping list
// or create a new list — the shared shopping list is the daily-habit lever.

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ShoppingCart, Sparkles, X, Plus } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { MonoLabel } from '@/components/ui/hearth'
import type { Slot } from '@/engine/types'
import {
  computeIngredientsFromSlots,
  addIngredientsBulk,
  createShoppingList,
  getShoppingLists,
  type AggregatedIngredient,
} from '@/services/shoppingLists'
import type { ShoppingList } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  slots: Slot[]
  circleId?: string | null
}

function defaultNewListName(locale: string): string {
  const date = new Date().toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `Smart cart — ${date}`
}

export function SmartConsolidateSheet({ open, onClose, slots, circleId }: Props) {
  const { t, locale } = useI18n()
  const [aggregated, setAggregated] = useState<AggregatedIngredient[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [done, setDone] = useState(false)

  // List picker state
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [target, setTarget] = useState<string | 'new'>('new')
  const [newName, setNewName] = useState(() => defaultNewListName(locale))

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setDone(false)
    setExcluded(new Set())
    setNewName(defaultNewListName(locale))
    void computeIngredientsFromSlots(slots)
      .then(setAggregated)
      .catch(() => setAggregated([]))
      .finally(() => setLoading(false))
    void getShoppingLists()
      .then((rows) => {
        const filtered = circleId
          ? (rows as ShoppingList[]).filter((l) => l.circle_id === circleId && l.status === 'active')
          : (rows as ShoppingList[]).filter((l) => l.status === 'active')
        setLists(filtered)
        // Default to the most recent active list when one exists.
        if (filtered.length > 0) {
          setTarget(filtered[0].id)
        } else {
          setTarget('new')
        }
      })
      .catch(() => setLists([]))
  }, [open, slots, circleId, locale])

  const visible = useMemo(
    () => (aggregated ?? []).filter((i) => !excluded.has(i.key)),
    [aggregated, excluded],
  )

  function toggle(key: string) {
    const next = new Set(excluded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExcluded(next)
  }

  async function addToList() {
    if (!circleId || visible.length === 0) return
    setAdding(true)
    try {
      let listId: string
      if (target === 'new') {
        const created = await createShoppingList(newName.trim() || defaultNewListName(locale), circleId)
        listId = created.id
      } else {
        listId = target
      }
      await addIngredientsBulk(listId, visible)
      setDone(true)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-rp-ink/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 bg-rp-bg rounded-t-3xl flex flex-col"
          style={{ maxHeight: '90dvh', boxShadow: '0 -20px 40px -10px rgba(40,20,10,0.3)' }}
        >
          <div className="pt-2 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-rp-hairline" />
          </div>

          {/* header */}
          <div className="px-5 pt-2 pb-3 flex items-start justify-between shrink-0">
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                  style={{ background: '#f2c14e', color: '#1f1612' }}
                >
                  <Sparkles className="h-2.5 w-2.5" /> AI
                </span>
                <MonoLabel>{t('consolidate.eyebrow')}</MonoLabel>
              </div>
              <Dialog.Title asChild>
                <h2 className="font-display italic text-[24px] text-rp-ink leading-[1.05] mt-1">
                  {t('consolidate.title')}
                </h2>
              </Dialog.Title>
              <p className="text-[12px] text-rp-ink-soft mt-0.5">
                {t('consolidate.subtitle').replace('{n}', String(slots.length))}
              </p>
            </div>
            <button onClick={onClose} aria-label={t('common.close')} className="text-rp-ink-mute p-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* list */}
          <div className="flex-1 overflow-y-auto px-5 pt-1 pb-4">
            {loading && <p className="text-rp-ink-mute text-[12px] italic py-4">{t('consolidate.loading')}</p>}
            {!loading && (aggregated?.length ?? 0) === 0 && (
              <p className="text-rp-ink-mute text-[12px] italic py-4">{t('consolidate.empty')}</p>
            )}
            {!loading && (aggregated?.length ?? 0) > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <MonoLabel>
                    {t('consolidate.itemsCount').replace('{n}', String(visible.length))}
                  </MonoLabel>
                  {excluded.size > 0 && (
                    <button
                      onClick={() => setExcluded(new Set())}
                      className="text-[11px] text-rp-brand"
                    >
                      {t('consolidate.resetExcluded')}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {(aggregated ?? []).map((i) => {
                    const isExcl = excluded.has(i.key)
                    return (
                      <button
                        key={i.key}
                        onClick={() => toggle(i.key)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 bg-rp-card border rounded-xl text-left transition-colors',
                          isExcl
                            ? 'border-rp-hairline-soft opacity-50 line-through'
                            : 'border-rp-hairline',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-rp-ink truncate">{i.name}</div>
                          {i.sourceRecipeTitles.length > 1 && (
                            <div className="text-[10px] text-rp-ink-mute">
                              {t('consolidate.usedIn').replace('{n}', String(i.sourceRecipeTitles.length))}
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-rp-ink-soft tabular-nums">
                          {i.quantity !== null ? `${i.quantity}${i.unit ? ' ' + i.unit : ''}` : '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* list-picker + actions */}
          {!loading && visible.length > 0 && !done && (
            <div
              className="px-5 pb-6 pt-3 border-t border-rp-hairline-soft shrink-0 space-y-2"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <MonoLabel>{t('consolidate.targetList')}</MonoLabel>
              <div className="flex flex-col gap-1.5">
                {lists.map((l) => (
                  <label
                    key={l.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors',
                      target === l.id
                        ? 'border-rp-brand bg-rp-brand/5'
                        : 'border-rp-hairline bg-rp-card hover:bg-rp-bg-soft',
                    )}
                  >
                    <input
                      type="radio"
                      name="target-list"
                      value={l.id}
                      checked={target === l.id}
                      onChange={() => setTarget(l.id)}
                      className="accent-rp-brand"
                    />
                    <ShoppingCart className="h-3.5 w-3.5 text-rp-ink-mute shrink-0" />
                    <span className="flex-1 text-[13px] text-rp-ink truncate">{l.name}</span>
                  </label>
                ))}
                <label
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors',
                    target === 'new'
                      ? 'border-rp-brand bg-rp-brand/5'
                      : 'border-rp-hairline bg-rp-card hover:bg-rp-bg-soft',
                  )}
                >
                  <input
                    type="radio"
                    name="target-list"
                    value="new"
                    checked={target === 'new'}
                    onChange={() => setTarget('new')}
                    className="accent-rp-brand"
                  />
                  <Plus className="h-3.5 w-3.5 text-rp-ink-mute shrink-0" />
                  <span className="text-[13px] text-rp-ink shrink-0">{t('consolidate.createNew')}</span>
                  {target === 'new' && (
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t('consolidate.newListPlaceholder')}
                      className="flex-1 min-w-0 ml-2 text-[13px] text-rp-ink bg-transparent outline-none border-b border-rp-hairline focus:border-rp-brand"
                      autoFocus
                    />
                  )}
                </label>
              </div>
              <button
                onClick={() => void addToList()}
                disabled={adding || !circleId || visible.length === 0}
                className="mt-2 w-full h-12 rounded-full text-[14px] font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: '#c4522d' }}
              >
                {adding
                  ? t('consolidate.adding')
                  : t('consolidate.addToList').replace('{n}', String(visible.length))}
              </button>
              {!circleId && (
                <p className="text-[11px] text-rp-ink-mute text-center">
                  {t('consolidate.needCircle')}
                </p>
              )}
            </div>
          )}

          {done && (
            <div
              className="px-5 pb-6 pt-2 border-t border-rp-hairline-soft shrink-0 text-center"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <p className="text-[13px] text-rp-ink mb-2">{t('consolidate.listAdded')}</p>
              <button onClick={onClose} className="text-[12px] text-rp-brand font-medium">
                {t('common.close')}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

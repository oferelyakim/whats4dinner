/**
 * v2.4.0 — "Add to shopping list" sheet for the slot-based /plan-v2 planner.
 *
 * Accepts a list of Dexie `Slot` objects (from a single slot, meal, day, or the
 * full visible week), reads the matching Recipe rows from IndexedDB, aggregates
 * ingredients using `computeIngredientsFromSlots`, and lets the user:
 *  1. Deselect individual ingredients.
 *  2. Choose an existing active list OR create a new one.
 *  3. Confirm → writes to Supabase shopping_list_items via addIngredientsBulk.
 */

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingCart, Check, ChevronDown } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'
import type { ShoppingList } from '@/types'
import type { Slot } from '@/engine/types'
import {
  computeIngredientsFromSlots,
  addIngredientsBulk,
  createShoppingList,
  getShoppingLists,
  type AggregatedIngredient,
} from '@/services/shoppingLists'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ShopFromPlanV2SheetProps {
  open: boolean
  onClose: () => void
  slots: Slot[]
  circleId: string | null | undefined
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayLabel(locale: string): string {
  const d = new Date()
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function defaultNewListName(locale: string): string {
  return `Shopping — ${todayLabel(locale)}`
}

// Format a quantity+unit display string, e.g. "2 cups" or "1.5"
function formatQtyUnit(quantity: number | null, unit: string): string {
  if (quantity === null) return ''
  // Format nicely: avoid trailing zeros
  const qtyStr = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/\.?0+$/, '')
  return unit ? `${qtyStr} ${unit}` : qtyStr
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShopFromPlanV2Sheet({
  open,
  onClose,
  slots,
  circleId,
}: ShopFromPlanV2SheetProps) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()

  // ── Excluded ingredient keys ────────────────────────────────────────────────
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set())

  // ── Target list state ───────────────────────────────────────────────────────
  const [targetListId, setTargetListId] = useState<string | 'new'>('new')
  const [newListName, setNewListName] = useState(() => defaultNewListName(locale))

  // ── UI state ────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [didSucceed, setDidSucceed] = useState(false)

  // Reset on every open
  useEffect(() => {
    if (!open) return
    setExcludedKeys(new Set())
    setSaveError(null)
    setDidSucceed(false)
    setNewListName(defaultNewListName(locale))
  }, [open, locale])

  // ── Fetch existing shopping lists ───────────────────────────────────────────
  const { data: shoppingLists = [] } = useQuery<ShoppingList[]>({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
    enabled: open,
  })

  const activeLists = useMemo(
    () => shoppingLists.filter((l) => l.status === 'active'),
    [shoppingLists],
  )

  // Default to first active list if any
  useEffect(() => {
    if (!open) return
    if (activeLists.length > 0) {
      setTargetListId(activeLists[0].id)
    } else {
      setTargetListId('new')
    }
  }, [open, activeLists.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build a stable slot-id key for the query ────────────────────────────────
  const slotKey = useMemo(
    () => slots.map((s) => s.id).sort().join(','),
    [slots],
  )

  // ── Aggregate ingredients from Dexie ───────────────────────────────────────
  const {
    data: aggregated = [],
    isFetching: isAggregating,
  } = useQuery<AggregatedIngredient[]>({
    queryKey: ['plan-v2-ingredients', slotKey],
    queryFn: () => computeIngredientsFromSlots(slots),
    enabled: open && slots.length > 0,
    staleTime: 60_000,
  })

  const visibleIngredients = useMemo(
    () => aggregated.filter((ing) => !excludedKeys.has(ing.key)),
    [aggregated, excludedKeys],
  )

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  function toggleIngredient(key: string) {
    setExcludedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleSelectAll() {
    setExcludedKeys(new Set())
  }

  function handleSelectNone() {
    setExcludedKeys(new Set(aggregated.map((i) => i.key)))
  }

  // ── Save handler ────────────────────────────────────────────────────────────
  async function handleAddToList() {
    if (visibleIngredients.length === 0 || isSaving) return
    setSaveError(null)
    setIsSaving(true)

    try {
      let listId: string

      if (targetListId === 'new') {
        if (!circleId) {
          throw new Error('No active circle — select a circle first')
        }
        const created = await createShoppingList(
          newListName || defaultNewListName(locale),
          circleId,
        )
        listId = created.id
      } else {
        listId = targetListId
      }

      const items = visibleIngredients.map((ing) => {
        // Build display quantity string for the name field when unit info is present
        const qtyStr = formatQtyUnit(ing.quantity, ing.unit)
        return {
          name: qtyStr ? `${ing.name} (${qtyStr})` : ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          notes:
            ing.sourceRecipeTitles.length > 0
              ? `From: ${ing.sourceRecipeTitles.join(', ')}`
              : null,
        }
      })

      await addIngredientsBulk(listId, items)
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
      setDidSucceed(true)
      setTimeout(() => onClose(), 900)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('plan.shop.errorAdd'))
    } finally {
      setIsSaving(false)
    }
  }

  // ── Count of skipped slots (no recipe) ─────────────────────────────────────
  const noRecipeCount = useMemo(
    () => slots.filter((s) => s.status === 'ready' && !s.recipeId).length,
    [slots],
  )

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('plan.shop.title')}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 start-0 end-0 z-[66] bg-rp-card rounded-t-3xl max-w-lg mx-auto max-h-[92dvh] flex flex-col shadow-2xl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-rp-ink">
                  {t('plan.shop.title')}
                </h2>
                <p className="text-sm text-rp-ink-mute mt-0.5">
                  {t('plan.shop.subtitle')}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label={t('common.close')}
                className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">

              {/* ── Ingredients section ────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {t('plan.shop.ingredientsLabel')}
                    {aggregated.length > 0 && (
                      <span className="normal-case font-normal ms-1 text-slate-400">
                        ({visibleIngredients.length}/{aggregated.length})
                      </span>
                    )}
                  </p>
                  {aggregated.length > 0 && (
                    <button
                      onClick={
                        visibleIngredients.length === aggregated.length
                          ? handleSelectNone
                          : handleSelectAll
                      }
                      className="text-[11px] text-brand-500 font-medium"
                    >
                      {visibleIngredients.length === aggregated.length
                        ? t('plan.shop.selectNone')
                        : t('plan.shop.selectAll')}
                    </button>
                  )}
                </div>

                {isAggregating && slots.length > 0 && (
                  <div className="flex justify-center py-6">
                    <div className="h-5 w-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {!isAggregating && slots.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">
                    {t('plan.shop.v2.empty')}
                  </p>
                )}

                {!isAggregating && slots.length > 0 && aggregated.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">
                    {t('plan.shop.v2.noRecipes')}
                  </p>
                )}

                {noRecipeCount > 0 && (
                  <p className="text-xs text-amber-600 mb-2">
                    {noRecipeCount} {t('plan.shop.noRecipes')}
                  </p>
                )}

                {!isAggregating && aggregated.length > 0 && (
                  <div className="space-y-1.5">
                    {aggregated.map((ing) => {
                      const excluded = excludedKeys.has(ing.key)
                      const qtyStr = formatQtyUnit(ing.quantity, ing.unit)

                      return (
                        <button
                          key={ing.key}
                          onClick={() => toggleIngredient(ing.key)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-start transition-all',
                            excluded
                              ? 'border-slate-100 opacity-50'
                              : 'border-rp-hairline bg-rp-bg-soft',
                          )}
                        >
                          {/* Checkbox */}
                          <div
                            className={cn(
                              'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0',
                              excluded
                                ? 'border-slate-300'
                                : 'border-brand-500 bg-brand-500',
                            )}
                          >
                            {!excluded && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <span
                              className={cn(
                                'text-sm font-medium',
                                excluded
                                  ? 'line-through text-slate-400'
                                  : 'text-rp-ink',
                              )}
                            >
                              {/* Capitalise first letter */}
                              {ing.name.charAt(0).toUpperCase() + ing.name.slice(1)}
                              {qtyStr && (
                                <span className="font-normal text-rp-ink-mute ms-1">
                                  ({qtyStr})
                                </span>
                              )}
                            </span>
                            {!excluded && ing.sourceRecipeTitles.length > 0 && (
                              <div className="text-xs text-rp-ink-mute line-clamp-1 mt-0.5">
                                {ing.sourceRecipeTitles.join(' · ')}
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* ── Target list ─────────────────────────────────────────── */}
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  {t('plan.shop.targetLabel')}
                </p>

                <div className="relative mb-2">
                  <select
                    value={targetListId}
                    onChange={(e) =>
                      setTargetListId(e.target.value as string | 'new')
                    }
                    className="w-full appearance-none px-3 py-2.5 pe-8 rounded-xl border border-rp-hairline bg-rp-card text-sm text-rp-ink focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                  >
                    <option value="new">{t('plan.shop.newList')}</option>
                    {activeLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                </div>

                {targetListId === 'new' && (
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder={t('plan.shop.newListName')}
                    aria-label={t('plan.shop.newListName')}
                    className="w-full px-3 py-2.5 rounded-xl border border-rp-hairline bg-rp-card text-sm text-rp-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                  />
                )}
              </section>

              {saveError && (
                <p className="text-sm text-red-500">{saveError}</p>
              )}
            </div>

            {/* ── Sticky footer ───────────────────────────────────────────── */}
            <div
              className="px-5 pt-3 pb-4 border-t border-rp-hairline/50 shrink-0"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <button
                onClick={didSucceed ? onClose : handleAddToList}
                disabled={isSaving || (!didSucceed && visibleIngredients.length === 0)}
                className={cn(
                  'w-full h-12 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
                  didSucceed
                    ? 'bg-emerald-500'
                    : 'bg-brand-500 disabled:opacity-40',
                )}
              >
                {didSucceed ? (
                  <>
                    <Check className="h-4 w-4" />
                    {t('plan.shop.success')}
                  </>
                ) : isSaving ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('plan.shop.ctaAdding')}
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" />
                    {t('plan.shop.ctaAdd').replace('{{count}}', String(visibleIngredients.length))}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

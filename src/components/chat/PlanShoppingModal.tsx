import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { X, ShoppingCart, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'
import type { MealPlanItem } from './ChatPlanReview'
import { getShoppingLists, addListItem, createShoppingList } from '@/services/shoppingLists'
import { useAppStore } from '@/stores/appStore'

interface AggregatedIngredient {
  name: string
  unit: string
  totalQuantity: number | null
  recipeAttribution: Array<{ title: string; quantity: number | null; unit: string }>
  key: string
}

function aggregateIngredients(items: MealPlanItem[]): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>()

  for (const item of items) {
    if (!item.ingredients) continue
    for (const ing of item.ingredients) {
      const unit = (ing.unit ?? '').toLowerCase().trim()
      const name = ing.name.toLowerCase().trim()
      const key = `${name}|${unit}`

      if (map.has(key)) {
        const existing = map.get(key)!
        if (existing.totalQuantity !== null && ing.quantity != null) {
          existing.totalQuantity += ing.quantity
        } else {
          existing.totalQuantity = null
        }
        existing.recipeAttribution.push({
          title: item.recipe_title,
          quantity: ing.quantity ?? null,
          unit,
        })
      } else {
        map.set(key, {
          name: ing.name,
          unit,
          totalQuantity: ing.quantity ?? null,
          recipeAttribution: [{ title: item.recipe_title, quantity: ing.quantity ?? null, unit }],
          key,
        })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

interface PlanShoppingModalProps {
  items: MealPlanItem[]
  onDismiss: () => void
  onDone: () => void
}

export function PlanShoppingModal({ items, onDismiss, onDone }: PlanShoppingModalProps) {
  const { t } = useI18n()
  const { activeCircle } = useAppStore()
  const [excludedRecipes, setExcludedRecipes] = useState<Set<string>>(new Set())
  const [excludedIngredientKeys, setExcludedIngredientKeys] = useState<Set<string>>(new Set())
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const includedItems = useMemo(
    () => items.filter((item) => !excludedRecipes.has(item.recipe_title)),
    [items, excludedRecipes]
  )

  const aggregated = useMemo(() => aggregateIngredients(includedItems), [includedItems])

  const visibleIngredients = useMemo(
    () => aggregated.filter((ing) => !excludedIngredientKeys.has(ing.key)),
    [aggregated, excludedIngredientKeys]
  )

  const toggleRecipe = (title: string) => {
    setExcludedRecipes((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const toggleIngredient = (key: string) => {
    setExcludedIngredientKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleAdd = async () => {
    if (!activeCircle || visibleIngredients.length === 0) return
    setIsAdding(true)
    setError(null)
    try {
      const lists = await getShoppingLists()
      let listId: string
      if (lists.length > 0) {
        listId = lists[0].id
      } else {
        const newList = await createShoppingList('Shopping List', activeCircle.id)
        listId = newList.id
      }

      for (const ing of visibleIngredients) {
        const displayQty = ing.totalQuantity !== null ? ing.totalQuantity : undefined
        const attribution =
          ing.recipeAttribution.length > 1
            ? ` (${ing.recipeAttribution
                .map((r) =>
                  r.quantity != null
                    ? `${r.quantity}${r.unit ? ' ' + r.unit : ''} for ${r.title}`
                    : r.title
                )
                .join(', ')})`
            : ''
        await addListItem(listId, {
          name: `${ing.name}${attribution}`,
          quantity: displayQty,
          unit: ing.unit || undefined,
        })
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chat.shoppingModal.addError'))
    } finally {
      setIsAdding(false)
    }
  }

  const recipeNames = [...new Set(items.map((i) => i.recipe_title))]

  return (
    <>
      <div className="fixed inset-0 z-[65] bg-black/50 backdrop-blur-sm" onClick={onDismiss} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="fixed bottom-0 start-0 end-0 z-[66] bg-rp-card rounded-t-3xl max-w-lg mx-auto max-h-[85dvh] flex flex-col shadow-2xl"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-rp-ink">
              {t('chat.shoppingModal.title')}
            </h2>
            <p className="text-sm text-rp-ink-mute mt-0.5">
              {t('chat.shoppingModal.subtitle')}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="h-8 w-8 rounded-full bg-slate-100 dark:bg-surface-dark-overlay flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">
          {/* Recipe filter chips */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {t('chat.shoppingModal.recipesLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {recipeNames.map((title) => {
                const excluded = excludedRecipes.has(title)
                return (
                  <button
                    key={title}
                    onClick={() => toggleRecipe(title)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                      excluded
                        ? 'border-rp-hairline text-rp-ink-mute line-through'
                        : 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                    )}
                  >
                    {title}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Ingredient list */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {t('chat.shoppingModal.ingredientsLabel')} ({visibleIngredients.length} {t('chat.shoppingModal.selected')})
            </p>
            <div className="space-y-1">
              {aggregated.map((ing) => {
                const excluded = excludedIngredientKeys.has(ing.key)
                const qty = ing.totalQuantity !== null ? ing.totalQuantity : null
                const multiRecipe = ing.recipeAttribution.length > 1
                return (
                  <button
                    key={ing.key}
                    onClick={() => toggleIngredient(ing.key)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-start transition-all',
                      excluded
                        ? 'border-slate-100 dark:border-slate-700/50 opacity-50'
                        : 'border-rp-hairline bg-rp-bg-soft'
                    )}
                  >
                    <div
                      className={cn(
                        'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0',
                        excluded
                          ? 'border-slate-300 dark:border-slate-600'
                          : 'border-brand-500 bg-brand-500'
                      )}
                    >
                      {!excluded && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          'text-sm',
                          excluded ? 'line-through text-slate-400' : 'text-rp-ink'
                        )}
                      >
                        {qty != null ? `${qty}${ing.unit ? ' ' + ing.unit : ''} ` : ''}
                        {ing.name}
                      </span>
                      {multiRecipe && !excluded && (
                        <p className="text-[10px] text-rp-ink-mute mt-0.5 truncate">
                          {ing.recipeAttribution
                            .map(
                              (r) =>
                                `${r.title}${r.quantity != null ? ` (${r.quantity}${r.unit ? ' ' + r.unit : ''})` : ''}`
                            )
                            .join(' + ')}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div
          className="px-5 pt-3 pb-4 border-t border-rp-hairline/50 shrink-0"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleAdd}
            disabled={isAdding || visibleIngredients.length === 0}
            className="w-full h-11 rounded-xl bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {isAdding ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            {isAdding
              ? t('chat.shoppingModal.adding')
              : `${t('chat.shoppingModal.addItems')} (${visibleIngredients.length})`}
          </button>
        </div>
      </motion.div>
    </>
  )
}

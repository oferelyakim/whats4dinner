import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingCart, Check, ChevronDown } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'
import { MEAL_TYPES } from '@/lib/constants'
import type { MealType } from '@/lib/constants'
import type { MealPlan, ShoppingList } from '@/types'
import {
  computePlanIngredients,
  addIngredientsBulk,
  createShoppingList,
  getShoppingLists,
  type AggregatedIngredient,
} from '@/services/shoppingLists'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ShopFromPlanSheetProps {
  open: boolean
  onClose: () => void
  plans: MealPlan[]
  circleId: string
  initialScope?: 'week' | 'day' | 'meal'
  initialDate?: string
  initialMealType?: MealType
  initialPlanId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoDate: string, locale: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString(
    locale === 'he' ? 'he-IL' : 'en-US',
    { weekday: 'short', month: 'short', day: 'numeric' }
  )
}

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ShopFromPlanSheet({
  open,
  onClose,
  plans,
  circleId,
  initialScope = 'week',
  initialDate,
  initialMealType,
  initialPlanId,
}: ShopFromPlanSheetProps) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()

  // ── Scope state ────────────────────────────────────────────────────────────
  const [scope, setScope] = useState<'week' | 'day' | 'meal'>(initialScope)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [selectedMealTypes, setSelectedMealTypes] = useState<Set<MealType>>(
    new Set(MEAL_TYPES)
  )
  const [excludedPlanIds, setExcludedPlanIds] = useState<Set<string>>(new Set())
  const [excludedIngredientKeys, setExcludedIngredientKeys] = useState<Set<string>>(new Set())

  // ── Target list state ──────────────────────────────────────────────────────
  const [targetListId, setTargetListId] = useState<string | 'new'>('new')
  const [newListName, setNewListName] = useState(() => defaultNewListName(locale))

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [didSucceed, setDidSucceed] = useState(false)

  // ── Unique dates with plans ─────────────────────────────────────────────────
  const planDates = useMemo(() => {
    const dates = [...new Set(plans.map((p) => p.plan_date))].sort()
    return dates
  }, [plans])

  // ── Sync initial state when sheet opens ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setScope(initialScope ?? 'week')
    setSaveError(null)
    setDidSucceed(false)
    setExcludedPlanIds(new Set())
    setExcludedIngredientKeys(new Set())
    setNewListName(defaultNewListName(locale))

    // Initialise selectedDates
    if ((initialScope === 'day' || initialScope === 'meal') && initialDate) {
      setSelectedDates(new Set([initialDate]))
    } else {
      setSelectedDates(new Set(planDates))
    }

    // Initialise selectedMealTypes
    if (initialScope === 'meal' && initialMealType) {
      setSelectedMealTypes(new Set([initialMealType]))
    } else {
      setSelectedMealTypes(new Set(MEAL_TYPES))
    }

    // Exclude specific plan if entering from meal scope
    if (initialScope === 'meal' && initialPlanId) {
      // The caller passes the one plan to scope down TO — don't exclude it
      // We'll keep excludedPlanIds empty and let date+mealType filtering narrow it
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch shopping lists ────────────────────────────────────────────────────
  const { data: shoppingLists = [] } = useQuery<ShoppingList[]>({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
    enabled: open,
  })

  const activeLists = useMemo(
    () => shoppingLists.filter((l) => l.status === 'active'),
    [shoppingLists]
  )

  // ── Effective plan IDs based on scope/filters ────────────────────────────────
  const effectivePlans = useMemo(() => {
    let filtered = plans.filter((p) => p.recipe_id != null)

    if (scope === 'week') {
      filtered = filtered.filter((p) => selectedDates.has(p.plan_date))
      filtered = filtered.filter((p) => selectedMealTypes.has(p.meal_type))
    } else if (scope === 'day') {
      filtered = filtered.filter((p) => selectedDates.has(p.plan_date))
      filtered = filtered.filter((p) => selectedMealTypes.has(p.meal_type))
    } else {
      // meal scope: filter by single date + single meal type
      filtered = filtered.filter((p) => selectedDates.has(p.plan_date))
      filtered = filtered.filter((p) => selectedMealTypes.has(p.meal_type))
    }

    // Apply per-plan exclusions
    filtered = filtered.filter((p) => !excludedPlanIds.has(p.id))
    return filtered
  }, [plans, scope, selectedDates, selectedMealTypes, excludedPlanIds])

  const effectivePlanIds = useMemo(
    () => effectivePlans.map((p) => p.id),
    [effectivePlans]
  )

  // Count plans that were filtered out because they have no recipe_id
  const noRecipePlanCount = useMemo(() => {
    let base = plans
    if (scope === 'week') {
      base = base.filter((p) => selectedDates.has(p.plan_date) && selectedMealTypes.has(p.meal_type))
    } else if (scope === 'day') {
      base = base.filter((p) => selectedDates.has(p.plan_date) && selectedMealTypes.has(p.meal_type))
    } else {
      base = base.filter((p) => selectedDates.has(p.plan_date) && selectedMealTypes.has(p.meal_type))
    }
    base = base.filter((p) => !excludedPlanIds.has(p.id))
    return base.filter((p) => p.recipe_id == null).length
  }, [plans, scope, selectedDates, selectedMealTypes, excludedPlanIds])

  // ── Aggregate ingredients ────────────────────────────────────────────────────
  const {
    data: aggregated = [],
    isFetching: isAggregating,
  } = useQuery<AggregatedIngredient[]>({
    queryKey: ['plan-ingredients', effectivePlanIds.join(',')],
    queryFn: () => computePlanIngredients(effectivePlanIds),
    enabled: open && effectivePlanIds.length > 0,
    staleTime: 30_000,
  })

  const visibleIngredients = useMemo(
    () => aggregated.filter((ing) => !excludedIngredientKeys.has(ing.key)),
    [aggregated, excludedIngredientKeys]
  )

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  function toggleDate(date: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
    setExcludedIngredientKeys(new Set())
  }

  function toggleMealType(mt: MealType) {
    setSelectedMealTypes((prev) => {
      const next = new Set(prev)
      if (next.has(mt)) next.delete(mt)
      else next.add(mt)
      return next
    })
    setExcludedIngredientKeys(new Set())
  }

  function togglePlanExclusion(planId: string) {
    setExcludedPlanIds((prev) => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
    setExcludedIngredientKeys(new Set())
  }

  function toggleIngredient(key: string) {
    setExcludedIngredientKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleSelectAll() {
    setExcludedIngredientKeys(new Set())
  }

  function handleSelectNone() {
    setExcludedIngredientKeys(new Set(aggregated.map((i) => i.key)))
  }

  // ── CTA handler ─────────────────────────────────────────────────────────────
  async function handleAddToList() {
    if (visibleIngredients.length === 0 || isSaving) return
    setSaveError(null)
    setIsSaving(true)
    try {
      let listId: string

      if (targetListId === 'new') {
        const created = await createShoppingList(newListName || defaultNewListName(locale), circleId)
        listId = created.id
      } else {
        listId = targetListId
      }

      const items = visibleIngredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        notes:
          ing.sourceRecipeTitles.length > 0
            ? `From: ${ing.sourceRecipeTitles.join(', ')}`
            : null,
      }))

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

  // ── Scope pill helpers ──────────────────────────────────────────────────────
  function handleScopeChange(newScope: 'week' | 'day' | 'meal') {
    setScope(newScope)
    setExcludedIngredientKeys(new Set())
    setExcludedPlanIds(new Set())

    if (newScope === 'week') {
      setSelectedDates(new Set(planDates))
      setSelectedMealTypes(new Set(MEAL_TYPES))
    } else if (newScope === 'day') {
      // Default to first available date
      const firstDate = planDates[0]
      setSelectedDates(firstDate ? new Set([firstDate]) : new Set())
      setSelectedMealTypes(new Set(MEAL_TYPES))
    } else {
      const firstDate = planDates[0]
      setSelectedDates(firstDate ? new Set([firstDate]) : new Set())
      setSelectedMealTypes(new Set([MEAL_TYPES[2]])) // default dinner
    }
  }

  // ── Included recipe chips for fine-grained exclusion ───────────────────────
  const includedRecipeChips = useMemo(() => {
    return effectivePlans
      .filter((p) => p.recipe?.title)
      .map((p) => ({ planId: p.id, title: p.recipe!.title! }))
  }, [effectivePlans])

  // ─── Render ─────────────────────────────────────────────────────────────────
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
            className="fixed bottom-0 start-0 end-0 z-[66] bg-white dark:bg-surface-dark-elevated rounded-t-3xl max-w-lg mx-auto max-h-[92dvh] flex flex-col shadow-2xl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('plan.shop.title')}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('plan.shop.subtitle')}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label={t('common.close')}
                className="h-8 w-8 rounded-full bg-slate-100 dark:bg-surface-dark-overlay flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">

              {/* ── Section 1: Scope ─────────────────────────────────────── */}
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  {t('plan.shop.scopeLabel')}
                </p>
                <div className="flex gap-2">
                  {(['week', 'day', 'meal'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleScopeChange(s)}
                      className={cn(
                        'flex-1 py-2 rounded-full text-xs font-medium border transition-all',
                        scope === s
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-400'
                      )}
                    >
                      {t(`plan.shop.scope${s.charAt(0).toUpperCase() + s.slice(1)}` as `plan.shop.scope${string}`)}
                    </button>
                  ))}
                </div>
              </section>

              {/* ── Section 2: Filter ─────────────────────────────────────── */}
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  {t('plan.shop.filterLabel')}
                </p>

                {/* Day chips — shown for week & day scope */}
                {(scope === 'week' || scope === 'day') && (
                  <div className="mb-3">
                    <p className="text-[11px] text-slate-500 mb-1.5">{t('plan.shop.daysLabel')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {planDates.map((date) => {
                        const included = selectedDates.has(date)
                        return (
                          <button
                            key={date}
                            onClick={() => {
                              if (scope === 'day') {
                                // Single-select for day scope
                                setSelectedDates(new Set([date]))
                                setExcludedIngredientKeys(new Set())
                              } else {
                                toggleDate(date)
                              }
                            }}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                              included
                                ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400'
                                : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 line-through'
                            )}
                          >
                            {formatDate(date, locale)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Meal type chips */}
                {(scope === 'week' || scope === 'day') && (
                  <div className="mb-3">
                    <p className="text-[11px] text-slate-500 mb-1.5">{t('plan.shop.mealTypesLabel')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MEAL_TYPES.map((mt) => {
                        const included = selectedMealTypes.has(mt)
                        return (
                          <button
                            key={mt}
                            onClick={() => toggleMealType(mt)}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize',
                              included
                                ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400'
                                : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 line-through'
                            )}
                          >
                            {t(`plan.${mt}` as `plan.${string}`)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Meal scope: date picker + meal type picker */}
                {scope === 'meal' && (
                  <div className="space-y-3 mb-3">
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1.5">{t('plan.shop.pickDate')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {planDates.map((date) => (
                          <button
                            key={date}
                            onClick={() => {
                              setSelectedDates(new Set([date]))
                              setExcludedIngredientKeys(new Set())
                            }}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                              selectedDates.has(date)
                                ? 'bg-brand-500 text-white border-brand-500'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                            )}
                          >
                            {formatDate(date, locale)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1.5">{t('plan.shop.pickMealType')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {MEAL_TYPES.map((mt) => (
                          <button
                            key={mt}
                            onClick={() => {
                              setSelectedMealTypes(new Set([mt]))
                              setExcludedIngredientKeys(new Set())
                            }}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize',
                              selectedMealTypes.has(mt)
                                ? 'bg-brand-500 text-white border-brand-500'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                            )}
                          >
                            {t(`plan.${mt}` as `plan.${string}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Included recipe chips with per-plan exclusion */}
                {includedRecipeChips.length > 0 && (
                  <div>
                    <p className="text-[11px] text-slate-500 mb-1.5">{t('plan.shop.recipesLabel')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {includedRecipeChips.map(({ planId, title }) => {
                        const excluded = excludedPlanIds.has(planId)
                        return (
                          <button
                            key={planId}
                            onClick={() => togglePlanExclusion(planId)}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                              excluded
                                ? 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 line-through'
                                : 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400'
                            )}
                          >
                            {title}
                            {!excluded && <X className="h-3 w-3" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* ── Section 3: Ingredients ──────────────────────────────── */}
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
                      onClick={visibleIngredients.length === aggregated.length ? handleSelectNone : handleSelectAll}
                      className="text-[11px] text-brand-500 font-medium"
                    >
                      {visibleIngredients.length === aggregated.length
                        ? t('plan.shop.selectNone')
                        : t('plan.shop.selectAll')}
                    </button>
                  )}
                </div>

                {isAggregating && effectivePlanIds.length > 0 && (
                  <div className="flex justify-center py-6">
                    <div className="h-5 w-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {!isAggregating && effectivePlanIds.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">
                    {t('plan.shop.noPlans')}
                  </p>
                )}

                {!isAggregating && effectivePlanIds.length > 0 && aggregated.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">
                    {t('plan.shop.noPlans')}
                  </p>
                )}

                {noRecipePlanCount > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                    {noRecipePlanCount} {t('plan.shop.noRecipes')}
                  </p>
                )}

                {!isAggregating && aggregated.length > 0 && (
                  <div className="space-y-1.5">
                    {aggregated.map((ing) => {
                      const excluded = excludedIngredientKeys.has(ing.key)
                      const hasQty = ing.quantity != null
                      const isMultiSource = ing.sourceRecipeTitles.length > 1

                      return (
                        <button
                          key={ing.key}
                          onClick={() => toggleIngredient(ing.key)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-start transition-all',
                            excluded
                              ? 'border-slate-100 dark:border-slate-700/50 opacity-50'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-dark-overlay'
                          )}
                        >
                          {/* Checkbox */}
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

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <span
                              className={cn(
                                'text-sm',
                                excluded
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-800 dark:text-slate-200'
                              )}
                            >
                              {hasQty ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''} ` : ''}
                              {ing.name}
                            </span>
                            {(isMultiSource || ing.sourceRecipeTitles.length === 1) && !excluded && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                                {t('plan.shop.from')} {ing.sourceRecipeTitles.join(', ')}
                              </p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* ── Section 4: Target list ─────────────────────────────── */}
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  {t('plan.shop.targetLabel')}
                </p>

                {/* Dropdown */}
                <div className="relative mb-2">
                  <select
                    value={targetListId}
                    onChange={(e) => setTargetListId(e.target.value as string | 'new')}
                    className="w-full appearance-none px-3 py-2.5 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark-overlay text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
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
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark-overlay text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                  />
                )}
              </section>

              {saveError && (
                <p className="text-sm text-red-500 dark:text-red-400">{saveError}</p>
              )}
            </div>

            {/* ── Sticky footer ───────────────────────────────────────────── */}
            <div
              className="px-5 pt-3 pb-4 border-t border-slate-200 dark:border-slate-700/50 shrink-0"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <button
                onClick={didSucceed ? onClose : handleAddToList}
                disabled={isSaving || (!didSucceed && visibleIngredients.length === 0)}
                className={cn(
                  'w-full h-12 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
                  didSucceed
                    ? 'bg-emerald-500'
                    : 'bg-brand-500 disabled:opacity-40'
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

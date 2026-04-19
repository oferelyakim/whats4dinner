import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronDown, ChevronUp, Clock, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'

export interface MealPlanItem {
  date: string
  meal_type: string
  recipe_title: string
  recipe_id?: string | null
  ingredients?: Array<{ name: string; quantity?: number; unit?: string }>
  servings?: number
  estimated_time_min?: number
  tags?: string[]
}

export interface GeneratedPlan {
  plan: MealPlanItem[]
  shopping_suggestions?: string[]
  notes?: string
}

interface ChatPlanReviewProps {
  plan: GeneratedPlan
  isAccepting: boolean
  onAccept: (selectedItems: MealPlanItem[]) => void
  onRequestChanges: (request: string) => void
  onRequestReplacements: (accepted: MealPlanItem[], rejected: Array<{ item: MealPlanItem; comment: string }>) => void
  onDismiss: () => void
}

const MEAL_ICONS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
}

function formatPlanDate(dateStr: string, locale: string): string {
  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(dateLocale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function ChatPlanReview({
  plan,
  isAccepting,
  onAccept,
  onRequestChanges,
  onRequestReplacements,
  onDismiss,
}: ChatPlanReviewProps) {
  const { t, locale } = useI18n()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(plan.plan.map((_, i) => i))
  )
  const [itemComments, setItemComments] = useState<Record<number, string>>({})
  const [shoppingExpanded, setShoppingExpanded] = useState(false)
  const [showStartOverInput, setShowStartOverInput] = useState(false)
  const [startOverRequest, setStartOverRequest] = useState('')

  const uncheckedIndices = plan.plan
    .map((_, i) => i)
    .filter((i) => !selectedIds.has(i))

  const toggleItem = (index: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
        // Clear comment when re-checking
        setItemComments((c) => {
          const nc = { ...c }
          delete nc[index]
          return nc
        })
      }
      return next
    })
  }

  const handleAccept = () => {
    const selectedItems = plan.plan.filter((_, i) => selectedIds.has(i))
    onAccept(selectedItems)
  }

  const handleSaveWithoutReplacements = () => {
    const selectedItems = plan.plan.filter((_, i) => selectedIds.has(i))
    onAccept(selectedItems)
  }

  const handleGetReplacements = () => {
    const accepted = plan.plan.filter((_, i) => selectedIds.has(i))
    const rejected = uncheckedIndices.map((i) => ({
      item: plan.plan[i],
      comment: itemComments[i] || '',
    }))
    onRequestReplacements(accepted, rejected)
  }

  const handleStartOver = () => {
    if (startOverRequest.trim()) {
      onRequestChanges(startOverRequest.trim())
    }
  }

  // Group items by date
  const itemsByDate = plan.plan.reduce<Record<string, Array<{ item: MealPlanItem; index: number }>>>(
    (acc, item, index) => {
      if (!acc[item.date]) acc[item.date] = []
      acc[item.date].push({ item, index })
      return acc
    },
    {}
  )

  const sortedDates = Object.keys(itemsByDate).sort()

  const hasUnchecked = uncheckedIndices.length > 0
  const allUnchecked = selectedIds.size === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="fixed bottom-0 start-0 end-0 z-[60] bg-white dark:bg-surface-dark-elevated rounded-t-3xl max-w-lg mx-auto max-h-[90dvh] flex flex-col shadow-2xl"
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
      </div>

      {/* Header */}
      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
              {t('chat.planReview.title')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t('chat.planReview.subtitle')}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="h-8 w-8 rounded-full bg-slate-100 dark:bg-surface-dark-overlay flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0 mt-0.5"
            aria-label={t('common.close')}
          >
            <span className="text-sm leading-none">✕</span>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">
        {/* Meal items grouped by date */}
        {sortedDates.map((date) => (
          <div key={date}>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
              {formatPlanDate(date, locale)}
            </p>
            <div className="space-y-2">
              {itemsByDate[date].map(({ item, index }) => {
                const isSelected = selectedIds.has(index)
                return (
                  <div key={index}>
                    <button
                      onClick={() => toggleItem(index)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-start active:scale-[0.98]',
                        isSelected
                          ? 'border-brand-300 dark:border-brand-700 bg-brand-500/5 dark:bg-brand-500/10'
                          : 'border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 opacity-70'
                      )}
                    >
                      {/* Meal icon */}
                      <span className="text-lg shrink-0 leading-none">
                        {MEAL_ICONS[item.meal_type] ?? '🍽️'}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm font-semibold truncate',
                          isSelected
                            ? 'text-slate-800 dark:text-slate-200'
                            : 'text-slate-500 dark:text-slate-400 line-through'
                        )}>
                          {item.recipe_title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {item.recipe_id ? (
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                              {t('chat.planReview.fromRecipes')}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded-full font-medium">
                              {t('chat.planReview.newRecipe')}
                            </span>
                          )}
                          {item.estimated_time_min && (
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                              <Clock className="h-2.5 w-2.5" />
                              {item.estimated_time_min}{t('chat.planReview.minutesAbbr')}
                            </span>
                          )}
                          {!isSelected && (
                            <span className="text-[10px] text-orange-500 dark:text-orange-400 font-medium">
                              {t('chat.planReview.itemReplacementHint')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Checkmark */}
                      <div
                        className={cn(
                          'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                          isSelected
                            ? 'border-brand-500 bg-brand-500'
                            : 'border-slate-300 dark:border-slate-600'
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </button>

                    {/* Per-item comment input when unchecked */}
                    <AnimatePresence>
                      {!isSelected && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <input
                            type="text"
                            value={itemComments[index] || ''}
                            onChange={(e) =>
                              setItemComments((prev) => ({ ...prev, [index]: e.target.value }))
                            }
                            placeholder={t('chat.planReview.replacementPlaceholder')}
                            className="mt-1.5 w-full h-9 px-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-orange-400/30"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Shopping suggestions */}
        {plan.shopping_suggestions && plan.shopping_suggestions.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShoppingExpanded((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-start bg-slate-50 dark:bg-surface-dark-overlay"
            >
              <ShoppingBag className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
                {t('chat.planReview.shoppingNeeded')} ({plan.shopping_suggestions.length})
              </span>
              {shoppingExpanded
                ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              }
            </button>
            <AnimatePresence>
              {shoppingExpanded && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {plan.shopping_suggestions.map((suggestion, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 px-3 py-1.5 border-t border-slate-100 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-400"
                    >
                      <span className="h-1 w-1 rounded-full bg-brand-400 shrink-0" />
                      {suggestion}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Notes */}
        {plan.notes && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 px-3 py-2.5">
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              {plan.notes}
            </p>
          </div>
        )}

        {/* Start over input */}
        <AnimatePresence>
          {showStartOverInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={startOverRequest}
                  onChange={(e) => setStartOverRequest(e.target.value)}
                  placeholder={t('chat.planReview.changesPlaceholder')}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && startOverRequest.trim()) {
                      handleStartOver()
                    }
                  }}
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-100 dark:bg-surface-dark-overlay text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                <button
                  onClick={handleStartOver}
                  disabled={!startOverRequest.trim()}
                  className="h-10 px-4 rounded-xl bg-brand-500 text-white text-sm font-medium disabled:opacity-40 active:scale-95 transition-transform"
                >
                  {t('common.send')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div
        className="px-5 pt-3 pb-4 border-t border-slate-200 dark:border-slate-700/50 flex flex-col gap-2 shrink-0"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Save without replacements link — only when items are unchecked and not all */}
        {hasUnchecked && !allUnchecked && (
          <button
            onClick={handleSaveWithoutReplacements}
            disabled={isAccepting}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-center py-0.5 transition-colors disabled:opacity-40"
          >
            {t('chat.planReview.saveWithoutReplacements')}
          </button>
        )}

        <div className="flex gap-3">
          {/* Left: Start Over */}
          <button
            onClick={() => setShowStartOverInput((v) => !v)}
            disabled={isAccepting}
            className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-surface-dark-elevated hover:bg-slate-50 dark:hover:bg-surface-dark-overlay transition-colors disabled:opacity-40 active:scale-[0.98]"
          >
            {t('chat.planReview.requestChanges')}
          </button>

          {/* Right: Get Replacements or Save Plan */}
          {hasUnchecked ? (
            <button
              onClick={handleGetReplacements}
              disabled={isAccepting || allUnchecked}
              className="flex-1 h-11 rounded-xl bg-orange-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {t('chat.planReview.getReplacements')} ({uncheckedIndices.length})
            </button>
          ) : (
            <button
              onClick={handleAccept}
              disabled={isAccepting || selectedIds.size === 0}
              className="flex-1 h-11 rounded-xl bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {isAccepting ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('chat.planReview.savePlan')
              )}
            </button>
          )}
        </div>

        {/* When all unchecked, show "Try New Plan" to trigger start over */}
        {allUnchecked && !showStartOverInput && (
          <p className="text-xs text-center text-slate-400 dark:text-slate-500">
            Uncheck all and tap <span className="font-medium">{t('chat.planReview.requestChanges')}</span> to generate a new plan
          </p>
        )}
      </div>
    </motion.div>
  )
}

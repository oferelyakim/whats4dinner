import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  RefreshCw,
  ShoppingCart,
  Trash2,
  CalendarCheck,
  CheckCircle2,
  Globe,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'

export interface MealPlanItem {
  date: string
  meal_type: string
  recipe_title: string
  recipe_id?: string | null
  description?: string
  source_preference?: 'web' | 'generate'
  // Populated after Phase 2
  ingredients?: Array<{ name: string; quantity?: number | null; unit?: string }>
  instructions?: string[]
  servings?: number | null
  estimated_time_min?: number | null
  tags?: string[]
  from_web?: boolean
  source_url?: string
  thumbnail?: string
  // Internal UI state
  _status?: 'loading' | 'ready' | 'error'
  _errorMessage?: string
}

export interface GeneratedPlan {
  plan: MealPlanItem[]
  shopping_suggestions?: string[]
  notes?: string
  _stage?: 'selecting' | 'fetching' | 'ready'
}

type PlanItemWithKey = MealPlanItem & { _key: number }

interface ChatPlanReviewProps {
  plan: GeneratedPlan
  isAccepting: boolean
  isRevising?: boolean
  fetchError?: string | null
  onApprove: (selectedItems: MealPlanItem[]) => void
  onAccept: (selectedItems: MealPlanItem[]) => void
  onRequestChanges: (request: string) => void
  onCancelRevision?: () => void
  onDismiss: () => void
  onNavigateToRecipe?: (recipeId: string) => void
  onAddToShoppingList?: (items: MealPlanItem[]) => void
  onRetryItem?: (item: MealPlanItem) => void
  onRetryAllFailed?: () => void
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
  isRevising = false,
  fetchError,
  onApprove,
  onAccept,
  onRequestChanges,
  onCancelRevision,
  onDismiss,
  onNavigateToRecipe,
  onAddToShoppingList,
  onRetryItem,
  onRetryAllFailed,
}: ChatPlanReviewProps) {
  const { t, locale } = useI18n()
  const stage = plan._stage ?? 'selecting'

  const keyedItems: PlanItemWithKey[] = plan.plan.map((item, i) => ({
    ...item,
    _key: i,
  }))

  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(
    () => new Set(plan.plan.map((_, i) => i))
  )
  const [itemComments, setItemComments] = useState<Record<number, string>>({})
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<number | null>(null)
  const [removedKeys, setRemovedKeys] = useState<Set<number>>(new Set())
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set())
  const [showStartOverInput, setShowStartOverInput] = useState(false)
  const [startOverRequest, setStartOverRequest] = useState('')

  const visibleItems = keyedItems.filter((item) => !removedKeys.has(item._key))
  const uncheckedItems = visibleItems.filter((item) => !selectedKeys.has(item._key))
  const selectedItems = visibleItems.filter((item) => selectedKeys.has(item._key))

  const toggleItem = (key: number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        setItemComments((c) => {
          const nc = { ...c }
          delete nc[key]
          return nc
        })
      }
      return next
    })
  }

  const toggleExpand = (key: number) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleRemove = (key: number) => {
    setRemovedKeys((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setConfirmRemoveKey(null)
  }

  const stripKey = (item: PlanItemWithKey): MealPlanItem => {
    const { _key: _unused, ...rest } = item
    void _unused
    return rest
  }

  const handleApprove = () => {
    onApprove(selectedItems.map(stripKey))
  }

  const handleAccept = () => {
    const readyItems = keyedItems.filter(
      (item) => item._status === 'ready' && !removedKeys.has(item._key),
    )
    onAccept(readyItems.map(stripKey))
  }

  const handleAddToShopping = () => {
    if (!onAddToShoppingList) return
    const readyItems = keyedItems.filter(
      (item) => item._status === 'ready' && !removedKeys.has(item._key),
    )
    onAddToShoppingList(readyItems.map(stripKey))
  }

  const handleRequestReplacements = () => {
    if (isRevising) return
    const feedback = uncheckedItems
      .map((item) => {
        const comment = itemComments[item._key]
        return `replace "${item.recipe_title}" (${item.meal_type} on ${item.date})${comment ? `: ${comment}` : ''}`
      })
      .join('; ')
    onRequestChanges(
      feedback
        ? `Please suggest replacements: ${feedback}. Keep all other dishes the same.`
        : 'Please suggest alternative dishes.',
    )
  }

  const handleStartOver = () => {
    if (isRevising) return
    const trimmed = startOverRequest.trim()
    if (!trimmed) return
    onRequestChanges(trimmed)
    setStartOverRequest('')
    setShowStartOverInput(false)
  }

  const itemsByDate = visibleItems.reduce<Record<string, PlanItemWithKey[]>>((acc, item) => {
    if (!acc[item.date]) acc[item.date] = []
    acc[item.date].push(item)
    return acc
  }, {})
  const sortedDates = Object.keys(itemsByDate).sort()

  const readyCount = keyedItems.filter((item) => item._status === 'ready').length
  const errorCount = keyedItems.filter((item) => item._status === 'error').length
  const totalFetchCount = keyedItems.filter((item) => item._status != null).length

  const headerTitle =
    stage === 'fetching'
      ? 'Fetching Recipes...'
      : stage === 'ready'
        ? 'Your Meal Plan'
        : t('chat.planReview.title')

  const headerSubtitle =
    stage === 'fetching'
      ? `${readyCount} of ${totalFetchCount} ready`
      : stage === 'ready'
        ? 'Tap any dish to see ingredients'
        : 'Review and approve your dishes'

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="fixed bottom-0 start-0 end-0 z-[60] bg-rp-card rounded-t-3xl max-w-lg mx-auto max-h-[90dvh] flex flex-col shadow-2xl"
    >
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
      </div>

      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-rp-ink leading-tight">
              {headerTitle}
            </h2>
            <p className="text-sm text-rp-ink-mute mt-0.5">{headerSubtitle}</p>
            {stage === 'fetching' && totalFetchCount > 0 && (
              <div className="mt-2 h-1 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <motion.div
                  className="h-full bg-brand-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(readyCount / totalFetchCount) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
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

      <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">
        {fetchError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-3 py-2.5">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300">
              {t('chat.planReview.fetchAllFailed')}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 leading-relaxed">
              {fetchError}
            </p>
          </div>
        )}
        {sortedDates.map((date) => (
          <div key={date}>
            <p className="text-xs font-semibold text-rp-ink-mute uppercase tracking-wide mb-2">
              {formatPlanDate(date, locale)}
            </p>
            <div className="space-y-2">
              {itemsByDate[date].map((item) => {
                if (stage === 'selecting') {
                  return (
                    <SelectingCard
                      key={item._key}
                      item={item}
                      isSelected={selectedKeys.has(item._key)}
                      comment={itemComments[item._key] ?? ''}
                      onToggle={() => toggleItem(item._key)}
                      onRemove={() => setConfirmRemoveKey(item._key)}
                      onCommentChange={(c) =>
                        setItemComments((p) => ({ ...p, [item._key]: c }))
                      }
                      onNavigateToRecipe={onNavigateToRecipe}
                    />
                  )
                }
                if (stage === 'fetching') {
                  return (
                    <FetchingCard
                      key={item._key}
                      item={item}
                      onRetry={onRetryItem ? () => onRetryItem(stripKey(item)) : undefined}
                    />
                  )
                }
                return (
                  <ReadyCard
                    key={item._key}
                    item={item}
                    isExpanded={expandedKeys.has(item._key)}
                    onToggle={() => toggleExpand(item._key)}
                    onNavigateToRecipe={onNavigateToRecipe}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {plan.notes && stage !== 'fetching' && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 px-3 py-2.5">
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{plan.notes}</p>
          </div>
        )}

        {stage === 'selecting' && (
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
                    className="flex-1 h-10 px-3 rounded-xl bg-slate-100 dark:bg-surface-dark-overlay text-sm text-rp-ink placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brand-500/30"
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
        )}
      </div>

      <div
        className="px-5 pt-3 pb-4 border-t border-rp-hairline/50 flex flex-col gap-2 shrink-0"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {stage === 'selecting' && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowStartOverInput((v) => !v)}
              className="flex-1 h-11 rounded-xl border border-rp-hairline text-sm font-medium text-slate-700 dark:text-slate-200 bg-rp-card hover:bg-slate-50 dark:hover:bg-surface-dark-overlay transition-colors active:scale-[0.98]"
            >
              {t('chat.planReview.requestChanges')}
            </button>
            {uncheckedItems.length > 0 ? (
              <button
                onClick={handleRequestReplacements}
                className="flex-1 h-11 rounded-xl bg-orange-500 text-white text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                Replace ({uncheckedItems.length})
              </button>
            ) : (
              <button
                onClick={handleApprove}
                disabled={selectedItems.length === 0}
                className="flex-1 h-11 rounded-xl bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                Get Recipes ({selectedItems.length}) →
              </button>
            )}
          </div>
        )}

        {stage === 'fetching' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2 text-sm text-rp-ink-mute py-2">
              <div className="h-4 w-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
              Fetching {Math.max(0, totalFetchCount - readyCount - errorCount)} more recipe
              {totalFetchCount - readyCount - errorCount !== 1 ? 's' : ''}...
            </div>
            {errorCount > 0 && onRetryAllFailed && (
              <button
                onClick={onRetryAllFailed}
                className="w-full h-10 rounded-xl border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <RefreshCw className="h-4 w-4" />
                {t('chat.planReview.retryAllFailed')} ({errorCount})
              </button>
            )}
          </div>
        )}

        {stage === 'ready' && (
          <>
            {errorCount > 0 && onRetryAllFailed && (
              <button
                onClick={onRetryAllFailed}
                className="w-full h-10 rounded-xl border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <RefreshCw className="h-4 w-4" />
                {t('chat.planReview.retryAllFailed')} ({errorCount})
              </button>
            )}
            {onAddToShoppingList && (
              <button
                onClick={handleAddToShopping}
                disabled={readyCount === 0}
                className="w-full h-11 rounded-xl border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                <ShoppingCart className="h-4 w-4" />
                {t('chat.planReview.addToShoppingList')}
              </button>
            )}
            <button
              onClick={handleAccept}
              disabled={isAccepting || readyCount === 0}
              className="w-full h-11 rounded-xl bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {isAccepting ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('chat.planReview.saving')}
                </>
              ) : (
                <>
                  <CalendarCheck className="h-4 w-4" />
                  {t('chat.planReview.saveToCalendar').replace('{{count}}', String(readyCount))}
                </>
              )}
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {isRevising && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-[65] rounded-t-3xl bg-rp-card/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6"
          >
            <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-rp-ink text-center">
              Revising your plan...
            </p>
            <p className="text-xs text-rp-ink-mute text-center max-w-xs">
              I&apos;m updating the dishes based on your request. This usually takes a few seconds.
            </p>
            {onCancelRevision && (
              <button
                type="button"
                onClick={onCancelRevision}
                className="mt-2 h-10 px-5 rounded-xl border border-rp-hairline text-sm font-medium text-rp-ink bg-rp-card hover:bg-slate-50 dark:hover:bg-surface-dark-overlay active:scale-[0.98] transition-all"
              >
                {t('common.cancel')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {confirmRemoveKey !== null && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmRemoveKey(null)}
          />
          <div className="relative bg-rp-card rounded-2xl p-5 shadow-2xl w-full max-w-sm space-y-3">
            <p className="text-sm font-medium text-rp-ink">
              Remove &quot;{keyedItems.find((i) => i._key === confirmRemoveKey)?.recipe_title}&quot; from the plan?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemoveKey(null)}
                className="flex-1 h-10 rounded-xl border border-rp-hairline text-sm text-rp-ink-soft"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleRemove(confirmRemoveKey)}
                className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-medium"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

interface SelectingCardProps {
  item: PlanItemWithKey
  isSelected: boolean
  comment: string
  onToggle: () => void
  onRemove: () => void
  onCommentChange: (c: string) => void
  onNavigateToRecipe?: (recipeId: string) => void
}

function SelectingCard({
  item,
  isSelected,
  comment,
  onToggle,
  onRemove,
  onCommentChange,
  onNavigateToRecipe,
}: SelectingCardProps) {
  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'w-full flex items-center gap-2 p-3 rounded-2xl border transition-all',
          isSelected
            ? 'border-brand-300 dark:border-brand-700 bg-brand-50/30 dark:bg-brand-900/10'
            : 'border-orange-200 dark:border-orange-800/50 bg-orange-50/30 dark:bg-orange-900/10 opacity-60',
        )}
      >
        <span className="text-xl shrink-0 leading-none">{MEAL_ICONS[item.meal_type] ?? '🍽️'}</span>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm font-semibold',
              isSelected
                ? 'text-rp-ink'
                : 'text-rp-ink-mute line-through',
            )}
          >
            {item.recipe_title}
          </p>
          {item.description && isSelected && (
            <p className="text-xs text-rp-ink-mute mt-0.5 line-clamp-2">
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {item.source_preference === 'web' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                <Globe className="h-2.5 w-2.5" />
                web
              </span>
            )}
            {item.source_preference === 'generate' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 font-medium flex items-center gap-0.5">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            )}
            {item.estimated_time_min && (
              <span className="flex items-center gap-0.5 text-[10px] text-rp-ink-mute">
                <Clock className="h-2.5 w-2.5" />
                {item.estimated_time_min}m
              </span>
            )}
            {(item.tags || []).slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/50 text-rp-ink-mute"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        {item.recipe_id && onNavigateToRecipe && (
          <button
            type="button"
            onClick={() => onNavigateToRecipe(item.recipe_id!)}
            className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-brand-500 transition-colors"
            aria-label="View recipe"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
          aria-label="Remove from plan"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors',
            isSelected ? 'border-brand-500 bg-brand-500' : 'border-slate-300 dark:border-slate-600',
          )}
          aria-label={isSelected ? 'Exclude' : 'Include'}
        >
          {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
        </button>
      </div>
      <AnimatePresence>
        {!isSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <input
              type="text"
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="What to replace it with (optional)..."
              className="w-full h-9 px-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 text-sm text-rp-ink-soft placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-orange-400/30"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface FetchingCardProps {
  item: PlanItemWithKey
  onRetry?: () => void
}

function FetchingCard({ item, onRetry }: FetchingCardProps) {
  const { t } = useI18n()
  const status = item._status ?? 'loading'
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-2xl border transition-all',
        status === 'ready'
          ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/10'
          : status === 'error'
            ? 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-900/10'
            : 'border-rp-hairline bg-rp-bg-soft',
      )}
    >
      <span className="text-xl shrink-0 leading-none mt-0.5">{MEAL_ICONS[item.meal_type] ?? '🍽️'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-rp-ink truncate">
          {item.recipe_title}
        </p>
        {status === 'loading' && (
          <div className="flex items-center gap-1 mt-1">
            <div
              className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
            <span className="text-xs text-rp-ink-mute ms-1">
              {t('chat.planReview.fetchingRecipe')}
            </span>
          </div>
        )}
        {status === 'ready' && (
          <div className="flex items-center gap-2 mt-1">
            {item.from_web ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <Globe className="h-2.5 w-2.5" />
                Web recipe
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center gap-0.5">
                <Sparkles className="h-2.5 w-2.5" />
                AI recipe
              </span>
            )}
            <span className="text-[10px] text-rp-ink-mute">
              {item.ingredients?.length || 0} ingredients
            </span>
          </div>
        )}
        {status === 'error' && (
          <div className="mt-1 space-y-1">
            <span className="text-[10px] font-medium text-red-500 dark:text-red-400">
              {t('chat.planReview.failedToFetch')}
            </span>
            {item._errorMessage && (
              <p className="text-[10px] text-red-400 dark:text-red-500 leading-relaxed">
                {t('chat.planReview.errorDetails')}: {item._errorMessage}
              </p>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors mt-0.5"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                {t('chat.planReview.retry')}
              </button>
            )}
          </div>
        )}
      </div>
      {status === 'ready' && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
      {status === 'loading' && (
        <div className="h-5 w-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {status === 'error' && <span className="text-[10px] text-red-500 shrink-0 mt-0.5">✕</span>}
    </div>
  )
}

interface ReadyCardProps {
  item: PlanItemWithKey
  isExpanded: boolean
  onToggle: () => void
  onNavigateToRecipe?: (recipeId: string) => void
}

function ReadyCard({ item, isExpanded, onToggle, onNavigateToRecipe }: ReadyCardProps) {
  const isError = item._status === 'error'
  return (
    <div
      className={cn(
        'rounded-2xl border overflow-hidden',
        isError
          ? 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-900/10'
          : 'border-rp-hairline bg-rp-card',
      )}
    >
      <button
        onClick={onToggle}
        disabled={isError}
        className="w-full flex items-center gap-3 p-3 text-start disabled:cursor-not-allowed"
      >
        <span className="text-xl shrink-0 leading-none">{MEAL_ICONS[item.meal_type] ?? '🍽️'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rp-ink truncate">
            {item.recipe_title}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {!isError && (
              <>
                {item.from_web ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    <Globe className="h-2.5 w-2.5" />
                    Web
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" />
                    AI
                  </span>
                )}
                <span className="text-[10px] text-rp-ink-mute">
                  {item.ingredients?.length || 0} ingredients
                </span>
                {item.estimated_time_min && (
                  <span className="flex items-center gap-0.5 text-[10px] text-rp-ink-mute">
                    <Clock className="h-2.5 w-2.5" />
                    {item.estimated_time_min}m
                  </span>
                )}
              </>
            )}
            {isError && (
              <span className="text-[10px] text-red-500 dark:text-red-400">
                Recipe failed — will save name only
              </span>
            )}
          </div>
        </div>
        {item.recipe_id && onNavigateToRecipe && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNavigateToRecipe(item.recipe_id!)
            }}
            className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-brand-500 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        {!isError &&
          (isExpanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          ))}
      </button>
      <AnimatePresence>
        {isExpanded && !isError && item.ingredients && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 border-t border-slate-100 dark:border-slate-700/50">
              <p className="text-[10px] font-semibold text-rp-ink-mute uppercase tracking-wide mt-2 mb-1.5">
                Ingredients
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {item.ingredients.map((ing, i) => (
                  <p key={i} className="text-xs text-rp-ink-soft">
                    {ing.quantity != null
                      ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''} `
                      : ''}
                    {ing.name}
                  </p>
                ))}
              </div>
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-brand-500 hover:text-brand-600 mt-2"
                >
                  <Globe className="h-2.5 w-2.5" />
                  View source
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

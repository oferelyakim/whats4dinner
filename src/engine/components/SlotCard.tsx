import { useState } from 'react'
import { Lock, RefreshCw, Loader2, AlertCircle, Clock, Unlock, Sparkles, X, Trash2, ShoppingCart } from 'lucide-react'
import type { Slot } from '../types'
import { useSlot } from '../hooks/useSlot'
import { getEngine } from '../MealPlanEngine'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ShopFromPlanV2Sheet } from '@/components/plan/ShopFromPlanV2Sheet'
import { useAppStore } from '@/stores/appStore'

interface Props {
  slotId: string
  onOpenRecipe?: (recipeId: string) => void
  /**
   * v2.0.0: opens the recipe view for a `link_ready` slot. The view
   * hydrates the URL on mount via `engine.hydrateLinkReadySlot`.
   */
  onOpenSlot?: (slotId: string) => void
}

const STAGE_LABEL: Record<Slot['status'], string> = {
  empty: 'Tap generate',
  generating_ingredient: 'Picking an ingredient…',
  ingredient_chosen: 'Ingredient chosen',
  generating_dish: 'Naming the dish…',
  dish_named: 'Dish named',
  fetching_recipe: 'Finding a recipe…',
  recipe_fetched: 'Recipe fetched',
  ready: '',
  error: '',
  error_rate_limited: '',
  queued_server: '',
  link_ready: '',
}

export function SlotCard({ slotId, onOpenRecipe, onOpenSlot }: Props) {
  const slot = useSlot(slotId)
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()
  const [showHint, setShowHint] = useState(false)
  const [hint, setHint] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showShopSheet, setShowShopSheet] = useState(false)

  if (!slot) return <div className="rounded-xl bg-rp-bg-soft animate-pulse h-20" />

  const engine = getEngine()
  const isLoading =
    slot.status === 'generating_ingredient' ||
    slot.status === 'generating_dish' ||
    slot.status === 'fetching_recipe'

  const onGenerate = () => void engine.generateSlot(slot.id)
  const onCancel = () => void engine.cancelSlot(slot.id)
  const onReplace = () => {
    void engine.replaceSlot(slot.id, hint.trim() || undefined)
    setShowHint(false)
    setHint('')
  }
  const onLock = () => void (slot.locked ? engine.unlockSlot(slot.id) : engine.lockSlot(slot.id))

  return (
    <div
      className={cn(
        'rounded-xl border p-3 bg-rp-card transition-all',
        slot.status === 'error'
          ? 'border-danger/40 bg-danger/5'
          : slot.status === 'error_rate_limited'
            ? 'border-amber-400/40 bg-amber-50/50'
            : slot.locked
              ? 'border-rp-brand/40'
              : 'border-rp-hairline',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rp-ink-mute font-semibold mb-1 flex-wrap">
            <span>{slot.role}</span>
            {slot.envelope && (
              <span className="normal-case font-normal text-rp-ink-mute/80">
                · {slot.envelope.cuisineLabel}
                {slot.envelope.styleLabel ? ` · ${slot.envelope.styleLabel}` : ''}
              </span>
            )}
            {slot.replaceHint && (
              <span className="text-rp-brand normal-case font-normal">· {slot.replaceHint}</span>
            )}
            {!slot.replaceHint && slot.notes && (
              <span className="text-rp-brand normal-case font-normal">· {slot.notes}</span>
            )}
            {slot.locked && <Lock className="h-3 w-3 text-rp-brand" />}
          </div>

          {slot.status === 'ready' && slot.dishName && (
            <button
              onClick={() => slot.recipeId && onOpenRecipe?.(slot.recipeId)}
              className="text-start w-full"
            >
              <p className="text-sm font-medium text-rp-ink truncate">{slot.dishName}</p>
              <p className="text-[11px] text-rp-ink-mute truncate">View recipe →</p>
            </button>
          )}

          {slot.status === 'link_ready' && slot.dishName && (
            <button
              onClick={() => onOpenSlot?.(slot.id)}
              className="text-start w-full"
            >
              <p className="text-sm font-medium text-rp-ink truncate">{slot.dishName}</p>
              <p className="text-[11px] text-rp-ink-mute truncate flex items-center gap-1">
                {slot.linkData?.sourceDomain
                  ? `From ${slot.linkData.sourceDomain} — tap to open`
                  : 'Tap to load recipe'}
              </p>
            </button>
          )}

          {slot.status === 'error' && (
            <div className="flex items-start gap-1.5 text-sm text-danger">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Stage {slot.errorStage ?? '?'} failed</p>
                <p className="text-[11px] text-danger/80 break-words">{slot.errorMessage}</p>
                <button
                  onClick={onGenerate}
                  className="mt-1 text-[11px] underline text-danger hover:text-danger/80"
                >
                  Retry from this stage
                </button>
              </div>
            </div>
          )}

          {slot.status === 'error_rate_limited' && (
            <div className="flex items-start gap-1.5 text-sm text-amber-700">
              <Clock className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Rate-limited</p>
                <p className="text-[11px] text-amber-700/80 break-words">
                  {slot.errorMessage ?? 'Auto-resuming shortly…'}
                </p>
              </div>
            </div>
          )}

          {slot.status === 'queued_server' && (
            <div className="flex items-center gap-1.5 text-sm text-rp-ink-mute">
              <span className="inline-block h-2 w-2 rounded-full bg-rp-brand/40 animate-pulse" />
              <span className="text-[12px]">{t('plan.job.queuedServer')}</span>
            </div>
          )}

          {slot.status !== 'ready' &&
            slot.status !== 'link_ready' &&
            slot.status !== 'error' &&
            slot.status !== 'error_rate_limited' &&
            slot.status !== 'queued_server' && (
            <div className="flex items-center gap-1.5 text-sm text-rp-ink-mute">
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>
                {slot.dishName
                  ? slot.dishName
                  : slot.ingredient
                    ? `Ingredient: ${slot.ingredient}`
                    : STAGE_LABEL[slot.status]}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isLoading && (
            <button
              onClick={onCancel}
              aria-label="Cancel generation"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft transition-colors"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {!isLoading && (
            <button
              onClick={onLock}
              aria-label={slot.locked ? 'Unlock slot' : 'Lock slot'}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft transition-colors"
            >
              {slot.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </button>
          )}
          {!slot.locked && !isLoading && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              aria-label={t('plan.slot.delete')}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {slot.status === 'empty' && !slot.locked && (
            <button
              onClick={onGenerate}
              className="h-8 px-2 rounded-lg flex items-center gap-1 bg-rp-brand text-white text-xs font-medium hover:bg-rp-brand/90 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              Generate
            </button>
          )}
          {slot.status === 'ready' && slot.recipeId && (
            <button
              onClick={() => setShowShopSheet(true)}
              aria-label={t('plan.shop.addToList')}
              title={t('plan.shop.addToList')}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft transition-colors"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
            </button>
          )}
          {(slot.status === 'ready' || slot.status === 'link_ready' || slot.status === 'error') && (
            <button
              onClick={() => setShowHint((v) => !v)}
              aria-label="Replace dish"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {showHint && (
        <div className="mt-2 flex gap-2">
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Optional: e.g. less spicy, use chicken, Italian"
            className="flex-1 text-sm bg-rp-bg-soft rounded-lg px-2 py-1.5 text-rp-ink placeholder:text-rp-ink-mute focus:outline-none focus:ring-1 focus:ring-rp-brand"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onReplace()
              if (e.key === 'Escape') {
                setShowHint(false)
                setHint('')
              }
            }}
          />
          <button
            onClick={onReplace}
            className="px-3 py-1.5 rounded-lg bg-rp-brand text-white text-xs font-medium"
          >
            Replace
          </button>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('plan.slot.deleteConfirm.title')}
        description={t('plan.slot.deleteConfirm.body')}
        confirmLabel={t('confirm.delete')}
        cancelLabel={t('confirm.cancel')}
        destructive
        onConfirm={() => engine.removeSlot(slot.id)}
      />

      {slot.status === 'ready' && slot.recipeId && (
        <ShopFromPlanV2Sheet
          open={showShopSheet}
          onClose={() => setShowShopSheet(false)}
          slots={[slot]}
          circleId={activeCircle?.id}
        />
      )}
    </div>
  )
}

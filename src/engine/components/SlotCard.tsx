import { useState } from 'react'
import { Lock, RefreshCw, Loader2, AlertCircle, Unlock, Sparkles } from 'lucide-react'
import type { Slot } from '../types'
import { useSlot } from '../hooks/useSlot'
import { getEngine } from '../MealPlanEngine'
import { cn } from '@/lib/cn'

interface Props {
  slotId: string
  onOpenRecipe?: (recipeId: string) => void
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
}

export function SlotCard({ slotId, onOpenRecipe }: Props) {
  const slot = useSlot(slotId)
  const [showHint, setShowHint] = useState(false)
  const [hint, setHint] = useState('')

  if (!slot) return <div className="rounded-xl bg-rp-bg-soft animate-pulse h-20" />

  const engine = getEngine()
  const isLoading =
    slot.status === 'generating_ingredient' ||
    slot.status === 'generating_dish' ||
    slot.status === 'fetching_recipe'

  const onGenerate = () => void engine.generateSlot(slot.id)
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
          : slot.locked
            ? 'border-rp-brand/40'
            : 'border-rp-hairline',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rp-ink-mute font-semibold mb-1">
            <span>{slot.role}</span>
            {slot.notes && <span className="text-rp-brand normal-case font-normal">· {slot.notes}</span>}
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

          {slot.status === 'error' && (
            <div className="flex items-start gap-1.5 text-sm text-danger">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">
                  Stage {slot.errorStage ?? '?'} failed
                </p>
                <p className="text-[11px] text-danger/80 break-words">{slot.errorMessage}</p>
              </div>
            </div>
          )}

          {slot.status !== 'ready' && slot.status !== 'error' && (
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
          <button
            onClick={onLock}
            aria-label={slot.locked ? 'Unlock slot' : 'Lock slot'}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft transition-colors"
          >
            {slot.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </button>
          {slot.status === 'empty' && !slot.locked && (
            <button
              onClick={onGenerate}
              className="h-8 px-2 rounded-lg flex items-center gap-1 bg-rp-brand text-white text-xs font-medium hover:bg-rp-brand/90 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              Generate
            </button>
          )}
          {(slot.status === 'ready' || slot.status === 'error') && (
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
            placeholder="Optional: e.g. less spicy, use chicken"
            className="flex-1 text-sm bg-rp-bg-soft rounded-lg px-2 py-1.5 text-rp-ink placeholder:text-rp-ink-mute focus:outline-none focus:ring-1 focus:ring-rp-brand"
            autoFocus
          />
          <button
            onClick={onReplace}
            className="px-3 py-1.5 rounded-lg bg-rp-brand text-white text-xs font-medium"
          >
            Replace
          </button>
        </div>
      )}
    </div>
  )
}

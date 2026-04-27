import { useState } from 'react'
import { Plus, Wand2, Layers, Trash2, Eraser, ShoppingCart } from 'lucide-react'
import type { MealView, Preset, PresetSlot } from '../types'
import { SlotCard } from './SlotCard'
import { getEngine } from '../MealPlanEngine'
import { PresetPicker } from './PresetPicker'
import { PresetConfirmDialog } from '@/components/meal-planner/PresetConfirmDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ShopFromPlanV2Sheet } from '@/components/plan/ShopFromPlanV2Sheet'
import { useI18n } from '@/lib/i18n'
import { useAppStore } from '@/stores/appStore'
import { db } from '../db'

interface Props {
  meal: MealView
  onOpenRecipe?: (recipeId: string) => void
  onOpenSlot?: (slotId: string) => void
}

export function MealCard({ meal, onOpenRecipe, onOpenSlot }: Props) {
  const [showPresets, setShowPresets] = useState(false)
  const [confirmPreset, setConfirmPreset] = useState<Preset | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showShopSheet, setShowShopSheet] = useState(false)
  const engine = getEngine()
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()

  // Collect only ready slots with a recipeId for shopping
  const readySlots = meal.slots.filter(
    (s) => s.status === 'ready' && s.recipeId,
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-display italic capitalize text-rp-ink">{meal.type}</h4>
        <div className="flex items-center gap-1">
          {meal.presetId && (
            <button
              onClick={() => void engine.clearMealPreset(meal.id)}
              aria-label={t('plan.meal.clearPreset')}
              title={t('plan.meal.clearPreset')}
              className="h-8 px-2 rounded-lg flex items-center gap-1 text-rp-ink-mute hover:bg-rp-bg-soft text-xs"
            >
              <Eraser className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => setShowPresets(true)}
            aria-label="Apply preset"
            className="h-8 px-2 rounded-lg flex items-center gap-1 text-rp-ink-mute hover:bg-rp-bg-soft text-xs"
          >
            <Layers className="h-3 w-3" />
            Preset
          </button>
          <button
            onClick={() => void engine.generateMeal(meal.id)}
            className="h-8 px-2 rounded-lg flex items-center gap-1 bg-rp-brand text-white text-xs font-medium"
          >
            <Wand2 className="h-3 w-3" />
            Generate all
          </button>
          <button
            onClick={() => void engine.addSlot(meal.id, 'main')}
            aria-label="Add slot"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {readySlots.length > 0 && (
            <button
              onClick={() => setShowShopSheet(true)}
              aria-label={t('plan.shop.addMealToList')}
              title={t('plan.shop.addMealToList')}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft transition-colors"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            aria-label={t('plan.meal.delete')}
            title={t('plan.meal.delete')}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        {meal.slots.map((s) => (
          <SlotCard key={s.id} slotId={s.id} onOpenRecipe={onOpenRecipe} onOpenSlot={onOpenSlot} />
        ))}
        {meal.slots.length === 0 && (
          <p className="text-xs text-rp-ink-mute italic">No slots — apply a preset or add one.</p>
        )}
      </div>

      <PresetPicker
        open={showPresets}
        onOpenChange={setShowPresets}
        scope="meal"
        onPick={(id) => {
          setShowPresets(false)
          // Resolve the preset from Dexie so we can pass the full shape to the
          // confirm dialog without fetching again inside the dialog.
          void db.presets.get(id).then((p) => {
            if (p) setConfirmPreset(p)
          })
        }}
      />

      {confirmPreset && (
        <PresetConfirmDialog
          open={confirmPreset !== null}
          onOpenChange={(open) => { if (!open) setConfirmPreset(null) }}
          preset={confirmPreset}
          scope="meal"
          onAddToPlan={async (adjusted) => {
            // adjusted is PresetSlot[] for meal scope
            const slots = adjusted as PresetSlot[]
            // Use a synthetic copy of the preset with the adjusted slots so
            // applyPreset sees the user's choices without mutating the stored preset.
            const syntheticId = `__confirm_${confirmPreset.id}`
            const synthetic: Preset = {
              ...confirmPreset,
              id: syntheticId,
              slots,
            }
            await db.presets.put(synthetic)
            await engine.applyPreset(syntheticId, { mealId: meal.id })
            await db.presets.delete(syntheticId)
          }}
          onGenerateAll={async (adjusted) => {
            const slots = adjusted as PresetSlot[]
            const syntheticId = `__confirm_${confirmPreset.id}`
            const synthetic: Preset = {
              ...confirmPreset,
              id: syntheticId,
              slots,
            }
            await db.presets.put(synthetic)
            await engine.applyPreset(syntheticId, { mealId: meal.id })
            await db.presets.delete(syntheticId)
            // Fire bank/AI fill for all slots in the meal
            void engine.generateMeal(meal.id)
          }}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('plan.meal.deleteConfirm.title').replace('{type}', meal.type)}
        confirmLabel={t('confirm.delete')}
        cancelLabel={t('confirm.cancel')}
        destructive
        onConfirm={() => engine.removeMeal(meal.id)}
      />

      <ShopFromPlanV2Sheet
        open={showShopSheet}
        onClose={() => setShowShopSheet(false)}
        slots={readySlots}
        circleId={activeCircle?.id}
      />
    </div>
  )
}

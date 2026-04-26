import { useState } from 'react'
import { Plus, Wand2, Layers } from 'lucide-react'
import type { MealView } from '../types'
import { SlotCard } from './SlotCard'
import { getEngine } from '../MealPlanEngine'
import { PresetPicker } from './PresetPicker'

interface Props {
  meal: MealView
  onOpenRecipe?: (recipeId: string) => void
  onOpenSlot?: (slotId: string) => void
}

export function MealCard({ meal, onOpenRecipe, onOpenSlot }: Props) {
  const [showPresets, setShowPresets] = useState(false)
  const engine = getEngine()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-display italic capitalize text-rp-ink">{meal.type}</h4>
        <div className="flex items-center gap-1">
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
        onPick={(id) => void engine.applyPreset(id, { mealId: meal.id })}
      />
    </div>
  )
}

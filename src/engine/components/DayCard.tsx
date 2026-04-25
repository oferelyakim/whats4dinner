import { useState } from 'react'
import { Plus, Layers } from 'lucide-react'
import type { DayView } from '../types'
import { MealCard } from './MealCard'
import { getEngine } from '../MealPlanEngine'
import { PresetPicker } from './PresetPicker'

interface Props {
  day: DayView
  onOpenRecipe?: (recipeId: string) => void
}

export function DayCard({ day, onOpenRecipe }: Props) {
  const [showPresets, setShowPresets] = useState(false)
  const [theme, setTheme] = useState(day.theme ?? '')
  const engine = getEngine()

  const date = new Date(day.date + 'T12:00:00')
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
  const dayNum = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="rounded-2xl bg-rp-card border border-rp-hairline p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-display italic text-lg text-rp-ink">{dayName}</p>
          <p className="text-xs text-rp-ink-mute">{dayNum}</p>
        </div>
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          onBlur={() => theme !== (day.theme ?? '') && void engine.setDayTheme(day.id, theme)}
          placeholder="theme (optional)"
          className="flex-1 max-w-[180px] text-xs bg-rp-bg-soft rounded-lg px-2 py-1.5 text-rp-ink placeholder:text-rp-ink-mute focus:outline-none focus:ring-1 focus:ring-rp-brand"
        />
        <button
          onClick={() => setShowPresets(true)}
          aria-label="Apply day preset"
          className="h-8 px-2 rounded-lg flex items-center gap-1 text-rp-ink-mute hover:bg-rp-bg-soft text-xs"
        >
          <Layers className="h-3 w-3" />
          Day preset
        </button>
      </div>

      <div className="space-y-4">
        {day.meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} onOpenRecipe={onOpenRecipe} />
        ))}
      </div>

      <button
        onClick={() => void engine.addMeal(day.id, 'meal')}
        className="w-full py-2 rounded-lg border border-dashed border-rp-hairline text-xs text-rp-ink-mute hover:bg-rp-bg-soft flex items-center justify-center gap-1"
      >
        <Plus className="h-3 w-3" />
        Add meal
      </button>

      <PresetPicker
        open={showPresets}
        onOpenChange={setShowPresets}
        scope="day"
        onPick={(id) => void engine.applyPreset(id, { dayId: day.id })}
      />
    </div>
  )
}

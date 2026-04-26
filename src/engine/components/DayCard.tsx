import { useState } from 'react'
import { Plus, Layers, Trash2 } from 'lucide-react'
import type { DayView, Preset, PresetSlot } from '../types'
import type { InterviewResult } from '../interview/types'
import { MealCard } from './MealCard'
import { getEngine } from '../MealPlanEngine'
import { PresetPicker } from './PresetPicker'
import { PresetConfirmDialog } from '@/components/meal-planner/PresetConfirmDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MealPlannerBanner } from '@/components/meal-planner/MealPlannerBanner'
import { useI18n } from '@/lib/i18n'
import { db } from '../db'

interface Props {
  day: DayView
  onOpenRecipe?: (recipeId: string) => void
  onOpenSlot?: (slotId: string) => void
  /**
   * v2.1.0 — when present, mounts a per-day "Plan this day with AI" banner
   * inside the day card. Approving the day-scoped interview calls back here
   * so PlanV2View can drive engine.applyInterviewResult + Realtime
   * subscription. Not provided → no banner (manual planning only).
   */
  onInterviewApprove?: (result: InterviewResult) => Promise<void>
}

export function DayCard({ day, onOpenRecipe, onOpenSlot, onInterviewApprove }: Props) {
  const [showPresets, setShowPresets] = useState(false)
  const [confirmPreset, setConfirmPreset] = useState<Preset | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [theme, setTheme] = useState(day.theme ?? '')
  const engine = getEngine()
  const t = useI18n((s) => s.t)

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
        <button
          onClick={() => setShowDeleteConfirm(true)}
          aria-label={t('plan.day.delete')}
          title={t('plan.day.delete')}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {onInterviewApprove && (
        <MealPlannerBanner
          planId={day.planId}
          circleId={null}
          scope="day"
          targetDayDate={day.date}
          onApprove={onInterviewApprove}
        />
      )}

      <div className="space-y-4">
        {day.meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} onOpenRecipe={onOpenRecipe} onOpenSlot={onOpenSlot} />
        ))}
      </div>

      <button
        onClick={() => {
          // v2.2.0: pick the next missing meal type so Add meal does something
          // sensible. Cycle: dinner → lunch → breakfast → snack → dinner.
          const existing = new Set(day.meals.map((m) => m.type.toLowerCase()))
          const order = ['dinner', 'lunch', 'breakfast', 'snack'] as const
          const next = order.find((t) => !existing.has(t)) ?? 'dinner'
          void engine.addMeal(day.id, next)
        }}
        className="w-full py-2 rounded-lg border border-dashed border-rp-hairline text-xs text-rp-ink-mute hover:bg-rp-bg-soft flex items-center justify-center gap-1"
      >
        <Plus className="h-3 w-3" />
        Add meal
      </button>

      <PresetPicker
        open={showPresets}
        onOpenChange={setShowPresets}
        scope="day"
        onPick={(id) => {
          setShowPresets(false)
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
          scope="day"
          onAddToPlan={async (adjusted) => {
            // adjusted is { mealShapes: ... } for day scope
            const { mealShapes } = adjusted as { mealShapes: { type: string; slots: PresetSlot[] }[] }
            const syntheticId = `__confirm_${confirmPreset.id}`
            const synthetic: Preset = {
              ...confirmPreset,
              id: syntheticId,
              mealShapes,
            }
            await db.presets.put(synthetic)
            await engine.applyPreset(syntheticId, { dayId: day.id })
            await db.presets.delete(syntheticId)
          }}
          onGenerateAll={async (adjusted) => {
            const { mealShapes } = adjusted as { mealShapes: { type: string; slots: PresetSlot[] }[] }
            const syntheticId = `__confirm_${confirmPreset.id}`
            const synthetic: Preset = {
              ...confirmPreset,
              id: syntheticId,
              mealShapes,
            }
            await db.presets.put(synthetic)
            await engine.applyPreset(syntheticId, { dayId: day.id })
            await db.presets.delete(syntheticId)
            // Fire bank/AI fill for every meal that was just created for this day
            const meals = await db.meals.where('dayId').equals(day.id).toArray()
            await Promise.all(meals.map((m) => engine.generateMeal(m.id)))
          }}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('plan.day.deleteConfirm.title')}
        description={t('plan.day.deleteConfirm.body')}
        confirmLabel={t('confirm.delete')}
        cancelLabel={t('confirm.cancel')}
        destructive
        onConfirm={() => engine.removeDay(day.id)}
      />
    </div>
  )
}

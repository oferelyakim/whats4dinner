import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, Layers, Trash2, BookOpen, X } from 'lucide-react'
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
import { getMealMenus } from '@/services/mealMenus'
import { useAppStore } from '@/stores/appStore'
import type { MealMenu, Recipe } from '@/types'

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
  // v2.3.0 — manual template-application dialog
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState<(MealMenu & { recipes: Recipe[] })[] | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [theme, setTheme] = useState(day.theme ?? '')
  const engine = getEngine()
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()

  // Lazy-load templates on first dialog open.
  useEffect(() => {
    if (!showTemplates || templates !== null) return
    setTemplatesLoading(true)
    getMealMenus(activeCircle?.id ?? undefined)
      .then((rows) => setTemplates(rows))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false))
  }, [showTemplates, templates, activeCircle?.id])

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

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            const existing = new Set(day.meals.map((m) => m.type.toLowerCase()))
            const order = ['dinner', 'lunch', 'breakfast', 'snack'] as const
            const next = order.find((t) => !existing.has(t)) ?? 'dinner'
            void engine.addMeal(day.id, next)
          }}
          className="py-2 rounded-lg border border-dashed border-rp-hairline text-xs text-rp-ink-mute hover:bg-rp-bg-soft flex items-center justify-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add meal
        </button>
        <button
          onClick={() => setShowTemplates(true)}
          className="py-2 rounded-lg border border-dashed border-rp-hairline text-xs text-rp-ink-mute hover:bg-rp-bg-soft flex items-center justify-center gap-1"
        >
          <BookOpen className="h-3 w-3" />
          {t('plan.day.addFromTemplate')}
        </button>
      </div>

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

      <Dialog.Root open={showTemplates} onOpenChange={setShowTemplates}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-rp-ink/40 backdrop-blur-sm z-40" />
          <Dialog.Content
            className="
              fixed inset-0 z-50 flex flex-col bg-rp-bg
              sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
              sm:h-[min(80vh,560px)] sm:w-[min(480px,90vw)] sm:rounded-2xl
              shadow-rp-hover overflow-hidden
            "
          >
            <div className="flex items-center justify-between border-b border-rp-ink/10 px-4 py-3">
              <Dialog.Title className="font-display italic text-lg text-rp-ink">
                {t('plan.template.dialogTitle')}
              </Dialog.Title>
              <Dialog.Close
                className="rounded-full p-1 text-rp-ink/60 hover:bg-rp-ink/5 hover:text-rp-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {templatesLoading && (
                <p className="text-sm text-rp-ink/60 text-center py-8">…</p>
              )}
              {!templatesLoading && (templates?.length ?? 0) === 0 && (
                <p className="text-sm text-rp-ink/60 text-center py-8">
                  {t('plan.template.empty')}
                </p>
              )}
              {!templatesLoading &&
                (templates ?? []).map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={async () => {
                      setShowTemplates(false)
                      await engine.applyMenuToDay(day.id, tpl)
                    }}
                    className="
                      w-full text-left rounded-xl border border-rp-ink/10 bg-rp-card
                      px-4 py-3 hover:border-rp-brand hover:bg-rp-bg-soft transition
                    "
                  >
                    <div className="font-medium text-rp-ink">{tpl.name}</div>
                    {tpl.description && (
                      <div className="text-xs text-rp-ink/60 mt-0.5 line-clamp-1">
                        {tpl.description}
                      </div>
                    )}
                    <div className="text-xs text-rp-ink/50 mt-1">
                      {tpl.recipes.length === 1
                        ? '1 recipe'
                        : `${tpl.recipes.length} recipes`}
                    </div>
                  </button>
                ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

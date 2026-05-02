import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Popover from '@radix-ui/react-popover'
import { Plus, Trash2, Bookmark, ShoppingCart } from 'lucide-react'
import type { DayView } from '../types'
import { MealCard } from './MealCard'
import { getEngine } from '../MealPlanEngine'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ShopFromPlanV2Sheet } from '@/components/plan/ShopFromPlanV2Sheet'
import { useI18n } from '@/lib/i18n'
import { useAppStore } from '@/stores/appStore'

interface Props {
  day: DayView
  /** ISO Sunday of the visible week. Threaded down to MealCard sheets. */
  weekStart: string
  onOpenRecipe?: (recipeId: string) => void
  onOpenSlot?: (slotId: string) => void
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'other'] as const

export function DayCard({ day, weekStart, onOpenRecipe, onOpenSlot }: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showShopSheet, setShowShopSheet] = useState(false)
  const [showAddMealPopover, setShowAddMealPopover] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [theme, setTheme] = useState(day.theme ?? '')
  const engine = getEngine()
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()

  const readySlots = day.meals.flatMap((meal) =>
    meal.slots.filter((s) => s.status === 'ready' && s.recipeId),
  )

  const date = new Date(day.date + 'T12:00:00')
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
  const dayNum = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const existingTypes = new Set(day.meals.map((m) => m.type.toLowerCase()))

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
        {readySlots.length > 0 && (
          <button
            onClick={() => setShowShopSheet(true)}
            aria-label={t('plan.shop.addDayToList')}
            title={t('plan.shop.addDayToList')}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft transition-colors shrink-0"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
          </button>
        )}
        {day.meals.length > 0 && (
          <button
            onClick={() => { setTemplateName(day.theme || dayName); setShowSaveTemplate(true) }}
            aria-label={t('action.saveAsTemplate')}
            title={t('action.saveAsTemplate')}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft transition-colors shrink-0"
          >
            <Bookmark className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          aria-label={t('plan.day.delete')}
          title={t('plan.day.delete')}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-4">
        {day.meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            weekStart={weekStart}
            onOpenRecipe={onOpenRecipe}
            onOpenSlot={onOpenSlot}
          />
        ))}
      </div>

      <Popover.Root open={showAddMealPopover} onOpenChange={setShowAddMealPopover}>
        <Popover.Trigger asChild>
          <button
            className="w-full py-2 rounded-lg border border-dashed border-rp-hairline text-xs text-rp-ink-mute hover:bg-rp-bg-soft flex items-center justify-center gap-1"
          >
            <Plus className="h-3 w-3" />
            {t('plan.addMeal.title')}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="center"
            sideOffset={6}
            className="z-50 rounded-xl bg-rp-card border border-rp-ink/10 shadow-rp-hover overflow-hidden w-[200px]"
          >
            {MEAL_TYPES.map((type, idx) => {
              const isAdded = existingTypes.has(type)
              return (
                <button
                  key={type}
                  disabled={isAdded}
                  onClick={() => {
                    setShowAddMealPopover(false)
                    void engine.addMeal(day.id, type)
                  }}
                  className={
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition ' +
                    (idx > 0 ? 'border-t border-rp-ink/5 ' : '') +
                    (isAdded ? 'text-rp-ink/40 cursor-not-allowed' : 'text-rp-ink hover:bg-rp-bg-soft')
                  }
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rp-brand" />
                  {t('plan.addMeal.' + type)}
                  {isAdded && <span className="ml-auto text-xs text-rp-ink/40">✓</span>}
                </button>
              )
            })}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

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

      <ShopFromPlanV2Sheet
        open={showShopSheet}
        onClose={() => setShowShopSheet(false)}
        slots={readySlots}
        circleId={activeCircle?.id}
      />

      <Dialog.Root open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-rp-ink/40 backdrop-blur-sm z-40" />
          <Dialog.Content
            className="
              fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
              w-[min(420px,90vw)] rounded-2xl bg-rp-bg shadow-rp-hover
              border border-rp-ink/10 p-5
            "
          >
            <Dialog.Title className="font-display italic text-lg text-rp-ink mb-1">
              {t('action.saveAsTemplate')}
            </Dialog.Title>
            <p className="text-xs text-rp-ink/60 mb-3">
              Reuse this day's meals on a future week.
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="w-full px-3 py-2 rounded-lg bg-rp-bg-soft text-rp-ink placeholder:text-rp-ink-mute focus:outline-none focus:ring-1 focus:ring-rp-brand text-sm"
              autoFocus
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="px-4 py-2 rounded-lg text-sm text-rp-ink hover:bg-rp-bg-soft"
              >
                {t('confirm.cancel')}
              </button>
              <button
                disabled={!templateName.trim() || savingTemplate}
                onClick={async () => {
                  if (!templateName.trim()) return
                  setSavingTemplate(true)
                  try {
                    await engine.saveDayAsPreset(day.id, templateName.trim())
                    setShowSaveTemplate(false)
                    setTemplateName('')
                  } finally {
                    setSavingTemplate(false)
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm bg-rp-brand text-white hover:bg-rp-brand/90 disabled:opacity-50"
              >
                {savingTemplate ? '…' : 'Save'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { BookOpen, Folder, CalendarRange, Trash2, ShoppingCart, Plus } from 'lucide-react'
import type { MealView } from '../types'
import { SlotCard } from './SlotCard'
import { getEngine } from '../MealPlanEngine'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ShopFromPlanV2Sheet } from '@/components/plan/ShopFromPlanV2Sheet'
import {
  AddRecipeFromLibrarySheet,
  AddRecipeFromTemplateSheet,
  AddRecipeFromWeekMenuSheet,
} from '@/components/plan/AddToMealSheets'
import { useI18n } from '@/lib/i18n'
import { useAppStore } from '@/stores/appStore'

interface Props {
  meal: MealView
  /** ISO Sunday of the visible week — used to scope the "This week menu" sheet. */
  weekStart: string
  onOpenRecipe?: (recipeId: string) => void
  onOpenSlot?: (slotId: string) => void
}

export function MealCard({ meal, weekStart, onOpenRecipe, onOpenSlot }: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showShopSheet, setShowShopSheet] = useState(false)
  const [showAddPopover, setShowAddPopover] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)
  const [showWeekMenu, setShowWeekMenu] = useState(false)
  const engine = getEngine()
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()

  const readySlots = meal.slots.filter((s) => s.status === 'ready' && s.recipeId)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-display italic capitalize text-rp-ink">{meal.type}</h4>
        <div className="flex items-center gap-1">
          <Popover.Root open={showAddPopover} onOpenChange={setShowAddPopover}>
            <Popover.Trigger asChild>
              <button
                aria-label={t('plan.addToMeal.label')}
                className="h-8 px-2 rounded-lg flex items-center gap-1 bg-rp-brand text-white text-xs font-medium"
              >
                <Plus className="h-3 w-3" />
                {t('plan.addToMeal.label')}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={6}
                className="z-50 rounded-xl bg-rp-card border border-rp-ink/10 shadow-rp-hover overflow-hidden w-[220px]"
              >
                <button
                  onClick={() => { setShowAddPopover(false); setShowLibrary(true) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-rp-ink hover:bg-rp-bg-soft text-left"
                >
                  <BookOpen className="h-4 w-4 text-rp-brand" />
                  {t('plan.addToMeal.recipeLibrary')}
                </button>
                <button
                  onClick={() => { setShowAddPopover(false); setShowTemplate(true) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-rp-ink hover:bg-rp-bg-soft text-left border-t border-rp-ink/5"
                >
                  <Folder className="h-4 w-4 text-rp-brand" />
                  {t('plan.addToMeal.fromTemplate')}
                </button>
                <button
                  onClick={() => { setShowAddPopover(false); setShowWeekMenu(true) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-rp-ink hover:bg-rp-bg-soft text-left border-t border-rp-ink/5"
                >
                  <CalendarRange className="h-4 w-4 text-rp-brand" />
                  {t('plan.addToMeal.thisWeekMenu')}
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
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
          <p className="text-xs text-rp-ink-mute italic">No dishes yet — tap "{t('plan.addToMeal.label')}".</p>
        )}
      </div>

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

      <AddRecipeFromLibrarySheet open={showLibrary} onOpenChange={setShowLibrary} mealId={meal.id} />
      <AddRecipeFromTemplateSheet open={showTemplate} onOpenChange={setShowTemplate} mealId={meal.id} />
      <AddRecipeFromWeekMenuSheet
        open={showWeekMenu}
        onOpenChange={setShowWeekMenu}
        mealId={meal.id}
        weekStart={weekStart}
      />
    </div>
  )
}

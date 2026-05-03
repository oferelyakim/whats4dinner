import { useEffect, useMemo, useState } from 'react'
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEngine } from '../hooks/useEngine'
import { usePlan } from '../hooks/usePlan'
import type { MealPlan } from '../types'
import { DayCard } from './DayCard'
import { DayCardUse } from './DayCardUse'
import { RecipeView } from './RecipeView'
import { ShopFromPlanV2Sheet } from '@/components/plan/ShopFromPlanV2Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useI18n } from '@/lib/i18n'
import { useAppStore } from '@/stores/appStore'
import { useAIAccess } from '@/hooks/useAIAccess'
import { FloatingShoppingBar } from '@/components/plan/FloatingShoppingBar'
// PantryRerollSheet intentionally not imported — entry point moved to /pantry-picks page.
import { SmartConsolidateSheet } from '@/components/plan/SmartConsolidateSheet'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { useToast } from '@/components/ui/Toast'
import { MonoLabel, RingsOrnament } from '@/components/ui/hearth'

// ── Week helpers ──────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().split('T')[0]
}

// Sunday-Saturday week (US household calendar). The drop generator emits
// `week_start = next Sunday`, so the planner's calendar must align: the
// visible week's first day is the Sunday on or before today (or the Sunday
// `weekOffset` weeks away).
function startOfWeekSun(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const dow = d.getDay() // 0 = Sun, 6 = Sat
  d.setDate(d.getDate() - dow)
  return d.toISOString().split('T')[0]
}

function visibleWeekStart(weekOffset: number): string {
  const today = isoToday()
  const baseSunday = startOfWeekSun(today)
  const startD = new Date(baseSunday + 'T12:00:00')
  startD.setDate(startD.getDate() + weekOffset * 7)
  return startD.toISOString().split('T')[0]
}

function visibleWeekDates(weekOffset: number): string[] {
  const baseSunday = visibleWeekStart(weekOffset)
  const startD = new Date(baseSunday + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startD)
    d.setDate(startD.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function formatWeekLabel(weekStartIso: string): string {
  const d = new Date(weekStartIso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTodayEyebrow(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toLowerCase()
}

const MIN_WEEK_OFFSET = -1
const MAX_WEEK_OFFSET = 3

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanV2View() {
  const engine = useEngine()
  const t = useI18n((s) => s.t)
  const { activeCircle, planMode, setPlanMode } = useAppStore()
  const ai = useAIAccess()
  const toast = useToast()

  const [plans, setPlans] = useState<MealPlan[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  const [openSlotId, setOpenSlotId] = useState<string | null>(null)
  const [showWeekShopSheet, setShowWeekShopSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSmartConsolidate, setShowSmartConsolidate] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const { plan, refresh } = usePlan(activePlanId)
  const [viewWeekOffset, setViewWeekOffset] = useState(0)

  // ── Bootstrap plan ──────────────────────────────────────────────────────────
  useEffect(() => {
    void engine.listPlans().then(async (list) => {
      setPlans(list)
      if (list.length > 0) {
        setActivePlanId(list[0].id)
      } else {
        const fresh = await engine.createPlan(isoToday())
        setActivePlanId(fresh.id)
        setPlans([fresh])
      }
    })
  }, [engine])

  // Stuck-slot self-heal.
  useEffect(() => {
    if (!activePlanId) return
    const sweep = () => {
      void engine
        .resumeStuckSlots(activePlanId)
        .then((n) => {
          if (n > 0) console.info(`[meal-engine] resumed ${n} stuck slot(s)`)
        })
        .catch(() => undefined)
    }
    sweep()
    const onVis = () => {
      if (document.visibilityState === 'visible') sweep()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [activePlanId, engine])

  // Auto-populate visible week.
  useEffect(() => {
    if (!activePlanId) return
    const dates = visibleWeekDates(viewWeekOffset)
    void (async () => {
      for (const date of dates) {
        await engine.addDay(activePlanId, date)
      }
      await refresh()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlanId, viewWeekOffset, engine])

  async function clearPlan() {
    if (!activePlanId) return
    await engine.deletePlan(activePlanId)
    const next = await engine.createPlan(isoToday())
    setActivePlanId(next.id)
    setPlans([next])
  }

  // ── Derived: days for the visible week ──────────────────────────────────────
  const weekDates = visibleWeekDates(viewWeekOffset)
  const weekDateSet = new Set(weekDates)
  const visibleDays = (plan?.days ?? []).filter((d) => weekDateSet.has(d.date))

  const weekReadySlots = useMemo(
    () =>
      visibleDays.flatMap((day) =>
        day.meals.flatMap((meal) =>
          meal.slots.filter((s) => s.status === 'ready' && s.recipeId),
        ),
      ),
    [visibleDays],
  )

  const weekMonday = weekDates[0]

  function handleSmartConsolidate() {
    if (weekReadySlots.length === 0) {
      toast.error(t('consolidate.empty'))
      return
    }
    if (!ai.checkAIAccess()) {
      setShowUpgrade(true)
      return
    }
    setShowSmartConsolidate(true)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isUseMode = planMode === 'use'

  // Plan mode reserves room for the bottom-nav (64px) plus the floating
  // shopping bar (~50px) plus a small margin. Use mode just clears the nav.
  const bottomPadding = isUseMode
    ? 'calc(64px + env(safe-area-inset-bottom, 0px))'
    : 'calc(140px + env(safe-area-inset-bottom, 0px))'

  return (
    <div
      className="max-w-3xl mx-auto"
      style={{ paddingBottom: bottomPadding }}
    >
      <div className="px-4 pt-4 pb-2">
        {/* Header */}
        <div className="flex items-end justify-between gap-2 mb-2">
          <div className="min-w-0">
            <MonoLabel>
              {t('plan.eyebrow').replace('{date}', formatTodayEyebrow())}
            </MonoLabel>
            <h1 className="font-display italic text-[28px] text-rp-ink leading-[1.05] mt-0.5">
              {t('plan.tonightHeader')}
            </h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isUseMode && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                aria-label={t('common.delete')}
                className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Plan / Use mode toggle */}
        <div
          className="flex rounded-full bg-rp-bg-soft p-1 gap-1 mb-3"
          role="group"
          aria-label={t('plan.mode.toggle.label')}
        >
          <button
            onClick={() => setPlanMode('plan')}
            className={
              'flex-1 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ' +
              (!isUseMode
                ? 'bg-rp-brand text-white'
                : 'text-rp-ink-mute hover:text-rp-ink')
            }
          >
            {t('plan.mode.plan')}
          </button>
          <button
            onClick={() => setPlanMode('use')}
            className={
              'flex-1 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ' +
              (isUseMode
                ? 'bg-rp-brand text-white'
                : 'text-rp-ink-mute hover:text-rp-ink')
            }
          >
            {t('plan.mode.use')}
          </button>
        </div>

        {!isUseMode && (
          <ConfirmDialog
            open={showDeleteConfirm}
            onOpenChange={setShowDeleteConfirm}
            title={t('plan.week.deleteConfirm.title')}
            description={t('plan.week.deleteConfirm.body')}
            confirmLabel={t('confirm.delete')}
            cancelLabel={t('confirm.cancel')}
            onConfirm={async () => {
              await clearPlan()
            }}
          />
        )}

        {/* Week navigation row */}
        <div className="flex items-center justify-between gap-2 mt-2 mb-3">
          <button
            onClick={() => setViewWeekOffset((o) => o - 1)}
            disabled={viewWeekOffset <= MIN_WEEK_OFFSET}
            aria-label={t('plan.week.prev')}
            className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </button>
          <span className="text-sm font-medium text-rp-ink flex items-center gap-1.5">
            <RingsOrnament size={14} className="opacity-50" />
            {t('plan.week.label').replace('{date}', formatWeekLabel(weekMonday))}
          </span>
          <button
            onClick={() => setViewWeekOffset((o) => o + 1)}
            disabled={viewWeekOffset >= MAX_WEEK_OFFSET}
            aria-label={t('plan.week.next')}
            className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      </div>

      {/* Day cards — Plan mode */}
      {!isUseMode && (
        <div className="px-4 space-y-3">
          {visibleDays.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              weekStart={visibleWeekStart(viewWeekOffset)}
              onOpenRecipe={setOpenRecipeId}
              onOpenSlot={setOpenSlotId}
            />
          ))}
        </div>
      )}

      {/* Day cards — Use mode */}
      {isUseMode && (
        <div className="px-4 space-y-3">
          {visibleDays.length === 0 && (
            <p className="text-sm text-rp-ink-mute text-center py-8">
              {t('plan.use.empty')}
            </p>
          )}
          {visibleDays.map((day) => (
            <DayCardUse key={day.id} day={day} />
          ))}
        </div>
      )}

      {/* Recipe viewer — Plan mode only (Use mode has its own internal RecipeView per DayCardUse) */}
      {!isUseMode && (
        <RecipeView
          recipeId={openRecipeId}
          slotId={openSlotId}
          onClose={() => {
            setOpenRecipeId(null)
            setOpenSlotId(null)
          }}
        />
      )}

      {!isUseMode && plans.length > 0 && (
        <p className="text-[11px] text-rp-ink-mute text-center pt-4 px-4">
          {plans.length} plan{plans.length === 1 ? '' : 's'} stored locally
        </p>
      )}

      {!isUseMode && (
        <ShopFromPlanV2Sheet
          open={showWeekShopSheet}
          onClose={() => setShowWeekShopSheet(false)}
          slots={weekReadySlots}
          circleId={activeCircle?.id}
        />
      )}

      {/* PantryRerollSheet intentionally unwired — entry point moved to /pantry-picks page.
          Component kept as dead code for potential reuse. */}

      {!isUseMode && (
        <SmartConsolidateSheet
          open={showSmartConsolidate}
          onClose={() => setShowSmartConsolidate(false)}
          slots={weekReadySlots}
          circleId={activeCircle?.id}
        />
      )}

      <AIUpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} />

      {/* Floating shopping bar — Plan mode only */}
      {!isUseMode && (
        <FloatingShoppingBar
          dishCount={weekReadySlots.length}
          itemCount={weekReadySlots.length * 5 /* heuristic — avg 5 ingredients/dish */}
          onOpenList={() => setShowWeekShopSheet(true)}
          onSmartConsolidate={handleSmartConsolidate}
        />
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Trash2, ChevronLeft, ChevronRight, Sparkles, Refrigerator } from 'lucide-react'
import { useEngine } from '../hooks/useEngine'
import { usePlan } from '../hooks/usePlan'
import type { MealPlan } from '../types'
import { DayCard } from './DayCard'
import { RecipeView } from './RecipeView'
import { ShopFromPlanV2Sheet } from '@/components/plan/ShopFromPlanV2Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useI18n } from '@/lib/i18n'
import { useAppStore } from '@/stores/appStore'
import { useAIAccess } from '@/hooks/useAIAccess'
import { WeeklyDropDrawer, type DrawerDensity } from '@/components/plan/WeeklyDropDrawer'
import { FloatingShoppingBar } from '@/components/plan/FloatingShoppingBar'
import { PantryRerollSheet } from '@/components/plan/PantryRerollSheet'
import { SmartConsolidateSheet } from '@/components/plan/SmartConsolidateSheet'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { useToast } from '@/components/ui/Toast'
import type { WeeklyDropEntry } from '@/services/recipe-bank'
import type { PantryMatch } from '@/services/recipe-bank'
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

const DRAWER_DENSITY_KEY = 'replanish.drawerDensity'

function readStoredDensity(): DrawerDensity {
  try {
    const v = localStorage.getItem(DRAWER_DENSITY_KEY)
    if (v === 'quiet' || v === 'medium' || v === 'hero') return v
  } catch {
    // ignore
  }
  return 'medium'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanV2View() {
  const engine = useEngine()
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()
  const ai = useAIAccess()
  const toast = useToast()

  const [plans, setPlans] = useState<MealPlan[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  const [openSlotId, setOpenSlotId] = useState<string | null>(null)
  const [showWeekShopSheet, setShowWeekShopSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPantrySheet, setShowPantrySheet] = useState(false)
  const [showSmartConsolidate, setShowSmartConsolidate] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [drawerDensity, setDrawerDensity] = useState<DrawerDensity>(readStoredDensity)
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

  // Persist drawer density.
  useEffect(() => {
    try {
      localStorage.setItem(DRAWER_DENSITY_KEY, drawerDensity)
    } catch {
      // ignore
    }
  }, [drawerDensity])

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
  const drawerHeightPx = drawerDensity === 'quiet' ? 52 : drawerDensity === 'hero' ? 360 : 176

  // ── Drop card → today's matching meal slot, or prompt to use per-meal sheet ─
  async function handleDropAdd(entry: WeeklyDropEntry) {
    if (!activePlanId) return
    const todayIso = isoToday()
    const todayDay = visibleDays.find((d) => d.date === todayIso)
    if (!todayDay) {
      toast.success(
        `Pick a meal and tap "Add to meal → This week menu" to add ${entry.title}.`,
      )
      return
    }

    // Find a meal matching the entry's mealType, or create one
    let meal = todayDay.meals.find((m) => m.type.toLowerCase() === entry.mealType)
    if (!meal) {
      const fresh = await engine.addMeal(todayDay.id, entry.mealType)
      meal = { ...fresh, slots: fresh.slots }
    }
    try {
      await engine.addBankRecipeToMeal(meal.id, entry.recipeBankId, entry.slotRole === 'main' ? 'main' : entry.slotRole.includes('side') ? 'side' : entry.slotRole)
      toast.success(`Added ${entry.title} to ${entry.mealType}.`)
      await refresh()
    } catch (e) {
      toast.error(`Couldn't add: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  async function handlePantryAdd(match: PantryMatch) {
    if (!activePlanId) return
    const todayIso = isoToday()
    const targetDay = visibleDays.find((d) => d.date === todayIso) ?? visibleDays[0]
    if (!targetDay) return
    const meal = targetDay.meals[0] ?? (await engine.addMeal(targetDay.id, 'dinner'))
    const emptySlot = meal.slots?.find((s) => s.status === 'empty')
    const slotId = emptySlot?.id ?? (await engine.addSlot(meal.id, 'main')).id
    await engine.addFromBank(slotId, match.id)
    toast.success(`Added ${match.title}.`)
    setShowPantrySheet(false)
    await refresh()
  }

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

  function handlePantryClick() {
    if (!ai.checkAIAccess()) {
      setShowUpgrade(true)
      return
    }
    setShowPantrySheet(true)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="max-w-3xl mx-auto"
      style={{
        // Reserve room for the drawer + bottom nav so day cards never sit under them.
        paddingBottom: `calc(${drawerHeightPx + 64 + 24}px + env(safe-area-inset-bottom, 0px))`,
      }}
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
            <button
              onClick={handlePantryClick}
              aria-label={t('pantry.title')}
              title={t('pantry.title')}
              className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft relative"
            >
              <Refrigerator className="h-4 w-4" />
              {!ai.hasAI && (
                <Sparkles className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5" style={{ color: '#f2c14e' }} />
              )}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              aria-label={t('common.delete')}
              className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

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

      {/* Day cards */}
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

      <RecipeView
        recipeId={openRecipeId}
        slotId={openSlotId}
        onClose={() => {
          setOpenRecipeId(null)
          setOpenSlotId(null)
        }}
      />

      {plans.length > 0 && (
        <p className="text-[11px] text-rp-ink-mute text-center pt-4 px-4">
          {plans.length} plan{plans.length === 1 ? '' : 's'} stored locally
        </p>
      )}

      <ShopFromPlanV2Sheet
        open={showWeekShopSheet}
        onClose={() => setShowWeekShopSheet(false)}
        slots={weekReadySlots}
        circleId={activeCircle?.id}
      />

      <PantryRerollSheet
        open={showPantrySheet}
        onClose={() => setShowPantrySheet(false)}
        onAdd={(m) => void handlePantryAdd(m)}
      />

      <SmartConsolidateSheet
        open={showSmartConsolidate}
        onClose={() => setShowSmartConsolidate(false)}
        slots={weekReadySlots}
        circleId={activeCircle?.id}
      />

      <AIUpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} />

      {/* Floating shopping bar — sits above the drawer */}
      <FloatingShoppingBar
        drawerHeightPx={drawerHeightPx}
        hidden={drawerDensity === 'hero'}
        dishCount={weekReadySlots.length}
        itemCount={weekReadySlots.length * 5 /* heuristic — avg 5 ingredients/dish */}
        onOpenList={() => setShowWeekShopSheet(true)}
        onSmartConsolidate={handleSmartConsolidate}
      />

      {/* Bottom-pinned weekly drop drawer — fetches the visible week's drop */}
      <WeeklyDropDrawer
        density={drawerDensity}
        onDensityChange={setDrawerDensity}
        onAdd={(entry) => void handleDropAdd(entry)}
        weekStart={visibleWeekStart(viewWeekOffset)}
      />
    </div>
  )
}

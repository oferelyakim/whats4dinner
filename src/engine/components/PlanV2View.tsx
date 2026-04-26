import { useEffect, useState } from 'react'
import { Plus, Wand2, Trash2, LayoutGrid } from 'lucide-react'
import { useEngine } from '../hooks/useEngine'
import { usePlan } from '../hooks/usePlan'
import type { MealPlan } from '../types'
import { DayCard } from './DayCard'
import { RecipeView } from './RecipeView'

function isoToday(): string {
  return new Date().toISOString().split('T')[0]
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function PlanV2View() {
  const engine = useEngine()
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  const { plan, refresh } = usePlan(activePlanId)

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

  // Stuck-slot self-heal: on mount + on tab-foreground, sweep any slots that
  // got stranded in `generating_*` because the user backgrounded the phone
  // mid-generation. The engine reverts them to their last good state and
  // queues a fresh generation. Idempotent — safe to call repeatedly.
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

  async function addWeek(numDays = 7) {
    if (!activePlanId) return
    const start = isoToday()
    for (let i = 0; i < numDays; i++) {
      const date = addDays(start, i)
      await engine.addDay(activePlanId, date)
    }
    await refresh()
  }

  /**
   * v1.17.0: one-click apply the "Standard day" preset (breakfast 1 + lunch 2 +
   * dinner 3 = 6 slots) to every day in the active plan. Eliminates the
   * "click each day" pain the user reported on /plan-v2.
   */
  async function applyStandardWeek() {
    if (!plan || plan.days.length === 0) return
    await engine.applyPreset('sys-day-standard', {
      dayIds: plan.days.map((d) => d.id),
    })
    await refresh()
  }

  async function generateAll() {
    if (!activePlanId) return
    await engine.generatePlan(activePlanId)
  }

  async function clearPlan() {
    if (!activePlanId) return
    await engine.deletePlan(activePlanId)
    const next = await engine.createPlan(isoToday())
    setActivePlanId(next.id)
    setPlans([next])
  }

  return (
    <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display italic text-3xl text-rp-ink">Meal plan</h1>
          <p className="text-xs text-rp-ink-mute">v2 engine — slot-based, offline-first</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => void addWeek(7)}
            className="px-3 py-2 rounded-lg bg-rp-bg-soft text-rp-ink text-xs font-medium flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add 7 days
          </button>
          <button
            onClick={() => void applyStandardWeek()}
            className="px-3 py-2 rounded-lg bg-rp-bg-soft text-rp-ink text-xs font-medium flex items-center gap-1"
            disabled={!plan || plan.days.length === 0}
            title="Apply 'Standard day' preset (breakfast + lunch + dinner) to every day"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Standard week
          </button>
          <button
            onClick={() => void generateAll()}
            className="px-3 py-2 rounded-lg bg-rp-brand text-white text-xs font-medium flex items-center gap-1"
            disabled={!plan || plan.days.length === 0}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Generate plan
          </button>
          <button
            onClick={() => void clearPlan()}
            aria-label="Clear plan"
            className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {plan && plan.days.length === 0 && (
        <div className="rounded-2xl border border-dashed border-rp-hairline p-8 text-center">
          <p className="text-rp-ink-mute mb-3">No days yet. Add a week to get started.</p>
          <button
            onClick={() => void addWeek(7)}
            className="px-4 py-2 rounded-lg bg-rp-brand text-white text-sm font-medium"
          >
            Add 7 days
          </button>
        </div>
      )}

      <div className="space-y-3">
        {plan?.days.map((day) => (
          <DayCard key={day.id} day={day} onOpenRecipe={setOpenRecipeId} />
        ))}
      </div>

      <RecipeView recipeId={openRecipeId} onClose={() => setOpenRecipeId(null)} />

      {plans.length > 0 && (
        <p className="text-[11px] text-rp-ink-mute text-center pt-4">
          {plans.length} plan{plans.length === 1 ? '' : 's'} stored locally
        </p>
      )}
    </div>
  )
}

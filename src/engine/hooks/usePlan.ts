import { useCallback, useEffect, useState } from 'react'
import type { PlanView } from '../types'
import { getEngine } from '../MealPlanEngine'

export function usePlan(planId: string | null | undefined): {
  plan: PlanView | null
  refresh: () => Promise<void>
} {
  const [plan, setPlan] = useState<PlanView | null>(null)

  const refresh = useCallback(async () => {
    if (!planId) {
      setPlan(null)
      return
    }
    const view = await getEngine().getPlan(planId)
    setPlan(view)
  }, [planId])

  useEffect(() => {
    void refresh()
    const engine = getEngine()
    const offSlot = engine.bus.on('slot:updated', () => {
      void refresh()
    })
    const offMeal = engine.bus.on('meal:updated', () => {
      void refresh()
    })
    const offPlan = engine.bus.on('plan:updated', (p) => {
      if (p.id === planId) setPlan(p)
    })
    return () => {
      offSlot()
      offMeal()
      offPlan()
    }
  }, [planId, refresh])

  return { plan, refresh }
}

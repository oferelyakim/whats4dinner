// Diversity scoring — used by tests + UI badges to confirm a plan isn't
// monochromatic. Reads dishHistory rows that match the plan's slot ids.

import { db } from '../db'
import type { PlanView } from '../types'
import { CUISINES } from './taxonomy'

export interface DiversityScore {
  proteinDiversity: number
  cuisineDiversity: number
  styleDiversity: number
  flavorDiversity: number
  regionConcentration: number
  worstOffender?: string
  totalSlots: number
}

const ratio = <T,>(arr: T[]): number => (arr.length === 0 ? 1 : new Set(arr).size / arr.length)

export async function scorePlan(plan: PlanView): Promise<DiversityScore> {
  const slots = plan.days.flatMap((d) => d.meals.flatMap((m) => m.slots))
  const slotIds = slots.map((s) => s.id)
  const history = slotIds.length === 0 ? [] : await db.dishHistory.where('slotId').anyOf(slotIds).toArray()

  const proteins = history.map((h) => h.proteinName).filter((n): n is string => !!n)
  const cuisines = history.map((h) => h.cuisineId)
  const styles = history.map((h) => h.styleId)
  const flavors = history.map((h) => h.flavorId)

  const regionCounts: Record<string, number> = {}
  for (const c of cuisines) {
    const region = CUISINES.find((x) => x.id === c)?.region ?? 'unknown'
    regionCounts[region] = (regionCounts[region] ?? 0) + 1
  }
  const dominantShare =
    cuisines.length === 0 ? 0 : Math.max(...Object.values(regionCounts), 0) / cuisines.length

  const score: DiversityScore = {
    proteinDiversity: ratio(proteins),
    cuisineDiversity: ratio(cuisines),
    styleDiversity: ratio(styles),
    flavorDiversity: ratio(flavors),
    regionConcentration: dominantShare,
    totalSlots: slots.length,
  }
  if (dominantShare > 0.5 && cuisines.length > 0) {
    const top = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0]
    score.worstOffender = `Dominant region: ${top[0]} (${(dominantShare * 100).toFixed(0)}%)`
  }
  return score
}

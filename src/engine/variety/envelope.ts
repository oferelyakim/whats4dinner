// Per-slot "spin" envelope.
// Before any AI call, code locally picks the cuisine + protein + style + flavor
// for a slot. Stage A's job becomes "name an ingredient that fits Korean
// braised umami-heavy with chicken thighs" — a tightly constrained question
// Haiku can answer without falling into the Mediterranean attractor.
//
// All Dexie reads stay here so the engine code path doesn't grow.

import { db } from '../db'
import {
  PROTEINS,
  CUISINES,
  STYLES,
  FLAVORS,
  findCuisine,
  findProtein,
  type Protein,
} from './taxonomy'
import { pickWithDiversity } from './picker'

export interface SlotEnvelope {
  cuisineId: string
  cuisineLabel: string
  cuisineRegion: string
  proteinName?: string
  proteinFamily?: string
  styleId: string
  styleLabel: string
  flavorId: string
  flavorLabel: string
  reasoning: string
}

const PROTEIN_ROLES = new Set(['main', 'protein', 'tapas'])

export interface BuildEnvelopeArgs {
  slotId: string
  mealId: string
  dayId: string
  planId: string
  slotRole: string
  dietaryTags?: string[]
  dislikedNames?: string[]
  isWeekend?: boolean
  rng?: () => number
}

const HISTORY_LIMIT = 30
const PLAN_RECENT_LIMIT = 14

// ─── Helpers ───────────────────────────────────────────────────────────────

async function recentCuisinesForPlan(planId: string, limit = PLAN_RECENT_LIMIT): Promise<string[]> {
  const rows = await db.dishHistory
    .where('planId')
    .equals(planId)
    .reverse()
    .sortBy('plannedAt')
  return rows.slice(0, limit).map((r) => r.cuisineId)
}

async function recentStylesForPlan(planId: string, limit = PLAN_RECENT_LIMIT): Promise<string[]> {
  const rows = await db.dishHistory
    .where('planId')
    .equals(planId)
    .reverse()
    .sortBy('plannedAt')
  return rows.slice(0, limit).map((r) => r.styleId)
}

async function recentFlavorsForPlan(planId: string, limit = PLAN_RECENT_LIMIT): Promise<string[]> {
  const rows = await db.dishHistory
    .where('planId')
    .equals(planId)
    .reverse()
    .sortBy('plannedAt')
  return rows.slice(0, limit).map((r) => r.flavorId)
}

async function recentProteinsAcrossPlans(limit = HISTORY_LIMIT): Promise<string[]> {
  const all = await db.dishHistory.orderBy('plannedAt').reverse().limit(limit).toArray()
  return all.map((r) => r.proteinName).filter((n): n is string => !!n)
}

async function siblingProteinFamilies(mealId: string, excludeSlotId: string): Promise<string[]> {
  const slots = await db.slots.where('mealId').equals(mealId).toArray()
  const siblings = slots.filter((s) => s.id !== excludeSlotId)
  if (siblings.length === 0) return []
  const histRows = await db.dishHistory.where('slotId').anyOf(siblings.map((s) => s.id)).toArray()
  const families = new Set<string>()
  for (const r of histRows) {
    if (r.proteinFamily) families.add(r.proteinFamily)
  }
  return [...families]
}

async function lockedCuisinesInDay(dayId: string): Promise<string[]> {
  const meals = await db.meals.where('dayId').equals(dayId).toArray()
  if (meals.length === 0) return []
  const slots = (
    await Promise.all(meals.map((m) => db.slots.where('mealId').equals(m.id).toArray()))
  ).flat()
  const lockedIds = slots.filter((s) => s.locked).map((s) => s.id)
  if (lockedIds.length === 0) return []
  const hist = await db.dishHistory.where('slotId').anyOf(lockedIds).toArray()
  return [...new Set(hist.map((h) => h.cuisineId))]
}

function regionOf(cuisineId: string): string {
  return findCuisine(cuisineId)?.region ?? 'unknown'
}

const REGION_CAP_RATIO = 0.35

function findDominantRegion(recent: string[]): string | null {
  if (recent.length < 4) return null
  const counts: Record<string, number> = {}
  for (const id of recent) {
    const r = regionOf(id)
    counts[r] = (counts[r] ?? 0) + 1
  }
  const total = recent.length
  for (const [region, count] of Object.entries(counts)) {
    if (count / total > REGION_CAP_RATIO) return region
  }
  return null
}

// ─── Public ────────────────────────────────────────────────────────────────

export async function buildEnvelope(args: BuildEnvelopeArgs): Promise<SlotEnvelope> {
  const {
    slotId,
    mealId,
    dayId,
    planId,
    slotRole,
    dietaryTags = [],
    dislikedNames = [],
    isWeekend = false,
    rng,
  } = args

  // ─── Pull recent context ─────────────────────────────────────────────────
  const dayCuisinesRecent = await recentCuisinesForPlan(planId)
  const lockedCuisines = await lockedCuisinesInDay(dayId)
  const sibFamilies = await siblingProteinFamilies(mealId, slotId)
  const weekProteinNames = await recentProteinsAcrossPlans()
  const recentStyles = await recentStylesForPlan(planId)
  const recentFlavors = await recentFlavorsForPlan(planId)

  // ─── 1. Pick cuisine ─────────────────────────────────────────────────────
  let cuisine = pickWithDiversity({
    pool: CUISINES,
    recentlyUsed: dayCuisinesRecent,
    banWindow: 2,
    decayWindow: 5,
    mustAvoidIds: lockedCuisines,
    rng,
  })!

  // Region cap: if any one region is >35% of recent, exclude it
  const dominantRegion = findDominantRegion(dayCuisinesRecent)
  if (dominantRegion && cuisine.region === dominantRegion) {
    const alt = pickWithDiversity({
      pool: CUISINES.filter((c) => c.region !== dominantRegion),
      recentlyUsed: dayCuisinesRecent,
      banWindow: 2,
      decayWindow: 5,
      mustAvoidIds: lockedCuisines,
      rng,
    })
    if (alt) cuisine = alt
  }

  // ─── 2. Pick protein (only for protein-led roles) ────────────────────────
  let protein: Protein | undefined
  if (PROTEIN_ROLES.has(slotRole)) {
    // Prefer proteins whose `cuisines[]` includes the chosen cuisine. If that
    // pool is empty (after filtering), fall back to all proteins so we still
    // get a pick.
    const cuisineSig = new Set(cuisine.signatureProteins)
    const pool = PROTEINS.filter((p) => cuisineSig.has(p.name) || p.cuisines.includes(cuisine.id))
    const fallbackPool = pool.length > 0 ? pool : PROTEINS

    const pick = pickWithDiversity({
      pool: fallbackPool,
      recentlyUsed: weekProteinNames,
      banWindow: 0,
      decayWindow: 14,
      mustAvoidFamily: sibFamilies,
      mustHaveTag: dietaryTags,
      mustAvoidIds: dislikedNames,
      rng,
    })
    protein = pick ?? undefined
  }

  // ─── 3. Pick cooking style ───────────────────────────────────────────────
  // Bias toward cuisine's commonStyles; weekend-bias styles get higher weight
  // on weekend slots (handled via filtering, not weighting, for simplicity).
  const stylePool = STYLES.filter((s) => {
    if (cuisine.commonStyles.includes(s.id)) return true
    return !isWeekend ? !s.weekendBias : true
  })
  const style =
    pickWithDiversity({
      pool: stylePool,
      recentlyUsed: recentStyles,
      banWindow: 3,
      decayWindow: 7,
      rng,
    }) ??
    pickWithDiversity({
      pool: STYLES,
      recentlyUsed: recentStyles,
      banWindow: 1,
      decayWindow: 5,
      rng,
    })!

  // ─── 4. Pick flavor profile ──────────────────────────────────────────────
  const flavorPool = FLAVORS.filter(
    (f) => cuisine.signatureFlavors.length === 0 || cuisine.signatureFlavors.includes(f.id),
  )
  const flavor =
    pickWithDiversity({
      pool: flavorPool.length > 0 ? flavorPool : FLAVORS,
      recentlyUsed: recentFlavors,
      banWindow: 2,
      decayWindow: 6,
      rng,
    })!

  return {
    cuisineId: cuisine.id,
    cuisineLabel: cuisine.displayName,
    cuisineRegion: cuisine.region,
    proteinName: protein?.name,
    proteinFamily: protein?.family,
    styleId: style.id,
    styleLabel: style.displayName,
    flavorId: flavor.id,
    flavorLabel: flavor.displayName,
    reasoning: `${cuisine.displayName} / ${style.displayName} / ${flavor.displayName}${protein ? ` / ${protein.name}` : ''}`,
  }
}

// Resolve a protein hint by name back to its taxonomy entry (used by replace
// flow when the user says "use chicken instead").
export function resolveProteinHint(hint: string | undefined): Protein | undefined {
  if (!hint) return undefined
  const lower = hint.toLowerCase()
  // exact-name match
  const exact = findProtein(hint)
  if (exact) return exact
  // family-keyword match
  if (/\b(chicken|poultry)\b/.test(lower)) return PROTEINS.find((p) => p.name.includes('chicken thighs'))
  if (/\bbeef\b/.test(lower)) return PROTEINS.find((p) => p.name.includes('flank'))
  if (/\bpork\b/.test(lower)) return PROTEINS.find((p) => p.name.includes('pork shoulder'))
  if (/\b(fish|salmon)\b/.test(lower)) return PROTEINS.find((p) => p.name.includes('salmon'))
  if (/\b(shrimp|prawn)\b/.test(lower)) return PROTEINS.find((p) => p.name.includes('shrimp'))
  if (/\b(vegetarian|veggie|tofu)\b/.test(lower)) return PROTEINS.find((p) => p.name === 'firm tofu')
  if (/\bvegan\b/.test(lower)) return PROTEINS.find((p) => p.name === 'firm tofu')
  if (/\b(beans|legume)\b/.test(lower)) return PROTEINS.find((p) => p.name.includes('black or pinto'))
  return undefined
}

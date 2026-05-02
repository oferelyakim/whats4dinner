// Recipe bank client (v3.0.0).
//
// Wraps the read-side queries against `recipe_bank` + the v3.0 RPCs:
//   * `get_current_weekly_drop()` / `get_weekly_drop_for_week(date)` — mig 035
//   * `match_recipes_by_ingredients(ingredients, diet, ...)` — mig 036
//   * `sample_recipes_for_slot(...)` — mig 030/034 (already used by engine)
//
// Service-role writes live in the cron edge functions
// (`weekly-drop-generator`, `recipe-bank-refresher`, `auditor-from-imports`).
// This file is read-only client code.

import { supabase } from './supabase'

// ─── Types matching the RPC return shapes ──────────────────────────────────

export interface WeeklyDropEntry {
  weekStart: string
  dayIdx: number
  mealType: string
  slotRole: string
  position: number
  recipeBankId: string
  title: string
  cuisineId: string
  dietaryTags: string[]
  ingredientMain: string
  proteinFamily: string | null
  prepTimeMin: number | null
  cookTimeMin: number | null
  servings: number | null
  imageUrl: string | null
  sourceUrl: string | null
  sourceDomain: string | null
  sourceKindV2: string | null
}

export interface BankSearchHit {
  id: string
  title: string
  cuisineId: string
  mealType: string
  slotRole: string
  dietaryTags: string[]
  ingredientMain: string
  proteinFamily: string | null
  prepTimeMin: number | null
  cookTimeMin: number | null
  servings: number | null
  imageUrl: string | null
  sourceUrl: string | null
  sourceDomain: string | null
  sourceKindV2: string | null
}

export interface PantryMatch extends BankSearchHit {
  matchScore: number
}

export interface BankSearchFilters {
  query?: string
  diets?: string[]
  cuisines?: string[]
  mealType?: string
  slotRole?: string
  maxPrepMin?: number
  limit?: number
}

// ─── Mappers ───────────────────────────────────────────────────────────────

interface DropRpcRow {
  week_start: string
  day_idx: number
  meal_type: string
  slot_role: string
  position: number
  recipe_bank_id: string
  title: string
  cuisine_id: string
  dietary_tags: string[] | null
  ingredient_main: string
  protein_family: string | null
  prep_time_min: number | null
  cook_time_min: number | null
  servings: number | null
  image_url: string | null
  source_url: string | null
  source_domain: string | null
  source_kind_v2: string | null
}

function mapDropRow(row: DropRpcRow): WeeklyDropEntry {
  return {
    weekStart: row.week_start,
    dayIdx: row.day_idx,
    mealType: row.meal_type,
    slotRole: row.slot_role,
    position: row.position,
    recipeBankId: row.recipe_bank_id,
    title: row.title,
    cuisineId: row.cuisine_id,
    dietaryTags: row.dietary_tags ?? [],
    ingredientMain: row.ingredient_main,
    proteinFamily: row.protein_family,
    prepTimeMin: row.prep_time_min,
    cookTimeMin: row.cook_time_min,
    servings: row.servings,
    imageUrl: row.image_url,
    sourceUrl: row.source_url,
    sourceDomain: row.source_domain,
    sourceKindV2: row.source_kind_v2,
  }
}

interface BankRowShape {
  id: string
  title: string
  cuisine_id: string
  meal_type: string
  slot_role: string
  dietary_tags: string[] | null
  ingredient_main: string
  protein_family: string | null
  prep_time_min: number | null
  cook_time_min: number | null
  servings: number | null
  image_url: string | null
  source_url: string | null
  source_domain: string | null
  source_kind_v2: string | null
}

function mapBankRow(row: BankRowShape): BankSearchHit {
  return {
    id: row.id,
    title: row.title,
    cuisineId: row.cuisine_id,
    mealType: row.meal_type,
    slotRole: row.slot_role,
    dietaryTags: row.dietary_tags ?? [],
    ingredientMain: row.ingredient_main,
    proteinFamily: row.protein_family,
    prepTimeMin: row.prep_time_min,
    cookTimeMin: row.cook_time_min,
    servings: row.servings,
    imageUrl: row.image_url,
    sourceUrl: row.source_url,
    sourceDomain: row.source_domain,
    sourceKindV2: row.source_kind_v2,
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch the current week's curated drop. Returns a flat list ordered by
 * (day_idx, meal_type, position). Caller groups client-side for rendering.
 *
 * Returns an empty array when no drop has been generated yet — UI should
 * show a "Drop coming Sunday" empty state.
 */
export async function getCurrentWeeklyDrop(): Promise<WeeklyDropEntry[]> {
  const { data, error } = await supabase.rpc('get_current_weekly_drop')
  if (error) throw error
  return ((data ?? []) as DropRpcRow[]).map(mapDropRow)
}

/**
 * Fetch a specific week's drop. Useful for "previous week" navigation in
 * the planner. weekStart should be an ISO Monday date — the RPC truncates
 * to ISO Monday on the server side too, so any date in the week works.
 */
export async function getWeeklyDropForWeek(weekStartIso: string): Promise<WeeklyDropEntry[]> {
  const { data, error } = await supabase.rpc('get_weekly_drop_for_week', { p_week_start: weekStartIso })
  if (error) throw error
  return ((data ?? []) as DropRpcRow[]).map(mapDropRow)
}

/**
 * Search the bank by query string + filters. Used in the "Add from bank"
 * picker on the meal planner. Free-tier surface — no AI.
 */
export async function searchBank(filters: BankSearchFilters = {}): Promise<BankSearchHit[]> {
  const limit = Math.min(filters.limit ?? 30, 100)

  let q = supabase
    .from('recipe_bank')
    .select('id, title, cuisine_id, meal_type, slot_role, dietary_tags, ingredient_main, protein_family, prep_time_min, cook_time_min, servings, image_url, source_url, source_domain, source_kind_v2')
    .is('retired_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('popularity_score', { ascending: false })
    .limit(limit)

  if (filters.query?.trim()) {
    // Postgres ILIKE on title — simple + indexed enough for the corpus size.
    q = q.ilike('title', `%${filters.query.trim()}%`)
  }
  if (filters.diets && filters.diets.length > 0) {
    q = q.contains('dietary_tags', filters.diets)
  }
  if (filters.cuisines && filters.cuisines.length > 0) {
    q = q.in('cuisine_id', filters.cuisines)
  }
  if (filters.mealType) {
    q = q.eq('meal_type', filters.mealType)
  }
  if (filters.slotRole) {
    q = q.eq('slot_role', filters.slotRole)
  }
  if (filters.maxPrepMin && filters.maxPrepMin > 0) {
    q = q.lte('prep_time_min', filters.maxPrepMin)
  }

  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as BankRowShape[]).map(mapBankRow)
}

/**
 * Pantry / leftover reroll. Calls the `match_recipes_by_ingredients` RPC
 * with the user's pantry + diet, returns ranked matches.
 *
 * Paid-tier surface — gate at the call site via `useAIAccess`.
 *
 * @param ingredients — array of pantry items (case-insensitive)
 * @param opts — diet filter, meal-type/role filter, prep-time cap, result count
 */
export async function matchByPantry(
  ingredients: string[],
  opts: {
    diet?: string[]
    mealType?: string
    slotRole?: string
    maxPrepMin?: number
    limit?: number
  } = {},
): Promise<PantryMatch[]> {
  const limit = Math.min(opts.limit ?? 5, 20)

  const { data, error } = await supabase.rpc('match_recipes_by_ingredients', {
    p_ingredients: ingredients,
    p_diet: opts.diet ?? [],
    p_meal_type: opts.mealType ?? null,
    p_slot_role: opts.slotRole ?? null,
    p_max_prep_min: opts.maxPrepMin ?? null,
    p_limit: limit,
  })
  if (error) throw error

  type RpcRow = BankRowShape & {
    recipe_bank_id: string
    match_score: number
  }
  return ((data ?? []) as RpcRow[]).map((row) => ({
    ...mapBankRow({ ...row, id: row.recipe_bank_id }),
    matchScore: row.match_score,
  }))
}

/**
 * Convenience: ISO Monday for a given JS Date or ISO date string.
 * Mirrors the `iso_monday()` SQL function. UI uses this for the
 * "next week" / "previous week" navigation buttons.
 */
export function isoMonday(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input + 'T12:00:00Z') : new Date(input)
  const dow = d.getUTCDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offsetToMonday = (dow + 6) % 7 // Mon=0, Tue=1, ..., Sun=6
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - offsetToMonday)
  return monday.toISOString().split('T')[0]
}

import { db } from './db'
import { EventBus } from './events'
import type {
  MealPlan,
  Day,
  Meal,
  Slot,
  Recipe,
  Preset,
  PresetSlot,
  UserPreferences,
  MealView,
  DayView,
  PlanView,
} from './types'
import { generateIngredient } from './pipeline/generateIngredient'
import { generateDish } from './pipeline/generateDish'
import { findAndFetchRecipe } from './pipeline/fetchRecipe'

const uid = () => crypto.randomUUID()
const now = () => Date.now()

const DEFAULT_PREFS: UserPreferences = {
  id: 'singleton',
  dietaryConstraints: [],
  pantryItems: [],
  dislikedIngredients: [],
  recentDishesWindow: 14,
}

export class MealPlanEngine {
  bus = new EventBus()

  // Public method for tests/components to subscribe
  on<K extends 'slot:updated' | 'meal:updated' | 'plan:updated'>(
    event: K,
    h: Parameters<EventBus['on']>[1] extends infer F ? F : never,
  ) {
    return this.bus.on(event, h as never)
  }

  // ─── Preferences ───────────────────────────────────────────────────────

  async getPrefs(): Promise<UserPreferences> {
    const stored = await db.prefs.get('singleton')
    return stored ?? DEFAULT_PREFS
  }

  async setPrefs(patch: Partial<Omit<UserPreferences, 'id'>>): Promise<UserPreferences> {
    const current = await this.getPrefs()
    const next = { ...current, ...patch, id: 'singleton' as const }
    await db.prefs.put(next)
    return next
  }

  // ─── Plan ──────────────────────────────────────────────────────────────

  async createPlan(weekStart: string): Promise<MealPlan> {
    const plan: MealPlan = { id: uid(), weekStart, createdAt: now(), updatedAt: now() }
    await db.plans.add(plan)
    return plan
  }

  async getPlan(id: string): Promise<PlanView | null> {
    const plan = await db.plans.get(id)
    if (!plan) return null
    const days = await db.days.where('planId').equals(id).sortBy('position')
    const dayViews: DayView[] = []
    for (const day of days) {
      const meals = await db.meals.where('dayId').equals(day.id).sortBy('position')
      const mealViews: MealView[] = []
      for (const meal of meals) {
        const slots = await db.slots.where('mealId').equals(meal.id).sortBy('position')
        mealViews.push({ ...meal, slots })
      }
      dayViews.push({ ...day, meals: mealViews })
    }
    return { ...plan, days: dayViews }
  }

  async listPlans(): Promise<MealPlan[]> {
    return await db.plans.orderBy('updatedAt').reverse().toArray()
  }

  async deletePlan(id: string): Promise<void> {
    const days = await db.days.where('planId').equals(id).toArray()
    for (const d of days) await this.removeDay(d.id, { skipEmit: true })
    await db.plans.delete(id)
  }

  // ─── Day ───────────────────────────────────────────────────────────────

  async addDay(planId: string, date: string, theme?: string): Promise<Day> {
    const count = await db.days.where('planId').equals(planId).count()
    const day: Day = { id: uid(), planId, date, theme, position: count }
    await db.days.add(day)
    await this.touchPlan(planId)
    return day
  }

  async setDayTheme(dayId: string, theme: string): Promise<void> {
    await db.days.update(dayId, { theme })
    const day = await db.days.get(dayId)
    if (day) await this.touchPlan(day.planId)
  }

  async removeDay(dayId: string, opts?: { skipEmit?: boolean }): Promise<void> {
    const meals = await db.meals.where('dayId').equals(dayId).toArray()
    for (const m of meals) await this.removeMeal(m.id, { skipEmit: true })
    const day = await db.days.get(dayId)
    await db.days.delete(dayId)
    if (day && !opts?.skipEmit) await this.touchPlan(day.planId)
  }

  // ─── Meal ──────────────────────────────────────────────────────────────

  async addMeal(dayId: string, type: string, presetId?: string): Promise<MealView> {
    const count = await db.meals.where('dayId').equals(dayId).count()
    const meal: Meal = { id: uid(), dayId, type, presetId, position: count }
    await db.meals.add(meal)
    if (presetId) await this.applyPreset(presetId, { mealId: meal.id })
    const slots = await db.slots.where('mealId').equals(meal.id).sortBy('position')
    const day = await db.days.get(dayId)
    if (day) await this.touchPlan(day.planId)
    return { ...meal, slots }
  }

  async setMealType(mealId: string, type: string): Promise<void> {
    await db.meals.update(mealId, { type })
  }

  async removeMeal(mealId: string, opts?: { skipEmit?: boolean }): Promise<void> {
    await db.slots.where('mealId').equals(mealId).delete()
    const meal = await db.meals.get(mealId)
    await db.meals.delete(mealId)
    if (meal && !opts?.skipEmit) {
      const day = await db.days.get(meal.dayId)
      if (day) await this.touchPlan(day.planId)
    }
  }

  // ─── Slot ──────────────────────────────────────────────────────────────

  async addSlot(mealId: string, role: string, notes?: string): Promise<Slot> {
    const count = await db.slots.where('mealId').equals(mealId).count()
    const slot: Slot = {
      id: uid(),
      mealId,
      role,
      status: 'empty',
      locked: false,
      notes,
      position: count,
      updatedAt: now(),
    }
    await db.slots.add(slot)
    this.bus.emit('slot:updated', slot)
    return slot
  }

  async removeSlot(slotId: string): Promise<void> {
    await db.slots.delete(slotId)
  }

  async updateSlotNotes(slotId: string, notes: string): Promise<void> {
    await db.slots.update(slotId, { notes, updatedAt: now() })
    const updated = await db.slots.get(slotId)
    if (updated) this.bus.emit('slot:updated', updated)
  }

  async lockSlot(slotId: string): Promise<void> {
    await db.slots.update(slotId, { locked: true, updatedAt: now() })
    const updated = await db.slots.get(slotId)
    if (updated) this.bus.emit('slot:updated', updated)
  }

  async unlockSlot(slotId: string): Promise<void> {
    await db.slots.update(slotId, { locked: false, updatedAt: now() })
    const updated = await db.slots.get(slotId)
    if (updated) this.bus.emit('slot:updated', updated)
  }

  async reorderSlots(_mealId: string, slotIds: string[]): Promise<void> {
    await db.transaction('rw', db.slots, async () => {
      for (let i = 0; i < slotIds.length; i++) {
        await db.slots.update(slotIds[i], { position: i, updatedAt: now() })
      }
    })
  }

  // ─── Presets (PURE DATA COPY, NO AI) ───────────────────────────────────

  private async fillSlotsFromPreset(mealId: string, slots: PresetSlot[]): Promise<void> {
    await db.slots.where('mealId').equals(mealId).delete()
    const rows: Slot[] = slots.map((ps, i) => {
      const hasRecipe = !!ps.recipeId
      const hasDish = !!ps.dishName
      const status: Slot['status'] = hasRecipe ? 'ready' : hasDish ? 'dish_named' : 'empty'
      return {
        id: uid(),
        mealId,
        role: ps.role,
        status,
        dishName: ps.dishName,
        recipeId: ps.recipeId,
        notes: ps.notes,
        locked: false,
        position: i,
        updatedAt: now(),
      }
    })
    await db.slots.bulkPut(rows)
    for (const s of rows) this.bus.emit('slot:updated', s)
  }

  async applyPreset(
    presetId: string,
    target:
      | { mealId: string }
      | { mealIds: string[] }
      | { dayId: string }
      | { dayIds: string[] },
  ): Promise<void> {
    const preset = await db.presets.get(presetId)
    if (!preset) throw new Error(`Preset ${presetId} not found`)

    const applyToMeal = async (mealId: string) => {
      if (preset.scope !== 'meal' || !preset.slots) {
        throw new Error(`Preset ${preset.name} is day-scoped; pass dayId(s)`)
      }
      await db.meals.update(mealId, { presetId })
      await this.fillSlotsFromPreset(mealId, preset.slots)
    }

    const applyToDay = async (dayId: string) => {
      if (preset.scope !== 'day' || !preset.mealShapes) {
        throw new Error(`Preset ${preset.name} is meal-scoped; pass mealId(s)`)
      }
      // Replace day's meals with preset shape
      const existing = await db.meals.where('dayId').equals(dayId).toArray()
      for (const m of existing) await this.removeMeal(m.id, { skipEmit: true })
      for (let i = 0; i < preset.mealShapes.length; i++) {
        const shape = preset.mealShapes[i]
        const meal: Meal = { id: uid(), dayId, type: shape.type, position: i }
        await db.meals.add(meal)
        await this.fillSlotsFromPreset(meal.id, shape.slots)
      }
    }

    if ('mealId' in target) await applyToMeal(target.mealId)
    else if ('mealIds' in target) for (const id of target.mealIds) await applyToMeal(id)
    else if ('dayId' in target) await applyToDay(target.dayId)
    else if ('dayIds' in target) for (const id of target.dayIds) await applyToDay(id)
  }

  async saveMealAsPreset(mealId: string, name: string): Promise<Preset> {
    const meal = await db.meals.get(mealId)
    if (!meal) throw new Error('Meal not found')
    const slots = await db.slots.where('mealId').equals(mealId).sortBy('position')
    const preset: Preset = {
      id: uid(),
      name,
      scope: 'meal',
      source: 'user',
      slots: slots.map((s) => ({
        role: s.role,
        dishName: s.dishName,
        recipeId: s.recipeId,
        notes: s.notes,
      })),
      createdAt: now(),
    }
    await db.presets.add(preset)
    return preset
  }

  async saveDayAsPreset(dayId: string, name: string): Promise<Preset> {
    const day = await db.days.get(dayId)
    if (!day) throw new Error('Day not found')
    const meals = await db.meals.where('dayId').equals(dayId).sortBy('position')
    const mealShapes: NonNullable<Preset['mealShapes']> = []
    for (const meal of meals) {
      const slots = await db.slots.where('mealId').equals(meal.id).sortBy('position')
      mealShapes.push({
        type: meal.type,
        slots: slots.map((s) => ({
          role: s.role,
          dishName: s.dishName,
          recipeId: s.recipeId,
          notes: s.notes,
        })),
      })
    }
    const preset: Preset = {
      id: uid(),
      name,
      scope: 'day',
      source: 'user',
      mealShapes,
      createdAt: now(),
    }
    await db.presets.add(preset)
    return preset
  }

  async listPresets(scope?: 'meal' | 'day'): Promise<Preset[]> {
    const all = await db.presets.toArray()
    return scope ? all.filter((p) => p.scope === scope) : all
  }

  async deletePreset(id: string): Promise<void> {
    const p = await db.presets.get(id)
    if (p?.source === 'system') throw new Error('Cannot delete system preset')
    await db.presets.delete(id)
  }

  // ─── Recipes ───────────────────────────────────────────────────────────

  async getRecipe(id: string): Promise<Recipe | null> {
    return (await db.recipes.get(id)) ?? null
  }

  // ─── Generation pipeline ───────────────────────────────────────────────

  private async patchSlot(id: string, patch: Partial<Slot>): Promise<Slot> {
    await db.slots.update(id, { ...patch, updatedAt: now() })
    const updated = await db.slots.get(id)
    if (!updated) throw new Error(`Slot ${id} disappeared`)
    this.bus.emit('slot:updated', updated)
    return updated
  }

  private async getRecentDishNames(planId: string, windowDays: number): Promise<string[]> {
    const days = await db.days.where('planId').equals(planId).toArray()
    const meals = (await Promise.all(days.map((d) => db.meals.where('dayId').equals(d.id).toArray()))).flat()
    const slots = (await Promise.all(meals.map((m) => db.slots.where('mealId').equals(m.id).toArray()))).flat()
    const cutoff = now() - windowDays * 24 * 60 * 60 * 1000
    return slots
      .filter((s) => s.dishName && s.updatedAt >= cutoff)
      .map((s) => s.dishName!)
      .slice(0, 50)
  }

  private async getMealAndSiblings(slotId: string): Promise<{
    slot: Slot
    meal: Meal
    day: Day
    siblings: Slot[]
  }> {
    const slot = await db.slots.get(slotId)
    if (!slot) throw new Error(`Slot ${slotId} not found`)
    const meal = await db.meals.get(slot.mealId)
    if (!meal) throw new Error('Meal not found')
    const day = await db.days.get(meal.dayId)
    if (!day) throw new Error('Day not found')
    const siblings = (await db.slots.where('mealId').equals(meal.id).toArray()).filter(
      (s) => s.id !== slotId,
    )
    return { slot, meal, day, siblings }
  }

  /** Idempotent: resumes from current status. */
  async generateSlot(slotId: string): Promise<Slot> {
    let slot = await db.slots.get(slotId)
    if (!slot) throw new Error(`Slot ${slotId} not found`)
    if (slot.status === 'ready') return slot
    if (slot.locked) return slot

    const prefs = await this.getPrefs()
    const { meal, day, siblings } = await this.getMealAndSiblings(slotId)

    // ─── Stage A — Ingredient ────────────────────────────────────
    if (slot.status === 'empty' || slot.status === 'generating_ingredient') {
      slot = await this.patchSlot(slotId, { status: 'generating_ingredient', errorMessage: undefined, errorStage: undefined })
      try {
        const recentDishes = await this.getRecentDishNames(day.planId, prefs.recentDishesWindow)
        const result = await generateIngredient({
          mealType: meal.type,
          slotRole: slot.role,
          theme: day.theme,
          dietaryConstraints: prefs.dietaryConstraints,
          pantryItems: prefs.pantryItems,
          dislikedIngredients: prefs.dislikedIngredients,
          recentDishes,
          notes: slot.notes,
          siblingSlots: siblings.map((s) => ({ role: s.role, ingredient: s.ingredient })),
        })
        slot = await this.patchSlot(slotId, {
          status: 'ingredient_chosen',
          ingredient: result.ingredient,
        })
      } catch (err) {
        slot = await this.patchSlot(slotId, {
          status: 'error',
          errorStage: 'ingredient',
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        return slot
      }
    }

    // ─── Stage B — Dish ──────────────────────────────────────────
    if (slot.status === 'ingredient_chosen' || slot.status === 'generating_dish') {
      slot = await this.patchSlot(slotId, { status: 'generating_dish' })
      try {
        const result = await generateDish({
          mealType: meal.type,
          slotRole: slot.role,
          ingredient: slot.ingredient!,
          theme: day.theme,
          dietaryConstraints: prefs.dietaryConstraints,
          notes: slot.notes,
        })
        slot = await this.patchSlot(slotId, {
          status: 'dish_named',
          dishName: result.dishName,
          searchKeywords: result.searchKeywords,
        })
      } catch (err) {
        slot = await this.patchSlot(slotId, {
          status: 'error',
          errorStage: 'dish',
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        return slot
      }
    }

    // ─── Stage C — Recipe ────────────────────────────────────────
    if (slot.status === 'dish_named' || slot.status === 'fetching_recipe' || slot.status === 'recipe_fetched') {
      slot = await this.patchSlot(slotId, { status: 'fetching_recipe' })
      try {
        const recipeData = await findAndFetchRecipe({
          dishName: slot.dishName!,
          searchKeywords: slot.searchKeywords ?? [slot.dishName!],
          dietaryConstraints: prefs.dietaryConstraints,
          notes: slot.notes,
        })
        const recipe: Recipe = { id: uid(), fetchedAt: now(), ...recipeData }
        await db.recipes.add(recipe)
        slot = await this.patchSlot(slotId, { status: 'ready', recipeId: recipe.id })
      } catch (err) {
        slot = await this.patchSlot(slotId, {
          status: 'error',
          errorStage: 'recipe',
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        return slot
      }
    }

    return slot
  }

  async replaceSlot(slotId: string, hint?: string): Promise<Slot> {
    const slot = await db.slots.get(slotId)
    if (!slot) throw new Error(`Slot ${slotId} not found`)

    // If slot has a recipeId, the recipe persists in Dexie (in case it's referenced elsewhere)
    // but we reset the slot itself.
    const newNotes = hint
      ? slot.notes
        ? `${slot.notes}; ${hint}`
        : hint
      : slot.notes

    await this.patchSlot(slotId, {
      status: 'empty',
      ingredient: undefined,
      dishName: undefined,
      searchKeywords: undefined,
      recipeId: undefined,
      errorMessage: undefined,
      errorStage: undefined,
      locked: false,
      notes: newNotes,
    })
    return await this.generateSlot(slotId)
  }

  /** Generates all empty/error/intermediate slots in a meal in parallel, skipping locked + ready. */
  async generateMeal(mealId: string): Promise<MealView> {
    const slots = await db.slots.where('mealId').equals(mealId).sortBy('position')
    const targets = slots.filter((s) => !s.locked && s.status !== 'ready')
    await Promise.all(targets.map((s) => this.generateSlot(s.id).catch(() => undefined)))
    const meal = await db.meals.get(mealId)
    const fresh = await db.slots.where('mealId').equals(mealId).sortBy('position')
    const view: MealView = { ...meal!, slots: fresh }
    this.bus.emit('meal:updated', view)
    return view
  }

  async generateDay(dayId: string): Promise<DayView> {
    const meals = await db.meals.where('dayId').equals(dayId).sortBy('position')
    await Promise.all(meals.map((m) => this.generateMeal(m.id)))
    const fresh: MealView[] = []
    for (const meal of meals) {
      const slots = await db.slots.where('mealId').equals(meal.id).sortBy('position')
      fresh.push({ ...meal, slots })
    }
    const day = await db.days.get(dayId)
    return { ...day!, meals: fresh }
  }

  async generatePlan(planId: string): Promise<PlanView> {
    const days = await db.days.where('planId').equals(planId).sortBy('position')
    await Promise.all(days.map((d) => this.generateDay(d.id)))
    const view = await this.getPlan(planId)
    if (!view) throw new Error('Plan disappeared')
    this.bus.emit('plan:updated', view)
    return view
  }

  // ─── helpers ───────────────────────────────────────────────────────────

  private async touchPlan(planId: string): Promise<void> {
    await db.plans.update(planId, { updatedAt: now() })
  }
}

// Singleton
let engineSingleton: MealPlanEngine | null = null
export function getEngine(): MealPlanEngine {
  if (!engineSingleton) engineSingleton = new MealPlanEngine()
  return engineSingleton
}

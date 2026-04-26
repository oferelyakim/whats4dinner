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
  ErrorStage,
  SlotEnvelopeSnapshot,
} from './types'
import { generateIngredient } from './pipeline/generateIngredient'
import { generateDish } from './pipeline/generateDish'
import { findAndFetchRecipe } from './pipeline/fetchRecipe'
import { buildEnvelope, type SlotEnvelope } from './variety/envelope'
import { mergeEnvelope, parseUserHint } from './variety/precedence'
import { AbortedByUserError, RateLimitedError } from './errors'

export { AbortedByUserError, RateLimitedError } from './errors'

const uid = () => crypto.randomUUID()
const now = () => Date.now()

const DEFAULT_PREFS: UserPreferences = {
  id: 'singleton',
  dietaryConstraints: [],
  pantryItems: [],
  dislikedIngredients: [],
  recentDishesWindow: 14,
}

// ─── Constants for reliability watchdog ────────────────────────────────────

const STUCK_THRESHOLD_MS = 120_000 // 2 minutes — anything older auto-resets

/**
 * v1.16.0: down from 2 → 1.
 * The user's Anthropic Tier 1 cap is 50K input tokens/min on Haiku 4.5.
 * Sonnet (used by composeFallbackRecipe) has a separate 50K/min budget so
 * mixing models actually doubles the effective throughput on a fresh plan.
 * One-at-a-time also makes retry-after handling sane: a single back-off
 * pauses the entire pipeline cleanly, no straggler races.
 */
const MAX_CONCURRENT_GENERATIONS = 1

/**
 * v1.16.0: when the queue receives a RateLimitedError, every other queued
 * job is paused until this timestamp. Set by the catch handler in
 * `queueGenerate`; consulted by `pump`. Slots-in-flight that already started
 * before this is set keep running — they have their own per-call retry.
 */
let queuePausedUntil = 0

export class MealPlanEngine {
  bus = new EventBus()

  // Per-slot AbortController — populated while a stage is in flight.
  private aborts = new Map<string, AbortController>()

  // 2-in-flight queue to keep us under Anthropic rate limits when generating
  // a whole plan in parallel.
  private queue: Array<() => Promise<void>> = []
  private inflight = 0

  // Public method for tests/components to subscribe
  on<K extends 'slot:updated' | 'meal:updated' | 'plan:updated' | 'error'>(
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
    await db.dishHistory.where('planId').equals(id).delete()
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
    const slots = await db.slots.where('mealId').equals(mealId).toArray()
    for (const s of slots) await db.dishHistory.where('slotId').equals(s.id).delete()
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
    await db.dishHistory.where('slotId').equals(slotId).delete()
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
    // wipe history rows for the slots we're about to delete
    const existing = await db.slots.where('mealId').equals(mealId).toArray()
    for (const s of existing) await db.dishHistory.where('slotId').equals(s.id).delete()
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
    // Cross-plan history takes precedence over current-plan-only.
    const cutoff = now() - windowDays * 24 * 60 * 60 * 1000
    const global = await db.dishHistory.orderBy('plannedAt').reverse().limit(50).toArray()
    const filtered = global.filter((h) => h.plannedAt >= cutoff).map((h) => h.dishName)
    if (filtered.length > 0) return filtered

    // Fall back to current-plan slot dishNames if dishHistory is empty (e.g. before
    // first generation completes).
    const days = await db.days.where('planId').equals(planId).toArray()
    const meals = (await Promise.all(days.map((d) => db.meals.where('dayId').equals(d.id).toArray()))).flat()
    const slots = (await Promise.all(meals.map((m) => db.slots.where('mealId').equals(m.id).toArray()))).flat()
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

  private isWeekend(isoDate: string): boolean {
    const d = new Date(isoDate + 'T12:00:00')
    const dow = d.getDay()
    return dow === 0 || dow === 6
  }

  private emitError(slotId: string, stage: ErrorStage, message: string, durationMs: number) {
    try {
      this.bus.emit('error', { slotId, stage, message, durationMs })
    } catch {
      /* never crash the engine on telemetry */
    }
  }

  /**
   * Idempotent: resumes from current status. Per-slot AbortController is
   * stored in `this.aborts` so `cancelSlot()` can interrupt mid-stage.
   */
  async generateSlot(slotId: string): Promise<Slot> {
    let slot = await db.slots.get(slotId)
    if (!slot) throw new Error(`Slot ${slotId} not found`)
    if (slot.status === 'ready') return slot
    if (slot.locked) return slot

    // v1.16.0: when resuming after a rate-limit pause, restore the slot to
    // its last-good-state so Stage A/B/C entry conditions trigger correctly.
    // The errorStage tells us which stage was about to run when we got 429'd.
    if (slot.status === 'error_rate_limited') {
      const resumeStatus =
        slot.errorStage === 'ingredient'
          ? 'empty'
          : slot.errorStage === 'dish'
            ? 'ingredient_chosen'
            : 'dish_named'
      slot = await this.patchSlot(slotId, {
        status: resumeStatus,
        errorMessage: undefined,
        errorStage: undefined,
      })
    }

    // If a generation is already in flight for this slot, skip — let the
    // running call complete. (Tests rely on idempotency at the status level
    // so we don't actually return early on `generating_*`.)
    const existing = this.aborts.get(slotId)
    if (existing) {
      // Clean up any stale controller — caller is starting fresh.
      this.aborts.delete(slotId)
    }
    const ctrl = new AbortController()
    this.aborts.set(slotId, ctrl)

    try {
      const prefs = await this.getPrefs()
      const { meal, day, siblings } = await this.getMealAndSiblings(slotId)

      // Build the variety envelope ONCE for this generation cycle. It is
      // stored on the slot so Stage A and B see the same envelope, and so
      // the UI can display it for debugging.
      let envelope: SlotEnvelope
      if (slot.envelope && slot.status !== 'empty') {
        // Reuse existing envelope when resuming from a partial state
        envelope = {
          ...slot.envelope,
          reasoning: `resumed: ${slot.envelope.cuisineLabel} / ${slot.envelope.styleLabel} / ${slot.envelope.flavorLabel}`,
        }
      } else {
        envelope = await buildEnvelope({
          slotId: slot.id,
          mealId: meal.id,
          dayId: day.id,
          planId: day.planId,
          slotRole: slot.role,
          dietaryTags: prefs.dietaryConstraints,
          dislikedNames: prefs.dislikedIngredients,
          isWeekend: this.isWeekend(day.date),
        })
      }

      // Apply user-hint precedence (replaceHint is one-shot; notes is persistent)
      const userHint = parseUserHint(slot.replaceHint || slot.notes)
      const finalEnvelope = mergeEnvelope(envelope, userHint)

      const envelopeSnap: SlotEnvelopeSnapshot = {
        cuisineId: finalEnvelope.cuisineId,
        cuisineLabel: finalEnvelope.cuisineLabel,
        cuisineRegion: finalEnvelope.cuisineRegion,
        proteinName: finalEnvelope.proteinName,
        proteinFamily: finalEnvelope.proteinFamily,
        styleId: finalEnvelope.styleId,
        styleLabel: finalEnvelope.styleLabel,
        flavorId: finalEnvelope.flavorId,
        flavorLabel: finalEnvelope.flavorLabel,
      }

      // ─── Stage A — Ingredient ────────────────────────────────────
      if (slot.status === 'empty' || slot.status === 'generating_ingredient') {
        slot = await this.patchSlot(slotId, {
          status: 'generating_ingredient',
          envelope: envelopeSnap,
          generatingStartedAt: now(),
          errorMessage: undefined,
          errorStage: undefined,
        })
        const stageStart = Date.now()
        try {
          const recentDishes = await this.getRecentDishNames(day.planId, prefs.recentDishesWindow)
          const result = await generateIngredient(
            {
              mealType: meal.type,
              slotRole: slot.role,
              theme: day.theme,
              dietaryConstraints: prefs.dietaryConstraints,
              pantryItems: prefs.pantryItems,
              dislikedIngredients: [...prefs.dislikedIngredients, ...(userHint.hardAvoid ?? [])],
              recentDishes,
              notes: slot.replaceHint || slot.notes,
              siblingSlots: siblings.map((s) => ({ role: s.role, ingredient: s.ingredient })),
              envelope: envelopeSnap,
            },
            ctrl.signal,
          )
          slot = await this.patchSlot(slotId, {
            status: 'ingredient_chosen',
            ingredient: result.ingredient,
          })
        } catch (err) {
          if (err instanceof AbortedByUserError || ctrl.signal.aborted) {
            // User cancelled — revert to empty, not error.
            slot = await this.patchSlot(slotId, {
              status: 'empty',
              generatingStartedAt: undefined,
            })
            return slot
          }
          if (err instanceof RateLimitedError) {
            slot = await this.handleRateLimited(slotId, 'ingredient', err)
            return slot
          }
          const message = err instanceof Error ? err.message : String(err)
          slot = await this.patchSlot(slotId, {
            status: 'error',
            errorStage: 'ingredient',
            errorMessage: message,
            generatingStartedAt: undefined,
          })
          this.emitError(slotId, 'ingredient', message, Date.now() - stageStart)
          return slot
        }
      }

      // ─── Stage B — Dish ──────────────────────────────────────────
      if (slot.status === 'ingredient_chosen' || slot.status === 'generating_dish') {
        slot = await this.patchSlot(slotId, {
          status: 'generating_dish',
          generatingStartedAt: now(),
        })
        const stageStart = Date.now()
        try {
          const recentDishes = await this.getRecentDishNames(day.planId, prefs.recentDishesWindow)
          const result = await generateDish(
            {
              mealType: meal.type,
              slotRole: slot.role,
              ingredient: slot.ingredient!,
              theme: day.theme,
              dietaryConstraints: prefs.dietaryConstraints,
              notes: slot.replaceHint || slot.notes,
              recentDishes,
              envelope: envelopeSnap,
            },
            ctrl.signal,
          )
          slot = await this.patchSlot(slotId, {
            status: 'dish_named',
            dishName: result.dishName,
            searchKeywords: result.searchKeywords,
          })

          // Write to dishHistory the moment Stage B succeeds — Stage C
          // failure shouldn't unwrite the dish identity.
          await db.dishHistory.add({
            id: uid(),
            slotId: slot.id,
            planId: day.planId,
            dishName: result.dishName,
            ingredient: slot.ingredient,
            proteinName: envelopeSnap.proteinName,
            proteinFamily: envelopeSnap.proteinFamily,
            cuisineId: envelopeSnap.cuisineId,
            styleId: envelopeSnap.styleId,
            flavorId: envelopeSnap.flavorId,
            plannedAt: now(),
          })
        } catch (err) {
          if (err instanceof AbortedByUserError || ctrl.signal.aborted) {
            slot = await this.patchSlot(slotId, {
              status: 'ingredient_chosen',
              generatingStartedAt: undefined,
            })
            return slot
          }
          if (err instanceof RateLimitedError) {
            slot = await this.handleRateLimited(slotId, 'dish', err)
            return slot
          }
          const message = err instanceof Error ? err.message : String(err)
          slot = await this.patchSlot(slotId, {
            status: 'error',
            errorStage: 'dish',
            errorMessage: message,
            generatingStartedAt: undefined,
          })
          this.emitError(slotId, 'dish', message, Date.now() - stageStart)
          return slot
        }
      }

      // ─── Stage C — Recipe ────────────────────────────────────────
      if (
        slot.status === 'dish_named' ||
        slot.status === 'fetching_recipe' ||
        slot.status === 'recipe_fetched'
      ) {
        slot = await this.patchSlot(slotId, {
          status: 'fetching_recipe',
          generatingStartedAt: now(),
        })
        const stageStart = Date.now()
        try {
          const recipeData = await findAndFetchRecipe(
            {
              dishName: slot.dishName!,
              searchKeywords: slot.searchKeywords ?? [slot.dishName!],
              dietaryConstraints: prefs.dietaryConstraints,
              notes: slot.replaceHint || slot.notes,
            },
            ctrl.signal,
          )
          const recipe: Recipe = { id: uid(), fetchedAt: now(), ...recipeData }
          await db.recipes.add(recipe)
          slot = await this.patchSlot(slotId, {
            status: 'ready',
            recipeId: recipe.id,
            replaceHint: undefined, // one-shot — clear after success
            generatingStartedAt: undefined,
          })
        } catch (err) {
          if (err instanceof AbortedByUserError || ctrl.signal.aborted) {
            slot = await this.patchSlot(slotId, {
              status: 'dish_named',
              generatingStartedAt: undefined,
            })
            return slot
          }
          if (err instanceof RateLimitedError) {
            slot = await this.handleRateLimited(slotId, 'recipe', err)
            return slot
          }
          const message = err instanceof Error ? err.message : String(err)
          slot = await this.patchSlot(slotId, {
            status: 'error',
            errorStage: 'recipe',
            errorMessage: message,
            generatingStartedAt: undefined,
          })
          this.emitError(slotId, 'recipe', message, Date.now() - stageStart)
          return slot
        }
      }

      return slot
    } finally {
      // Only delete if this is still the controller we registered.
      if (this.aborts.get(slotId) === ctrl) this.aborts.delete(slotId)
    }
  }

  /** Cancel an in-flight generation. Reverts slot to its last completed state. */
  async cancelSlot(slotId: string): Promise<void> {
    const ctrl = this.aborts.get(slotId)
    if (ctrl) {
      ctrl.abort()
      this.aborts.delete(slotId)
    }
    // generateSlot's catch block handles the revert; nothing else to do here.
  }

  async replaceSlot(slotId: string, hint?: string): Promise<Slot> {
    const slot = await db.slots.get(slotId)
    if (!slot) throw new Error(`Slot ${slotId} not found`)

    // Pre-cancel any in-flight generation.
    await this.cancelSlot(slotId)

    // Drop the slot's own dishHistory rows so the anti-repeat picker doesn't
    // re-suggest the dish we just rejected.
    await db.dishHistory.where('slotId').equals(slotId).delete()

    const trimmedHint = hint?.trim()

    await this.patchSlot(slotId, {
      status: 'empty',
      ingredient: undefined,
      dishName: undefined,
      searchKeywords: undefined,
      recipeId: undefined,
      envelope: undefined,
      errorMessage: undefined,
      errorStage: undefined,
      generatingStartedAt: undefined,
      locked: false,
      // Overwrite, never append. Hint is one-shot.
      replaceHint: trimmedHint || undefined,
    })
    return await this.generateSlot(slotId)
  }

  // ─── Concurrency-bounded queue ─────────────────────────────────────────

  private async queueGenerate(slotId: string): Promise<void> {
    return new Promise((resolve) => {
      const job = async () => {
        this.inflight++
        try {
          await this.generateSlot(slotId)
        } catch {
          /* slot already patched to error inside generateSlot */
        } finally {
          this.inflight--
          resolve()
          this.pump()
        }
      }
      this.queue.push(job)
      this.pump()
    })
  }

  private pump(): void {
    // v1.16.0: when a 429 hit any slot recently, pause the queue entirely
    // until `queuePausedUntil`. Slot already in flight finish (their per-call
    // retry-after handles the wait); queue resumes via setTimeout.
    const now = Date.now()
    if (now < queuePausedUntil) {
      const wait = queuePausedUntil - now
      setTimeout(() => this.pump(), wait + 50)
      return
    }
    while (this.inflight < MAX_CONCURRENT_GENERATIONS && this.queue.length > 0) {
      const job = this.queue.shift()!
      void job()
    }
  }

  /**
   * v1.16.0: when a Stage hits a true Anthropic 429, mark the slot
   * `error_rate_limited` (preserving any earlier stage outputs), pause the
   * queue globally, and schedule an automatic resume after the retry-after
   * window. The user sees a "rate-limited — retrying in Xs" countdown
   * instead of a hard error they have to retry by hand.
   */
  private async handleRateLimited(
    slotId: string,
    stage: ErrorStage,
    err: RateLimitedError,
  ): Promise<Slot> {
    const wait = Math.max(2000, Math.min(60_000, err.retryAfterMs))
    queuePausedUntil = Math.max(queuePausedUntil, Date.now() + wait)
    const slot = await this.patchSlot(slotId, {
      status: 'error_rate_limited',
      errorStage: stage,
      errorMessage: `Rate-limited; retrying in ${Math.ceil(wait / 1000)}s`,
      generatingStartedAt: undefined,
    })
    this.emitError(slotId, stage, slot.errorMessage ?? 'rate_limited', 0)
    // Schedule auto-resume — generateSlot is idempotent and resumes from the
    // last successful stage (Stage A retries from empty; Stage B from
    // ingredient_chosen; Stage C from dish_named).
    setTimeout(() => {
      // Re-enqueue rather than calling directly so the global concurrency cap
      // and queuePausedUntil checks still apply.
      void this.queueGenerate(slotId)
    }, wait + 250)
    return slot
  }

  /** Generates all empty/error/intermediate slots in a meal in parallel-with-cap, skipping locked + ready. */
  async generateMeal(mealId: string): Promise<MealView> {
    const slots = await db.slots.where('mealId').equals(mealId).sortBy('position')
    const targets = slots.filter((s) => !s.locked && s.status !== 'ready')
    await Promise.all(targets.map((s) => this.queueGenerate(s.id)))
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

    // Empty days have no meals → no slots → nothing for the engine to fill,
    // and the click silently no-ops. Auto-populate any empty day with a
    // default Dinner meal + one main slot so "Add 7 days → Generate plan"
    // works as users expect. Idempotent: only fires when meal count is 0,
    // so applyPreset / explicit addMeal flows are untouched.
    for (const d of days) {
      const mealCount = await db.meals.where('dayId').equals(d.id).count()
      if (mealCount === 0) {
        const meal = await this.addMeal(d.id, 'Dinner')
        const slotCount = await db.slots.where('mealId').equals(meal.id).count()
        if (slotCount === 0) {
          await this.addSlot(meal.id, 'main')
        }
      }
    }

    const refreshedDays = await db.days.where('planId').equals(planId).sortBy('position')
    await Promise.all(refreshedDays.map((d) => this.generateDay(d.id)))
    const view = await this.getPlan(planId)
    if (!view) throw new Error('Plan disappeared')
    this.bus.emit('plan:updated', view)
    return view
  }

  /**
   * Stuck-slot self-heal. Scans the plan for slots in `generating_*` for
   * longer than STUCK_THRESHOLD_MS (default 2 min) and reverts them to
   * their last good state, then queues a fresh generation. Idempotent —
   * safe to call repeatedly (e.g. on visibilitychange).
   */
  async resumeStuckSlots(planId: string): Promise<number> {
    const days = await db.days.where('planId').equals(planId).toArray()
    const meals = (
      await Promise.all(days.map((d) => db.meals.where('dayId').equals(d.id).toArray()))
    ).flat()
    const slots = (
      await Promise.all(meals.map((m) => db.slots.where('mealId').equals(m.id).toArray()))
    ).flat()

    const cutoff = now() - STUCK_THRESHOLD_MS
    const stuck = slots.filter((s) => {
      if (!s.status.startsWith('generating_') && s.status !== 'fetching_recipe') return false
      const started = s.generatingStartedAt ?? s.updatedAt
      return started < cutoff
    })

    for (const s of stuck) {
      const fallback: Slot['status'] =
        s.status === 'generating_ingredient'
          ? 'empty'
          : s.status === 'generating_dish'
            ? 'ingredient_chosen'
            : s.status === 'fetching_recipe'
              ? 'dish_named'
              : 'empty'
      // Drop the stale controller so generateSlot makes a fresh one.
      this.aborts.delete(s.id)
      await this.patchSlot(s.id, {
        status: fallback,
        generatingStartedAt: undefined,
      })
      // Resume in the background — don't block the resume sweep.
      void this.queueGenerate(s.id)
    }
    return stuck.length
  }

  // ─── helpers ───────────────────────────────────────────────────────────

  private async touchPlan(planId: string): Promise<void> {
    await db.plans.update(planId, { updatedAt: now() })
  }
}

// Singleton with a default error logger — devs see issues in the console
// without any setup.
let engineSingleton: MealPlanEngine | null = null
export function getEngine(): MealPlanEngine {
  if (!engineSingleton) {
    engineSingleton = new MealPlanEngine()
    engineSingleton.on('error', (e) => {
      console.warn('[meal-engine]', e)
    })
  }
  return engineSingleton
}

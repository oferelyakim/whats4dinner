import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { MealPlanEngine } from '../MealPlanEngine'
import { seedSystemPresets, __resetSeedCache } from '../presets/seedOnFirstRun'
import { __setMealEngineMock } from '../ai/client'

beforeEach(async () => {
  await db.delete()
  await db.open()
  __resetSeedCache()
  await seedSystemPresets()
})

/**
 * Full-flow regression test mirroring the user's three checks:
 *   1. Replace one slot in the test plan — only that slot regenerates, no error
 *   2. Apply a preset to two meals — both populate instantly with zero AI calls
 *   3. Reload the app — every recipe loads from Dexie with no network requests
 */
describe('one-week mixed plan E2E', () => {
  it('builds a mixed plan, regenerates one slot, applies preset to 2 meals, reloads', async () => {
    const aiCallLog: string[] = []
    let dishCounter = 0
    __setMealEngineMock(async (op, body) => {
      aiCallLog.push(op)
      if (op === 'ingredient') {
        const role = (body as { slotRole: string }).slotRole
        return { ingredient: `${role}-ingredient`, rationale: 'fits' }
      }
      if (op === 'dish') {
        dishCounter++
        return {
          dishName: `Dish #${dishCounter}`,
          searchKeywords: [`dish ${dishCounter}`],
        }
      }
      if (op === 'find-recipe') {
        return {
          recipe: {
            title: (body as { dishName: string }).dishName,
            source: 'ai-fallback',
            ingredients: [{ item: 'an ingredient' }],
            steps: ['cook it'],
          },
        }
      }
      throw new Error(`unexpected op ${op}`)
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-27')

    // Build 7 days with mixed themes/presets
    const dates = [
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ]
    const dayIds: string[] = []
    for (const date of dates) {
      const d = await engine.addDay(plan.id, date)
      dayIds.push(d.id)
    }

    // Day 1: Mexican-themed standard dinner
    await engine.setDayTheme(dayIds[0], 'Mexican')
    const mex = await engine.addMeal(dayIds[0], 'dinner')
    await engine.applyPreset('sys-standard-dinner', { mealId: mex.id })

    // Day 2: Tapas night
    const tapas = await engine.addMeal(dayIds[1], 'dinner')
    await engine.applyPreset('sys-tapas', { mealId: tapas.id })

    // Day 3: Mixed mains dinner
    const mixed = await engine.addMeal(dayIds[2], 'dinner')
    await engine.applyPreset('sys-mixed-mains', { mealId: mixed.id })

    // Day 4 + Day 5: simple breakfasts
    const bf1 = await engine.addMeal(dayIds[3], 'breakfast')
    const bf2 = await engine.addMeal(dayIds[4], 'breakfast')
    await engine.applyPreset('sys-simple-breakfast', { mealIds: [bf1.id, bf2.id] })

    // Snapshot AI calls so far — should be ZERO (preset application is pure data copy)
    expect(aiCallLog.length).toBe(0)

    // Now generate the plan
    await engine.generatePlan(plan.id)

    // Verify all slots are ready
    const view = await engine.getPlan(plan.id)
    const allSlots = view!.days.flatMap((d) => d.meals.flatMap((m) => m.slots))
    expect(allSlots.length).toBeGreaterThan(0)
    for (const s of allSlots) {
      expect(s.status).toBe('ready')
      expect(s.recipeId).toBeTruthy()
    }

    // ─── Regression check 1: Replace one slot ─────────────────
    const targetSlot = allSlots[0]
    const originalDishName = targetSlot.dishName
    const beforeReplaceCalls = aiCallLog.length

    await engine.replaceSlot(targetSlot.id, 'spicier please')

    const afterReplace = await db.slots.get(targetSlot.id)
    expect(afterReplace?.status).toBe('ready')
    expect(afterReplace?.dishName).not.toBe(originalDishName)
    expect(afterReplace?.errorMessage).toBeUndefined()

    // No other slots changed: spot-check sibling
    const sibling = allSlots[1]
    const siblingNow = await db.slots.get(sibling.id)
    expect(siblingNow?.dishName).toBe(sibling.dishName)
    expect(siblingNow?.recipeId).toBe(sibling.recipeId)

    // Replace runs Stage A + B + C → 3 calls
    expect(aiCallLog.length - beforeReplaceCalls).toBe(3)

    // ─── Regression check 2: Apply preset to 2 meals — zero AI calls ─────
    const preApplyAiCalls = aiCallLog.length
    const newMeal1 = await engine.addMeal(dayIds[5], 'dinner')
    const newMeal2 = await engine.addMeal(dayIds[6], 'dinner')

    await engine.applyPreset('sys-standard-dinner', { mealIds: [newMeal1.id, newMeal2.id] })

    const m1Slots = await db.slots.where('mealId').equals(newMeal1.id).toArray()
    const m2Slots = await db.slots.where('mealId').equals(newMeal2.id).toArray()
    expect(m1Slots).toHaveLength(3)
    expect(m2Slots).toHaveLength(3)
    expect(m1Slots.every((s) => s.status === 'empty')).toBe(true)
    expect(m2Slots.every((s) => s.status === 'empty')).toBe(true)

    // Critical: ZERO AI calls for preset application
    expect(aiCallLog.length).toBe(preApplyAiCalls)

    // ─── Regression check 3: Reload — recipes from Dexie, no network ─────
    let networkCallsAfterReload = 0
    __setMealEngineMock(async (op) => {
      networkCallsAfterReload++
      throw new Error(`No network calls allowed on reload (got ${op})`)
    })

    // New engine instance simulates reload
    const engine2 = new MealPlanEngine()
    const reloadedPlan = await engine2.getPlan(plan.id)
    expect(reloadedPlan).not.toBeNull()

    // Touch every recipe — they must all come from Dexie
    const allRecipeIds = reloadedPlan!.days
      .flatMap((d) => d.meals.flatMap((m) => m.slots))
      .map((s) => s.recipeId)
      .filter((id): id is string => !!id)

    expect(allRecipeIds.length).toBeGreaterThan(0)
    for (const rid of allRecipeIds) {
      const r = await engine2.getRecipe(rid)
      expect(r).not.toBeNull()
      expect(r?.title).toBeTruthy()
    }

    expect(networkCallsAfterReload).toBe(0)
  })
})

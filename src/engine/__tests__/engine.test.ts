import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import { MealPlanEngine } from '../MealPlanEngine'
import { seedSystemPresets, __resetSeedCache } from '../presets/seedOnFirstRun'
import { __setMealEngineMock } from '../ai/client'

beforeEach(async () => {
  await db.delete()
  await db.open()
  __resetSeedCache()
  await seedSystemPresets()
  __setMealEngineMock(null)
})

describe('applyPreset (PURE DATA COPY, NO AI)', () => {
  it('copies preset slots into a meal with zero AI calls', async () => {
    const aiSpy = vi.fn()
    __setMealEngineMock(async (op) => {
      aiSpy(op)
      throw new Error('AI must not be called for applyPreset')
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')

    await engine.applyPreset('sys-standard-dinner', { mealId: meal.id })

    const slots = await db.slots.where('mealId').equals(meal.id).toArray()
    expect(slots).toHaveLength(3)
    expect(slots.map((s) => s.role).sort()).toEqual(['main', 'starch_side', 'veg_side'])
    expect(slots.every((s) => s.status === 'empty')).toBe(true)
    expect(aiSpy).toHaveBeenCalledTimes(0)
  })

  it('apply to two meals at once populates both with zero AI calls', async () => {
    const aiSpy = vi.fn()
    __setMealEngineMock(async (op) => {
      aiSpy(op)
      throw new Error('AI must not be called')
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const m1 = await engine.addMeal(day.id, 'dinner')
    const m2 = await engine.addMeal(day.id, 'lunch')

    await engine.applyPreset('sys-standard-dinner', { mealIds: [m1.id, m2.id] })

    const s1 = await db.slots.where('mealId').equals(m1.id).toArray()
    const s2 = await db.slots.where('mealId').equals(m2.id).toArray()
    expect(s1).toHaveLength(3)
    expect(s2).toHaveLength(3)
    expect(aiSpy).toHaveBeenCalledTimes(0)
  })

  it('day-scoped preset replaces day meals with zero AI calls', async () => {
    const aiSpy = vi.fn()
    __setMealEngineMock(async (op) => {
      aiSpy(op)
      throw new Error('AI must not be called')
    })
    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')

    await engine.applyPreset('sys-day-standard', { dayId: day.id })

    const meals = await db.meals.where('dayId').equals(day.id).toArray()
    expect(meals).toHaveLength(3)
    expect(aiSpy).toHaveBeenCalledTimes(0)
  })
})

describe('replaceSlot', () => {
  it('resets only the targeted slot; siblings untouched', async () => {
    const calls: string[] = []
    __setMealEngineMock(async (op, body) => {
      calls.push(op)
      if (op === 'ingredient') return { ingredient: 'tofu', rationale: 'plant' }
      if (op === 'dish') return { dishName: 'Crispy tofu', searchKeywords: ['crispy tofu'] }
      if (op === 'find-recipe') {
        const dn = (body as { dishName: string }).dishName
        return {
          recipe: {
            title: dn,
            source: 'ai-fallback',
            ingredients: [{ item: 'tofu' }],
            steps: ['cook'],
          },
        }
      }
      throw new Error(`unhandled op ${op}`)
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    await engine.applyPreset('sys-standard-dinner', { mealId: meal.id })

    const slots = await db.slots.where('mealId').equals(meal.id).sortBy('position')
    const target = slots[0]
    const sibling = slots[1]

    // pre-set sibling to ready manually so we can verify it's untouched
    await db.slots.update(sibling.id, { status: 'ready', dishName: 'sibling dish' })

    await engine.replaceSlot(target.id)

    const updatedTarget = await db.slots.get(target.id)
    const updatedSibling = await db.slots.get(sibling.id)
    expect(updatedTarget?.status).toBe('ready')
    expect(updatedTarget?.dishName).toBe('Crispy tofu')
    // sibling untouched
    expect(updatedSibling?.status).toBe('ready')
    expect(updatedSibling?.dishName).toBe('sibling dish')
  })
})

describe('generateSlot idempotency', () => {
  it('on a dish_named slot, runs only Stage C', async () => {
    const calls: string[] = []
    __setMealEngineMock(async (op) => {
      calls.push(op)
      if (op === 'find-recipe') {
        return {
          recipe: {
            title: 'X',
            source: 'ai-fallback',
            ingredients: [{ item: 'x' }],
            steps: ['cook'],
          },
        }
      }
      throw new Error(`unexpected op ${op}`)
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const slot = await engine.addSlot(meal.id, 'main')
    await db.slots.update(slot.id, {
      status: 'dish_named',
      dishName: 'Pre-named',
      searchKeywords: ['pre named'],
      ingredient: 'x',
    })

    await engine.generateSlot(slot.id)
    expect(calls).toEqual(['find-recipe'])
  })

  it('on a ready slot, is a no-op', async () => {
    const calls: string[] = []
    __setMealEngineMock(async (op) => {
      calls.push(op)
      throw new Error('should not be called')
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const slot = await engine.addSlot(meal.id, 'main')
    await db.slots.update(slot.id, { status: 'ready' })

    await engine.generateSlot(slot.id)
    expect(calls).toEqual([])
  })
})

describe('locked slots', () => {
  it('generateMeal skips locked slots', async () => {
    const calls: { op: string; slotIngredient?: string }[] = []
    __setMealEngineMock(async (op) => {
      calls.push({ op })
      if (op === 'ingredient') return { ingredient: 'x', rationale: '' }
      if (op === 'dish') return { dishName: 'X', searchKeywords: ['x'] }
      if (op === 'find-recipe') {
        return {
          recipe: { title: 'X', source: 'ai-fallback', ingredients: [{ item: 'x' }], steps: ['c'] },
        }
      }
      throw new Error('?')
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const a = await engine.addSlot(meal.id, 'main')
    const b = await engine.addSlot(meal.id, 'side')
    await engine.lockSlot(b.id)

    await engine.generateMeal(meal.id)

    const aFinal = await db.slots.get(a.id)
    const bFinal = await db.slots.get(b.id)
    expect(aFinal?.status).toBe('ready')
    expect(bFinal?.status).toBe('empty')
    expect(bFinal?.locked).toBe(true)
  })
})

describe('schema validation', () => {
  it('AI response failing validation → slot status error, no silent fall-through', async () => {
    __setMealEngineMock(async () => ({ wrong: 'shape' }))

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const slot = await engine.addSlot(meal.id, 'main')

    await engine.generateSlot(slot.id)
    const final = await db.slots.get(slot.id)
    expect(final?.status).toBe('error')
    expect(final?.errorStage).toBe('ingredient')
    expect(final?.errorMessage).toMatch(/Schema validation/)
  })
})

describe('slot isolation', () => {
  it('failing Stage A on slot X does not change slot Y', async () => {
    let count = 0
    __setMealEngineMock(async (op) => {
      count++
      if (op === 'ingredient' && count === 1) throw new Error('boom')
      if (op === 'ingredient') return { ingredient: 'x', rationale: '' }
      if (op === 'dish') return { dishName: 'X', searchKeywords: ['x'] }
      if (op === 'find-recipe') {
        return { recipe: { title: 'X', source: 'ai-fallback', ingredients: [{ item: 'x' }], steps: ['c'] } }
      }
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const x = await engine.addSlot(meal.id, 'main')
    const y = await engine.addSlot(meal.id, 'side')

    await Promise.all([
      engine.generateSlot(x.id).catch(() => {}),
      engine.generateSlot(y.id).catch(() => {}),
    ])

    const xFinal = await db.slots.get(x.id)
    const yFinal = await db.slots.get(y.id)

    // x might be error, y should not be — at most one of them should have errored
    expect(xFinal?.status === 'error' || yFinal?.status === 'error').toBe(true)
    // one of them succeeded (whichever didn't get the boom)
    expect(xFinal?.status === 'ready' || yFinal?.status === 'ready').toBe(true)
  })
})

describe('recipe persistence', () => {
  it('recipes load from Dexie on reload with no network calls', async () => {
    let aiCallsAfterPersist = 0
    __setMealEngineMock(async (op) => {
      if (op === 'ingredient') return { ingredient: 'x', rationale: '' }
      if (op === 'dish') return { dishName: 'X', searchKeywords: ['x'] }
      if (op === 'find-recipe') {
        return { recipe: { title: 'X', source: 'ai-fallback', ingredients: [{ item: 'x' }], steps: ['c'] } }
      }
    })

    const engine1 = new MealPlanEngine()
    const plan = await engine1.createPlan('2026-04-25')
    const day = await engine1.addDay(plan.id, '2026-04-25')
    const meal = await engine1.addMeal(day.id, 'dinner')
    const slot = await engine1.addSlot(meal.id, 'main')
    await engine1.generateSlot(slot.id)

    const finishedSlot = await db.slots.get(slot.id)
    expect(finishedSlot?.status).toBe('ready')
    const recipeId = finishedSlot!.recipeId!

    // Simulate "reload" — new engine instance, count any further AI calls
    __setMealEngineMock(async () => {
      aiCallsAfterPersist++
      throw new Error('should not be called on reload')
    })
    const engine2 = new MealPlanEngine()
    const recipe = await engine2.getRecipe(recipeId)
    expect(recipe).not.toBeNull()
    expect(recipe?.title).toBe('X')
    expect(aiCallsAfterPersist).toBe(0)

    // also: re-read the plan, slot points at same recipe id
    const planView = await engine2.getPlan(plan.id)
    expect(planView?.days[0].meals[0].slots[0].recipeId).toBe(recipeId)
    expect(aiCallsAfterPersist).toBe(0)
  })
})

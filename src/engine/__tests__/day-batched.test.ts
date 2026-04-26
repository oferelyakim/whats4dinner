// v1.19.0 — generateDayBatched (day-plan op wiring) tests.
//
// Invariants:
//   - happy path: N slots in a day → 1 day-plan call → all advance to dish_named
//   - locked slots are skipped client-side (not sent to AI)
//   - user-hint slots (replaceHint / notes) bypass batch — per-slot path
//     applies the hint via parseUserHint + mergeEnvelope
//   - partial response: returned slots advance, missing slots fall through
//     to per-slot Stage A (untouched at empty)
//   - failure: any error from day-plan → return 0, slots remain empty
//   - dishHistory write happens for every advanced slot (anti-repeat invariant)
//   - 0/1 candidate slots → no day-plan call (not worth the round-trip)

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
  __setMealEngineMock(null)
})

async function setupSimpleDay() {
  const engine = new MealPlanEngine()
  const plan = await engine.createPlan('2026-05-01')
  const day = await engine.addDay(plan.id, '2026-05-01')
  const dinner = await engine.addMeal(day.id, 'dinner')
  await engine.addSlot(dinner.id, 'main')
  await engine.addSlot(dinner.id, 'veg_side')
  await engine.addSlot(dinner.id, 'starch_side')
  return { engine, plan, day, dinner }
}

describe('generateDayBatched — happy path', () => {
  it('one day-plan call advances every slot to dish_named', async () => {
    const calls: { op: string; body: unknown }[] = []
    __setMealEngineMock(async (op, body) => {
      calls.push({ op, body })
      // Bank lookups always miss in this test (no recipe_bank in mock).
      if (op === 'sample-from-bank') return { candidates: [] }
      if (op === 'day-plan') {
        const slots = (body as { meals: { slots: { slotId: string; role: string }[] }[] }).meals.flatMap((m) => m.slots)
        return {
          slots: slots.map((s, i) => ({
            slotId: s.slotId,
            ingredient: `ingredient-${i}`,
            dishName: `Dish ${i}`,
            searchKeywords: [`keyword-${i}-a`, `keyword-${i}-b`],
            rationale: 'test',
          })),
        }
      }
      throw new Error(`unexpected op: ${op}`)
    })

    const { engine, day } = await setupSimpleDay()
    const advanced = await engine.generateDayBatched(day.id)

    expect(advanced).toBe(3)
    const slots = await db.slots.where('mealId').equals((await db.meals.where('dayId').equals(day.id).first())!.id).toArray()
    expect(slots).toHaveLength(3)
    for (const slot of slots) {
      expect(slot.status).toBe('dish_named')
      expect(slot.ingredient).toMatch(/ingredient-\d/)
      expect(slot.dishName).toMatch(/Dish \d/)
      expect(slot.searchKeywords?.length).toBeGreaterThanOrEqual(1)
    }
    // Exactly ONE day-plan call (no per-slot Stage A or B).
    const dayPlanCalls = calls.filter((c) => c.op === 'day-plan')
    expect(dayPlanCalls).toHaveLength(1)
  })

  it('writes a dishHistory entry per advanced slot (anti-repeat invariant)', async () => {
    __setMealEngineMock(async (op, body) => {
      if (op === 'sample-from-bank') return { candidates: [] }
      if (op === 'day-plan') {
        const slots = (body as { meals: { slots: { slotId: string }[] }[] }).meals.flatMap((m) => m.slots)
        return {
          slots: slots.map((s, i) => ({
            slotId: s.slotId,
            ingredient: `ing-${i}`,
            dishName: `Dish ${i}`,
            searchKeywords: [`kw-${i}`],
          })),
        }
      }
      throw new Error(`unexpected op: ${op}`)
    })

    const { engine, day } = await setupSimpleDay()
    const beforeHistoryCount = await db.dishHistory.count()
    await engine.generateDayBatched(day.id)
    const afterHistoryCount = await db.dishHistory.count()
    expect(afterHistoryCount - beforeHistoryCount).toBe(3)
  })
})

describe('generateDayBatched — skips', () => {
  it('skips locked slots; passes only unlocked slots to day-plan', async () => {
    let dayPlanInputSlotCount = 0
    __setMealEngineMock(async (op, body) => {
      if (op === 'sample-from-bank') return { candidates: [] }
      if (op === 'day-plan') {
        const slots = (body as { meals: { slots: { slotId: string }[] }[] }).meals.flatMap((m) => m.slots)
        dayPlanInputSlotCount = slots.length
        return {
          slots: slots.map((s, i) => ({
            slotId: s.slotId,
            ingredient: `ing-${i}`,
            dishName: `Dish ${i}`,
            searchKeywords: [`kw-${i}`],
          })),
        }
      }
      throw new Error(`unexpected op: ${op}`)
    })

    const { engine, day, dinner } = await setupSimpleDay()
    const slots = await db.slots.where('mealId').equals(dinner.id).toArray()
    // Lock the first slot
    await engine.lockSlot(slots[0].id)

    const advanced = await engine.generateDayBatched(day.id)
    expect(dayPlanInputSlotCount).toBe(2) // only the 2 unlocked slots
    expect(advanced).toBe(2)
    // Locked slot still empty
    const lockedAfter = await db.slots.get(slots[0].id)
    expect(lockedAfter?.status).toBe('empty')
    expect(lockedAfter?.locked).toBe(true)
  })

  it('skips slots with replaceHint (user-hint precedence)', async () => {
    let dayPlanInputSlotCount = 0
    __setMealEngineMock(async (op, body) => {
      if (op === 'sample-from-bank') return { candidates: [] }
      if (op === 'day-plan') {
        const slots = (body as { meals: { slots: { slotId: string }[] }[] }).meals.flatMap((m) => m.slots)
        dayPlanInputSlotCount = slots.length
        return {
          slots: slots.map((s, i) => ({
            slotId: s.slotId,
            ingredient: `ing-${i}`,
            dishName: `Dish ${i}`,
            searchKeywords: [`kw-${i}`],
          })),
        }
      }
      throw new Error(`unexpected op: ${op}`)
    })

    const { engine, day, dinner } = await setupSimpleDay()
    const slots = await db.slots.where('mealId').equals(dinner.id).toArray()
    // Set a user hint on slots[1]
    await db.slots.update(slots[1].id, { replaceHint: 'Italian please' })

    const advanced = await engine.generateDayBatched(day.id)
    expect(dayPlanInputSlotCount).toBe(2) // 3 minus the 1 with replaceHint
    expect(advanced).toBe(2)
    const hintedAfter = await db.slots.get(slots[1].id)
    expect(hintedAfter?.status).toBe('empty') // not advanced — per-slot path will handle
  })

  it('returns 0 without calling day-plan when fewer than 2 candidate slots', async () => {
    const calls: string[] = []
    __setMealEngineMock(async (op) => {
      calls.push(op)
      if (op === 'sample-from-bank') return { candidates: [] }
      throw new Error(`day-plan should not be called: ${op}`)
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-05-01')
    const day = await engine.addDay(plan.id, '2026-05-01')
    const dinner = await engine.addMeal(day.id, 'dinner')
    await engine.addSlot(dinner.id, 'main')

    const advanced = await engine.generateDayBatched(day.id)
    expect(advanced).toBe(0)
    expect(calls.filter((c) => c === 'day-plan')).toHaveLength(0)
  })
})

describe('generateDayBatched — partial + failure', () => {
  it('partial response: only returned slots advance; others stay at empty', async () => {
    __setMealEngineMock(async (op, body) => {
      if (op === 'sample-from-bank') return { candidates: [] }
      if (op === 'day-plan') {
        const slots = (body as { meals: { slots: { slotId: string }[] }[] }).meals.flatMap((m) => m.slots)
        // Return only the first 2 of 3 — simulates AI partial answer
        return {
          slots: slots.slice(0, 2).map((s, i) => ({
            slotId: s.slotId,
            ingredient: `ing-${i}`,
            dishName: `Dish ${i}`,
            searchKeywords: [`kw-${i}`],
          })),
        }
      }
      throw new Error(`unexpected op: ${op}`)
    })

    const { engine, day, dinner } = await setupSimpleDay()
    const advanced = await engine.generateDayBatched(day.id)
    expect(advanced).toBe(2)

    const finalSlots = await db.slots.where('mealId').equals(dinner.id).sortBy('position')
    expect(finalSlots[0].status).toBe('dish_named')
    expect(finalSlots[1].status).toBe('dish_named')
    expect(finalSlots[2].status).toBe('empty') // missed slot — per-slot path picks up
  })

  it('day-plan throws → returns 0, all slots stay at empty', async () => {
    __setMealEngineMock(async (op) => {
      if (op === 'sample-from-bank') return { candidates: [] }
      if (op === 'day-plan') throw new Error('simulated network failure')
      throw new Error(`unexpected op: ${op}`)
    })

    const { engine, day, dinner } = await setupSimpleDay()
    const advanced = await engine.generateDayBatched(day.id)
    expect(advanced).toBe(0)
    const slots = await db.slots.where('mealId').equals(dinner.id).toArray()
    for (const slot of slots) {
      expect(slot.status).toBe('empty')
      expect(slot.dishName).toBeFalsy()
    }
  })

  it('schema-invalid response → returns 0, slots untouched', async () => {
    __setMealEngineMock(async (op) => {
      if (op === 'sample-from-bank') return { candidates: [] }
      if (op === 'day-plan') {
        // Missing required `dishName` field → schema fails
        return { slots: [{ slotId: 'something', ingredient: 'rice' }] }
      }
      throw new Error(`unexpected op: ${op}`)
    })

    const { engine, day, dinner } = await setupSimpleDay()
    const advanced = await engine.generateDayBatched(day.id)
    expect(advanced).toBe(0)
    const slots = await db.slots.where('mealId').equals(dinner.id).toArray()
    for (const slot of slots) {
      expect(slot.status).toBe('empty')
    }
  })
})

describe('generateDayBatched — invariants', () => {
  it('idempotency: re-running on a partially-advanced day skips already-advanced slots', async () => {
    let dayPlanCallCount = 0
    let inputSlotsOnSecondCall = 0
    __setMealEngineMock(async (op, body) => {
      if (op === 'sample-from-bank') return { candidates: [] }
      if (op === 'day-plan') {
        dayPlanCallCount++
        const slots = (body as { meals: { slots: { slotId: string }[] }[] }).meals.flatMap((m) => m.slots)
        if (dayPlanCallCount === 2) inputSlotsOnSecondCall = slots.length
        return {
          slots: slots.map((s, i) => ({
            slotId: s.slotId,
            ingredient: `ing-${i}`,
            dishName: `Dish ${i}`,
            searchKeywords: [`kw-${i}`],
          })),
        }
      }
      throw new Error(`unexpected op: ${op}`)
    })

    const { engine, day } = await setupSimpleDay()
    await engine.generateDayBatched(day.id)
    // Second run should see all slots already at dish_named → 0 candidates,
    // skipping the AI call entirely.
    const advanced = await engine.generateDayBatched(day.id)
    expect(advanced).toBe(0)
    expect(dayPlanCallCount).toBe(1) // only the first run hit AI
    expect(inputSlotsOnSecondCall).toBe(0)
  })
})

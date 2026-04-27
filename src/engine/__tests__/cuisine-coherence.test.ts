// v2.3.0 — cuisine coherence within ONE meal.
//
// User-reported bug from v2.2.0 testing: applying a Greek preset to a meal
// produced "Greek braised flank + Japanese curry + Filipino fried rice" in the
// SAME dinner. Sibling slots inside one meal must share a cuisine.
//
// Two regression invariants:
//   1. tryFillSlotFromBank locks onto a sibling's cuisine when one is set.
//   2. applyInterviewResult propagates the meal's cuisine into still-empty
//      sibling slot.notes after the first slot lands, so the residual
//      generation queue (worker envelope built from notes) keeps the cuisine.

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { MealPlanEngine } from '../MealPlanEngine'
import { __setMealEngineMock } from '../ai/client'
import { __resetSeedCache, seedSystemPresets } from '../presets/seedOnFirstRun'
import { parseUserHint } from '../variety/precedence'
import type { SlotEnvelopeSnapshot } from '../types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  __resetSeedCache()
  await seedSystemPresets()
  __setMealEngineMock(null)
})

interface FakeBankRow {
  bankId: string
  title: string
  cuisineId: string
  ingredientMain: string
  proteinFamily?: string
  qualityScore: number
  recipe: {
    title: string
    source: 'web'
    ingredients: { item: string; quantity?: string }[]
    steps: string[]
  }
}

function buildBankRow(opts: {
  title: string
  cuisineId: string
  ingredientMain: string
  proteinFamily?: string
}): FakeBankRow {
  return {
    bankId: `bank-${opts.title}`,
    title: opts.title,
    cuisineId: opts.cuisineId,
    ingredientMain: opts.ingredientMain,
    proteinFamily: opts.proteinFamily,
    qualityScore: 0.9,
    recipe: {
      title: opts.title,
      source: 'web',
      ingredients: [{ item: opts.ingredientMain }],
      steps: [`Cook ${opts.ingredientMain}.`],
    },
  }
}

describe('tryFillSlotFromBank — sibling cuisine lock', () => {
  it('rejects a candidate whose cuisine differs from a sibling slot already filled with greek', async () => {
    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-05-01')
    const day = await engine.addDay(plan.id, '2026-05-01')
    const dinner = await engine.addMeal(day.id, 'dinner')
    const main = await engine.addSlot(dinner.id, 'main')
    const side = await engine.addSlot(dinner.id, 'veg_side')

    // Pretend the main is already filled with a Greek envelope (this is how
    // the engine flags cuisine on the slot for siblings to read).
    const greekEnvelope: SlotEnvelopeSnapshot = {
      cuisineId: 'greek',
      cuisineLabel: 'Greek',
      cuisineRegion: 'med-me',
      proteinName: 'lamb shoulder',
      proteinFamily: 'red-meat',
      styleId: 'grilled',
      styleLabel: 'Grilled',
      flavorId: 'bright-citrusy',
      flavorLabel: 'Bright',
    }
    await db.slots.update(main.id, {
      status: 'ready',
      envelope: greekEnvelope,
      dishName: 'Greek Lamb Souvlaki',
      ingredient: 'lamb shoulder',
      updatedAt: Date.now(),
    })

    // Bank returns a Korean candidate first, then a Greek one. The picker
    // MUST skip the Korean and choose the Greek to keep the meal coherent.
    __setMealEngineMock(async (op) => {
      if (op !== 'sample-from-bank') throw new Error(`unexpected op: ${op}`)
      return {
        candidates: [
          buildBankRow({
            title: 'Korean Sesame Bok Choy',
            cuisineId: 'korean',
            ingredientMain: 'bok choy',
            proteinFamily: 'vegetable',
          }),
          buildBankRow({
            title: 'Greek Lemon Roasted Zucchini',
            cuisineId: 'greek',
            ingredientMain: 'zucchini',
            proteinFamily: 'vegetable',
          }),
        ],
      }
    })

    const filled = await engine.tryFillSlotFromBank(side.id, [], [], [])
    expect(filled).toBe(true)
    const finalSide = await db.slots.get(side.id)
    expect(finalSide?.status).toBe('ready')
    expect(finalSide?.envelope?.cuisineId).toBe('greek')
    expect(finalSide?.dishName).toBe('Greek Lemon Roasted Zucchini')
  })

  it('passes the sibling cuisine into sample-from-bank query when locked', async () => {
    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-05-01')
    const day = await engine.addDay(plan.id, '2026-05-01')
    const dinner = await engine.addMeal(day.id, 'dinner')
    const main = await engine.addSlot(dinner.id, 'main')
    const side = await engine.addSlot(dinner.id, 'starch_side')

    // Sibling has a Greek note (set by preset application or by the
    // applyInterviewResult propagation pass).
    await db.slots.update(main.id, {
      notes: 'greek',
      updatedAt: Date.now(),
    })

    let observedCuisineIds: string[] = []
    __setMealEngineMock(async (op, body) => {
      if (op !== 'sample-from-bank') throw new Error(`unexpected op: ${op}`)
      observedCuisineIds = (body as { cuisineIds: string[] }).cuisineIds
      return { candidates: [] } // miss intentionally — we only care about the query
    })

    await engine.tryFillSlotFromBank(side.id, [], [], [])
    expect(observedCuisineIds).toEqual(['greek'])
  })
})

describe('tryFillSlotFromBank — preset cuisine hard constraint (Bug A regression)', () => {
  it('rejects a Peruvian candidate when Burger preset locked slot.notes to american', async () => {
    // Burger preset sets cuisineId='american' on its slots, so fillSlotsFromPreset
    // writes notes="american (modern) burger" on the main slot. Previously,
    // tryFillSlotFromBank only checked lockedSiblingCuisineId (other slots in
    // the meal) — not the slot's OWN preset cuisine. Peruvian chicken was being
    // accepted as the first bank candidate even though slot.notes said "american".
    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-05-01')
    const day = await engine.addDay(plan.id, '2026-05-01')

    // Apply Burger preset to the day — this creates a dinner meal with
    // main + side slots, each with notes carrying the 'american' cuisine token.
    await engine.applyPreset('sys-day-burger', { dayId: day.id })

    const dinner = (await db.meals.where('dayId').equals(day.id).toArray())[0]
    const slots = await db.slots.where('mealId').equals(dinner.id).sortBy('position')
    const mainSlot = slots.find((s) => s.role === 'main')
    expect(mainSlot).toBeDefined()
    // Verify the preset actually wrote an american cuisine token into notes.
    const presetHint = parseUserHint(mainSlot!.notes)
    expect(presetHint.cuisineId).toBe('american')

    // Mock the bank to return Peruvian first, American second.
    __setMealEngineMock(async (op) => {
      if (op !== 'sample-from-bank') throw new Error(`unexpected op: ${op}`)
      return {
        candidates: [
          buildBankRow({
            title: 'Peruvian Chicken (Pollo a la Brasa)',
            cuisineId: 'peruvian',
            ingredientMain: 'whole roast chicken',
            proteinFamily: 'poultry',
          }),
          buildBankRow({
            title: 'Classic American Cheeseburger',
            cuisineId: 'american',
            ingredientMain: 'ground beef (85/15)',
            proteinFamily: 'red-meat',
          }),
        ],
      }
    })

    const filled = await engine.tryFillSlotFromBank(mainSlot!.id, [], [], [])
    expect(filled).toBe(true)
    const finalMain = await db.slots.get(mainSlot!.id)
    // Slot must land on the American candidate, not the Peruvian one.
    expect(finalMain?.envelope?.cuisineId).toBe('american')
    expect(finalMain?.dishName).toBe('Classic American Cheeseburger')
  })

  it('returns false when bank only has non-american candidates for an american-preset slot', async () => {
    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-05-01')
    const day = await engine.addDay(plan.id, '2026-05-01')
    await engine.applyPreset('sys-day-burger', { dayId: day.id })
    const dinner = (await db.meals.where('dayId').equals(day.id).toArray())[0]
    const slots = await db.slots.where('mealId').equals(dinner.id).sortBy('position')
    const mainSlot = slots.find((s) => s.role === 'main')!

    // Bank returns only non-American candidates — slot must fall through to AI.
    __setMealEngineMock(async (op) => {
      if (op !== 'sample-from-bank') throw new Error(`unexpected op: ${op}`)
      return {
        candidates: [
          buildBankRow({ title: 'Peruvian Chicken', cuisineId: 'peruvian', ingredientMain: 'chicken', proteinFamily: 'poultry' }),
          buildBankRow({ title: 'Korean Short Ribs', cuisineId: 'korean', ingredientMain: 'beef short ribs', proteinFamily: 'red-meat' }),
        ],
      }
    })

    const filled = await engine.tryFillSlotFromBank(mainSlot.id, [], [], [])
    // No matching cuisine → return false so the caller falls through to AI.
    expect(filled).toBe(false)
    const slot = await db.slots.get(mainSlot.id)
    // Status unchanged — still the preset's empty state (not marked ready).
    expect(slot?.status).not.toBe('ready')
  })
})

describe('applyInterviewResult — cuisine propagation', () => {
  it('writes the meal cuisine into still-empty sibling slot.notes after the first sibling lands', async () => {
    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-05-01')
    const day = await engine.addDay(plan.id, '2026-05-01')
    const dinner = await engine.addMeal(day.id, 'dinner')
    await engine.addSlot(dinner.id, 'main')
    await engine.addSlot(dinner.id, 'veg_side')
    await engine.addSlot(dinner.id, 'starch_side')

    // Mock the bank: ONLY the main fills (Greek). Sides miss → end up in
    // `misses[]` for residual queue. The cuisine-propagation pass must then
    // write 'greek' into both sides' notes so the worker's envelope-build
    // (which reads slot.notes) keeps them coherent.
    let mainCallCount = 0
    __setMealEngineMock(async (op, body) => {
      if (op === 'sample-from-bank') {
        const role = (body as { slotRole?: string }).slotRole
        // The first call corresponds to the main; subsequent calls to sides.
        if (mainCallCount === 0 && role !== 'starch_side' && role !== 'veg_side') {
          mainCallCount++
          return {
            candidates: [
              buildBankRow({
                title: 'Greek Lamb Souvlaki',
                cuisineId: 'greek',
                ingredientMain: 'lamb shoulder',
                proteinFamily: 'red-meat',
              }),
            ],
          }
        }
        // sides miss
        return { candidates: [] }
      }
      return null
    })

    // applyInterviewResult runs the cuisine-propagation pass per-meal BEFORE
    // it queues residual misses through generatePlanAsync. The mock supabase
    // has no auth context, so generatePlanAsync throws — but the propagation
    // already ran. We catch and proceed to assert.
    try {
      await engine.applyInterviewResult(plan.id, null, {
        answers: {
          q_days: { selectedDates: ['2026-05-01'] },
          q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 1, snack: 0 },
        },
        proposal: {
          days: [
            {
              date: '2026-05-01',
              meals: [
                {
                  type: 'dinner',
                  slots: [
                    { role: 'main', candidates: ['Greek Lamb Souvlaki'] },
                    { role: 'veg_side', candidates: ['Greek Lemon Zucchini'] },
                    { role: 'starch_side', candidates: ['Greek Lemon Rice'] },
                  ],
                },
              ],
            },
          ],
        },
        dayPresets: new Map(),
      })
    } catch (err) {
      // Expected: generatePlanAsync needs auth. Swallow.
      if (!String(err).includes('Not authenticated')) throw err
    }

    // After the call: the two side slots should have 'greek' in their notes.
    const meals = await db.meals.where('dayId').equals(day.id).toArray()
    const slots = await db.slots.where('mealId').equals(meals[0].id).sortBy('position')
    const sides = slots.filter((s) => s.role !== 'main')
    expect(sides.length).toBe(2)
    for (const s of sides) {
      // Either fully filled with greek envelope, or notes carry greek.
      const fromEnvelope = s.envelope?.cuisineId === 'greek'
      const fromNotes = parseUserHint(s.notes).cuisineId === 'greek'
      expect(fromEnvelope || fromNotes).toBe(true)
    }
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { MealPlanEngine } from '../MealPlanEngine'
import { __setMealEngineMock } from '../ai/client'
import { __resetSeedCache, seedSystemPresets } from '../presets/seedOnFirstRun'
import { pickWithDiversity, seededRng } from '../variety/picker'
import { CUISINES, PROTEINS } from '../variety/taxonomy'
import { parseUserHint, mergeEnvelope } from '../variety/precedence'
import type { SlotEnvelope } from '../variety/envelope'
import { scorePlan } from '../variety/score'

beforeEach(async () => {
  await db.delete()
  await db.open()
  __resetSeedCache()
  await seedSystemPresets()
  __setMealEngineMock(null)
})

describe('pickWithDiversity', () => {
  it('hard-bans the most recent N items', () => {
    const recent = ['mexican', 'thai', 'japanese', 'korean', 'cantonese']
    const pick = pickWithDiversity({
      pool: CUISINES,
      recentlyUsed: recent,
      banWindow: 5,
      decayWindow: 12,
      rng: seededRng(42),
    })
    expect(pick).not.toBeNull()
    expect(recent).not.toContain(pick!.id)
  })

  it('respects mustHaveTag filter (vegetarian)', () => {
    const pick = pickWithDiversity({
      pool: PROTEINS,
      mustHaveTag: ['vegetarian'],
      rng: seededRng(7),
    })
    expect(pick).not.toBeNull()
    expect(pick!.tags).toContain('vegetarian')
  })

  it('respects mustAvoidFamily filter', () => {
    const pick = pickWithDiversity({
      pool: PROTEINS,
      mustAvoidFamily: ['poultry', 'seafood'],
      rng: seededRng(17),
    })
    expect(pick).not.toBeNull()
    expect(['poultry', 'seafood']).not.toContain(pick!.family)
  })

  it('falls back to relaxed banWindow when no candidates remain', () => {
    // Ban every cuisine via banWindow
    const recent = CUISINES.map((c) => c.id)
    const pick = pickWithDiversity({
      pool: CUISINES,
      recentlyUsed: recent,
      banWindow: recent.length,
      decayWindow: recent.length + 5,
      rng: seededRng(1),
    })
    expect(pick).not.toBeNull()
  })
})

describe('parseUserHint', () => {
  it('extracts cuisine from natural language', () => {
    const hint = parseUserHint('make it Italian tonight')
    expect(hint.cuisineId).toBe('italian-northern' satisfies string)
  })

  it('extracts spice flavor from "less spicy"', () => {
    const hint = parseUserHint('less spicy please')
    expect(hint.flavorId).toBe('peppery-mild')
  })

  it('extracts protein from "use chicken"', () => {
    const hint = parseUserHint('use chicken instead')
    expect(hint.proteinFamily).toBe('poultry')
  })

  it('extracts hard-avoid items', () => {
    const hint = parseUserHint('no peanuts and no shellfish')
    expect(hint.hardAvoid?.some((s) => s.includes('peanut'))).toBe(true)
  })
})

describe('mergeEnvelope', () => {
  it('overrides cuisine when user names one', () => {
    const env: SlotEnvelope = {
      cuisineId: 'mexican',
      cuisineLabel: 'Mexican',
      cuisineRegion: 'latin-america',
      styleId: 'taco-wrap',
      styleLabel: 'Taco / wrap / handheld',
      flavorId: 'spicy-hot',
      flavorLabel: 'Spicy-hot',
      reasoning: '',
    }
    const merged = mergeEnvelope(env, parseUserHint('Italian tonight'))
    expect(merged.cuisineId).toBe('italian-northern')
    expect(merged.styleId).toBe('taco-wrap') // unchanged
  })

  it('preserves cuisine when user only changes flavor', () => {
    const env: SlotEnvelope = {
      cuisineId: 'thai',
      cuisineLabel: 'Thai',
      cuisineRegion: 'southeast-asia',
      styleId: 'curry',
      styleLabel: 'Curry',
      flavorId: 'spicy-hot',
      flavorLabel: 'Spicy-hot',
      reasoning: '',
    }
    const merged = mergeEnvelope(env, parseUserHint('less spicy'))
    expect(merged.cuisineId).toBe('thai')
    expect(merged.flavorId).toBe('peppery-mild')
  })
})

describe('Anti-Mediterranean seed', () => {
  it('seedSystemPresets seeds dishHistory with Mediterranean entries on first run', async () => {
    const count = await db.dishHistory.count()
    expect(count).toBeGreaterThan(0)
    const cuisines = (await db.dishHistory.toArray()).map((r) => r.cuisineId)
    // At least one of the four Med/ME cuisines should appear
    expect(cuisines.some((c) => ['greek', 'spanish-tapas', 'persian', 'israeli'].includes(c))).toBe(
      true,
    )
  })
})

describe('scorePlan returns sane defaults for empty plan', () => {
  it('reports 100% diversity when no slots exist', async () => {
    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const view = await engine.getPlan(plan.id)
    expect(view).not.toBeNull()
    const score = await scorePlan(view!)
    expect(score.totalSlots).toBe(0)
    expect(score.cuisineDiversity).toBe(1)
  })
})

describe('engine variety wiring', () => {
  it('writes dishHistory rows on Stage B success and includes envelope cuisineId', async () => {
    __setMealEngineMock(async (op) => {
      if (op === 'ingredient') return { ingredient: 'chicken thighs', rationale: '' }
      if (op === 'dish') return { dishName: 'Test dish', searchKeywords: ['test dish'] }
      if (op === 'find-recipe') {
        return {
          recipe: {
            title: 'Test',
            source: 'ai-fallback',
            ingredients: [{ item: 'chicken' }],
            steps: ['cook'],
          },
        }
      }
      throw new Error('?')
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const slot = await engine.addSlot(meal.id, 'main')

    await engine.generateSlot(slot.id)

    const final = await db.slots.get(slot.id)
    expect(final?.status).toBe('ready')
    expect(final?.envelope?.cuisineId).toBeTruthy()

    const history = await db.dishHistory.where('slotId').equals(slot.id).toArray()
    expect(history.length).toBe(1)
    expect(history[0].dishName).toBe('Test dish')
    expect(history[0].cuisineId).toBe(final?.envelope?.cuisineId)
  })

  it('replaceSlot drops the slot history row + clears envelope before regenerating', async () => {
    let dishCounter = 0
    __setMealEngineMock(async (op) => {
      if (op === 'ingredient') return { ingredient: 'salmon', rationale: '' }
      if (op === 'dish') {
        dishCounter++
        return { dishName: `Dish #${dishCounter}`, searchKeywords: [`dish ${dishCounter}`] }
      }
      if (op === 'find-recipe') {
        return {
          recipe: {
            title: `Dish #${dishCounter}`,
            source: 'ai-fallback',
            ingredients: [{ item: 'salmon' }],
            steps: ['cook'],
          },
        }
      }
      throw new Error('?')
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const slot = await engine.addSlot(meal.id, 'main')

    await engine.generateSlot(slot.id)
    const before = await db.dishHistory.where('slotId').equals(slot.id).toArray()
    expect(before.length).toBe(1)
    const firstName = before[0].dishName

    await engine.replaceSlot(slot.id, 'something different')

    const after = await db.dishHistory.where('slotId').equals(slot.id).toArray()
    expect(after.length).toBe(1) // exactly one (the new one)
    expect(after[0].dishName).not.toBe(firstName)
  })

  it('cancelSlot is safe to call when nothing is in flight', async () => {
    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const slot = await engine.addSlot(meal.id, 'main')
    // No generation in flight — cancelSlot should be a no-op.
    await engine.cancelSlot(slot.id)
    const after = await db.slots.get(slot.id)
    expect(after?.status).toBe('empty')
  })

  it('cancelSlot reverts a slot when the mock honors the abort signal', async () => {
    let aborted = false
    __setMealEngineMock(async (op) => {
      // Mock that throws AbortedByUserError if signal already aborted by the time it runs
      if (aborted) {
        const { AbortedByUserError } = await import('../errors')
        throw new AbortedByUserError()
      }
      if (op === 'ingredient') return { ingredient: 'tofu', rationale: '' }
      return {}
    })

    const engine = new MealPlanEngine()
    const plan = await engine.createPlan('2026-04-25')
    const day = await engine.addDay(plan.id, '2026-04-25')
    const meal = await engine.addMeal(day.id, 'dinner')
    const slot = await engine.addSlot(meal.id, 'main')

    // Pre-abort: kick off then cancel before the (synchronous) mock resolves.
    aborted = true
    const genPromise = engine.generateSlot(slot.id)
    await engine.cancelSlot(slot.id)
    await genPromise.catch(() => undefined)

    const after = await db.slots.get(slot.id)
    // Should be reverted to empty (start state) — not 'error'.
    expect(after?.status).toBe('empty')
    expect(after?.errorMessage).toBeUndefined()
  })
})

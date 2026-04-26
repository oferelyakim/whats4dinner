// Interview runtime tests (v2.0.0).
//
// Pure-function tests — no Dexie, no React, no Anthropic.

import { describe, it, expect } from 'vitest'
import {
  getNextQuestion,
  applyInferences,
  remainingQuestions,
  progressPercent,
} from '../runtime'
import type { AnswerMap } from '../types'
import type { IntakeParseResult } from '../../ai/schemas'

describe('runtime — getNextQuestion', () => {
  it('returns q_days first on an empty answer map', () => {
    const next = getNextQuestion({}, [])
    expect(next?.id).toBe('q_days')
  })

  it('returns q_meals_per_day after q_days is answered', () => {
    const a: AnswerMap = { q_days: { selectedDates: ['2026-04-27'] } }
    const next = getNextQuestion(a, [])
    expect(next?.id).toBe('q_meals_per_day')
  })

  it('returns q_freeform after q_days + q_meals_per_day', () => {
    const a: AnswerMap = {
      q_days: { selectedDates: ['2026-04-27'] },
      q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 3, snack: 0 },
    }
    expect(getNextQuestion(a, [])?.id).toBe('q_freeform')
  })

  it('skips q_dietary when on the skip-list', () => {
    const a: AnswerMap = {
      q_days: { selectedDates: ['2026-04-27'] },
      q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 3, snack: 0 },
      q_freeform: 'vegetarian dinner only',
      q_headcount: { adults: 2, kids: 0 },
      q_preset_per_day: {},
    }
    const next = getNextQuestion(a, ['q_dietary', 'q_dislikes'])
    expect(next?.id).toBe('q_prep_time')
  })

  it('returns q_review when all other questions are answered or skipped', () => {
    const a: AnswerMap = {
      q_days: { selectedDates: ['2026-04-27'] },
      q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 3, snack: 0 },
      q_freeform: 'simple week',
      q_headcount: { adults: 2, kids: 0 },
      q_preset_per_day: {},
      q_dietary: [],
      q_dislikes: [],
      q_prep_time: 30,
      q_calories: 'balanced',
      q_cooking_skill: 'easy',
      q_themes: [],
    }
    expect(getNextQuestion(a, [])?.id).toBe('q_review')
  })

  it('jumps straight to q_review when all skippables are on the skip-list', () => {
    const a: AnswerMap = {
      q_days: { selectedDates: ['2026-04-27'] },
      q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 3, snack: 0 },
      q_freeform: 'kitchen-sink description',
    }
    const fullSkip: ReadonlyArray<
      'q_headcount' | 'q_dietary' | 'q_dislikes' | 'q_prep_time' | 'q_calories'
      | 'q_cooking_skill' | 'q_themes' | 'q_preset_per_day'
    > = [
      'q_headcount', 'q_dietary', 'q_dislikes', 'q_prep_time',
      'q_calories', 'q_cooking_skill', 'q_themes', 'q_preset_per_day',
    ]
    expect(getNextQuestion(a, fullSkip)?.id).toBe('q_review')
  })
})

describe('runtime — applyInferences', () => {
  it('seeds skipped questions with inferred values from parse result', () => {
    const parsed: IntakeParseResult = {
      skip: ['q_dietary', 'q_headcount'],
      prefill: {
        diets: ['vegetarian'],
        dislikes: [],
        themes: [],
        headcountAdults: 4,
        headcountKids: 1,
      },
    }
    const a: AnswerMap = { q_days: { selectedDates: ['2026-04-27'] } }
    const out = applyInferences(a, parsed)
    expect(out.q_dietary).toEqual(['vegetarian'])
    expect(out.q_headcount).toEqual({ adults: 4, kids: 1 })
    // unrelated questions stay undefined so the runtime can ask them
    expect(out.q_dislikes).toBeUndefined()
  })

  it('does not overwrite an answer the user already gave', () => {
    const parsed: IntakeParseResult = {
      skip: ['q_dietary'],
      prefill: { diets: ['vegan'], dislikes: [], themes: [] },
    }
    const a: AnswerMap = { q_dietary: ['vegetarian'] }
    const out = applyInferences(a, parsed)
    expect(out.q_dietary).toEqual(['vegetarian'])
  })

  it('seeds q_themes from parse-intake even when not yet on skip-list', () => {
    const parsed: IntakeParseResult = {
      skip: ['q_themes'],
      prefill: { diets: [], dislikes: [], themes: ['taco-tuesday', 'pizza-friday'] },
    }
    const out = applyInferences({}, parsed)
    expect(out.q_themes).toEqual(['taco-tuesday', 'pizza-friday'])
  })

  it('infers q_preset_per_day from selected days + themes (Monday→meatless, Tuesday→taco)', () => {
    const parsed: IntakeParseResult = {
      skip: ['q_themes', 'q_preset_per_day'],
      prefill: { diets: [], dislikes: [], themes: ['meatless-monday', 'taco-tuesday'] },
    }
    const a: AnswerMap = {
      q_days: { selectedDates: ['2026-04-27', '2026-04-28', '2026-04-29'] }, // Mon, Tue, Wed
    }
    const out = applyInferences(a, parsed)
    expect(out.q_preset_per_day).toEqual({
      '2026-04-27': 'sys-day-meatless-monday',
      '2026-04-28': 'sys-day-taco-tuesday',
      '2026-04-29': null,
    })
  })

  it('seeds from circleDefaults when the question has defaultFrom: circle_context', () => {
    const out = applyInferences(
      {},
      null,
      { q_dietary: ['gluten-free'], q_cooking_skill: 'easy' },
    )
    expect(out.q_dietary).toEqual(['gluten-free'])
    expect(out.q_cooking_skill).toEqual('easy')
  })
})

describe('runtime — remainingQuestions / progressPercent', () => {
  it('counts down as questions get answered', () => {
    const total = remainingQuestions({}, [])
    expect(total).toBeGreaterThan(0)
    const after1 = remainingQuestions(
      { q_days: { selectedDates: ['2026-04-27'] } },
      [],
    )
    expect(after1).toBe(total - 1)
  })

  it('counts skipped questions as resolved', () => {
    const baseline = remainingQuestions({}, [])
    const skipped = remainingQuestions({}, ['q_dietary', 'q_dislikes'])
    expect(skipped).toBe(baseline - 2)
  })

  it('progressPercent reaches ~100 when all but review is resolved', () => {
    const a: AnswerMap = {
      q_days: { selectedDates: ['2026-04-27'] },
      q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 3, snack: 0 },
      q_freeform: 'simple',
      q_headcount: { adults: 2, kids: 0 },
      q_preset_per_day: {},
      q_dietary: [],
      q_dislikes: [],
      q_prep_time: 30,
      q_calories: 'balanced',
      q_cooking_skill: 'easy',
      q_themes: [],
    }
    expect(progressPercent(a, [])).toBe(100)
  })
})

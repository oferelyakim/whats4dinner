// Event Planner v2 — picker tests.
//
// Covers the deterministic question tree: condition predicates, priority
// ordering, skip inferences, and transition to `proposing` when nothing
// is left to ask.

import { describe, it, expect } from 'vitest'
import {
  QUESTIONS,
  defaultForQuestion,
  getNextQuestion,
  getQuestion,
  inferSkippedValue,
} from '../questions'
import type { AnswerMap } from '../types'

describe('getNextQuestion — picker', () => {
  it('asks archetype first when nothing is answered', () => {
    const r = getNextQuestion({})
    expect(r.question?.id).toBe('archetype')
  })

  it('returns the highest-priority eligible question after archetype', () => {
    const r = getNextQuestion({ archetype: 'family-dinner' })
    // priority 95 = date_time, 90 = duration, etc. — date_time wins.
    expect(r.question?.id).toBe('date_time')
  })

  it('honors condition predicates — kid_age_band only when kids > 0', () => {
    // No kids → kid_age_band must NOT be eligible.
    const noKids: AnswerMap = {
      archetype: 'family-dinner',
      headcount_adults: 8,
      headcount_kids: 0,
      venue: 'indoor',
      date_time: { date: '2026-05-15' },
      duration_hours: '3',
      budget_tier: 'modest',
      food_style: 'host-cooks',
    }
    const next1 = getNextQuestion(noKids)
    expect(next1.question?.id).not.toBe('kid_age_band')

    // With kids → kid_age_band IS eligible (priority 75 — wins over photo_keepsake).
    const withKids: AnswerMap = { ...noKids, headcount_kids: 4 }
    const next2 = getNextQuestion(withKids)
    expect(next2.question?.id).toBe('kid_age_band')
  })

  it('parking_seating only surfaces at headcount >= 25', () => {
    const small: AnswerMap = {
      archetype: 'birthday',
      headcount_adults: 8,
      headcount_kids: 4,
      venue: 'indoor',
      kid_age_band: 'mixed',
      date_time: { date: '2026-05-15' },
      duration_hours: '3',
      budget_tier: 'modest',
      food_style: 'host-cooks',
      special_guest: ['none'],
      photo_keepsake: true,
      kid_activities: ['craft-station'],
      dietary_mix: [],
      helpers_count: 1,
      setup_window: '1h',
    }
    expect(QUESTIONS.find((q) => q.id === 'parking_seating')?.condition?.(small)).toBe(false)

    const large: AnswerMap = { ...small, headcount_adults: 30 }
    expect(QUESTIONS.find((q) => q.id === 'parking_seating')?.condition?.(large)).toBe(true)
  })

  it('rain_plan only surfaces for outdoor / both venues', () => {
    const indoor: AnswerMap = { archetype: 'birthday', venue: 'indoor' }
    const outdoor: AnswerMap = { archetype: 'picnic', venue: 'outdoor' }
    const both: AnswerMap = { archetype: 'birthday', venue: 'both' }
    const cond = QUESTIONS.find((q) => q.id === 'rain_plan')?.condition!
    expect(cond(indoor)).toBe(false)
    expect(cond(outdoor)).toBe(true)
    expect(cond(both)).toBe(true)
  })

  it('av_setup only surfaces with band/dj/speaker special guests', () => {
    const cond = QUESTIONS.find((q) => q.id === 'av_setup')?.condition!
    expect(cond({ special_guest: ['none'] })).toBe(false)
    expect(cond({ special_guest: ['photographer'] })).toBe(false)
    expect(cond({ special_guest: ['local-band'] })).toBe(true)
    expect(cond({ special_guest: ['dj', 'photographer'] })).toBe(true)
    expect(cond({ special_guest: ['speaker'] })).toBe(true)
  })

  it('travel_lodging only for reunion + headcount >= 12', () => {
    const cond = QUESTIONS.find((q) => q.id === 'travel_lodging')?.condition!
    expect(cond({ archetype: 'family-dinner', headcount_adults: 30 })).toBe(false)
    expect(cond({ archetype: 'reunion', headcount_adults: 8 })).toBe(false)
    expect(cond({ archetype: 'reunion', headcount_adults: 12 })).toBe(true)
    expect(
      cond({ archetype: 'reunion', headcount_adults: 5, headcount_kids: 8 }),
    ).toBe(true)
  })

  it('special_guest hidden for family-dinner archetype', () => {
    const cond = QUESTIONS.find((q) => q.id === 'special_guest')?.condition!
    expect(cond({ archetype: 'family-dinner', headcount_adults: 20 })).toBe(false)
    expect(cond({ archetype: 'birthday', headcount_adults: 20 })).toBe(true)
  })

  it('returns null when every eligible question is answered', () => {
    // Walk a happy-path simulation: a small family dinner.
    const answers: AnswerMap = {}
    answers.archetype = 'family-dinner'
    answers.date_time = { date: '2026-05-15' }
    answers.duration_hours = '3'
    answers.headcount_adults = 8
    answers.headcount_kids = 0
    answers.venue = 'indoor'
    answers.budget_tier = 'modest'
    answers.food_style = 'host-cooks'
    answers.dietary_mix = []
    answers.helpers_count = 1
    answers.setup_window = '1h'

    const r = getNextQuestion(answers)
    expect(r.question).toBe(null)
    expect(r.remaining).toBe(0)
  })

  it('100-person picnic with bouncy-house + band + chef → unlocks logistics chain', () => {
    // Verifying the spec's headline scenario: every conditional question is
    // eligible at some point during this flow.
    let answers: AnswerMap = {
      archetype: 'picnic',
      headcount_adults: 100,
      headcount_kids: 12,
      venue: 'outdoor',
      kid_age_band: 'mixed',
    }

    // Verify each conditional question is eligible at this point.
    const eligibleNow = new Set(
      QUESTIONS.filter((q) => !q.condition || q.condition(answers)).map((q) => q.id),
    )
    expect(eligibleNow.has('kid_age_band')).toBe(true)
    expect(eligibleNow.has('rain_plan')).toBe(true)
    expect(eligibleNow.has('parking_seating')).toBe(true)
    expect(eligibleNow.has('kid_activities')).toBe(true)
    expect(eligibleNow.has('tent_canopy')).toBe(true)
    // Don't expect special_guest for picnic until the user adds them; archetype check is satisfied.
    expect(eligibleNow.has('special_guest')).toBe(true)

    // Add band + chef.
    answers = { ...answers, special_guest: ['local-band', 'guest-chef'] }
    const after = new Set(
      QUESTIONS.filter((q) => !q.condition || q.condition(answers)).map((q) => q.id),
    )
    expect(after.has('av_setup')).toBe(true)

    // Travel lodging is reunion-only — must stay hidden for picnic.
    expect(after.has('travel_lodging')).toBe(false)
  })

  it('inference-on-skip: picnic with 30 adults → tent inferred', () => {
    const answers: AnswerMap = {
      archetype: 'picnic',
      venue: 'outdoor',
      headcount_adults: 30,
    }
    const q = getQuestion('rain_plan')!
    expect(inferSkippedValue(q, answers)).toBe('tent')
  })

  it('inference-on-skip: small outdoor → move_indoor inferred', () => {
    const answers: AnswerMap = {
      archetype: 'family-dinner',
      venue: 'outdoor',
      headcount_adults: 8,
    }
    const q = getQuestion('rain_plan')!
    expect(inferSkippedValue(q, answers)).toBe('move_indoor')
  })

  it('defaultFrom: family-dinner pre-fills 3h duration + indoor + 8 adults', () => {
    const a: AnswerMap = { archetype: 'family-dinner' }
    expect(defaultForQuestion(getQuestion('duration_hours')!, a)).toBe('3')
    expect(defaultForQuestion(getQuestion('venue')!, a)).toBe('indoor')
    expect(defaultForQuestion(getQuestion('headcount_adults')!, {})).toBe(8)
  })

  it('defaultFrom: large headcount pre-fills catered food style', () => {
    const a: AnswerMap = { archetype: 'birthday', headcount_adults: 60 }
    expect(defaultForQuestion(getQuestion('food_style')!, a)).toBe('catered')
  })

  it('defaultFrom: special_guest=guest-chef → food_style=guest-chef', () => {
    const a: AnswerMap = { archetype: 'holiday', special_guest: ['guest-chef'] }
    expect(defaultForQuestion(getQuestion('food_style')!, a)).toBe('guest-chef')
  })

  it('priority order is stable: archetype (100) > date_time (95) > duration (90) > adults (88) > kids (86) > venue (84) > budget (80)', () => {
    // Sanity: the first 7 questions in any flow follow this priority chain.
    let answers: AnswerMap = {}
    const order = []
    for (let i = 0; i < 7; i++) {
      const r = getNextQuestion(answers)
      if (!r.question) break
      order.push(r.question.id)
      // Provide a dummy answer so the picker advances.
      answers = { ...answers, [r.question.id]: dummyValueFor(r.question.id) }
    }
    expect(order).toEqual([
      'archetype',
      'date_time',
      'duration_hours',
      'headcount_adults',
      'headcount_kids',
      'venue',
      'budget_tier',
    ])
  })

  it('no question is reaskable in this version (v1 invariant)', () => {
    expect(QUESTIONS.every((q) => !q.reaskable)).toBe(true)
  })

  it('every question with options has a non-empty option list', () => {
    for (const q of QUESTIONS) {
      if (q.kind === 'chips' || q.kind === 'multi') {
        expect(q.options?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })
})

function dummyValueFor(id: string) {
  // Return a value that satisfies the picker's "answered = present" rule.
  if (id === 'archetype') return 'family-dinner'
  if (id === 'date_time') return { date: '2026-05-15' }
  if (id === 'duration_hours') return '3'
  if (id === 'headcount_adults') return 8
  if (id === 'headcount_kids') return 0
  if (id === 'venue') return 'indoor'
  if (id === 'budget_tier') return 'modest'
  if (id === 'food_style') return 'host-cooks'
  if (id === 'dietary_mix') return []
  if (id === 'helpers_count') return 1
  if (id === 'setup_window') return '1h'
  return 'placeholder'
}

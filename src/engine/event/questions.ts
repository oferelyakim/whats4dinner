// Event Planner v2 — master question tree.
//
// One declarative tree that branches via per-question `condition` predicates.
// The picker (./picker.ts) walks this list, filters by condition, drops
// already-answered ids, and returns the next eligible question by priority.
//
// Adding a new question = append a row here. Adding a new archetype = add
// it to ARCHETYPES in types.ts; existing predicates already reference the
// `archetype` answer.
//
// All prompts are referenced via i18n keys that live in src/lib/i18n.ts
// under the `event.planner.q.*` namespace.

import type { AnswerMap, AnswerValue, Predicate, Question } from './types'

// ─── Helpers ───────────────────────────────────────────────────────────────

const has = (a: AnswerMap, id: string) => a[id] !== undefined && a[id] !== null
const num = (a: AnswerMap, id: string, fallback = 0): number => {
  const v = a[id]
  return typeof v === 'number' ? v : fallback
}
const str = (a: AnswerMap, id: string, fallback = ''): string => {
  const v = a[id]
  return typeof v === 'string' ? v : fallback
}
const list = (a: AnswerMap, id: string): string[] => {
  const v = a[id]
  return Array.isArray(v) ? (v as string[]) : []
}

const HEADCOUNT_TOTAL = (a: AnswerMap) => num(a, 'headcount_adults') + num(a, 'headcount_kids')
const VENUE = (a: AnswerMap) => str(a, 'venue')
const ARCHETYPE = (a: AnswerMap) => str(a, 'archetype')

const not = (p: Predicate): Predicate => (a) => !p(a)
const and = (...ps: Predicate[]): Predicate => (a) => ps.every((p) => p(a))
const or = (...ps: Predicate[]): Predicate => (a) => ps.some((p) => p(a))

// ─── Question catalog ──────────────────────────────────────────────────────

export const QUESTIONS: Question[] = [
  // ── Identity ────────────────────────────────────────────────────────────
  {
    id: 'archetype',
    kind: 'chips',
    promptKey: 'event.planner.q.archetype',
    helpKey: 'event.planner.q.archetype.help',
    options: [
      { value: 'family-dinner', labelKey: 'event.planner.archetype.family-dinner' },
      { value: 'holiday', labelKey: 'event.planner.archetype.holiday' },
      { value: 'reunion', labelKey: 'event.planner.archetype.reunion' },
      { value: 'birthday', labelKey: 'event.planner.archetype.birthday' },
      { value: 'potluck', labelKey: 'event.planner.archetype.potluck' },
      { value: 'picnic', labelKey: 'event.planner.archetype.picnic' },
      { value: 'housewarming', labelKey: 'event.planner.archetype.housewarming' },
      { value: 'activity-day', labelKey: 'event.planner.archetype.activity-day' },
      { value: 'other', labelKey: 'event.planner.archetype.other' },
    ],
    priority: 100,
    required: true,
  },

  // ── Foundations (always shown, smart defaults) ──────────────────────────
  {
    id: 'date_time',
    kind: 'datetime',
    promptKey: 'event.planner.q.date_time',
    priority: 95,
    inferenceWhenSkipped: () => null,
  },
  {
    id: 'duration_hours',
    kind: 'chips',
    promptKey: 'event.planner.q.duration',
    options: [
      { value: '2', labelKey: 'event.planner.duration.2h' },
      { value: '3', labelKey: 'event.planner.duration.3h' },
      { value: '4', labelKey: 'event.planner.duration.4h' },
      { value: '6', labelKey: 'event.planner.duration.6h' },
      { value: '8', labelKey: 'event.planner.duration.allday' },
    ],
    priority: 90,
    defaultFrom: (a) => {
      const t = ARCHETYPE(a)
      if (t === 'family-dinner' || t === 'potluck' || t === 'birthday') return '3'
      if (t === 'picnic' || t === 'activity-day') return '4'
      if (t === 'reunion') return '8'
      return '3'
    },
    inferenceWhenSkipped: (a) => {
      const t = ARCHETYPE(a)
      if (t === 'reunion') return '6'
      return '3'
    },
  },
  {
    id: 'headcount_adults',
    kind: 'slider',
    promptKey: 'event.planner.q.headcount_adults',
    min: 1,
    max: 200,
    step: 1,
    priority: 88,
    defaultFrom: () => 8,
    inferenceWhenSkipped: () => 8,
  },
  {
    id: 'headcount_kids',
    kind: 'slider',
    promptKey: 'event.planner.q.headcount_kids',
    min: 0,
    max: 100,
    step: 1,
    priority: 86,
    defaultFrom: (a) => {
      const t = ARCHETYPE(a)
      if (t === 'birthday' || t === 'reunion' || t === 'activity-day') return 4
      return 0
    },
    inferenceWhenSkipped: () => 0,
  },
  {
    id: 'venue',
    kind: 'chips',
    promptKey: 'event.planner.q.venue',
    options: [
      { value: 'indoor', labelKey: 'event.planner.venue.indoor' },
      { value: 'outdoor', labelKey: 'event.planner.venue.outdoor' },
      { value: 'both', labelKey: 'event.planner.venue.both' },
    ],
    priority: 84,
    defaultFrom: (a) => {
      const t = ARCHETYPE(a)
      if (t === 'picnic') return 'outdoor'
      if (t === 'family-dinner' || t === 'housewarming' || t === 'potluck') return 'indoor'
      return undefined
    },
    inferenceWhenSkipped: () => 'indoor',
  },
  {
    id: 'budget_tier',
    kind: 'chips',
    promptKey: 'event.planner.q.budget_tier',
    helpKey: 'event.planner.q.budget_tier.help',
    options: [
      { value: 'shoestring', labelKey: 'event.planner.budget.shoestring' },
      { value: 'modest', labelKey: 'event.planner.budget.modest' },
      { value: 'comfortable', labelKey: 'event.planner.budget.comfortable' },
      { value: 'premium', labelKey: 'event.planner.budget.premium' },
    ],
    priority: 80,
    defaultFrom: (a) => {
      if (HEADCOUNT_TOTAL(a) > 60) return 'comfortable'
      return 'modest'
    },
    inferenceWhenSkipped: () => 'modest',
  },

  // ── People (conditional) ────────────────────────────────────────────────
  {
    id: 'kid_age_band',
    kind: 'chips',
    promptKey: 'event.planner.q.kid_age_band',
    options: [
      { value: 'toddler', labelKey: 'event.planner.kid_age.toddler' },
      { value: 'young', labelKey: 'event.planner.kid_age.young' },
      { value: 'tween', labelKey: 'event.planner.kid_age.tween' },
      { value: 'mixed', labelKey: 'event.planner.kid_age.mixed' },
    ],
    condition: (a) => num(a, 'headcount_kids') > 0,
    priority: 75,
    inferenceWhenSkipped: () => 'mixed',
  },
  {
    id: 'mobility_needs',
    kind: 'confirm',
    promptKey: 'event.planner.q.mobility_needs',
    condition: (a) => ARCHETYPE(a) === 'reunion' || ARCHETYPE(a) === 'holiday',
    priority: 70,
    inferenceWhenSkipped: () => false,
  },
  {
    id: 'dietary_mix',
    kind: 'multi',
    promptKey: 'event.planner.q.dietary_mix',
    helpKey: 'event.planner.q.dietary_mix.help',
    options: [
      { value: 'vegetarian', labelKey: 'event.planner.diet.vegetarian' },
      { value: 'vegan', labelKey: 'event.planner.diet.vegan' },
      { value: 'gluten-free', labelKey: 'event.planner.diet.gluten-free' },
      { value: 'kosher', labelKey: 'event.planner.diet.kosher' },
      { value: 'halal', labelKey: 'event.planner.diet.halal' },
      { value: 'nut-free', labelKey: 'event.planner.diet.nut-free' },
      { value: 'dairy-free', labelKey: 'event.planner.diet.dairy-free' },
    ],
    priority: 68,
    condition: (a) => str(a, 'food_style') !== 'no-food',
    inferenceWhenSkipped: () => [],
  },
  {
    id: 'special_guest',
    kind: 'multi',
    promptKey: 'event.planner.q.special_guest',
    helpKey: 'event.planner.q.special_guest.help',
    options: [
      { value: 'guest-chef', labelKey: 'event.planner.guest.chef' },
      { value: 'local-band', labelKey: 'event.planner.guest.band' },
      { value: 'dj', labelKey: 'event.planner.guest.dj' },
      { value: 'photographer', labelKey: 'event.planner.guest.photographer' },
      { value: 'magician', labelKey: 'event.planner.guest.magician' },
      { value: 'speaker', labelKey: 'event.planner.guest.speaker' },
      { value: 'none', labelKey: 'event.planner.guest.none' },
    ],
    priority: 65,
    condition: (a) => HEADCOUNT_TOTAL(a) >= 8 && ARCHETYPE(a) !== 'family-dinner',
    inferenceWhenSkipped: () => ['none'],
  },

  // ── Vibe & Style ────────────────────────────────────────────────────────
  {
    id: 'food_style',
    kind: 'chips',
    promptKey: 'event.planner.q.food_style',
    options: [
      { value: 'host-cooks', labelKey: 'event.planner.food.host_cooks' },
      { value: 'potluck', labelKey: 'event.planner.food.potluck' },
      { value: 'catered', labelKey: 'event.planner.food.catered' },
      { value: 'guest-chef', labelKey: 'event.planner.food.guest_chef' },
      { value: 'mixed', labelKey: 'event.planner.food.mixed' },
      { value: 'no-food', labelKey: 'event.planner.food.none' },
    ],
    priority: 64,
    defaultFrom: (a) => {
      if (ARCHETYPE(a) === 'potluck') return 'potluck'
      if (HEADCOUNT_TOTAL(a) > 40) return 'catered'
      if (list(a, 'special_guest').includes('guest-chef')) return 'guest-chef'
      return 'host-cooks'
    },
    inferenceWhenSkipped: () => 'host-cooks',
  },
  {
    id: 'photo_keepsake',
    kind: 'confirm',
    promptKey: 'event.planner.q.photo_keepsake',
    condition: (a) =>
      ['reunion', 'holiday', 'birthday', 'housewarming'].includes(ARCHETYPE(a)),
    priority: 60,
    defaultFrom: (a) => ARCHETYPE(a) === 'reunion' || ARCHETYPE(a) === 'birthday',
    inferenceWhenSkipped: (a) => ARCHETYPE(a) === 'reunion',
  },

  // ── Conditional logistics ───────────────────────────────────────────────
  {
    id: 'rain_plan',
    kind: 'chips',
    promptKey: 'event.planner.q.rain_plan',
    options: [
      { value: 'tent', labelKey: 'event.planner.rain.tent' },
      { value: 'move_indoor', labelKey: 'event.planner.rain.move_indoor' },
      { value: 'reschedule', labelKey: 'event.planner.rain.reschedule' },
      { value: 'rain_or_shine', labelKey: 'event.planner.rain.rain_or_shine' },
    ],
    condition: (a) => VENUE(a) === 'outdoor' || VENUE(a) === 'both',
    priority: 58,
    inferenceWhenSkipped: (a) => (HEADCOUNT_TOTAL(a) > 25 ? 'tent' : 'move_indoor'),
  },
  {
    id: 'parking_seating',
    kind: 'multi',
    promptKey: 'event.planner.q.parking_seating',
    options: [
      { value: 'parking_tight', labelKey: 'event.planner.logistics.parking_tight' },
      { value: 'need_extra_seating', labelKey: 'event.planner.logistics.need_extra_seating' },
      { value: 'need_tables', labelKey: 'event.planner.logistics.need_tables' },
      { value: 'need_restrooms', labelKey: 'event.planner.logistics.need_restrooms' },
    ],
    condition: (a) => HEADCOUNT_TOTAL(a) >= 25,
    priority: 56,
    inferenceWhenSkipped: () => [],
  },
  {
    id: 'kid_activities',
    kind: 'multi',
    promptKey: 'event.planner.q.kid_activities',
    helpKey: 'event.planner.q.kid_activities.help',
    options: [
      { value: 'magician', labelKey: 'event.planner.kidact.magician' },
      { value: 'balloon-artist', labelKey: 'event.planner.kidact.balloon' },
      { value: 'bouncy-house', labelKey: 'event.planner.kidact.bouncy' },
      { value: 'face-painting', labelKey: 'event.planner.kidact.face' },
      { value: 'treasure-hunt', labelKey: 'event.planner.kidact.treasure' },
      { value: 'craft-station', labelKey: 'event.planner.kidact.craft' },
      { value: 'pinata', labelKey: 'event.planner.kidact.pinata' },
    ],
    condition: (a) => num(a, 'headcount_kids') >= 3,
    priority: 55,
    inferenceWhenSkipped: () => [],
  },
  {
    id: 'av_setup',
    kind: 'confirm',
    promptKey: 'event.planner.q.av_setup',
    condition: (a) => {
      const guests = list(a, 'special_guest')
      return (
        guests.includes('local-band') ||
        guests.includes('dj') ||
        guests.includes('speaker')
      )
    },
    priority: 52,
    defaultFrom: () => true,
    inferenceWhenSkipped: () => true,
  },
  {
    id: 'travel_lodging',
    kind: 'chips',
    promptKey: 'event.planner.q.travel_lodging',
    options: [
      { value: 'no_overnight', labelKey: 'event.planner.travel.no_overnight' },
      { value: 'host_some', labelKey: 'event.planner.travel.host_some' },
      { value: 'hotel_block', labelKey: 'event.planner.travel.hotel_block' },
    ],
    condition: (a) => ARCHETYPE(a) === 'reunion' && HEADCOUNT_TOTAL(a) >= 12,
    priority: 50,
    inferenceWhenSkipped: () => 'host_some',
  },

  // ── Equipment ───────────────────────────────────────────────────────────
  {
    id: 'tent_canopy',
    kind: 'confirm',
    promptKey: 'event.planner.q.tent_canopy',
    condition: (a) =>
      (VENUE(a) === 'outdoor' || VENUE(a) === 'both') && HEADCOUNT_TOTAL(a) >= 25,
    priority: 48,
    defaultFrom: () => true,
    inferenceWhenSkipped: () => true,
  },
  {
    id: 'power_ice',
    kind: 'confirm',
    promptKey: 'event.planner.q.power_ice',
    condition: (a) =>
      VENUE(a) === 'outdoor' &&
      (str(a, 'food_style') !== 'no-food' || list(a, 'kid_activities').includes('bouncy-house')),
    priority: 46,
    defaultFrom: () => true,
    inferenceWhenSkipped: () => true,
  },

  // ── Always last ─────────────────────────────────────────────────────────
  {
    id: 'helpers_count',
    kind: 'slider',
    promptKey: 'event.planner.q.helpers_count',
    helpKey: 'event.planner.q.helpers_count.help',
    min: 0,
    max: 10,
    step: 1,
    priority: 30,
    defaultFrom: (a) => Math.min(4, Math.max(1, Math.floor(HEADCOUNT_TOTAL(a) / 12))),
    inferenceWhenSkipped: () => 1,
  },
  {
    id: 'setup_window',
    kind: 'chips',
    promptKey: 'event.planner.q.setup_window',
    options: [
      { value: '30m', labelKey: 'event.planner.setup.30m' },
      { value: '1h', labelKey: 'event.planner.setup.1h' },
      { value: '2h', labelKey: 'event.planner.setup.2h' },
      { value: 'half_day', labelKey: 'event.planner.setup.half_day' },
    ],
    priority: 28,
    defaultFrom: (a) => (HEADCOUNT_TOTAL(a) >= 25 ? '2h' : '1h'),
    inferenceWhenSkipped: () => '1h',
  },
]

// ─── Picker ────────────────────────────────────────────────────────────────

export interface PickResult {
  /** The next question to ask, or null when the planner can transition to
   *  `proposing`. */
  question: Question | null
  /** Helpful for tests + UI: how many eligible questions remain after this. */
  remaining: number
}

/**
 * Returns the next question to ask given the current answers.
 *
 *  1. Filter to questions whose `condition` evaluates true (or has no condition)
 *  2. Drop ones already answered (unless `reaskable`)
 *  3. Sort by priority desc — higher-priority questions unlock more downstream branches
 *  4. Return the head; null when nothing is eligible
 */
export function getNextQuestion(answers: AnswerMap): PickResult {
  const eligible = QUESTIONS.filter((q) => {
    if (!q.reaskable && answers[q.id] !== undefined) return false
    if (q.condition && !q.condition(answers)) return false
    return true
  }).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  if (eligible.length === 0) return { question: null, remaining: 0 }
  return { question: eligible[0], remaining: eligible.length - 1 }
}

/** Lookup by id — used by the engine when restoring a draft. */
export function getQuestion(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id)
}

/** Apply skip inferences — returns the value to write, or undefined to leave blank. */
export function inferSkippedValue(q: Question, answers: AnswerMap): AnswerValue | undefined {
  if (!q.inferenceWhenSkipped) return undefined
  return q.inferenceWhenSkipped(answers)
}

/** Pre-fill a question from current answers (circle context, NLU). */
export function defaultForQuestion(q: Question, answers: AnswerMap): AnswerValue | undefined {
  if (!q.defaultFrom) return undefined
  return q.defaultFrom(answers)
}

// Internals exported for tests
export const __test = { has, num, str, list, HEADCOUNT_TOTAL, VENUE, ARCHETYPE, not, and, or }

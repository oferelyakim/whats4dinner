// Event Planner v2 — types
//
// Architecture mirrors src/engine/MealPlanEngine: a small state machine over
// a deterministic question tree. AI is only invoked at intake (free-text NLU),
// at proposal time, and on revise. Everything else is pure data.

export const ARCHETYPES = [
  'family-dinner',
  'holiday',
  'reunion',
  'birthday',
  'potluck',
  'picnic',
  'housewarming',
  'activity-day',
  'other',
] as const

export type Archetype = (typeof ARCHETYPES)[number]

export type Phase =
  | 'intake'
  | 'questionnaire'
  | 'proposing'
  | 'proposal'
  | 'applying'
  | 'applied'
  | 'error'

export type QuestionKind =
  | 'chips' // single-select pill row
  | 'multi' // multi-select pills
  | 'slider' // numeric range with single value
  | 'datetime' // date + optional time
  | 'text' // short free text
  | 'long-text' // multi-line free text
  | 'confirm' // yes/no with default

/** A specific catalog row reference (used by the activities multi-select). */
export interface CatalogChoice {
  slug: string
  name: string
}

export type AnswerValue =
  | string
  | string[]
  | number
  | boolean
  | { date: string; time?: string | null }
  | CatalogChoice[]
  | null

/** What we've gathered so far. Keys match Question.id values. */
export interface AnswerMap {
  [questionId: string]: AnswerValue | undefined
}

/** Predicate evaluated against the current AnswerMap. */
export type Predicate = (answers: AnswerMap) => boolean

/** Inference applied when the user skips a question. */
export type Inference = (answers: AnswerMap) => AnswerValue | undefined

/** Source of an answer — used to discard inferences when free text changes. */
export type AnswerSource = 'user' | 'inferred' | 'circle-context' | 'nlu'

export interface AnsweredEntry {
  value: AnswerValue
  source: AnswerSource
  at: number
}

export interface AnswerLog {
  [questionId: string]: AnsweredEntry
}

export interface QuestionOption {
  /** Stable value written into the answer. */
  value: string
  /** i18n key for the label. Falls back to value if missing. */
  labelKey: string
  /** Optional description shown beneath the chip. */
  hintKey?: string
  /** When picked, also pre-fill these other answers (light NLU shortcut). */
  triggers?: AnswerMap
}

export interface Question {
  /** Stable id; written into AnswerMap. */
  id: string
  /** UI hint. */
  kind: QuestionKind
  /** i18n key for the question prompt. */
  promptKey: string
  /** Optional helper line shown under the prompt. */
  helpKey?: string
  /** When evaluated true, the question is eligible. Default: always. */
  condition?: Predicate
  /** Static options for chips/multi. */
  options?: QuestionOption[]
  /** Numeric range when kind === 'slider'. */
  min?: number
  max?: number
  step?: number
  /** Pre-fill from current answers (e.g. circle context, NLU). */
  defaultFrom?: (answers: AnswerMap) => AnswerValue | undefined
  /** Inferred value if the user skips. */
  inferenceWhenSkipped?: Inference
  /** Higher-priority questions are picked first when multiple are eligible. */
  priority?: number
  /** When false, the question can be skipped via a "Skip" button. */
  required?: boolean
  /** Allow the question to surface even after the user already answered it
   *  (used for confirmation steps). Default false. */
  reaskable?: boolean
}

/** State machine root. Persisted into events.questionnaire jsonb. */
export interface PlannerState {
  eventId: string
  phase: Phase
  archetype: Archetype | null
  answers: AnswerLog
  /** Free-text intake — keeps the original prose for re-NLU. */
  freeText: string
  /** Most recent error if any (for the 'error' phase). */
  errorMessage?: string
  /** When set, the next refresh will resume into this question. */
  pendingQuestionId?: string | null
  startedAt: number
  updatedAt: number
}

export interface PlanItem {
  /** Stable client id; we apply by mapping to event_items rows. */
  id: string
  type: 'dish' | 'supply' | 'task'
  name: string
  category?: string | null
  quantity?: number | null
  /** Free-form notes — used for activity prefix `[Activity]` etc. */
  notes?: string | null
  /** Timeline window string for tasks: "4 weeks before", "day-of", etc. */
  dueWhen?: string | null
  /** Whether guests can claim this from the EventDetailPage UI. */
  claimable?: boolean
  /** Where this item came from. */
  source: 'catalog' | 'ai' | 'fallback' | 'user-edit'
  /** Sort hint within its type — applied as event_items.sort_order. */
  position?: number
}

export interface DraftPlan {
  items: PlanItem[]
  timelineSummary?: string
  /** Optional one-question follow-up the AI raised. Engine surfaces it as a
   *  "the AI wasn't sure about X" banner on the review screen. */
  clarifyingQuestion?: string | null
  /** True when the engine fell back to a deterministic catalog-only plan. */
  fallback?: boolean
  generatedAt: number
}

/** Public engine event payloads. */
export type EventEngineEvent =
  | { type: 'state'; state: PlannerState }
  | { type: 'next-question'; questionId: string | null }
  | { type: 'plan'; plan: DraftPlan }
  | { type: 'error'; stage: 'intake' | 'propose' | 'revise' | 'apply'; message: string }

/** Helpers exposed for tests. */
export interface AnswerHelpers {
  getValue: (id: string) => AnswerValue | undefined
  getNumber: (id: string, fallback?: number) => number
  getString: (id: string, fallback?: string) => string
  getStringList: (id: string) => string[]
  getBool: (id: string, fallback?: boolean) => boolean
}

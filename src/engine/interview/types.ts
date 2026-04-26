// Meal-Planner Interview — declarative question tree types (v2.0.0).
//
// The interview is data-driven: questions are declared as a flat list with
// optional `condition` predicates and `inferenceWhenSkipped` defaults. The
// runtime (`runtime.ts`) walks the list given the current AnswerMap + a
// skipList from `parse-intake`, returning the next Question to ask (or null
// when the user is ready for the q_review step).

import type {
  IntakeParseResult,
  ProposePlanResult,
  SkippableQuestionId,
  ThemePresetId,
} from '../ai/schemas'

// ─── Per-question answer shapes ────────────────────────────────────────────

export interface DaysAnswer {
  /** ISO dates the user wants planned (sorted). Min 1. */
  selectedDates: string[]
}

export interface MealsPerDayAnswer {
  /** Dishes per breakfast (0 = no breakfast slot). */
  breakfast: number
  /** Dishes per lunch. */
  lunch: number
  /** Dishes per dinner. */
  dinner: number
  /** Dishes per snack (defaults 0). */
  snack: number
}

export type FreeformAnswer = string

export interface HeadcountAnswer {
  adults: number
  kids: number
}

export type PresetPerDayAnswer = Record<string /* iso date */, string /* presetId */ | null>

export type DietaryAnswer = string[]

export type DislikesAnswer = string[]

export type PrepTimeAnswer = number /* minutes */

export type CaloriesAnswer = 'light' | 'balanced' | 'hearty'

export type SkillAnswer = 'easy' | 'normal' | 'challenge'

export type ThemesAnswer = ThemePresetId[]

export interface ReviewAnswer {
  approved: boolean
  /** When the user swaps a slot before approval, the chosen candidate goes
   *  here. Keyed by virtual slot id from the proposal (see runtime). */
  finalCandidates: Record<string, string>
}

// ─── AnswerMap (typed by question id) ──────────────────────────────────────

export interface AnswerMap {
  q_days?: DaysAnswer
  q_meals_per_day?: MealsPerDayAnswer
  q_freeform?: FreeformAnswer
  q_headcount?: HeadcountAnswer
  q_preset_per_day?: PresetPerDayAnswer
  q_dietary?: DietaryAnswer
  q_dislikes?: DislikesAnswer
  q_prep_time?: PrepTimeAnswer
  q_calories?: CaloriesAnswer
  q_cooking_skill?: SkillAnswer
  q_themes?: ThemesAnswer
  q_review?: ReviewAnswer
}

export type QuestionId = keyof AnswerMap
export type SkipList = ReadonlyArray<SkippableQuestionId>

// ─── Question declaration ──────────────────────────────────────────────────

export type QuestionKind =
  | 'days_picker'
  | 'meals_per_day'
  | 'open_text'
  | 'number_pair'
  | 'multi_select'
  | 'preset_picker'
  | 'choice'
  | 'review'

export interface Question {
  id: QuestionId
  kind: QuestionKind
  /** i18n key — UI calls `t(promptKey)`. */
  promptKey: string
  /** Optional helper i18n key — short hint under the prompt. */
  helpKey?: string
  /**
   * Pull a default value from the user's circle context (diet, household
   * size, cooking prefs) if available. The component is free to override.
   */
  defaultFrom?: 'circle_context' | 'previous_plan'
  /** Skip the question entirely when this returns false. */
  condition?: (a: AnswerMap) => boolean
  /**
   * When this question is on the parse-intake skip-list, fall back to this
   * synthetic answer (typically derived from earlier answers) instead of
   * leaving the answer undefined. The runtime calls this; the component
   * never sees a skipped question.
   */
  inferenceWhenSkipped?: (a: AnswerMap, parsed: IntakeParseResult | null) => unknown
  /** For multi_select / choice — the option list. */
  options?: { id: string; labelKey: string; payload?: unknown }[]
}

// ─── Final result handed to MealPlanEngine.applyInterviewResult ────────────

export interface InterviewResult {
  answers: AnswerMap
  /**
   * The propose-plan output, validated. Each slot has 1-3 candidate dish
   * names in priority order. The engine tries each against the bank.
   */
  proposal: ProposePlanResult
  /**
   * Per-day preset id (resolved from `q_themes` + `q_preset_per_day` at
   * approval time). Empty entries = no preset; the day keeps whatever
   * structure it had before the interview.
   */
  dayPresets: Map<string /* dayId */, string | null /* presetId */>
}

// Meal-Planner Interview — pure runtime (v2.0.0).
//
// Walks `QUESTIONS` in order, given the current `AnswerMap` + a `skipList`
// from `parse-intake`. Returns the next `Question` to ask, or null when the
// user is ready for the review step.
//
// Pure functions only — no React, no Dexie, no fetch. Easy to test.

import { QUESTIONS } from './questions'
import type { AnswerMap, Question, QuestionId, SkipList } from './types'
import type { IntakeParseResult, SkippableQuestionId } from '../ai/schemas'

/**
 * Compute the next question to ask. Skips:
 *   • questions already answered (id in `answers`)
 *   • questions on the parse-intake skip-list (after applying their
 *     `inferenceWhenSkipped` synthesizer to the answer map — see
 *     `applyInferences` below)
 *   • questions whose `condition` predicate returns false
 *
 * Returns null when only `q_review` remains and the user has been through
 * the propose-plan call (ie all skippable questions resolved).
 */
export function getNextQuestion(answers: AnswerMap, skip: SkipList): Question | null {
  for (const q of QUESTIONS) {
    if (answers[q.id] !== undefined) continue
    if (isSkippable(q.id) && skip.includes(q.id)) continue
    if (q.condition && !q.condition(answers)) continue
    return q
  }
  return null
}

/**
 * Apply parse-intake skip-list + inferences to the answer map. Mutates
 * non-destructively — returns a new AnswerMap with synthesized answers
 * filled in for every question on `skip`. Pre-runs before the first
 * `getNextQuestion` call so the user never sees a skipped question.
 *
 * Also seeds questions that have a `defaultFrom: 'circle_context'` if the
 * caller passes a `circleDefaults` map.
 */
export function applyInferences(
  answers: AnswerMap,
  parsed: IntakeParseResult | null,
  circleDefaults: Partial<AnswerMap> = {},
): AnswerMap {
  const out: AnswerMap = { ...answers }
  const skip = new Set<SkippableQuestionId>(parsed?.skip ?? [])

  for (const q of QUESTIONS) {
    if (out[q.id] !== undefined) continue

    // 1. parse-intake-driven skip → run inferenceWhenSkipped
    if (isSkippable(q.id) && skip.has(q.id) && q.inferenceWhenSkipped) {
      const inferred = q.inferenceWhenSkipped(out, parsed)
      if (inferred !== undefined) {
        ;(out as Record<QuestionId, unknown>)[q.id] = inferred
      }
      continue
    }

    // 2. circle-context defaults — only seed when caller provided them.
    if (q.defaultFrom === 'circle_context' && circleDefaults[q.id] !== undefined) {
      ;(out as Record<QuestionId, unknown>)[q.id] = circleDefaults[q.id]
    }
  }

  return out
}

/**
 * Convenience: total remaining steps (excluding review). UI uses this to
 * render a progress bar. Re-evaluates after every answer because the
 * skip-list may shrink the path.
 */
export function remainingQuestions(answers: AnswerMap, skip: SkipList): number {
  let count = 0
  for (const q of QUESTIONS) {
    if (q.id === 'q_review') continue
    if (answers[q.id] !== undefined) continue
    if (isSkippable(q.id) && skip.includes(q.id)) continue
    if (q.condition && !q.condition(answers)) continue
    count++
  }
  return count
}

/**
 * Convenience: percent-complete (0-100). For UI progress bar. Always >= 1
 * once the interview is open (the user has at least started).
 */
export function progressPercent(answers: AnswerMap, skip: SkipList): number {
  const total = QUESTIONS.length - 1 // exclude q_review
  let answered = 0
  for (const q of QUESTIONS) {
    if (q.id === 'q_review') continue
    if (answers[q.id] !== undefined) answered++
    else if (isSkippable(q.id) && skip.includes(q.id)) answered++
  }
  return Math.min(100, Math.max(1, Math.round((answered / total) * 100)))
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const SKIPPABLE_SET: ReadonlySet<string> = new Set([
  'q_headcount',
  'q_dietary',
  'q_dislikes',
  'q_prep_time',
  'q_calories',
  'q_cooking_skill',
  'q_themes',
  'q_preset_per_day',
])

function isSkippable(id: QuestionId): id is SkippableQuestionId {
  return SKIPPABLE_SET.has(id)
}

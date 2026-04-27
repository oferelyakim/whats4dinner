// v2.1.0 — Meal-Planner Interview dialog.
//
// Walks the user through a declarative question tree (`src/engine/interview`),
// makes at most 2 Anthropic calls (parse-intake after q_freeform, propose-plan
// via explicit "Generate plan" button), and hands the result to
// MealPlanEngine.applyInterviewResult.
//
// Change log vs v2.0.0:
//   - Eliminated auto-advance: each step has an explicit Continue button.
//     A `draft` state holds the in-progress answer for the current question;
//     Continue commits it to `answers` and advances via getNextQuestion.
//   - Added explicit Back button: `history: QuestionId[]` stack lets the user
//     pop the last committed answer and restore it into `draft`.
//   - Removed the useEffect that auto-fired runProposePlan on q_review.
//     A "Generate plan" button is shown when there are no more questions.
//   - Added `scope` prop ('day' | 'week'). When scope='day', q_days is
//     pre-filled with targetDayDate and q_themes is skipped.
//   - `targetDayDate?: string` (ISO) used only when scope='day'.
//
// Sub-components are unchanged: DaysPickerInput, MealsPerDayInput,
// FreeformInput, NumberPairInput, MultiSelectInput, ChoiceInput, ReviewStep,
// BusyState. Only the main component logic changes.

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, RefreshCcw, Sparkles, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { callOp } from '@/engine/ai/client'
import {
  IntakeParseResultSchema,
  ProposePlanResultSchema,
  type IntakeParseResult,
  type ProposePlanResult,
} from '@/engine/ai/schemas'
import {
  applyInferences,
  getNextQuestion,
  progressPercent,
  remainingQuestions,
} from '@/engine/interview/runtime'
import { getQuestion } from '@/engine/interview/questions'
import type {
  AnswerMap,
  InterviewResult,
  QuestionId,
  SkipList,
} from '@/engine/interview/types'
import { logAIUsage } from '@/services/ai-usage'
import { supabase } from '@/services/supabase'

interface MealPlannerInterviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  circleId: string | null
  onApprove: (result: InterviewResult) => Promise<void>
  /** 'week' (default) plans multiple days. 'day' plans a single targetDayDate. */
  scope?: 'day' | 'week'
  /** ISO date (e.g. "2026-05-01"). Required when scope='day'. */
  targetDayDate?: string
}

type Stage =
  | 'collecting'
  | 'parsing'
  | 'ready_to_propose'
  | 'proposing'
  | 'reviewing'
  | 'submitting'

// ─── Helpers for scope-aware seeding ──────────────────────────────────────

function seedAnswers(scope: 'day' | 'week', targetDayDate?: string): AnswerMap {
  if (scope === 'day' && targetDayDate) {
    return {
      // Pre-fill q_days so it is never shown to the user.
      q_days: { selectedDates: [targetDayDate] },
      q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 3, snack: 0 },
    }
  }
  return {
    q_days: { selectedDates: defaultWeekDates() },
    q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 3, snack: 0 },
  }
}

/** Extra skip ids injected when scope='day' (q_themes is week-level). */
function scopeSkip(scope: 'day' | 'week'): SkipList {
  return scope === 'day' ? ['q_themes'] : []
}

// ─── Main component ────────────────────────────────────────────────────────

export function MealPlannerInterview({
  open,
  onOpenChange,
  planId,
  circleId,
  onApprove,
  scope = 'week',
  targetDayDate,
}: MealPlannerInterviewProps) {
  const t = useI18n((s) => s.t)

  const [stage, setStage] = useState<Stage>('collecting')
  const [answers, setAnswers] = useState<AnswerMap>(() =>
    seedAnswers(scope, targetDayDate),
  )
  // skip list from parse-intake + scope-level pre-skips
  const [skip, setSkip] = useState<SkipList>(() => scopeSkip(scope))
  const [parsed, setParsed] = useState<IntakeParseResult | null>(null)
  const [proposal, setProposal] = useState<ProposePlanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewSwaps, setReviewSwaps] = useState<Record<string, string>>({})

  // draft holds the current question's in-progress answer before Continue
  const [draft, setDraft] = useState<AnswerMap[QuestionId]>(undefined)
  // history is a stack of committed question ids — used by Back
  const [history, setHistory] = useState<QuestionId[]>([])

  const currentQuestion = useMemo(
    () => getNextQuestion(answers, skip),
    [answers, skip],
  )
  const remaining = remainingQuestions(answers, skip)
  const progressPct = progressPercent(answers, skip)

  // Whether all questions have been answered (ready to propose or propose fired)
  const allAnswered = currentQuestion === null

  // ─── Banner title ────────────────────────────────────────────────────────

  function bannerTitle(): string {
    if (scope === 'day' && targetDayDate) {
      const prettyDate = new Date(targetDayDate + 'T12:00:00').toLocaleDateString(
        undefined,
        { weekday: 'long', month: 'short', day: 'numeric' },
      )
      return t('interview.banner.dayTitle').replace('{date}', prettyDate)
    }
    return t('interview.banner.weekTitle')
  }

  // ─── Continue (commit draft + advance) ──────────────────────────────────

  function handleContinue() {
    if (!currentQuestion) return
    const questionId = currentQuestion.id
    // Commit draft to answers
    setAnswers((prev) => ({ ...prev, [questionId]: draft }))
    setHistory((prev) => [...prev, questionId])
    // Reset draft for the next question
    setDraft(undefined)
  }

  /**
   * v2.3.0 — Skip the current optional question with the empty/no-op answer
   * for its kind. Commits + advances exactly like Continue. Used by the
   * Skip button rendered next to Continue on multi_select / preset_picker
   * / open_text-dislikes / choice steps.
   */
  function handleSkip() {
    if (!currentQuestion) return
    const questionId = currentQuestion.id
    let skipValue: AnswerMap[QuestionId]
    switch (currentQuestion.kind) {
      case 'multi_select':
      case 'open_text':
        skipValue = [] as never
        break
      case 'preset_picker':
        skipValue = {} as never
        break
      case 'choice':
        // Use the question's existing inferenceWhenSkipped path: leave the
        // value unset and let getNextQuestion treat it as committed via the
        // skip-list mechanism. Falls through to Continue with undefined.
        skipValue = undefined
        break
      default:
        skipValue = undefined
    }
    setAnswers((prev) => ({ ...prev, [questionId]: skipValue }))
    setHistory((prev) => [...prev, questionId])
    setDraft(undefined)
  }

  /**
   * v2.3.0 — questions that have no required value. The Skip button shows
   * only for these and the prompt gets the "Optional — leave blank" hint.
   */
  function isOptionalQuestion(): boolean {
    if (!currentQuestion) return false
    if (
      currentQuestion.kind === 'multi_select' ||
      currentQuestion.kind === 'preset_picker'
    ) {
      return true
    }
    // q_dislikes is open_text — also optional. q_freeform handles its own
    // submit button (no shared footer) so it never needs the Skip CTA.
    if (currentQuestion.kind === 'open_text' && currentQuestion.id === 'q_dislikes') {
      return true
    }
    // q_calories and q_cooking_skill are choice questions — optional.
    if (
      currentQuestion.id === 'q_calories' ||
      currentQuestion.id === 'q_cooking_skill'
    ) {
      return true
    }
    return false
  }

  // Special-case: q_freeform uses its own submit inside FreeformInput which
  // also triggers parse-intake. After parse-intake finishes, the component
  // resumes in 'collecting' with the answer already committed. The explicit
  // Continue button is hidden for q_freeform since FreeformInput has its own.
  async function handleFreeformSubmit(text: string) {
    if (!currentQuestion) return
    // Commit q_freeform answer immediately before the async call so the
    // cursor advances while we parse.
    setAnswers((prev) => ({ ...prev, q_freeform: text }))
    setHistory((prev) => [...prev, 'q_freeform'])
    setDraft(undefined)
    await runParseIntake(text)
  }

  // ─── Back (pop history) ──────────────────────────────────────────────────

  function handleBack() {
    if (history.length === 0) return
    const last = history[history.length - 1]
    // Restore the previous answer as draft
    const prevValue = answers[last]
    setDraft(prevValue as AnswerMap[QuestionId])
    // Remove from committed answers
    setAnswers((prev) => {
      const next = { ...prev }
      delete next[last]
      return next
    })
    setHistory((prev) => prev.slice(0, -1))
    // If we were at ready_to_propose, go back to collecting
    if (stage === 'ready_to_propose') {
      setStage('collecting')
    }
  }

  // ─── v2.6.0 telemetry: detect users stuck on the "Ready to build your
  // plan" screen. If the user lingers >5s in ready_to_propose without
  // clicking Generate, drop a localStorage breadcrumb so future debugging
  // can correlate the stuck state with reported "blank page" complaints. ──
  useEffect(() => {
    if (stage !== 'ready_to_propose' || !allAnswered) return
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem('proposeIdleObserved', String(Date.now()))
      } catch {
        // ignore quota / private-mode failures
      }
    }, 5000)
    return () => window.clearTimeout(id)
  }, [stage, allAnswered])

  // ─── parse-intake ────────────────────────────────────────────────────────

  async function runParseIntake(freeform: string) {
    setStage('parsing')
    setError(null)
    try {
      const circleContext = await loadCircleContext(circleId)
      const out = await callOp(
        'parse-intake',
        { freeform, circleContext },
        IntakeParseResultSchema,
      )
      setParsed(out)
      // Apply inferences + merge skip-list (preserve scope-level skips)
      setAnswers((a) => applyInferences({ ...a, q_freeform: freeform }, out))
      setSkip((prev) => {
        const merged = new Set([...prev, ...out.skip])
        return Array.from(merged) as SkipList
      })
      void logUsage('meal_plan')
    } catch (err) {
      console.warn('[interview] parse-intake failed:', err)
      // Non-fatal — continue without extra skips
    }
    setStage('collecting')
  }

  // ─── propose-plan ────────────────────────────────────────────────────────

  async function runProposePlan() {
    setStage('proposing')
    setError(null)
    try {
      window.localStorage.removeItem('proposeIdleObserved')
    } catch {
      // ignore
    }
    try {
      const circleContext = await loadCircleContext(circleId)
      const recentDishes = await fetchRecentDishesForPlan(planId)
      const out = await callOp(
        'propose-plan',
        { answers, circleContext, recentDishes },
        ProposePlanResultSchema,
      )
      // v2.3.0 / v2.4.0 / v2.5.0: an empty proposal is a silent failure —
      // Anthropic returned no tool_use, partial structure, or the schema let
      // through empty meals[] / empty slots[] arrays. v2.5.0 broadens to the
      // deepest level: every day must have at least one meal AND at least one
      // slot total, otherwise ReviewStep renders day headers + meal-type
      // labels + zero rows = "blank dialog".
      const hasAnyContent = out.days?.some(
        (d) => d.meals?.some((m) => (m.slots?.length ?? 0) > 0),
      )
      if (!out.days?.length || !hasAnyContent) {
        console.warn(
          '[interview] propose-plan returned empty proposal:',
          JSON.stringify(out).slice(0, 800),
        )
        setError(t('interview.proposing.empty'))
        setStage('ready_to_propose')
        return
      }
      setProposal(out)
      void logUsage('meal_plan_edit')
      setStage('reviewing')
    } catch (err) {
      console.warn('[interview] propose-plan failed:', err)
      setError(t('interview.proposing.empty'))
      // Return to ready_to_propose so the user can retry
      setStage('ready_to_propose')
    }
  }

  // ─── approve ─────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!proposal) return
    setStage('submitting')
    try {
      const dayPresets = computeDayPresets(answers, parsed)
      const result: InterviewResult = {
        answers: {
          ...answers,
          q_review: { approved: true, finalCandidates: reviewSwaps },
        },
        proposal: {
          ...proposal,
          days: applySwaps(proposal.days, reviewSwaps),
        },
        dayPresets,
      }
      await onApprove(result)
      onOpenChange(false)
    } catch (err) {
      console.warn('[interview] approve failed:', err)
      setError(String(err))
      setStage('reviewing')
    }
  }

  // ─── Derived: can the Continue button be pressed? ────────────────────────

  function canContinue(): boolean {
    if (!currentQuestion) return false
    // For optional questions (multi_select, choice, preset_picker) allow
    // continuing with undefined (skip-equivalent). For required ones verify.
    if (currentQuestion.kind === 'days_picker') {
      const val = draft as { selectedDates: string[] } | undefined
      return (val?.selectedDates?.length ?? 0) > 0
    }
    if (currentQuestion.kind === 'meals_per_day') {
      const val = draft as { breakfast: number; lunch: number; dinner: number; snack: number } | undefined
      if (!val) return false
      return val.breakfast + val.lunch + val.dinner + val.snack > 0
    }
    if (currentQuestion.kind === 'number_pair') {
      const val = draft as { adults: number; kids: number } | undefined
      return (val?.adults ?? 0) >= 1
    }
    // All other kinds (multi_select, choice, preset_picker) are optional
    return true
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const showBusy = stage === 'parsing' || stage === 'proposing' || stage === 'submitting'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-rp-ink/40 backdrop-blur-sm z-40" />
        <Dialog.Content
          className="
            fixed inset-0 z-50 flex flex-col bg-rp-bg
            sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
            sm:h-[min(90vh,700px)] sm:w-[min(560px,90vw)] sm:rounded-2xl
            shadow-rp-hover overflow-hidden
          "
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-rp-ink/10 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-5 w-5 text-rp-brand shrink-0" />
              <Dialog.Title className="font-display italic text-lg text-rp-ink truncate">
                {bannerTitle()}
              </Dialog.Title>
            </div>
            <Dialog.Close
              className="rounded-full p-1 text-rp-ink/60 hover:bg-rp-ink/5 hover:text-rp-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {/* Progress bar — shown while collecting non-terminal questions */}
          {stage === 'collecting' && currentQuestion && (
            <div className="px-4 sm:px-6 pt-3">
              <div className="h-1.5 w-full bg-rp-ink/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-rp-brand"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
              <p className="mt-1 text-xs text-rp-ink/50 tabular-nums">
                {remaining} {remaining === 1 ? 'question left' : 'questions left'}
              </p>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {showBusy && (
              <BusyState
                message={
                  stage === 'parsing'
                    ? t('interview.parsing')
                    : t('interview.proposing')
                }
              />
            )}

            {stage === 'collecting' && currentQuestion && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQuestion.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                >
                  <QuestionStep
                    question={currentQuestion}
                    answers={answers}
                    draft={draft}
                    setDraft={setDraft}
                    onSubmitFreeform={(text) => void handleFreeformSubmit(text)}
                  />
                </motion.div>
              </AnimatePresence>
            )}

            {/* All questions answered — show summary + "Generate plan" CTA.
                v2.6.0: surface a populated screen so the user can SEE that
                their selections were captured, plus an in-body Generate
                button so it isn't hidden in the footer below the fold. */}
            {(stage === 'collecting' || stage === 'ready_to_propose') &&
              allAnswered && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <Sparkles className="h-9 w-9 text-rp-brand" />
                  <p className="font-display italic text-xl text-rp-ink text-center">
                    {t('interview.q.review')}
                  </p>
                  <p className="text-sm text-rp-ink/60 text-center leading-snug max-w-xs">
                    {t('interview.q.reviewHelp')}
                  </p>

                  <SelectionSummary answers={answers} />

                  <button
                    type="button"
                    onClick={() => void runProposePlan()}
                    className="
                      inline-flex items-center gap-1.5 rounded-full bg-rp-brand px-6 py-3
                      text-sm font-medium text-white hover:bg-rp-brand/90 active:scale-[0.98]
                      shadow-rp-card mt-2
                    "
                  >
                    <Sparkles className="h-4 w-4" />
                    {t('interview.generatePlan')}
                  </button>

                  {error && (
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  )}
                </div>
              )}

            {stage === 'reviewing' && proposal && (
              <ReviewStep
                proposal={proposal}
                swaps={reviewSwaps}
                setSwaps={setReviewSwaps}
                onRetry={() => void runProposePlan()}
              />
            )}

            {/* v2.5.0: removed `stage !== 'ready_to_propose'` gate. When a
                propose-plan attempt fails, runProposePlan reverts to that
                stage AND sets error — gating it on stage hid the message and
                made the failure look like the dialog "did nothing". */}
            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* Footer — Back + Skip + Continue while collecting */}
          {stage === 'collecting' && currentQuestion && currentQuestion.id !== 'q_freeform' && (
            <div className="border-t border-rp-ink/10 bg-rp-bg-soft px-4 py-3 sm:px-6 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={history.length === 0}
                className="
                  inline-flex items-center gap-1.5 rounded-full px-4 py-2
                  text-sm font-medium text-rp-ink/70 hover:text-rp-ink
                  disabled:opacity-30 disabled:cursor-not-allowed
                "
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                {t('interview.back')}
              </button>
              <div className="flex items-center gap-2">
                {isOptionalQuestion() && (
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="
                      inline-flex items-center gap-1 rounded-full px-4 py-2
                      text-sm font-medium text-rp-ink/70 hover:text-rp-ink
                      hover:bg-rp-ink/5
                    "
                  >
                    {t('interview.skip')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue()}
                  className="
                    inline-flex items-center gap-1.5 rounded-full bg-rp-brand px-5 py-2.5
                    text-sm font-medium text-white hover:bg-rp-brand/90 active:scale-[0.98]
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                >
                  {t('interview.next')}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          )}

          {/* Footer — "Generate plan" when all questions are answered */}
          {(stage === 'collecting' || stage === 'ready_to_propose') && allAnswered && (
            <div className="border-t border-rp-ink/10 bg-rp-bg-soft px-4 py-3 sm:px-6 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={history.length === 0}
                className="
                  inline-flex items-center gap-1.5 rounded-full px-4 py-2
                  text-sm font-medium text-rp-ink/70 hover:text-rp-ink
                  disabled:opacity-30 disabled:cursor-not-allowed
                "
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                {t('interview.back')}
              </button>
              <button
                type="button"
                onClick={() => void runProposePlan()}
                className="
                  inline-flex items-center gap-1.5 rounded-full bg-rp-brand px-5 py-2.5
                  text-sm font-medium text-white hover:bg-rp-brand/90 active:scale-[0.98]
                "
              >
                <Sparkles className="h-4 w-4" />
                {t('interview.generatePlan')}
              </button>
            </div>
          )}

          {/* Footer — review/approve */}
          {stage === 'reviewing' && proposal && (
            <div className="border-t border-rp-ink/10 bg-rp-bg-soft px-4 py-3 sm:px-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleApprove}
                className="
                  inline-flex items-center gap-1.5 rounded-full bg-rp-brand px-5 py-2.5
                  text-sm font-medium text-white hover:bg-rp-brand/90 active:scale-[0.98]
                "
              >
                <Check className="h-4 w-4" />
                {t('interview.approve')}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

// v2.2.0 — funny thinking sentences that rotate every 2.5s while AI is busy.
// Adds personality + reassures the user that work is happening, especially
// when bank-fill is fast (~1s) and Anthropic-fallback is slower (~10s).
const BUSY_PHRASE_KEYS = [
  'interview.busy.aisles',
  'interview.busy.tomatoes',
  'interview.busy.cards',
  'interview.busy.grandma',
  'interview.busy.basil',
  'interview.busy.butcher',
  'interview.busy.herbs',
  'interview.busy.season',
  'interview.busy.table',
  'interview.busy.dish',
] as const

/**
 * v2.6.0 — compact summary card surfaced on the q_review screen so the user
 * can confirm their captured answers BEFORE clicking Generate. Avoids the
 * "blank page" feel where the screen previously rendered only a title +
 * subtitle and the Generate button lived only in the footer.
 */
function SelectionSummary({ answers }: { answers: AnswerMap }) {
  const t = useI18n((s) => s.t)

  const lines: { labelKey: string; value: string }[] = []

  const days = answers.q_days?.selectedDates?.length ?? 0
  if (days > 0) {
    const valueKey =
      days === 1 ? 'interview.summary.daysValue' : 'interview.summary.daysValuePlural'
    lines.push({
      labelKey: 'interview.summary.days',
      value: t(valueKey).replace('{count}', String(days)),
    })
  }

  const meals = answers.q_meals_per_day
  if (meals) {
    const parts: string[] = []
    if (meals.breakfast > 0) parts.push(`${meals.breakfast}× ${t('plan.breakfast')}`)
    if (meals.lunch > 0) parts.push(`${meals.lunch}× ${t('plan.lunch')}`)
    if (meals.dinner > 0) parts.push(`${meals.dinner}× ${t('plan.dinner')}`)
    if (meals.snack > 0) parts.push(`${meals.snack}× ${t('plan.snack')}`)
    if (parts.length > 0) {
      lines.push({ labelKey: 'interview.summary.meals', value: parts.join(' · ') })
    }
  }

  const headcount = answers.q_headcount
  if (headcount && (headcount.adults > 0 || headcount.kids > 0)) {
    lines.push({
      labelKey: 'interview.summary.headcount',
      value: t('interview.summary.headcountValue')
        .replace('{adults}', String(headcount.adults))
        .replace('{kids}', String(headcount.kids)),
    })
  }

  const dietary = answers.q_dietary
  if (dietary && dietary.length > 0) {
    const dietQuestion = getQuestion('q_dietary')
    const labels = dietary.map((id) => {
      const opt = dietQuestion?.options?.find((o) => o.id === id)
      return opt ? t(opt.labelKey) : id
    })
    lines.push({ labelKey: 'interview.summary.dietary', value: labels.join(', ') })
  }

  const prepTime = answers.q_prep_time
  if (typeof prepTime === 'number' && prepTime > 0) {
    lines.push({
      labelKey: 'interview.summary.prepTime',
      value: t('interview.summary.prepTimeValue').replace('{minutes}', String(prepTime)),
    })
  }

  const themes = answers.q_themes
  if (themes && themes.length > 0) {
    const themesQuestion = getQuestion('q_themes')
    const labels = themes.map((id) => {
      const opt = themesQuestion?.options?.find((o) => o.id === id)
      return opt ? t(opt.labelKey) : id
    })
    lines.push({ labelKey: 'interview.summary.themes', value: labels.join(', ') })
  }

  if (lines.length === 0) return null

  return (
    <div className="w-full max-w-sm rounded-2xl border border-rp-ink/10 bg-rp-bg-soft px-4 py-3 mt-1">
      <p className="text-xs uppercase tracking-wide font-medium text-rp-ink/50 mb-2">
        {t('interview.summary.title')}
      </p>
      <dl className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <div key={line.labelKey} className="flex items-baseline gap-3 text-sm">
            <dt className="text-rp-ink/60 shrink-0 min-w-[6.5rem]">{t(line.labelKey)}</dt>
            <dd className="text-rp-ink text-right flex-1">{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function BusyState({ message }: { message: string }) {
  const t = useI18n((s) => s.t)
  const [phraseIdx, setPhraseIdx] = useState(() =>
    Math.floor(Math.random() * BUSY_PHRASE_KEYS.length),
  )
  useEffect(() => {
    const id = window.setInterval(() => {
      setPhraseIdx((i) => (i + 1) % BUSY_PHRASE_KEYS.length)
    }, 2500)
    return () => window.clearInterval(id)
  }, [])
  const phrase = t(BUSY_PHRASE_KEYS[phraseIdx])
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <RefreshCcw className="h-8 w-8 text-rp-brand animate-spin" />
      <p className="text-rp-ink/70 font-display italic text-base">{message}</p>
      <p className="text-rp-ink/50 text-sm transition-opacity duration-300" key={phraseIdx}>
        {phrase}
      </p>
    </div>
  )
}

function QuestionStep({
  question,
  answers,
  draft,
  setDraft,
  onSubmitFreeform,
}: {
  question: {
    id: QuestionId
    kind: string
    promptKey: string
    helpKey?: string
    options?: { id: string; labelKey: string; payload?: unknown }[]
  }
  answers: AnswerMap
  draft: AnswerMap[QuestionId]
  setDraft: (v: AnswerMap[QuestionId]) => void
  onSubmitFreeform: (text: string) => void
}) {
  const t = useI18n((s) => s.t)
  const showDietaryDisclaimer = question.id === 'q_dietary'
  // v2.3.0 — surface "Optional — leave blank" copy on questions that can be
  // skipped from the user's perspective (matches the Skip button gating in
  // the parent component). q_freeform has its own submit + this label is
  // only useful where the shared footer renders.
  const isOptional =
    question.kind === 'multi_select' ||
    question.kind === 'preset_picker' ||
    (question.kind === 'open_text' && question.id === 'q_dislikes')
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display italic text-2xl text-rp-ink leading-tight">
          {t(question.promptKey)}
        </h2>
        {question.helpKey && (
          <p className="mt-1 text-sm text-rp-ink/60 leading-snug">{t(question.helpKey)}</p>
        )}
        {isOptional && (
          <p className="mt-1 text-xs text-rp-ink/50 italic">{t('interview.optional')}</p>
        )}
      </div>

      {showDietaryDisclaimer && (
        <div className="rounded-xl border border-amber-300 bg-rp-bg-soft p-3 text-sm text-rp-ink/80">
          {t('interview.disclaimer.dietary')}
        </div>
      )}

      {question.kind === 'days_picker' && (
        <DaysPickerInput
          value={
            ((draft as { selectedDates: string[] } | undefined)?.selectedDates) ??
            answers.q_days?.selectedDates ??
            defaultWeekDates()
          }
          onChange={(v) => setDraft({ selectedDates: v })}
        />
      )}
      {question.kind === 'meals_per_day' && (
        <MealsPerDayInput
          value={
            (draft as { breakfast: number; lunch: number; dinner: number; snack: number } | undefined) ??
            answers.q_meals_per_day ??
            { breakfast: 0, lunch: 0, dinner: 3, snack: 0 }
          }
          onChange={(v) => setDraft(v)}
        />
      )}
      {question.kind === 'open_text' && question.id === 'q_freeform' && (
        <FreeformInput onSubmit={onSubmitFreeform} />
      )}
      {question.kind === 'open_text' && question.id === 'q_dislikes' && (
        <DislikesInput
          value={(draft as string[] | undefined) ?? answers.q_dislikes ?? []}
          onChange={(v) => setDraft(v)}
        />
      )}
      {question.kind === 'number_pair' && (
        <NumberPairInput
          value={
            (draft as { adults: number; kids: number } | undefined) ??
            answers.q_headcount ??
            { adults: 2, kids: 0 }
          }
          onChange={(v) => setDraft(v)}
        />
      )}
      {question.kind === 'multi_select' && question.options && (
        <MultiSelectInput
          options={question.options}
          value={
            (draft as string[] | undefined) ??
            (question.id === 'q_dietary' ? answers.q_dietary : answers.q_themes) ??
            []
          }
          onChange={(v) => setDraft(v)}
        />
      )}
      {question.kind === 'choice' && question.options && (
        <ChoiceInput
          options={question.options}
          value={String(
            (draft as string | number | undefined) ??
              (question.id === 'q_prep_time'
                ? answers.q_prep_time
                : question.id === 'q_calories'
                  ? answers.q_calories
                  : answers.q_cooking_skill) ??
              '',
          )}
          onChange={(opt) => {
            if (question.id === 'q_prep_time') {
              setDraft((opt.payload as number) ?? Number(opt.id))
            } else if (question.id === 'q_calories') {
              setDraft(opt.id as 'light' | 'balanced' | 'hearty')
            } else if (question.id === 'q_cooking_skill') {
              setDraft(opt.id as 'easy' | 'normal' | 'challenge')
            }
          }}
        />
      )}
      {question.kind === 'preset_picker' && (
        <PresetPerDayInput
          selectedDates={answers.q_days?.selectedDates ?? defaultWeekDates()}
          value={
            (draft as Record<string, string | null> | undefined) ??
            answers.q_preset_per_day ??
            {}
          }
          onChange={(v) => setDraft(v)}
        />
      )}
    </div>
  )
}

function DaysPickerInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const dates = defaultWeekDates()
  const selected = new Set(value)
  return (
    <div className="grid grid-cols-7 gap-2">
      {dates.map((iso) => {
        const d = new Date(iso + 'T12:00:00')
        const dow = d.toLocaleDateString(undefined, { weekday: 'short' })
        const dayNum = d.getDate()
        const isOn = selected.has(iso)
        return (
          <button
            type="button"
            key={iso}
            onClick={() => {
              const next = new Set(selected)
              if (isOn) next.delete(iso)
              else next.add(iso)
              onChange(Array.from(next).sort())
            }}
            className={`
              rounded-2xl border-2 p-3 text-center transition
              ${isOn
                ? 'border-rp-brand bg-rp-brand/10 text-rp-ink'
                : 'border-rp-ink/10 text-rp-ink/60 hover:border-rp-ink/30'}
            `}
          >
            <div className="text-xs uppercase tracking-wide">{dow}</div>
            <div className="font-display italic text-lg">{dayNum}</div>
          </button>
        )
      })}
    </div>
  )
}

function MealsPerDayInput({
  value,
  onChange,
}: {
  value: { breakfast: number; lunch: number; dinner: number; snack: number }
  onChange: (v: { breakfast: number; lunch: number; dinner: number; snack: number }) => void
}) {
  const meals: { key: 'breakfast' | 'lunch' | 'dinner' | 'snack'; label: string }[] = [
    { key: 'breakfast', label: 'Breakfast' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'dinner', label: 'Dinner' },
    { key: 'snack', label: 'Snacks' },
  ]
  return (
    <div className="space-y-3">
      {meals.map((m) => {
        const count = value[m.key]
        return (
          <div
            key={m.key}
            className="flex items-center justify-between rounded-xl border border-rp-ink/10 px-4 py-3"
          >
            <span className="font-medium text-rp-ink">{m.label}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease ${m.label}`}
                onClick={() => onChange({ ...value, [m.key]: Math.max(0, count - 1) })}
                className="rounded-full bg-rp-ink/5 px-3 py-1 text-rp-ink hover:bg-rp-ink/10"
                disabled={count <= 0}
              >
                −
              </button>
              <span className="font-display italic text-xl tabular-nums w-6 text-center">
                {count}
              </span>
              <button
                type="button"
                aria-label={`Increase ${m.label}`}
                onClick={() => onChange({ ...value, [m.key]: Math.min(8, count + 1) })}
                className="rounded-full bg-rp-ink/5 px-3 py-1 text-rp-ink hover:bg-rp-ink/10"
                disabled={count >= 8}
              >
                +
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FreeformInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="e.g. dinner only, 3 dishes per meal — kids hate fish, slow-cooker on Tuesdays"
        className="
          w-full rounded-xl border border-rp-ink/15 bg-rp-bg px-4 py-3
          text-rp-ink placeholder-rp-ink/40 focus:border-rp-brand
          focus:outline-none focus:ring-2 focus:ring-rp-brand/20
        "
      />
      <button
        type="button"
        onClick={() => onSubmit(text.trim())}
        className="
          inline-flex items-center gap-1.5 rounded-full bg-rp-brand px-4 py-2
          text-sm font-medium text-white hover:bg-rp-brand/90
        "
      >
        Continue
        <ArrowRight className="h-4 w-4 rtl:rotate-180" />
      </button>
    </div>
  )
}

function DislikesInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [text, setText] = useState(value.join(', '))
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const parts = e.target.value
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
        onChange(parts)
      }}
      placeholder="e.g. mushrooms, eggplant, raisins"
      className="
        w-full rounded-xl border border-rp-ink/15 bg-rp-bg px-4 py-3
        text-rp-ink placeholder-rp-ink/40 focus:border-rp-brand
        focus:outline-none focus:ring-2 focus:ring-rp-brand/20
      "
    />
  )
}

function NumberPairInput({
  value,
  onChange,
}: {
  value: { adults: number; kids: number }
  onChange: (v: { adults: number; kids: number }) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(['adults', 'kids'] as const).map((key) => (
        <div key={key} className="rounded-xl border border-rp-ink/10 p-4">
          <label className="text-sm text-rp-ink/60 block capitalize">{key}</label>
          <input
            type="number"
            min={key === 'adults' ? 1 : 0}
            max={20}
            value={value[key]}
            onChange={(e) =>
              onChange({ ...value, [key]: Math.max(0, Number(e.target.value) || 0) })
            }
            className="mt-1 w-full font-display italic text-3xl tabular-nums bg-transparent focus:outline-none"
          />
        </div>
      ))}
    </div>
  )
}

function MultiSelectInput({
  options,
  value,
  onChange,
}: {
  options: { id: string; labelKey: string }[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const t = useI18n((s) => s.t)
  const selected = new Set(value)
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isOn = selected.has(opt.id)
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => {
              const next = new Set(selected)
              if (isOn) next.delete(opt.id)
              else next.add(opt.id)
              onChange(Array.from(next))
            }}
            className={`
              rounded-full px-4 py-2 text-sm font-medium transition border
              ${isOn
                ? 'bg-rp-brand text-white border-rp-brand'
                : 'bg-rp-bg-soft text-rp-ink border-rp-ink/10 hover:border-rp-ink/30'}
            `}
          >
            {t(opt.labelKey)}
          </button>
        )
      })}
    </div>
  )
}

function ChoiceInput({
  options,
  value,
  onChange,
}: {
  options: { id: string; labelKey: string; payload?: unknown }[]
  value: string
  onChange: (opt: { id: string; payload?: unknown }) => void
}) {
  const t = useI18n((s) => s.t)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((opt) => {
        const isOn = value === opt.id
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => onChange(opt)}
            className={`
              rounded-xl border-2 px-3 py-3 text-sm font-medium transition
              ${isOn
                ? 'border-rp-brand bg-rp-brand/10 text-rp-ink'
                : 'border-rp-ink/10 text-rp-ink/70 hover:border-rp-ink/30'}
            `}
          >
            {t(opt.labelKey)}
          </button>
        )
      })}
    </div>
  )
}

function PresetPerDayInput({
  selectedDates,
  value,
  onChange,
}: {
  selectedDates: string[]
  value: Record<string, string | null>
  onChange: (v: Record<string, string | null>) => void
}) {
  const t = useI18n((s) => s.t)
  // v2.2.0: real picker UI replacing the blank PresetPickerNote stub.
  // Each selected date gets a row with a select dropdown of theme presets.
  // Default value: null (no preset — user fills the day manually or later).
  const themes: { id: string; labelKey: string }[] = [
    { id: 'sys-day-meatless-monday', labelKey: 'interview.theme.meatlessMonday' },
    { id: 'sys-day-taco-tuesday', labelKey: 'interview.theme.tacoTuesday' },
    { id: 'sys-day-pasta-wednesday', labelKey: 'interview.theme.pastaWednesday' },
    { id: 'sys-day-pizza-friday', labelKey: 'interview.theme.pizzaFriday' },
    { id: 'sys-day-slow-cooker', labelKey: 'interview.theme.slowCooker' },
    { id: 'sys-day-one-pot', labelKey: 'interview.theme.onePot' },
    { id: 'sys-day-burger', labelKey: 'interview.theme.burger' },
    { id: 'sys-day-greek', labelKey: 'interview.theme.greek' },
    { id: 'sys-day-asian', labelKey: 'interview.theme.asian' },
  ]
  return (
    <div className="space-y-2">
      <p className="text-sm text-rp-ink/60">{t('interview.q.presetPerDayHelp')}</p>
      {selectedDates.map((iso) => {
        const d = new Date(iso + 'T12:00:00')
        const label = d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        return (
          <div
            key={iso}
            className="flex items-center justify-between gap-2 rounded-xl border border-rp-ink/10 px-3 py-2.5"
          >
            <span className="text-sm text-rp-ink min-w-0 truncate">{label}</span>
            <select
              value={value[iso] ?? ''}
              onChange={(e) => {
                onChange({ ...value, [iso]: e.target.value || null })
              }}
              className="text-sm bg-rp-bg-soft text-rp-ink rounded-lg px-2 py-1.5 border border-rp-ink/10 focus:outline-none focus:ring-1 focus:ring-rp-brand"
            >
              <option value="">— {t('interview.preset.none')} —</option>
              {themes.map((th) => (
                <option key={th.id} value={th.id}>
                  {t(th.labelKey)}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}

function ReviewStep({
  proposal,
  swaps,
  setSwaps,
  onRetry,
}: {
  proposal: ProposePlanResult
  swaps: Record<string, string>
  setSwaps: (s: Record<string, string>) => void
  onRetry: () => void
}) {
  const t = useI18n((s) => s.t)
  // v2.3 / v2.4 / v2.5: belt-and-braces. The runProposePlan caller already
  // routes empty results back to ready_to_propose, but if a propose-plan
  // response slips through with zero usable rows (no day has any meal with
  // any slot), render a clear retry CTA instead of a blank dialog.
  const hasAnyContent = proposal.days?.some((d) =>
    d.meals?.some((m) => (m.slots?.length ?? 0) > 0),
  )
  if (!proposal.days?.length || !hasAnyContent) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <Sparkles className="h-10 w-10 text-rp-brand" />
        <p className="font-display italic text-lg text-rp-ink text-center">
          {t('interview.proposing.empty')}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="
            inline-flex items-center gap-1.5 rounded-full bg-rp-brand px-5 py-2.5
            text-sm font-medium text-white hover:bg-rp-brand/90 active:scale-[0.98]
          "
        >
          <RefreshCcw className="h-4 w-4" />
          {t('interview.generatePlan')}
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {proposal.days.map((day) => (
        <div key={day.date} className="rounded-2xl border border-rp-ink/10 bg-rp-bg-soft p-4">
          <h3 className="font-display italic text-lg text-rp-ink mb-2">
            {formatDayHeader(day.date)}
          </h3>
          {day.meals.map((meal, mi) => (
            <div key={mi} className="mb-3 last:mb-0">
              <div className="text-xs uppercase tracking-wide text-rp-ink/50 mb-1">
                {meal.type}
              </div>
              <div className="space-y-1">
                {meal.slots.map((slot, si) => {
                  const key = `${day.date}|${mi}|${si}`
                  const chosen = swaps[key] ?? slot.candidates[0]
                  return (
                    <div key={si} className="flex items-start justify-between gap-2 py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-rp-ink truncate">{chosen}</div>
                        <div className="text-xs text-rp-ink/50">{slot.role}</div>
                      </div>
                      {slot.candidates.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const idx = slot.candidates.indexOf(chosen)
                            const next = slot.candidates[(idx + 1) % slot.candidates.length]
                            setSwaps({ ...swaps, [key]: next })
                          }}
                          className="text-xs text-rp-brand hover:underline shrink-0"
                        >
                          {t('interview.swap')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="rounded-xl border border-amber-300 bg-rp-bg-soft p-3 text-sm text-rp-ink/80">
        {t('interview.disclaimer.plan')}
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultWeekDates(): string[] {
  const today = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

async function loadCircleContext(circleId: string | null): Promise<string> {
  if (!circleId) return ''
  try {
    const { data, error } = await supabase
      .from('circles')
      .select('name, icon, purpose, circle_type, context')
      .eq('id', circleId)
      .maybeSingle()
    if (error || !data) return ''
    const lines = [
      `<circle_context>`,
      data.name ? `name: ${data.name}` : '',
      data.icon ? `icon: ${data.icon}` : '',
      data.circle_type ? `type: ${data.circle_type}` : '',
      data.purpose ? `purpose: ${data.purpose}` : '',
      data.context ? `context: ${JSON.stringify(data.context)}` : '',
      `</circle_context>`,
    ].filter(Boolean)
    return lines.join('\n')
  } catch {
    return ''
  }
}

async function fetchRecentDishesForPlan(_planId: string): Promise<string[]> {
  // The engine has its own getRecentDishNames helper but it is private.
  // For the propose-plan call we just pass an empty array — the engine's
  // sibling/recent enforcement happens later during bank-fill anyway.
  return []
}

type InterviewActionType = 'meal_plan' | 'meal_plan_edit'
async function logUsage(actionType: InterviewActionType): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    // 1 propose call ≈ ~1500 input tok + ~600 output tok on Haiku 4.5.
    // Cost = 1.5K * $0.001/M + 0.6K * $0.005/M ≈ $0.0045
    await logAIUsage(user.id, actionType, 'claude-haiku-4-5-20251001', 1500, 600, 0.0045)
  } catch (err) {
    console.warn('[interview] logAIUsage failed:', err)
  }
}

function applySwaps(
  days: ProposePlanResult['days'],
  swaps: Record<string, string>,
): ProposePlanResult['days'] {
  return days.map((day) => ({
    ...day,
    meals: day.meals.map((meal, mi) => ({
      ...meal,
      slots: meal.slots.map((slot, si) => {
        const key = `${day.date}|${mi}|${si}`
        const chosen = swaps[key]
        if (!chosen) return slot
        // Move the chosen candidate to position 0 so applyInterviewResult tries it first.
        const others = slot.candidates.filter((c) => c !== chosen)
        return { ...slot, candidates: [chosen, ...others] }
      }),
    })),
  })) as ProposePlanResult['days']
}

function computeDayPresets(
  answers: AnswerMap,
  parsed: IntakeParseResult | null,
): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const presetByDate = answers.q_preset_per_day ?? {}
  const themes = answers.q_themes ?? parsed?.prefill.themes ?? []
  for (const iso of answers.q_days?.selectedDates ?? []) {
    let presetId: string | null = presetByDate[iso] ?? null
    if (!presetId) {
      const dow = new Date(iso + 'T12:00:00').getDay()
      if (themes.includes('meatless-monday' as never) && dow === 1)
        presetId = 'sys-day-meatless-monday'
      else if (themes.includes('taco-tuesday' as never) && dow === 2)
        presetId = 'sys-day-taco-tuesday'
      else if (themes.includes('pasta-wednesday' as never) && dow === 3)
        presetId = 'sys-day-pasta-wednesday'
      else if (themes.includes('pizza-friday' as never) && dow === 5)
        presetId = 'sys-day-pizza-friday'
    }
    out.set(iso, presetId)
  }
  return out
}

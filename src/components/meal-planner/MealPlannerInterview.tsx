// v2.0.0 — Meal-Planner Interview dialog.
//
// Walks the user through a declarative question tree (`src/engine/interview`),
// makes at most 2 Anthropic calls (parse-intake after q_freeform, propose-plan
// at the end), and hands the result to MealPlanEngine.applyInterviewResult.
//
// The dialog is full-screen on mobile (CLAUDE.md "fixed inset-0 overflow-hidden"
// pattern). Disclaimer renders above q_dietary and at the foot of q_review.

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
import { QUESTIONS } from '@/engine/interview/questions'
import {
  applyInferences,
  getNextQuestion,
  progressPercent,
  remainingQuestions,
} from '@/engine/interview/runtime'
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
}

type Stage = 'collecting' | 'parsing' | 'proposing' | 'reviewing' | 'submitting'

export function MealPlannerInterview({
  open,
  onOpenChange,
  planId,
  circleId,
  onApprove,
}: MealPlannerInterviewProps) {
  const t = useI18n((s) => s.t)
  const [stage, setStage] = useState<Stage>('collecting')
  const [answers, setAnswers] = useState<AnswerMap>(() => seedAnswers())
  const [skip, setSkip] = useState<SkipList>([])
  const [parsed, setParsed] = useState<IntakeParseResult | null>(null)
  const [proposal, setProposal] = useState<ProposePlanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewSwaps, setReviewSwaps] = useState<Record<string, string>>({})

  const currentQuestion = useMemo(
    () => getNextQuestion(answers, skip),
    [answers, skip],
  )
  const remaining = remainingQuestions(answers, skip)
  const progressPct = progressPercent(answers, skip)

  // When all questions answered (currentQuestion === q_review), trigger
  // propose-plan to draft the week.
  useEffect(() => {
    if (
      stage === 'collecting' &&
      currentQuestion?.id === 'q_review' &&
      proposal === null
    ) {
      void runProposePlan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, currentQuestion?.id, proposal])

  function setAnswer<K extends QuestionId>(id: K, value: AnswerMap[K]) {
    setAnswers((a) => ({ ...a, [id]: value }))
  }

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
      // Apply inferences + skip-list before returning to collecting.
      setAnswers((a) => applyInferences({ ...a, q_freeform: freeform }, out))
      setSkip(out.skip)
      void logUsage('meal_plan_parse_intake')
    } catch (err) {
      console.warn('[interview] parse-intake failed:', err)
      // Non-fatal — continue without skipping anything.
      setAnswers((a) => ({ ...a, q_freeform: freeform }))
    }
    setStage('collecting')
  }

  async function runProposePlan() {
    setStage('proposing')
    setError(null)
    try {
      const circleContext = await loadCircleContext(circleId)
      const recentDishes = await fetchRecentDishesForPlan(planId)
      const out = await callOp(
        'propose-plan',
        { answers, circleContext, recentDishes },
        ProposePlanResultSchema,
      )
      setProposal(out)
      void logUsage('meal_plan_propose_plan')
      setStage('reviewing')
    } catch (err) {
      console.warn('[interview] propose-plan failed:', err)
      setError(t('interview.proposing'))
      setStage('collecting')
    }
  }

  async function handleApprove() {
    if (!proposal) return
    setStage('submitting')
    try {
      const dayPresets = computeDayPresets(answers, parsed)
      const result: InterviewResult = {
        answers: { ...answers, q_review: { approved: true, finalCandidates: reviewSwaps } },
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
                {t('interview.banner.title')}
              </Dialog.Title>
            </div>
            <Dialog.Close
              className="rounded-full p-1 text-rp-ink/60 hover:bg-rp-ink/5 hover:text-rp-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {/* Progress bar */}
          {stage === 'collecting' && currentQuestion && currentQuestion.id !== 'q_review' && (
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
            {stage === 'parsing' && <BusyState message={t('interview.parsing')} />}
            {stage === 'proposing' && <BusyState message={t('interview.proposing')} />}
            {stage === 'submitting' && <BusyState message={t('interview.proposing')} />}
            {stage === 'collecting' && currentQuestion && currentQuestion.id !== 'q_review' && (
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
                    setAnswer={setAnswer}
                    onSubmitFreeform={(text) => void runParseIntake(text)}
                  />
                </motion.div>
              </AnimatePresence>
            )}
            {stage === 'reviewing' && proposal && (
              <ReviewStep
                proposal={proposal}
                swaps={reviewSwaps}
                setSwaps={setReviewSwaps}
              />
            )}
            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* Footer */}
          {stage === 'collecting' && currentQuestion && (
            <FooterButtons
              question={currentQuestion}
              answers={answers}
              onContinue={() => {
                // No-op — the AnswerMap update from QuestionStep already
                // advances the runtime cursor.
              }}
              onApprove={handleApprove}
              t={t}
            />
          )}
          {stage === 'reviewing' && proposal && (
            <ReviewFooter onApprove={handleApprove} t={t} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function BusyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <RefreshCcw className="h-8 w-8 text-rp-brand animate-spin" />
      <p className="text-rp-ink/70 font-display italic text-base">{message}</p>
    </div>
  )
}

function QuestionStep({
  question,
  answers,
  setAnswer,
  onSubmitFreeform,
}: {
  question: { id: QuestionId; kind: string; promptKey: string; helpKey?: string; options?: { id: string; labelKey: string; payload?: unknown }[] }
  answers: AnswerMap
  setAnswer: <K extends QuestionId>(id: K, value: AnswerMap[K]) => void
  onSubmitFreeform: (text: string) => void
}) {
  const t = useI18n((s) => s.t)
  const showDietaryDisclaimer = question.id === 'q_dietary'
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display italic text-2xl text-rp-ink leading-tight">
          {t(question.promptKey)}
        </h2>
        {question.helpKey && (
          <p className="mt-1 text-sm text-rp-ink/60 leading-snug">{t(question.helpKey)}</p>
        )}
      </div>

      {showDietaryDisclaimer && (
        <div className="rounded-xl border border-amber-300 bg-rp-bg-soft p-3 text-sm text-rp-ink/80">
          {t('interview.disclaimer.dietary')}
        </div>
      )}

      {question.kind === 'days_picker' && (
        <DaysPickerInput
          value={answers.q_days?.selectedDates ?? defaultWeekDates()}
          onChange={(v) => setAnswer('q_days', { selectedDates: v })}
        />
      )}
      {question.kind === 'meals_per_day' && (
        <MealsPerDayInput
          value={answers.q_meals_per_day ?? { breakfast: 0, lunch: 0, dinner: 3, snack: 0 }}
          onChange={(v) => setAnswer('q_meals_per_day', v)}
        />
      )}
      {question.kind === 'open_text' && question.id === 'q_freeform' && (
        <FreeformInput onSubmit={onSubmitFreeform} />
      )}
      {question.kind === 'open_text' && question.id === 'q_dislikes' && (
        <DislikesInput
          value={answers.q_dislikes ?? []}
          onChange={(v) => setAnswer('q_dislikes', v)}
        />
      )}
      {question.kind === 'number_pair' && (
        <NumberPairInput
          value={answers.q_headcount ?? { adults: 2, kids: 0 }}
          onChange={(v) => setAnswer('q_headcount', v)}
        />
      )}
      {question.kind === 'multi_select' && question.options && (
        <MultiSelectInput
          options={question.options}
          value={
            (question.id === 'q_dietary'
              ? answers.q_dietary
              : answers.q_themes) ?? []
          }
          onChange={(v) => {
            if (question.id === 'q_dietary') setAnswer('q_dietary', v)
            else if (question.id === 'q_themes') setAnswer('q_themes', v as never)
          }}
        />
      )}
      {question.kind === 'choice' && question.options && (
        <ChoiceInput
          options={question.options}
          value={
            question.id === 'q_prep_time'
              ? String(answers.q_prep_time ?? '')
              : question.id === 'q_calories'
                ? answers.q_calories ?? ''
                : answers.q_cooking_skill ?? ''
          }
          onChange={(opt) => {
            if (question.id === 'q_prep_time') {
              setAnswer('q_prep_time', (opt.payload as number) ?? Number(opt.id))
            } else if (question.id === 'q_calories') {
              setAnswer('q_calories', opt.id as 'light' | 'balanced' | 'hearty')
            } else if (question.id === 'q_cooking_skill') {
              setAnswer('q_cooking_skill', opt.id as 'easy' | 'normal' | 'challenge')
            }
          }}
        />
      )}
      {question.kind === 'preset_picker' && (
        <PresetPickerNote />
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
          <div key={m.key} className="flex items-center justify-between rounded-xl border border-rp-ink/10 px-4 py-3">
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
        <ArrowRight className="h-4 w-4" />
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
  useEffect(() => {
    const parts = text
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (parts.join(',') !== value.join(',')) onChange(parts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
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
            onChange={(e) => onChange({ ...value, [key]: Math.max(0, Number(e.target.value) || 0) })}
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

function PresetPickerNote() {
  const t = useI18n((s) => s.t)
  return (
    <p className="text-sm text-rp-ink/60">
      {t('interview.q.presetPerDayHelp')}
    </p>
  )
}

function ReviewStep({
  proposal,
  swaps,
  setSwaps,
}: {
  proposal: ProposePlanResult
  swaps: Record<string, string>
  setSwaps: (s: Record<string, string>) => void
}) {
  const t = useI18n((s) => s.t)
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display italic text-2xl text-rp-ink leading-tight">
          {t('interview.q.review')}
        </h2>
        <p className="mt-1 text-sm text-rp-ink/60 leading-snug">
          {t('interview.q.reviewHelp')}
        </p>
      </div>

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

function FooterButtons({
  question,
  answers,
  onApprove: _onApprove,
  t,
}: {
  question: { id: QuestionId; kind: string }
  answers: AnswerMap
  onContinue: () => void
  onApprove: () => void
  t: (k: string) => string
}) {
  // q_freeform has its own submit. Other steps progress automatically when
  // the user changes their answer, but we render a Continue button as fallback.
  if (question.kind === 'open_text' && question.id === 'q_freeform') {
    return null
  }
  if (question.id === 'q_review') {
    return null
  }
  // Continue is implicit for now (answer change triggers cursor advance).
  // We render a "Skip" / "Continue" pair to make the action explicit.
  const hasAnswer = answers[question.id] !== undefined
  return (
    <div className="border-t border-rp-ink/10 bg-rp-bg-soft px-4 py-3 sm:px-6 flex items-center justify-end gap-2">
      {hasAnswer && (
        <span className="text-xs text-rp-ink/50 mr-auto">
          {t('interview.next')} →
        </span>
      )}
    </div>
  )
}

function ReviewFooter({ onApprove, t }: { onApprove: () => void; t: (k: string) => string }) {
  return (
    <div className="border-t border-rp-ink/10 bg-rp-bg-soft px-4 py-3 sm:px-6 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onApprove}
        className="
          inline-flex items-center gap-1.5 rounded-full bg-rp-brand px-5 py-2.5
          text-sm font-medium text-white hover:bg-rp-brand/90 active:scale-[0.98]
        "
      >
        <Check className="h-4 w-4" />
        {t('interview.approve')}
      </button>
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

function seedAnswers(): AnswerMap {
  return {
    q_days: { selectedDates: defaultWeekDates() },
    q_meals_per_day: { breakfast: 0, lunch: 0, dinner: 3, snack: 0 },
  }
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
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
  // The engine has its own getRecentDishNames helper but it's private.
  // For the propose-plan call we just pass an empty array — the engine's
  // sibling/recent enforcement happens later during bank-fill anyway.
  return []
}

async function logUsage(actionType: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // 1 propose call ≈ ~1500 input tok + ~600 output tok on Haiku 4.5.
    // Cost = 1.5K * $0.001/M + 0.6K * $0.005/M = ~$0.0045
    await logAIUsage(user.id, actionType, 'claude-haiku-4-5-20251001', 1500, 600, 0.0045)
  } catch (err) {
    console.warn('[interview] logAIUsage failed:', err)
  }
}

function applySwaps(
  days: ProposePlanResult['days'],
  swaps: Record<string, string>,
): ProposePlanResult['days'] {
  return days.map((day, di) => ({
    ...day,
    meals: day.meals.map((meal, mi) => ({
      ...meal,
      slots: meal.slots.map((slot, si) => {
        const key = `${day.date}|${mi}|${si}`
        const chosen = swaps[key]
        if (!chosen) return slot
        // Move the chosen candidate to position 0 so applyInterviewResult
        // tries it first.
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
      if (themes.includes('meatless-monday' as never) && dow === 1) presetId = 'sys-day-meatless-monday'
      else if (themes.includes('taco-tuesday' as never) && dow === 2) presetId = 'sys-day-taco-tuesday'
      else if (themes.includes('pasta-wednesday' as never) && dow === 3) presetId = 'sys-day-pasta-wednesday'
      else if (themes.includes('pizza-friday' as never) && dow === 5) presetId = 'sys-day-pizza-friday'
    }
    out.set(iso, presetId)
  }
  return out
}

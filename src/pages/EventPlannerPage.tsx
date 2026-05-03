// EventPlannerPage — full-screen Event Planner v2 entry point.
//
// Mounted at /events/:id/plan (registered in src/App.tsx). Replaces the
// pre-v1.20 EventAIPlanDialog one-shot form.
//
// Phase machine driven by EventPlanEngine (src/engine/event/EventPlanEngine.ts).
// Phases: intake → questionnaire (loop) → proposing → proposal (review) →
// applying → applied. Entry from EventDetailPage banner.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Sparkles, X, ChevronLeft, Trash2, MessageCircle, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAIAccess } from '@/hooks/useAIAccess'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { useToast } from '@/components/ui/Toast'
import {
  getEvent,
  getEventItems,
  addEventItem,
  deleteEventItem,
  type EventItem,
} from '@/services/events'
import { supabase } from '@/services/supabase'
import { logAIUsage } from '@/services/ai-usage'
import { EventPlanEngine } from '@/engine/event/EventPlanEngine'
import { getQuestion, QUESTIONS } from '@/engine/event/questions'
import type {
  AnswerValue,
  DraftPlan,
  PlanItem,
  PlannerState,
  Question,
  QuestionOption,
} from '@/engine/event/types'

// Page-level engine instance — distinct from the meal engine. We don't use
// the singleton from getEventEngine() because tests need fresh state per
// run; a per-page instance is cheap. `useState` with an initializer creates
// the engine exactly once per mount (vs. `useRef` which would require reading
// `.current` during render — a Rules-of-Hooks violation under React 19).
const useEngine = () => {
  const [engine] = useState<EventPlanEngine>(
    () => new EventPlanEngine(supabase as unknown as never),
  )
  return engine
}

export function EventPlannerPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const ai = useAIAccess()
  const toast = useToast()
  const queryClient = useQueryClient()
  const engine = useEngine()

  // ─── Page state ─────────────────────────────────────────────────────────
  const [state, setState] = useState<PlannerState | null>(null)
  const [draft, setDraft] = useState<DraftPlan | null>(null)
  const [nextQuestionId, setNextQuestionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [reviseInstruction, setReviseInstruction] = useState('')
  const [isRevising, setIsRevising] = useState(false)
  const [tellMoreOpen, setTellMoreOpen] = useState(false)
  const [tellMoreText, setTellMoreText] = useState('')
  // manage-mode is computed UI state (NOT persisted in engine state). It
  // overrides phase rendering when there are already applied event_items —
  // i.e. the user has used the planner before and wants to edit, not re-plan.
  const [manageMode, setManageMode] = useState(false)

  // ─── Event lookup (for header) ──────────────────────────────────────────
  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => (eventId ? getEvent(eventId) : null),
    enabled: !!eventId,
  })

  // ─── Boot the engine + subscribe to bus events ──────────────────────────
  useEffect(() => {
    if (!eventId) return
    let off1: (() => void) | undefined
    let off2: (() => void) | undefined
    let off3: (() => void) | undefined
    let off4: (() => void) | undefined
    let cancelled = false

    void (async () => {
      try {
        const initial = await engine.start(eventId, { circleId: event?.circle_id ?? null })
        if (cancelled) return
        setState(initial)
        setDraft(engine.getPlan(eventId))

        // Probe for existing applied items. If anything is already on the
        // event, default to manage-mode — that's the only way to avoid the
        // blank-page when the engine state says "applied" but the in-memory
        // draft is null (apply() clears events.draft_plan).
        try {
          const items = await getEventItems(eventId)
          if (!cancelled && (items.length > 0 || initial.phase === 'applied')) {
            setManageMode(true)
          }
        } catch {
          // non-fatal — keep the flow open
        }

        off1 = engine.on('state', (s) => setState({ ...s }))
        off2 = engine.on('next-question', (p) => setNextQuestionId(p.questionId))
        off3 = engine.on('plan', (p) => setDraft({ ...p }))
        off4 = engine.on('error', (p) => setErrorMessage(p.message))
      } catch (err) {
        if (cancelled) return
        setErrorMessage((err as Error).message ?? 'Failed to load planner')
      }
    })()

    return () => {
      cancelled = true
      off1?.()
      off2?.()
      off3?.()
      off4?.()
      // Cancel any in-flight call so navigating away aborts the AI call.
      engine.cancel(eventId)
    }
  }, [engine, eventId, event?.circle_id])

  // Hooks must be called before any early return to satisfy Rules of Hooks.
  const totalQuestions = useMemo(() => {
    if (!state) return 0
    const map = EventPlanEngine.answersToMap(state.answers)
    return QUESTIONS.filter((q) => !q.condition || q.condition(map)).length
  }, [state])

  if (!eventId) return null

  const phase = state?.phase ?? 'intake'
  const answeredCount = state ? Object.keys(state.answers).length : 0

  // ─── Handlers ───────────────────────────────────────────────────────────
  async function handleIntakeSubmit(text: string, opts: { skip?: boolean } = {}) {
    if (!eventId) return
    setErrorMessage(null)
    if (opts.skip) {
      await engine.submitIntake(eventId, '')
      return
    }
    await engine.submitIntake(eventId, text)
  }

  async function handleAnswer(questionId: string, value: AnswerValue) {
    if (!eventId) return
    setErrorMessage(null)
    await engine.setAnswer(eventId, questionId, value)
  }

  async function handleSkipCurrentQuestion() {
    if (!eventId || !nextQuestionId) return
    await engine.skipQuestion(eventId, nextQuestionId)
  }

  async function handleBack() {
    if (!eventId || !state) return
    const ids = Object.keys(state.answers)
    if (ids.length === 0) return
    const last = ids[ids.length - 1]
    await engine.unanswer(eventId, last)
  }

  async function handlePropose() {
    if (!eventId) return
    setErrorMessage(null)
    if (!ai.checkAIAccess()) {
      // Free tier can still get a deterministic catalog plan.
      try {
        const sessionId = localStorage.getItem('replanish_session_id') ?? crypto.randomUUID()
        await engine.propose(eventId, {
          circleId: event?.circle_id ?? null,
          freeTierOnly: true,
          sessionId,
        })
      } catch (err) {
        setErrorMessage((err as Error).message)
      }
      return
    }
    try {
      const sessionId = localStorage.getItem('replanish_session_id') ?? crypto.randomUUID()
      await engine.propose(eventId, {
        circleId: event?.circle_id ?? null,
        sessionId,
      })
      // Best-effort AI usage logging — engine doesn't surface tokens directly,
      // so we tag a 0-cost row to mark the feature touch (the edge fn already
      // recorded actual spend if it happened). Skip if no auth.
    } catch (err) {
      setErrorMessage((err as Error).message)
    }
  }

  async function handleRevise() {
    if (!eventId || !reviseInstruction.trim()) return
    setIsRevising(true)
    setErrorMessage(null)
    try {
      await engine.revise(eventId, reviseInstruction.trim(), {
        circleId: event?.circle_id ?? null,
      })
      setReviseInstruction('')
    } catch (err) {
      setErrorMessage((err as Error).message)
    } finally {
      setIsRevising(false)
    }
  }

  async function handleApply() {
    if (!eventId) return
    setErrorMessage(null)
    try {
      const { inserted } = await engine.apply(eventId)
      const message = t('event.planner.review.applied').replace('{count}', String(inserted))
      toast.success(message)
      queryClient.invalidateQueries({ queryKey: ['event-items', eventId] })
      // Best-effort AI usage logging. Even if the engine's call burned tokens,
      // the edge function already recorded the row server-side; this is a
      // marker so the client also sees the touch.
      const { data: authData } = await supabase.auth.getUser()
      if (authData.user) {
        await logAIUsage(
          authData.user.id,
          'event_plan',
          'event-engine',
          0,
          0,
          0,
          { feature_context: 'event_planner_v2' },
        )
      }
      navigate(`/events/${eventId}`, { replace: true })
    } catch (err) {
      setErrorMessage((err as Error).message)
    }
  }

  async function handleTellMore() {
    if (!eventId || !tellMoreText.trim()) return
    await engine.submitIntake(eventId, tellMoreText.trim(), { tellMore: true })
    setTellMoreOpen(false)
    setTellMoreText('')
  }

  async function handleCancelInflight() {
    if (!eventId) return
    engine.cancel(eventId)
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const headerLabel = event?.name || t('event.planner.title')

  return (
    <div className="min-h-screen bg-rp-bg">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-rp-card border-b border-rp-hairline">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(`/events/${eventId}`)}
            className="p-2 -m-2 text-rp-ink-soft hover:text-rp-ink"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider font-mono text-rp-brand">
              {t('event.planner.title')}
            </p>
            <p className="text-sm font-display italic text-rp-ink truncate">{headerLabel}</p>
          </div>
          {phase === 'questionnaire' && totalQuestions > 0 && (
            <p className="text-xs font-mono text-rp-ink-mute tabular-nums">
              {answeredCount}/{totalQuestions}
            </p>
          )}
        </div>
        {phase === 'questionnaire' && totalQuestions > 0 && (
          <div className="h-1 bg-rp-bg-soft">
            <div
              className="h-full bg-rp-brand transition-all duration-300"
              style={{ width: `${Math.min(100, (answeredCount / totalQuestions) * 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-32 pt-6">
        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-sm text-red-900 dark:text-red-100">
            {errorMessage}
          </div>
        )}

        {manageMode && eventId ? (
          <PlanManage
            eventId={eventId}
            circleId={event?.circle_id ?? null}
            onStartFresh={() => {
              setManageMode(false)
              // Reset draft so the propose path can run again
              setDraft(null)
            }}
          />
        ) : null}

        {!manageMode && phase === 'intake' && (
          <PlannerIntake
            initialText={state?.freeText ?? ''}
            onSubmit={(text) => handleIntakeSubmit(text)}
            onSkip={() => handleIntakeSubmit('', { skip: true })}
          />
        )}

        {!manageMode && phase === 'questionnaire' && nextQuestionId && state && (
          <QuestionTurn
            key={nextQuestionId}
            question={getQuestion(nextQuestionId)!}
            engine={engine}
            eventId={eventId}
            onAnswer={(value) => handleAnswer(nextQuestionId, value)}
            onSkip={handleSkipCurrentQuestion}
            onBack={Object.keys(state.answers).length > 0 ? handleBack : undefined}
            onTellMore={() => {
              setTellMoreText(state?.freeText ?? '')
              setTellMoreOpen(true)
            }}
          />
        )}

        {!manageMode && phase === 'questionnaire' && !nextQuestionId && (
          <Card className="p-6 text-center space-y-4">
            <Sparkles className="h-10 w-10 text-rp-brand mx-auto" />
            <p className="font-display text-2xl italic text-rp-ink">
              {t('event.planner.review.title')}
            </p>
            <p className="text-sm text-rp-ink-soft">
              {t('event.planner.subtitle')}
            </p>
            <Button onClick={handlePropose} className="w-full">
              {t('event.planner.review.title')}
            </Button>
          </Card>
        )}

        {!manageMode && phase === 'proposing' && (
          <Card className="p-8 text-center space-y-4">
            <div className="h-12 w-12 mx-auto rounded-full bg-gradient-to-br from-rp-brand to-purple-500 flex items-center justify-center">
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="font-display text-xl italic text-rp-ink">
              {t('event.planner.proposing')}
            </p>
            <Button variant="secondary" onClick={handleCancelInflight}>
              {t('event.planner.cancel')}
            </Button>
          </Card>
        )}

        {!manageMode && (phase === 'proposal' || phase === 'applying' || phase === 'applied') && draft && (
          <PlanReview
            draft={draft}
            engine={engine}
            eventId={eventId}
            isApplying={phase === 'applying'}
            reviseInstruction={reviseInstruction}
            onReviseInstructionChange={setReviseInstruction}
            isRevising={isRevising}
            onRevise={handleRevise}
            onApply={handleApply}
          />
        )}

        {!manageMode && phase === 'error' && (
          <Card className="p-6 space-y-3">
            <p className="font-display text-xl italic text-rp-ink">
              {t('event.planner.error.title')}
            </p>
            <p className="text-sm text-rp-ink-soft">
              {state?.errorMessage ?? errorMessage ?? '—'}
            </p>
            <Button onClick={handlePropose}>{t('event.planner.error.retry')}</Button>
          </Card>
        )}
      </div>

      {tellMoreOpen && (
        <TellMoreSheet
          text={tellMoreText}
          onChange={setTellMoreText}
          onSubmit={handleTellMore}
          onClose={() => setTellMoreOpen(false)}
          placeholder={t('event.planner.tellMore.placeholder')}
        />
      )}

      <AIUpgradeModal
        open={ai.showUpgradeModal || showUpgrade}
        onOpenChange={(open) => {
          if (!open) {
            ai.setShowUpgradeModal(false)
            setShowUpgrade(false)
          }
        }}
        isLimitReached={ai.upgradeReason === 'ai_limit'}
        isImportCapReached={ai.upgradeReason === 'recipe_import_cap'}
      />
    </div>
  )
}

// ─── PlannerIntake ──────────────────────────────────────────────────────────

interface PlannerIntakeProps {
  initialText: string
  onSubmit: (text: string) => void
  onSkip: () => void
}

function PlannerIntake({ initialText, onSubmit, onSkip }: PlannerIntakeProps) {
  const { t } = useI18n()
  const [text, setText] = useState(initialText)

  return (
    <Card className="p-6 space-y-5">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider font-mono text-rp-brand">
          {t('event.planner.title')}
        </p>
        <p className="font-display text-2xl italic text-rp-ink leading-tight">
          {t('event.planner.subtitle')}
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 600))}
        placeholder={t('event.planner.intake.placeholder')}
        rows={6}
        maxLength={600}
        className="w-full px-3 py-2 rounded-xl text-sm bg-rp-bg-soft border border-rp-hairline text-rp-ink placeholder:text-rp-ink-mute focus:outline-none focus:ring-2 focus:ring-rp-brand/40 resize-none"
      />
      <div className="flex flex-col gap-2">
        <Button onClick={() => onSubmit(text)} disabled={text.trim().length === 0}>
          {t('event.planner.intake.cta')}
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-rp-ink-mute hover:text-rp-ink py-2"
        >
          {t('event.planner.intake.skipCta')}
        </button>
      </div>
    </Card>
  )
}

// ─── QuestionTurn ──────────────────────────────────────────────────────────

interface QuestionTurnProps {
  question: Question
  engine: EventPlanEngine
  eventId: string
  onAnswer: (value: AnswerValue) => void
  onSkip: () => void
  onBack?: () => void
  onTellMore: () => void
}

function QuestionTurn({
  question,
  engine,
  eventId,
  onAnswer,
  onSkip,
  onBack,
  onTellMore,
}: QuestionTurnProps) {
  const { t } = useI18n()
  const prefilled = engine.prefilledValueFor(eventId, question.id)

  return (
    <Card className="p-6 space-y-5">
      <div className="space-y-2">
        <p className="font-display text-2xl italic text-rp-ink leading-tight">
          {t(question.promptKey)}
        </p>
        {question.helpKey && (
          <p className="text-sm text-rp-ink-soft">{t(question.helpKey)}</p>
        )}
      </div>

      <QuestionInput question={question} prefilled={prefilled} onAnswer={onAnswer} />

      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-xs flex items-center gap-1 text-rp-ink-mute hover:text-rp-ink py-2 px-2 -mx-2"
            >
              <ChevronLeft className="h-3 w-3" />
              {t('event.planner.back')}
            </button>
          )}
          <button
            type="button"
            onClick={onTellMore}
            className="text-xs flex items-center gap-1 text-rp-ink-mute hover:text-rp-ink py-2 px-2"
          >
            <MessageCircle className="h-3 w-3" />
            {t('event.planner.tellMore')}
          </button>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-rp-ink-mute hover:text-rp-ink py-2 px-2"
        >
          {t('event.planner.skip')}
        </button>
      </div>
    </Card>
  )
}

// ─── QuestionInput — branches on Question.kind ──────────────────────────────

interface QuestionInputProps {
  question: Question
  prefilled: AnswerValue | undefined
  onAnswer: (value: AnswerValue) => void
}

function QuestionInput({ question, prefilled, onAnswer }: QuestionInputProps) {
  if (question.kind === 'chips') {
    const selected = (typeof prefilled === 'string' ? prefilled : '') as string
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {question.options?.map((opt) => (
          <ChipButton
            key={opt.value}
            opt={opt}
            selected={selected === opt.value}
            onClick={() => onAnswer(opt.value)}
          />
        ))}
      </div>
    )
  }

  if (question.kind === 'multi') {
    const selected: string[] = Array.isArray(prefilled) ? (prefilled as string[]) : []
    return (
      <MultiPicker
        options={question.options ?? []}
        selected={selected}
        onChange={(next) => onAnswer(next)}
        onConfirm={() => onAnswer(selected)}
      />
    )
  }

  if (question.kind === 'slider') {
    const value = typeof prefilled === 'number' ? prefilled : (question.min ?? 0)
    return (
      <SliderInput
        min={question.min ?? 0}
        max={question.max ?? 10}
        step={question.step ?? 1}
        value={value}
        onChange={(v) => onAnswer(v)}
      />
    )
  }

  if (question.kind === 'datetime') {
    const v =
      prefilled && typeof prefilled === 'object' && 'date' in (prefilled as object)
        ? (prefilled as { date: string; time?: string | null })
        : { date: '', time: '' }
    return (
      <DateTimeInput
        value={v}
        onChange={(next) => onAnswer(next)}
      />
    )
  }

  if (question.kind === 'confirm') {
    const value = typeof prefilled === 'boolean' ? prefilled : null
    return (
      <div className="grid grid-cols-2 gap-2">
        <ChipButton
          opt={{ value: 'yes', labelKey: 'event.planner.confirm.yes' }}
          selected={value === true}
          onClick={() => onAnswer(true)}
        />
        <ChipButton
          opt={{ value: 'no', labelKey: 'event.planner.confirm.no' }}
          selected={value === false}
          onClick={() => onAnswer(false)}
        />
      </div>
    )
  }

  if (question.kind === 'text' || question.kind === 'long-text') {
    const initial = typeof prefilled === 'string' ? prefilled : ''
    return <TextInput question={question} initial={initial} onAnswer={onAnswer} />
  }

  return null
}

function ChipButton({
  opt,
  selected,
  onClick,
}: {
  opt: QuestionOption
  selected: boolean
  onClick: () => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[48px] rounded-2xl px-3 py-2 text-sm font-medium border transition-all active:scale-[0.97]',
        selected
          ? 'bg-rp-brand text-white border-rp-brand'
          : 'bg-rp-bg-soft text-rp-ink border-rp-hairline hover:border-rp-brand',
      )}
    >
      {t(opt.labelKey)}
    </button>
  )
}

function MultiPicker({
  options,
  selected,
  onChange,
  onConfirm,
}: {
  options: QuestionOption[]
  selected: string[]
  onChange: (next: string[]) => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const [picks, setPicks] = useState<string[]>(selected)

  function toggle(value: string) {
    setPicks((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((opt) => (
          <ChipButton
            key={opt.value}
            opt={opt}
            selected={picks.includes(opt.value)}
            onClick={() => toggle(opt.value)}
          />
        ))}
      </div>
      <Button
        onClick={() => {
          onChange(picks)
          onConfirm()
        }}
        className="w-full"
      >
        {t('event.planner.next')}
      </Button>
    </div>
  )
}

function SliderInput({
  min,
  max,
  step,
  value,
  onChange,
}: {
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  const { t } = useI18n()
  const [v, setV] = useState(value)
  return (
    <div className="space-y-4">
      <div className="text-center font-display text-4xl italic text-rp-ink tabular-nums">{v}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        className="w-full accent-rp-brand"
      />
      <div className="flex items-center justify-between text-xs text-rp-ink-mute">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <Button onClick={() => onChange(v)} className="w-full">
        {t('event.planner.next')}
      </Button>
    </div>
  )
}

function DateTimeInput({
  value,
  onChange,
}: {
  value: { date: string; time?: string | null }
  onChange: (v: { date: string; time?: string | null }) => void
}) {
  const { t } = useI18n()
  const [date, setDate] = useState(value.date)
  const [time, setTime] = useState(value.time ?? '')
  return (
    <div className="space-y-3">
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full"
      />
      <Input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-full"
      />
      <Button onClick={() => onChange({ date, time: time || null })} className="w-full" disabled={!date}>
        {t('event.planner.next')}
      </Button>
    </div>
  )
}

function TextInput({
  question,
  initial,
  onAnswer,
}: {
  question: Question
  initial: string
  onAnswer: (value: AnswerValue) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState(initial)
  if (question.kind === 'long-text') {
    return (
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-xl text-sm bg-rp-bg-soft border border-rp-hairline text-rp-ink focus:outline-none focus:ring-2 focus:ring-rp-brand/40 resize-none"
        />
        <Button onClick={() => onAnswer(text)} className="w-full">
          {t('event.planner.next')}
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Input value={text} onChange={(e) => setText(e.target.value)} className="w-full" />
      <Button onClick={() => onAnswer(text)} className="w-full">
        {t('event.planner.next')}
      </Button>
    </div>
  )
}

// ─── PlanReview ────────────────────────────────────────────────────────────

interface PlanReviewProps {
  draft: DraftPlan
  engine: EventPlanEngine
  eventId: string
  isApplying: boolean
  reviseInstruction: string
  onReviseInstructionChange: (s: string) => void
  isRevising: boolean
  onRevise: () => void
  onApply: () => void
}

function PlanReview({
  draft,
  engine,
  eventId,
  isApplying,
  reviseInstruction,
  onReviseInstructionChange,
  isRevising,
  onRevise,
  onApply,
}: PlanReviewProps) {
  const { t } = useI18n()
  const dishes = draft.items.filter((it) => it.type === 'dish')
  const supplies = draft.items.filter((it) => it.type === 'supply')
  const tasks = draft.items.filter((it) => it.type === 'task' && it.category !== 'activity')
  const activities = draft.items.filter((it) => it.type === 'task' && it.category === 'activity')

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-mono text-rp-brand">
          <Sparkles className="h-3 w-3" />
          {t('event.planner.review.title')}
        </div>
        {draft.timelineSummary && (
          <p className="text-sm text-rp-ink-soft leading-relaxed whitespace-pre-line">
            {draft.timelineSummary}
          </p>
        )}
      </Card>

      {draft.fallback && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-xs text-amber-900 dark:text-amber-100">
          {t('event.planner.review.fallbackBanner')}
        </div>
      )}

      {draft.clarifyingQuestion && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm text-amber-900 dark:text-amber-100 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wide">
            {t('event.planner.review.clarifyingBanner')}
          </p>
          <p>{draft.clarifyingQuestion}</p>
        </div>
      )}

      <PlanSection
        title={t('event.planner.review.dishes')}
        items={dishes}
        engine={engine}
        eventId={eventId}
      />
      <PlanSection
        title={t('event.planner.review.supplies')}
        items={supplies}
        engine={engine}
        eventId={eventId}
      />
      <PlanSection
        title={t('event.planner.review.tasks')}
        items={tasks}
        engine={engine}
        eventId={eventId}
      />
      <PlanSection
        title={t('event.planner.review.activities')}
        items={activities}
        engine={engine}
        eventId={eventId}
      />

      <Card className="p-4 space-y-2">
        <p className="text-xs uppercase tracking-wider font-mono text-rp-ink-mute">
          {t('event.planner.review.revise')}
        </p>
        <Input
          value={reviseInstruction}
          onChange={(e) => onReviseInstructionChange(e.target.value)}
          placeholder={t('event.planner.review.revisePlaceholder')}
          className="w-full"
        />
        <Button
          variant="secondary"
          onClick={onRevise}
          disabled={isRevising || reviseInstruction.trim().length === 0}
          className="w-full"
        >
          {isRevising ? t('event.planner.proposing') : t('event.planner.review.revise')}
        </Button>
      </Card>

      <div className="sticky bottom-0 bg-rp-bg pt-3 pb-2 -mx-4 px-4">
        <Button onClick={onApply} disabled={isApplying} className="w-full">
          {isApplying ? t('event.planner.review.applying') : t('event.planner.review.apply')}
        </Button>
      </div>
    </div>
  )
}

function PlanSection({
  title,
  items,
  engine,
  eventId,
}: {
  title: string
  items: PlanItem[]
  engine: EventPlanEngine
  eventId: string
}) {
  const [showRemove, setShowRemove] = useState<string | null>(null)
  if (items.length === 0) return null

  return (
    <Card className="p-4 space-y-2">
      <p className="text-xs uppercase tracking-wider font-mono text-rp-ink-mute">{title}</p>
      <ul className="divide-y divide-rp-hairline">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-start gap-2 py-2 text-sm"
            onMouseEnter={() => setShowRemove(it.id)}
            onMouseLeave={() => setShowRemove((prev) => (prev === it.id ? null : prev))}
          >
            <div className="flex-1 min-w-0">
              <p className="text-rp-ink truncate">{it.name}</p>
              {(it.dueWhen || it.notes) && (
                <p className="text-xs text-rp-ink-mute truncate">
                  {it.dueWhen ? `${it.dueWhen}` : ''}
                  {it.dueWhen && it.notes ? ' · ' : ''}
                  {it.notes ?? ''}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => engine.removeItem(eventId, it.id)}
              className={cn(
                'p-1 rounded text-rp-ink-mute hover:text-red-600 transition-opacity',
                showRemove === it.id ? 'opacity-100' : 'opacity-50 sm:opacity-0',
              )}
              aria-label="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── TellMoreSheet ─────────────────────────────────────────────────────────

function TellMoreSheet({
  text,
  onChange,
  onSubmit,
  onClose,
  placeholder,
}: {
  text: string
  onChange: (s: string) => void
  onSubmit: () => void
  onClose: () => void
  placeholder: string
}) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-rp-card rounded-t-3xl sm:rounded-3xl p-5 w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-xl italic text-rp-ink">{t('event.planner.tellMore')}</p>
          <button onClick={onClose} className="p-1 text-rp-ink-mute" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value.slice(0, 600))}
          rows={5}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-xl text-sm bg-rp-bg-soft border border-rp-hairline text-rp-ink focus:outline-none focus:ring-2 focus:ring-rp-brand/40 resize-none"
        />
        <Button onClick={onSubmit} disabled={text.trim().length === 0} className="w-full">
          {t('event.planner.next')}
        </Button>
      </div>
    </div>
  )
}

// ─── PlanManage ────────────────────────────────────────────────────────────
//
// Edit-existing-plan mode. Loads `event_items` directly (the source of
// truth post-apply) and lets the user add/remove dishes, supplies, tasks,
// and activities. Reuses the existing event-services CRUD so nothing
// here needs new RPCs.
//
// Avoids the blank-page bug from EventPlanEngine.apply() clearing
// events.draft_plan but keeping phase='applied' — when the engine is
// loaded later, draft is null and the original PlanReview branch can't
// render. PlanManage doesn't depend on draft at all.

function PlanManage({
  eventId,
  circleId: _circleId,
  onStartFresh,
}: {
  eventId: string
  circleId: string | null
  onStartFresh: () => void
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['event-items', eventId],
    queryFn: () => getEventItems(eventId),
  })

  const dishes = items.filter((it) => it.type === 'dish')
  const supplies = items.filter((it) => it.type === 'supply')
  const tasks = items.filter((it) => it.type === 'task' && it.category !== 'activity')
  const activities = items.filter((it) => it.type === 'task' && it.category === 'activity')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['event-items', eventId] })

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-mono text-rp-brand">
          <Sparkles className="h-3 w-3" />
          {t('event.planner.manage.title')}
        </div>
        <p className="text-sm text-rp-ink-soft">
          {isLoading ? t('common.loading') : t('event.planner.manage.subtitle')}
        </p>
      </Card>

      <ManageSection
        title={t('event.planner.review.dishes')}
        type="dish"
        items={dishes}
        eventId={eventId}
        onChanged={refresh}
      />
      <ManageSection
        title={t('event.planner.review.supplies')}
        type="supply"
        items={supplies}
        eventId={eventId}
        onChanged={refresh}
      />
      <ManageSection
        title={t('event.planner.review.tasks')}
        type="task"
        category="other"
        items={tasks}
        eventId={eventId}
        onChanged={refresh}
      />
      <ManageSection
        title={t('event.planner.review.activities')}
        type="task"
        category="activity"
        items={activities}
        eventId={eventId}
        onChanged={refresh}
      />

      <Card className="p-4 space-y-2">
        <p className="text-xs uppercase tracking-wider font-mono text-rp-ink-mute">
          {t('event.planner.manage.startFreshTitle')}
        </p>
        <p className="text-xs text-rp-ink-soft">
          {t('event.planner.manage.startFreshHelp')}
        </p>
        <Button variant="secondary" onClick={onStartFresh} className="w-full">
          {t('event.planner.manage.startFresh')}
        </Button>
      </Card>
    </div>
  )
}

function ManageSection({
  title,
  type,
  category,
  items,
  eventId,
  onChanged,
}: {
  title: string
  type: 'dish' | 'supply' | 'task'
  category?: string
  items: EventItem[]
  eventId: string
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAdd() {
    const name = draft.trim()
    if (!name) return
    setBusy(true)
    try {
      await addEventItem(eventId, {
        type,
        name,
        category: category ?? (type === 'dish' ? 'other' : type === 'supply' ? 'other' : 'other'),
      })
      setDraft('')
      setAdding(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(itemId: string) {
    setBusy(true)
    try {
      await deleteEventItem(itemId)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider font-mono text-rp-ink-mute">{title}</p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="p-1 rounded text-rp-ink-mute hover:text-rp-brand"
          aria-label={t('event.planner.manage.add')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {items.length === 0 && !adding && (
        <p className="text-xs text-rp-ink-mute italic">{t('event.planner.manage.empty')}</p>
      )}

      <ul className="divide-y divide-rp-hairline">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-2 py-2 text-sm">
            <div className="flex-1 min-w-0">
              <p className="text-rp-ink truncate">{it.name}</p>
              {it.notes && <p className="text-xs text-rp-ink-mute truncate">{it.notes}</p>}
            </div>
            <button
              type="button"
              onClick={() => handleRemove(it.id)}
              disabled={busy}
              className="p-1 rounded text-rp-ink-mute hover:text-red-600 disabled:opacity-50"
              aria-label={t('common.delete')}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="flex items-center gap-2 pt-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('event.planner.manage.addPlaceholder')}
            className="flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
          />
          <Button onClick={handleAdd} disabled={busy || !draft.trim()}>
            {t('event.planner.manage.add')}
          </Button>
        </div>
      )}
    </Card>
  )
}

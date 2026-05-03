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
import { ArrowLeft, Sparkles, X, ChevronLeft, Trash2, MessageCircle, Layers, Sparkle, ListChecks, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAIAccess } from '@/hooks/useAIAccess'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { useToast } from '@/components/ui/Toast'
import {
  getEvent,
  getEventItems,
  deleteEventItems,
  deleteAllEventItems,
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
  // intent-mode is computed UI state (NOT persisted in engine state). It
  // overrides phase rendering when there are already applied event_items —
  // i.e. the user opened the AI planner on an event that already has dishes /
  // supplies / tasks. We ask them how to proceed (add on top, wipe, or pick
  // what to remove) BEFORE running the questionnaire.
  // intentResolved flips true once the user chooses; from then on the normal
  // engine phase machine drives the UI.
  const [intentResolved, setIntentResolved] = useState(false)
  const [hasExistingItems, setHasExistingItems] = useState(false)
  const [existingItemCount, setExistingItemCount] = useState(0)

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
        // event, route through the intent picker so the user explicitly
        // chooses add-vs-wipe-vs-pick before we start a fresh questionnaire.
        // (Without this we'd land on a blank page when the engine state says
        // "applied" but the in-memory draft is null — apply() clears
        // events.draft_plan but persists phase='applied'.)
        try {
          const items = await getEventItems(eventId)
          if (!cancelled && (items.length > 0 || initial.phase === 'applied')) {
            setHasExistingItems(true)
            setExistingItemCount(items.length)
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

        {hasExistingItems && !intentResolved && eventId ? (
          <PlanIntent
            eventId={eventId}
            itemCount={existingItemCount}
            onResolved={async ({ wipe }) => {
              // wipe == true means "Start fresh" or pick-to-remove already
              // ran its own deletes; either way reset the engine state so the
              // questionnaire restarts with no leftover answers from a prior
              // session.
              await engine.reset(eventId)
              setDraft(null)
              setErrorMessage(null)
              setIntentResolved(true)
              if (wipe) {
                setHasExistingItems(false)
                setExistingItemCount(0)
              } else {
                // Refresh count for any items the user removed via pick.
                try {
                  const items = await getEventItems(eventId)
                  setExistingItemCount(items.length)
                  setHasExistingItems(items.length > 0)
                } catch {
                  // ignore
                }
              }
              queryClient.invalidateQueries({ queryKey: ['event-items', eventId] })
            }}
            onCancel={() => navigate(`/events/${eventId}`)}
          />
        ) : (
          <>
            {phase === 'intake' && (
              <PlannerIntake
                initialText={state?.freeText ?? ''}
                onSubmit={(text) => handleIntakeSubmit(text)}
                onSkip={() => handleIntakeSubmit('', { skip: true })}
              />
            )}

            {phase === 'questionnaire' && nextQuestionId && state && (
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

            {phase === 'questionnaire' && !nextQuestionId && (
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

            {phase === 'proposing' && (
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

            {(phase === 'proposal' || phase === 'applying' || phase === 'applied') && draft && (
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

            {phase === 'error' && (
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
          </>
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

// ─── PlanIntent ────────────────────────────────────────────────────────────
//
// Shown when the AI planner is opened on an event that already has items.
// Three options:
//   1. Add to existing items — straight to questionnaire, new items append.
//   2. Start from scratch — confirm → wipe ALL event_items → questionnaire.
//   3. Pick what to remove — sub-screen lets user select items to delete,
//      then proceed to questionnaire (additions land on top of the rest).
//
// onResolved({ wipe }) — called once the user is ready to start the AI
// questionnaire. wipe=true means we already deleted items (start-fresh OR
// pick-and-remove) so the page should refresh its existing-items count.

function PlanIntent({
  eventId,
  itemCount,
  onResolved,
  onCancel,
}: {
  eventId: string
  itemCount: number
  onResolved: (opts: { wipe: boolean }) => Promise<void> | void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [showFreshConfirm, setShowFreshConfirm] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [busy, setBusy] = useState(false)

  if (pickMode) {
    return (
      <PickItemsToRemove
        eventId={eventId}
        onBack={() => setPickMode(false)}
        onDone={async () => {
          await onResolved({ wipe: true })
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-mono text-rp-brand">
          <Sparkles className="h-3 w-3" />
          {t('event.planner.intent.title')}
        </div>
        <p className="font-display text-2xl italic text-rp-ink leading-tight">
          {t('event.planner.intent.subtitle')}
        </p>
        <p className="text-xs text-rp-ink-mute">
          {t('event.planner.intent.itemCount').replace('{count}', String(itemCount))}
        </p>
      </Card>

      <IntentChoice
        icon={<Layers className="h-5 w-5" />}
        title={t('event.planner.intent.add.title')}
        help={t('event.planner.intent.add.help')}
        onClick={async () => {
          if (busy) return
          setBusy(true)
          try {
            await onResolved({ wipe: false })
          } finally {
            setBusy(false)
          }
        }}
        disabled={busy}
      />
      <IntentChoice
        icon={<Sparkle className="h-5 w-5" />}
        title={t('event.planner.intent.fresh.title')}
        help={t('event.planner.intent.fresh.help')}
        onClick={() => setShowFreshConfirm(true)}
        destructive
        disabled={busy}
      />
      <IntentChoice
        icon={<ListChecks className="h-5 w-5" />}
        title={t('event.planner.intent.pick.title')}
        help={t('event.planner.intent.pick.help')}
        onClick={() => setPickMode(true)}
        disabled={busy}
      />

      <button
        onClick={onCancel}
        className="w-full text-xs text-rp-ink-mute hover:text-rp-ink py-3"
      >
        {t('common.cancel')}
      </button>

      <ConfirmDialog
        open={showFreshConfirm}
        onOpenChange={setShowFreshConfirm}
        title={t('event.planner.intent.fresh.confirmTitle')}
        description={t('event.planner.intent.fresh.confirmBody').replace('{count}', String(itemCount))}
        confirmLabel={t('event.planner.intent.fresh.confirmCta')}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => {
          if (busy) return
          setBusy(true)
          try {
            await deleteAllEventItems(eventId)
            await onResolved({ wipe: true })
          } catch (err) {
            toast.error((err as Error).message ?? 'Failed to delete items')
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}

function IntentChoice({
  icon,
  title,
  help,
  onClick,
  destructive = false,
  disabled = false,
}: {
  icon: React.ReactNode
  title: string
  help: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full text-start rounded-2xl p-4 transition-all border bg-rp-card',
        'hover:border-rp-brand active:scale-[0.99] disabled:opacity-50',
        destructive ? 'border-rp-hairline hover:border-red-400' : 'border-rp-hairline',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
            destructive ? 'bg-red-50 text-red-600 dark:bg-red-950/30' : 'bg-rp-bg-soft text-rp-brand',
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rp-ink">{title}</p>
          <p className="text-xs text-rp-ink-soft mt-0.5 leading-snug">{help}</p>
        </div>
      </div>
    </button>
  )
}

// ─── PickItemsToRemove ─────────────────────────────────────────────────────
//
// Sub-screen of PlanIntent. Lists every event_item with a checkbox; user
// taps the ones they want gone, confirms, we batch-delete, then proceed.

function PickItemsToRemove({
  eventId,
  onBack,
  onDone,
}: {
  eventId: string
  onBack: () => void
  onDone: () => Promise<void> | void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['event-items', eventId],
    queryFn: () => getEventItems(eventId),
  })

  const sectioned = useMemo(() => {
    const dishes = items.filter((it) => it.type === 'dish')
    const supplies = items.filter((it) => it.type === 'supply')
    const tasks = items.filter((it) => it.type === 'task' && it.category !== 'activity')
    const activities = items.filter((it) => it.type === 'task' && it.category === 'activity')
    return [
      { titleKey: 'event.planner.review.dishes', items: dishes },
      { titleKey: 'event.planner.review.supplies', items: supplies },
      { titleKey: 'event.planner.review.tasks', items: tasks },
      { titleKey: 'event.planner.review.activities', items: activities },
    ].filter((s) => s.items.length > 0)
  }, [items])

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-2">
        <button
          onClick={onBack}
          className="text-xs flex items-center gap-1 text-rp-ink-mute hover:text-rp-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          {t('event.planner.pick.back')}
        </button>
        <p className="font-display text-2xl italic text-rp-ink leading-tight">
          {t('event.planner.pick.title')}
        </p>
        <p className="text-sm text-rp-ink-soft">{t('event.planner.pick.subtitle')}</p>
      </Card>

      {isLoading ? (
        <Card className="p-4 text-center text-sm text-rp-ink-mute">{t('common.loading')}</Card>
      ) : items.length === 0 ? (
        <Card className="p-6 text-center space-y-3">
          <p className="text-sm text-rp-ink-soft">{t('event.planner.pick.empty')}</p>
          <Button onClick={() => onDone()} className="w-full">
            {t('event.planner.next')}
          </Button>
        </Card>
      ) : (
        <>
          {sectioned.map((section) => (
            <Card key={section.titleKey} className="p-4 space-y-2">
              <p className="text-xs uppercase tracking-wider font-mono text-rp-ink-mute">
                {t(section.titleKey)}
              </p>
              <ul className="divide-y divide-rp-hairline">
                {section.items.map((it) => {
                  const checked = selectedIds.has(it.id)
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => toggle(it.id)}
                        className="w-full flex items-center gap-3 py-2 text-start"
                      >
                        <span
                          className={cn(
                            'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                            checked
                              ? 'bg-red-600 border-red-600'
                              : 'border-rp-hairline bg-rp-bg-soft',
                          )}
                        >
                          {checked && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              'text-sm truncate',
                              checked ? 'line-through text-rp-ink-mute' : 'text-rp-ink',
                            )}
                          >
                            {it.name}
                          </p>
                          {it.notes && (
                            <p className="text-xs text-rp-ink-mute truncate">{it.notes}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}

          <div className="sticky bottom-0 bg-rp-bg pt-3 pb-2 -mx-4 px-4 space-y-2">
            <p className="text-xs text-center text-rp-ink-mute">
              {t('event.planner.pick.selected').replace('{count}', String(selectedIds.size))}
            </p>
            <Button
              onClick={() => {
                if (selectedIds.size === 0) {
                  void onDone()
                } else {
                  setShowConfirm(true)
                }
              }}
              disabled={busy}
              className="w-full"
            >
              {selectedIds.size === 0
                ? t('event.planner.pick.skipSelection')
                : t('event.planner.pick.deleteSelected')}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t('event.planner.pick.confirmTitle').replace('{count}', String(selectedIds.size))}
        description={t('event.planner.pick.confirmBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => {
          if (busy || selectedIds.size === 0) return
          setBusy(true)
          try {
            await deleteEventItems(Array.from(selectedIds))
            await onDone()
          } catch (err) {
            toast.error((err as Error).message ?? 'Failed to delete items')
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}

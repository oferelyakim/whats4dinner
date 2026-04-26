import { useEffect, useState, useCallback } from 'react'
import { Trash2, X as XIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEngine } from '../hooks/useEngine'
import { usePlan } from '../hooks/usePlan'
import type { MealPlan } from '../types'
import { DayCard } from './DayCard'
import { RecipeView } from './RecipeView'
import { useI18n } from '@/lib/i18n'
import {
  cancelJob,
  getJob,
  subscribeJob,
  type MealPlanJobRow,
} from '@/services/meal-plan-jobs'
import { MealPlannerBanner } from '@/components/meal-planner/MealPlannerBanner'
import type { InterviewResult } from '@/engine/interview/types'

// ── Week helpers ──────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().split('T')[0]
}

function startOfWeekMon(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const dow = d.getDay() // 0=Sun..6=Sat
  const offsetToMonday = (dow + 6) % 7
  d.setDate(d.getDate() - offsetToMonday)
  return d.toISOString().split('T')[0]
}

function visibleWeekDates(weekOffset: number): string[] {
  const today = isoToday()
  const baseMonday = startOfWeekMon(today)
  const startD = new Date(baseMonday + 'T12:00:00')
  startD.setDate(startD.getDate() + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startD)
    d.setDate(startD.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function formatWeekLabel(mondayIso: string): string {
  const d = new Date(mondayIso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Min / max visible week offsets ────────────────────────────────────────────
const MIN_WEEK_OFFSET = -1 // 1 week back
const MAX_WEEK_OFFSET = 3  // 3 weeks ahead

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanV2View() {
  const engine = useEngine()
  const t = useI18n((s) => s.t)
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  // v2.0.0: tracks a `link_ready` slot the user opened so RecipeView can
  // hydrate the URL on mount.
  const [openSlotId, setOpenSlotId] = useState<string | null>(null)
  const { plan, refresh } = usePlan(activePlanId)
  // v1.18.0 — async job state. activeJobId drives the progress bar.
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<{
    completed: number
    failed: number
    total: number
    status: MealPlanJobRow['status']
  } | null>(null)

  // v2.1.0 — week navigation (default = current week)
  const [viewWeekOffset, setViewWeekOffset] = useState(0)

  // ── Bootstrap plan ──────────────────────────────────────────────────────────
  useEffect(() => {
    void engine.listPlans().then(async (list) => {
      setPlans(list)
      if (list.length > 0) {
        setActivePlanId(list[0].id)
      } else {
        const fresh = await engine.createPlan(isoToday())
        setActivePlanId(fresh.id)
        setPlans([fresh])
      }
    })
  }, [engine])

  // Stuck-slot self-heal: on mount + on tab-foreground, sweep any slots that
  // got stranded in `generating_*` because the user backgrounded the phone
  // mid-generation. The engine reverts them to their last good state and
  // queues a fresh generation. Idempotent — safe to call repeatedly.
  useEffect(() => {
    if (!activePlanId) return
    const sweep = () => {
      void engine
        .resumeStuckSlots(activePlanId)
        .then((n) => {
          if (n > 0) console.info(`[meal-engine] resumed ${n} stuck slot(s)`)
        })
        .catch(() => undefined)
    }
    sweep()
    const onVis = () => {
      if (document.visibilityState === 'visible') sweep()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [activePlanId, engine])

  // v1.18.0 — re-attach to any in-flight async job after a tab close-and-reopen.
  // The engine reads localStorage for the stored jobId, sweeps any 'done' slots
  // that completed while the tab was closed, and re-subscribes to live updates.
  useEffect(() => {
    if (!activePlanId) return
    let unsub: (() => void) | undefined
    void (async () => {
      const jobId = await engine.reattachActiveJob(activePlanId)
      if (!jobId) return
      setActiveJobId(jobId)
      const job = await getJob(jobId)
      if (job) {
        setJobProgress({
          completed: job.completed_slots,
          failed: job.failed_slots,
          total: job.total_slots,
          status: job.status,
        })
      }
      // Local progress channel — drives the progress bar even though the
      // engine has its own subscription writing to Dexie.
      const sub = subscribeJob(
        jobId,
        () => undefined,
        (jobRow) => {
          setJobProgress((prev) =>
            prev
              ? {
                  ...prev,
                  completed: jobRow.completed_slots ?? prev.completed,
                  failed: jobRow.failed_slots ?? prev.failed,
                  status: jobRow.status ?? prev.status,
                }
              : prev,
          )
          if (
            jobRow.status === 'completed' ||
            jobRow.status === 'failed' ||
            jobRow.status === 'cancelled'
          ) {
            // Clear after a short delay so user can see the final state.
            setTimeout(() => {
              setActiveJobId(null)
              setJobProgress(null)
            }, 1500)
          }
        },
      )
      unsub = sub.unsubscribe
    })()
    return () => {
      unsub?.()
    }
  }, [activePlanId, engine])

  // v2.1.0 — Auto-populate visible week. On activePlanId or viewWeekOffset
  // change, ensure all 7 dates of the visible week have a Day row in Dexie.
  // Idempotent: engine.addDay does nothing if the date already exists.
  useEffect(() => {
    if (!activePlanId) return
    const dates = visibleWeekDates(viewWeekOffset)
    void (async () => {
      for (const date of dates) {
        await engine.addDay(activePlanId, date)
      }
      await refresh()
    })()
  // refresh is stable (usePlan returns a memoised ref); engine ref is stable too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlanId, viewWeekOffset, engine])

  // ── Job cancel ──────────────────────────────────────────────────────────────

  async function handleCancelJob() {
    if (!activeJobId) return
    await cancelJob(activeJobId)
    setActiveJobId(null)
    setJobProgress(null)
    await refresh()
  }

  // ── Clear plan ──────────────────────────────────────────────────────────────

  async function clearPlan() {
    if (!activePlanId) return
    await engine.deletePlan(activePlanId)
    const next = await engine.createPlan(isoToday())
    setActivePlanId(next.id)
    setPlans([next])
  }

  // v2.0.0 — interview approval handler. Applies day-presets, runs bank-fill
  // per slot using the AI's candidate dish names, queues residual misses
  // through the existing async worker.
  const handleInterviewApprove = useCallback(
    async (result: InterviewResult) => {
      if (!activePlanId) return
      try {
        const { jobId, totalQueued, bankFilled } = await engine.applyInterviewResult(
          activePlanId,
          null,
          result,
        )
        console.info(`[interview] applied: bankFilled=${bankFilled} queued=${totalQueued}`)
        if (jobId && totalQueued > 0) {
          setActiveJobId(jobId)
          setJobProgress({ completed: 0, failed: 0, total: totalQueued, status: 'queued' })
          const sub = subscribeJob(
            jobId,
            () => undefined,
            (jobRow) => {
              setJobProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      completed: jobRow.completed_slots ?? prev.completed,
                      failed: jobRow.failed_slots ?? prev.failed,
                      status: jobRow.status ?? prev.status,
                    }
                  : prev,
              )
              if (
                jobRow.status === 'completed' ||
                jobRow.status === 'failed' ||
                jobRow.status === 'cancelled'
              ) {
                setTimeout(() => {
                  setActiveJobId(null)
                  setJobProgress(null)
                  void refresh()
                }, 1500)
                sub.unsubscribe()
              }
            },
          )
        }
        await refresh()
      } catch (err) {
        console.error('[interview] applyInterviewResult failed', err)
      }
    },
    [activePlanId, engine, refresh],
  )

  // ── Derived: days for the visible week only ─────────────────────────────────

  const weekDates = visibleWeekDates(viewWeekOffset)
  const weekDateSet = new Set(weekDates)
  const visibleDays = (plan?.days ?? []).filter((d) => weekDateSet.has(d.date))

  // Monday of the visible week for the label
  const weekMonday = weekDates[0]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display italic text-3xl text-rp-ink">
            {t('food.mealPlan')}
          </h1>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => void clearPlan()}
            aria-label={t('common.delete')}
            className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Week navigation row */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setViewWeekOffset((o) => o - 1)}
          disabled={viewWeekOffset <= MIN_WEEK_OFFSET}
          aria-label={t('plan.week.prev')}
          className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <span className="text-sm font-medium text-rp-ink">
          {t('plan.week.label').replace(
            '{date}',
            formatWeekLabel(weekMonday),
          )}
        </span>
        <button
          onClick={() => setViewWeekOffset((o) => o + 1)}
          disabled={viewWeekOffset >= MAX_WEEK_OFFSET}
          aria-label={t('plan.week.next')}
          className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>

      {/* v2.1.0 — per-week AI banner. Passes scope="week" so the
          MealPlannerInterview can adapt its questionnaire accordingly.
          The parallel MealPlannerBanner/Interview agent adds the scope prop. */}
      <MealPlannerBanner
        planId={activePlanId}
        circleId={null}
        scope="week"
        onApprove={handleInterviewApprove}
      />

      {/* Async job progress bar */}
      {jobProgress && activeJobId && (
        <div className="rounded-xl bg-rp-bg-soft border border-rp-hairline p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="text-rp-ink-mute flex items-center gap-2">
              <span>
                {jobProgress.status === 'completed'
                  ? t('plan.job.completed')
                  : jobProgress.status === 'failed'
                    ? t('plan.job.failed')
                    : jobProgress.status === 'cancelled'
                      ? t('plan.job.cancelled')
                      : t('plan.job.progress')
                          .replace('{completed}', String(jobProgress.completed))
                          .replace('{total}', String(jobProgress.total))}
              </span>
              {jobProgress.failed > 0 && (
                <span className="text-amber-700">
                  · {t('plan.job.failedCount').replace('{count}', String(jobProgress.failed))}
                </span>
              )}
            </div>
            {(jobProgress.status === 'queued' || jobProgress.status === 'running') && (
              <button
                onClick={() => void handleCancelJob()}
                className="flex items-center gap-1 text-rp-ink-mute hover:text-rp-ink"
                aria-label={t('plan.job.cancelButton')}
                title={t('plan.job.cancelButton')}
              >
                <XIcon className="h-3 w-3" />
                {t('plan.job.cancelButton')}
              </button>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-rp-hairline overflow-hidden">
            <div
              className={
                'h-full rounded-full transition-all duration-500 ' +
                (jobProgress.status === 'completed'
                  ? 'bg-emerald-500'
                  : jobProgress.status === 'failed'
                    ? 'bg-amber-500'
                    : jobProgress.status === 'cancelled'
                      ? 'bg-rp-ink-mute'
                      : 'bg-rp-brand')
              }
              style={{
                width:
                  jobProgress.total > 0
                    ? `${Math.min(100, Math.round(((jobProgress.completed + jobProgress.failed) / jobProgress.total) * 100))}%`
                    : '0%',
              }}
            />
          </div>
        </div>
      )}

      {/* Day cards — only the 7 days of the visible week */}
      <div className="space-y-3">
        {visibleDays.map((day) => (
          <DayCard
            key={day.id}
            day={day}
            onOpenRecipe={setOpenRecipeId}
            onOpenSlot={setOpenSlotId}
            onInterviewApprove={handleInterviewApprove}
          />
        ))}
      </div>

      <RecipeView
        recipeId={openRecipeId}
        slotId={openSlotId}
        onClose={() => {
          setOpenRecipeId(null)
          setOpenSlotId(null)
        }}
      />

      {plans.length > 0 && (
        <p className="text-[11px] text-rp-ink-mute text-center pt-4">
          {plans.length} plan{plans.length === 1 ? '' : 's'} stored locally
        </p>
      )}
    </div>
  )
}

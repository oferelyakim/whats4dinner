import { useEffect, useState } from 'react'
import { Plus, Wand2, Trash2, LayoutGrid, X as XIcon } from 'lucide-react'
import { useEngine } from '../hooks/useEngine'
import { usePlan } from '../hooks/usePlan'
import type { MealPlan } from '../types'
import { DayCard } from './DayCard'
import { RecipeView } from './RecipeView'
import { supabase } from '@/services/supabase'
import { useI18n } from '@/lib/i18n'
import {
  cancelJob,
  getJob,
  subscribeJob,
  type MealPlanJobRow,
} from '@/services/meal-plan-jobs'

function isoToday(): string {
  return new Date().toISOString().split('T')[0]
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function PlanV2View() {
  const engine = useEngine()
  const t = useI18n((s) => s.t)
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)
  const { plan, refresh } = usePlan(activePlanId)
  // v1.18.0 — async job state. activeJobId drives the progress bar.
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<{
    completed: number
    failed: number
    total: number
    status: MealPlanJobRow['status']
  } | null>(null)

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

  async function addWeek(numDays = 7) {
    if (!activePlanId) return
    const start = isoToday()
    for (let i = 0; i < numDays; i++) {
      const date = addDays(start, i)
      await engine.addDay(activePlanId, date)
    }
    await refresh()
  }

  /**
   * v1.17.0: one-click apply the "Standard day" preset (breakfast 1 + lunch 2 +
   * dinner 3 = 6 slots) to every day in the active plan. Eliminates the
   * "click each day" pain the user reported on /plan-v2.
   */
  async function applyStandardWeek() {
    if (!plan || plan.days.length === 0) return
    await engine.applyPreset('sys-day-standard', {
      dayIds: plan.days.map((d) => d.id),
    })
    await refresh()
  }

  async function generateAll() {
    if (!activePlanId) return
    // v1.18.0 quick UX: if every day still has just the auto-default
    // (1 Dinner meal, 1 main slot), auto-apply the Standard week preset
    // BEFORE generating. The user reported "1 dish per day" because they
    // didn't realize they had to click Standard week — this removes that
    // friction. They can still un-do via the per-day controls.
    const cur = plan
    if (cur && cur.days.length > 0) {
      const everyDayIsDefault = cur.days.every((d) => {
        if (d.meals.length !== 1) return false
        const m = d.meals[0]
        if (m.type.toLowerCase() !== 'dinner') return false
        if (m.slots.length !== 1) return false
        if (m.slots[0].role !== 'main') return false
        if (m.slots[0].status === 'ready') return false
        return true
      })
      if (everyDayIsDefault) {
        await engine.applyPreset('sys-day-standard', {
          dayIds: cur.days.map((d) => d.id),
        })
        await refresh()
      }
    }
    // v1.18.0 — when online + signed-in, prefer the async server-side path.
    // Closes-tab-safe; rate-limit-safe via worker retry. Falls back to
    // local generation when offline or unauthenticated.
    try {
      const session = await supabase.auth.getSession()
      if (session.data.session) {
        const { jobId, totalQueued } = await engine.generatePlanAsync(activePlanId, null)
        if (jobId && totalQueued > 0) {
          setActiveJobId(jobId)
          setJobProgress({ completed: 0, failed: 0, total: totalQueued, status: 'queued' })
          // Subscribe locally for the progress bar (engine has its own
          // subscription that writes Dexie; this one drives just the UI).
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
          // No await — fire and forget; Realtime drives updates.
          await refresh()
          return
        }
        // Bank covered everything — no queued work, just refresh the UI.
        await refresh()
        return
      }
      // Offline / unauthenticated: fall back to local AI generation.
      await engine.generatePlan(activePlanId)
    } catch (err) {
      console.error('[generateAll] async path failed; falling back', err)
      await engine.generatePlan(activePlanId)
    }
  }

  async function handleCancelJob() {
    if (!activeJobId) return
    await cancelJob(activeJobId)
    setActiveJobId(null)
    setJobProgress(null)
    await refresh()
  }

  async function clearPlan() {
    if (!activePlanId) return
    await engine.deletePlan(activePlanId)
    const next = await engine.createPlan(isoToday())
    setActivePlanId(next.id)
    setPlans([next])
  }

  return (
    <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display italic text-3xl text-rp-ink">Meal plan</h1>
          <p className="text-xs text-rp-ink-mute">v2 engine — slot-based, offline-first</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => void addWeek(7)}
            className="px-3 py-2 rounded-lg bg-rp-bg-soft text-rp-ink text-xs font-medium flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add 7 days
          </button>
          <button
            onClick={() => void applyStandardWeek()}
            className="px-3 py-2 rounded-lg bg-rp-bg-soft text-rp-ink text-xs font-medium flex items-center gap-1"
            disabled={!plan || plan.days.length === 0}
            title="Apply 'Standard day' preset (breakfast + lunch + dinner) to every day"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Standard week
          </button>
          <button
            onClick={() => void generateAll()}
            className="px-3 py-2 rounded-lg bg-rp-brand text-white text-xs font-medium flex items-center gap-1"
            disabled={!plan || plan.days.length === 0}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Generate plan
          </button>
          <button
            onClick={() => void clearPlan()}
            aria-label="Clear plan"
            className="p-2 rounded-lg text-rp-ink-mute hover:bg-rp-bg-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

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

      {plan && plan.days.length === 0 && (
        <div className="rounded-2xl border border-dashed border-rp-hairline p-8 text-center">
          <p className="text-rp-ink-mute mb-3">No days yet. Add a week to get started.</p>
          <button
            onClick={() => void addWeek(7)}
            className="px-4 py-2 rounded-lg bg-rp-brand text-white text-sm font-medium"
          >
            Add 7 days
          </button>
        </div>
      )}

      <div className="space-y-3">
        {plan?.days.map((day) => (
          <DayCard key={day.id} day={day} onOpenRecipe={setOpenRecipeId} />
        ))}
      </div>

      <RecipeView recipeId={openRecipeId} onClose={() => setOpenRecipeId(null)} />

      {plans.length > 0 && (
        <p className="text-[11px] text-rp-ink-mute text-center pt-4">
          {plans.length} plan{plans.length === 1 ? '' : 's'} stored locally
        </p>
      )}
    </div>
  )
}

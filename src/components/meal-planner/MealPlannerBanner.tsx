// v2.1.0 — Meal-planner AI banner.
//
// Renders above the day list on /plan-v2. Free users see disabled state +
// "Upgrade to plan with AI →" CTA that opens the existing AIUpgradeModal.
// Paid users see active state; clicking opens the MealPlannerInterview.
//
// New in v2.1.0: accepts `scope` and `targetDayDate` props and passes them
// through to MealPlannerInterview so callers can open a single-day interview.

import { useState } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useAIAccess } from '@/hooks/useAIAccess'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { MealPlannerInterview } from './MealPlannerInterview'
import type { InterviewResult } from '@/engine/interview/types'

interface MealPlannerBannerProps {
  planId: string | null
  circleId: string | null
  onApprove: (result: InterviewResult) => Promise<void>
  /** 'week' (default) plans multiple days; 'day' plans a single targetDayDate. */
  scope?: 'day' | 'week'
  /** ISO date (e.g. "2026-05-01"). Required when scope='day'. */
  targetDayDate?: string
}

export function MealPlannerBanner({
  planId,
  circleId,
  onApprove,
  scope = 'week',
  targetDayDate,
}: MealPlannerBannerProps) {
  const t = useI18n((s) => s.t)
  const {
    hasAI,
    canUseAI,
    isLimitReached,
    checkAIAccess,
    showUpgradeModal,
    setShowUpgradeModal,
    upgradeReason,
  } = useAIAccess()
  const [interviewOpen, setInterviewOpen] = useState(false)

  const isPaid = hasAI && canUseAI && !isLimitReached
  const handleClick = () => {
    if (!planId) return
    if (!checkAIAccess()) return
    setInterviewOpen(true)
  }

  // Title shown on the banner card itself mirrors the scope.
  const bannerTitle = (): string => {
    if (!isPaid) return t('interview.banner.disabled')
    if (scope === 'day' && targetDayDate) {
      const prettyDate = new Date(targetDayDate + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
      return t('interview.banner.dayTitle').replace('{date}', prettyDate)
    }
    return t('interview.banner.weekTitle')
  }

  return (
    <>
      <div
        className={`
          relative mb-4 rounded-2xl border p-4 sm:p-5 transition
          ${isPaid
            ? 'bg-rp-bg-soft border-rp-brand/30 shadow-rp-card hover:shadow-rp-hover'
            : 'bg-rp-bg-soft border-rp-ink/10 opacity-90'}
        `}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className={`
              flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
              ${isPaid ? 'bg-rp-brand text-white' : 'bg-rp-ink/10 text-rp-ink'}
            `}
            aria-hidden
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display italic text-lg leading-tight text-rp-ink">
              {bannerTitle()}
            </h3>
            <p className="mt-1 text-sm text-rp-ink/70 leading-snug">
              {t('interview.banner.subtitle')}
            </p>
            <div className="mt-3">
              {isPaid ? (
                <button
                  type="button"
                  onClick={handleClick}
                  disabled={!planId}
                  className="
                    inline-flex items-center gap-1.5 rounded-full bg-rp-brand px-4 py-2
                    text-sm font-medium text-white transition
                    hover:bg-rp-brand/90 active:scale-[0.98]
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  {t('interview.banner.start')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClick}
                  className="
                    inline-flex items-center gap-1.5 rounded-full
                    border border-rp-brand bg-transparent px-4 py-2
                    text-sm font-medium text-rp-brand transition
                    hover:bg-rp-brand/5 active:scale-[0.98]
                  "
                >
                  {t('interview.banner.upgrade')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <AIUpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          isLimitReached={upgradeReason === 'ai_limit'}
          isImportCapReached={upgradeReason === 'recipe_import_cap'}
        />
      )}

      {interviewOpen && planId && (
        <MealPlannerInterview
          open={interviewOpen}
          onOpenChange={setInterviewOpen}
          planId={planId}
          circleId={circleId}
          onApprove={onApprove}
          scope={scope}
          targetDayDate={targetDayDate}
        />
      )}
    </>
  )
}

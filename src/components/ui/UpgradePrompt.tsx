import { Sparkles, Check, AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { AI_PRICING } from '@/lib/subscription'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mockActivateSubscription, mockCancelSubscription } from '@/services/ai-usage'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/lib/i18n'

interface AIUpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If true, user has AI plan but hit the usage limit */
  isLimitReached?: boolean
  /** Reset date string for limit-reached state */
  resetDate?: string
}

export function AIUpgradeModal({ open, onOpenChange, isLimitReached, resetDate }: AIUpgradeModalProps) {
  const { session } = useAuth()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [selectedPlan, setSelectedPlan] = useState<'ai_individual' | 'ai_family'>('ai_individual')

  // TODO: Replace with Stripe checkout
  const activateMutation = useMutation({
    mutationFn: () => mockActivateSubscription(session!.user.id, selectedPlan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] })
      onOpenChange(false)
    },
  })

  if (isLimitReached) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-3xl p-6 max-w-lg mx-auto">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
            <div className="flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {t('ai.limitReached')}
              </Dialog.Title>
              <p className="text-sm text-slate-500 mb-4">
                {t('ai.limitReachedDesc')}{resetDate ? ` ${t('ai.resetsOn')} ${resetDate}.` : ''}
              </p>
              <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
                {t('common.done')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-3xl p-6 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
          <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white text-center mb-1">
            {t('ai.unlockAI')}
          </Dialog.Title>
          <p className="text-sm text-slate-500 text-center mb-5">
            {t('ai.unlockDesc')}
          </p>

          {/* Plans */}
          <div className="space-y-3">
            <PlanCard
              name={AI_PRICING.ai_individual.label}
              price={AI_PRICING.ai_individual.monthly}
              features={[
                t('ai.feature.recipeImport'),
                t('ai.feature.recipePhoto'),
                t('ai.feature.mealPlanAI'),
                t('ai.feature.nlpActions'),
              ]}
              selected={selectedPlan === 'ai_individual'}
              onSelect={() => setSelectedPlan('ai_individual')}
            />

            <PlanCard
              name={AI_PRICING.ai_family.label}
              price={AI_PRICING.ai_family.monthly}
              features={[
                t('ai.feature.everythingIndividual'),
                `${t('ai.feature.upToMembers')} ${AI_PRICING.ai_family.members} ${t('ai.feature.members')}`,
                t('ai.feature.sharedUsage'),
              ]}
              selected={selectedPlan === 'ai_family'}
              onSelect={() => setSelectedPlan('ai_family')}
              badge={t('ai.bestValue')}
            />
          </div>

          {/* TODO: Replace with Stripe checkout */}
          <Button
            className="w-full mt-4"
            size="lg"
            onClick={() => activateMutation.mutate()}
            disabled={activateMutation.isPending}
          >
            <Sparkles className="h-4 w-4" />
            {activateMutation.isPending ? t('common.loading') : t('ai.activate')}
          </Button>
          <p className="text-[10px] text-slate-400 text-center mt-2">
            {t('ai.testMode')}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PlanCard({
  name, price, features, selected, onSelect, badge,
}: {
  name: string
  price: number
  features: string[]
  selected: boolean
  onSelect: () => void
  badge?: string
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 rounded-xl border-2 transition-all',
        selected
          ? 'border-brand-500 bg-brand-500/5'
          : 'border-slate-200 dark:border-slate-700'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 dark:text-white">{name}</span>
          {badge && (
            <span className="text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-slate-900 dark:text-white">${price.toFixed(2)}</span>
          <span className="text-xs text-slate-400">/mo</span>
        </div>
      </div>
      <div className="space-y-1">
        {features.map((f) => (
          <div key={f} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <Check className="h-3 w-3 text-success shrink-0" />
            {f}
          </div>
        ))}
      </div>
    </button>
  )
}

/** Usage meter progress bar for Profile/Settings */
export function UsageMeter({
  usageDollars,
  limitDollars,
  percentUsed,
  isWarning,
  isLimitReached,
}: {
  usageDollars: number
  limitDollars: number
  percentUsed: number
  isWarning: boolean
  isLimitReached: boolean
}) {
  const { t } = useI18n()

  const barColor = isLimitReached
    ? 'bg-red-500'
    : isWarning
      ? 'bg-orange-500'
      : 'bg-emerald-500'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600 dark:text-slate-400">{t('ai.usageThisMonth')}</span>
        <span className={cn(
          'font-medium',
          isLimitReached ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-slate-600 dark:text-slate-400'
        )}>
          ${usageDollars.toFixed(2)} / ${limitDollars.toFixed(2)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-surface-dark-overlay overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
      {isLimitReached && (
        <p className="text-xs text-red-500 font-medium">{t('ai.limitReachedShort')}</p>
      )}
      {isWarning && !isLimitReached && (
        <p className="text-xs text-orange-500 font-medium">{t('ai.warningUsage')}</p>
      )}
    </div>
  )
}

export { mockCancelSubscription }

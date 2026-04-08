import { Crown, Check } from 'lucide-react'
import { Button } from './Button'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { PRICING, useSubscription } from '@/lib/subscription'
import { useState } from 'react'

interface UpgradePromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feature: string
}

export function UpgradePrompt({ open, onOpenChange, feature }: UpgradePromptProps) {
  const { setTier } = useSubscription()
  const [selectedPlan, setSelectedPlan] = useState<'premium' | 'family'>('premium')
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly')

  // For now, simulate upgrade. In production: Stripe checkout
  function handleUpgrade() {
    setTier(selectedPlan)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-3xl p-6 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
          <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white text-center mb-1">
            Upgrade to unlock
          </Dialog.Title>
          <p className="text-sm text-slate-500 text-center mb-5">
            {feature} is a premium feature
          </p>

          {/* Billing toggle */}
          <div className="flex gap-1 bg-slate-100 dark:bg-surface-dark-overlay rounded-lg p-0.5 mb-4">
            <button
              onClick={() => setBilling('monthly')}
              className={cn(
                'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                billing === 'monthly'
                  ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={cn(
                'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                billing === 'yearly'
                  ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500'
              )}
            >
              Yearly (save 33%)
            </button>
          </div>

          {/* Plans */}
          <div className="space-y-3">
            <PlanCard
              name="Premium"
              price={billing === 'monthly' ? PRICING.premium.monthly : PRICING.premium.yearlyMonthly}
              period={billing === 'yearly' ? '/mo (billed yearly)' : '/mo'}
              features={[
                'Create unlimited circles',
                'Organize events & gatherings',
                'AI recipe import (20/mo)',
                'Share shopping lists',
                'Unlimited recipes',
                'Meal templates',
                'Store route sorting',
              ]}
              selected={selectedPlan === 'premium'}
              onSelect={() => setSelectedPlan('premium')}
            />

            <PlanCard
              name="Family"
              price={billing === 'monthly' ? PRICING.family.monthly : PRICING.family.yearlyMonthly}
              period={billing === 'yearly' ? '/mo (billed yearly)' : '/mo'}
              features={[
                'Everything in Premium',
                `Up to ${PRICING.family.members} premium members`,
                'AI recipe import (50/mo)',
                'Priority support',
                'Early access to features',
              ]}
              selected={selectedPlan === 'family'}
              onSelect={() => setSelectedPlan('family')}
              badge="Best Value"
            />
          </div>

          <Button className="w-full mt-4" size="lg" onClick={handleUpgrade}>
            <Crown className="h-4 w-4" />
            Start Free Trial
          </Button>
          <p className="text-[10px] text-slate-400 text-center mt-2">
            7-day free trial. Cancel anytime.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PlanCard({
  name, price, period, features, selected, onSelect, badge,
}: {
  name: string
  price: number
  period: string
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
          <span className="text-xs text-slate-400">{period}</span>
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

// Simple hook to check and prompt upgrade
export function useFeatureGate() {
  const { tier } = useSubscription()
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeFeature, setUpgradeFeature] = useState('')

  function checkFeature(feature: string, allowed: boolean): boolean {
    if (allowed) return true
    setUpgradeFeature(feature)
    setShowUpgrade(true)
    return false
  }

  return {
    tier,
    showUpgrade,
    upgradeFeature,
    setShowUpgrade,
    checkFeature,
  }
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { getUserSubscription, getMonthlyUsage } from '@/services/ai-usage'
import type { Subscription } from '@/types'

export interface AIAccess {
  subscription: Subscription | null
  hasAI: boolean
  canUseAI: boolean
  usagePercent: number
  usageDollars: number
  limitDollars: number
  isWarning: boolean
  isLimitReached: boolean
  isLoading: boolean
  showUpgradeModal: boolean
  setShowUpgradeModal: (show: boolean) => void
  /** Call before triggering an AI action. Returns true if allowed, shows modal if not. */
  checkAIAccess: () => boolean
}

export function useAIAccess(): AIAccess {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription', userId],
    queryFn: () => getUserSubscription(userId!),
    enabled: !!userId,
  })

  const hasAI = !!subscription
    && subscription.plan !== 'free'
    && subscription.status === 'active'
    && new Date(subscription.current_period_end) >= new Date()

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['ai-usage', userId],
    queryFn: () => getMonthlyUsage(userId!),
    enabled: !!userId && hasAI,
  })

  const usageDollars = usage?.totalCost ?? 0
  const usagePercent = usage?.percentUsed ?? 0
  const isWarning = usage?.isWarning ?? false
  const isLimitReached = usage?.isLimitReached ?? false
  const limitDollars = usage?.limitDollars ?? 4.0

  const canUse = hasAI && !isLimitReached

  function checkAIAccess(): boolean {
    if (canUse) return true
    setShowUpgradeModal(true)
    return false
  }

  return {
    subscription: subscription ?? null,
    hasAI,
    canUseAI: canUse,
    usagePercent,
    usageDollars,
    limitDollars,
    isWarning,
    isLimitReached,
    isLoading: subLoading || usageLoading,
    showUpgradeModal,
    setShowUpgradeModal,
    checkAIAccess,
  }
}

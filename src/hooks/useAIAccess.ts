import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import {
  getUserSubscription,
  getMonthlyUsage,
  getMonthlyImports,
  hasActiveFamilySeat,
  RECIPE_IMPORT_FREE_CAP,
} from '@/services/ai-usage'
import type { Subscription } from '@/types'

export type UpgradeReason = 'ai' | 'ai_limit' | 'recipe_import_cap'

export interface AIAccess {
  subscription: Subscription | null
  hasAI: boolean
  canUseAI: boolean
  usagePercent: number
  usageDollars: number
  limitDollars: number
  isWarning: boolean
  isLimitReached: boolean
  /** Recipe imports used this calendar month (free-tier counter) */
  importsUsed: number
  importsRemaining: number
  importsLimit: number
  canImportRecipe: boolean
  isLoading: boolean
  showUpgradeModal: boolean
  upgradeReason: UpgradeReason
  setShowUpgradeModal: (show: boolean) => void
  /** Call before triggering an AI-paid action. Returns true if allowed, shows modal if not. */
  checkAIAccess: () => boolean
  /**
   * Call before triggering a recipe import (URL or photo). Paid users bypass the cap;
   * free users are allowed up to RECIPE_IMPORT_FREE_CAP imports per calendar month.
   * Returns true if allowed, shows modal if not.
   */
  checkRecipeImportAccess: () => boolean
}

export function useAIAccess(): AIAccess {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>('ai')

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription', userId],
    queryFn: () => getUserSubscription(userId!),
    enabled: !!userId,
  })

  const hasOwnedAI = !!subscription
    && subscription.plan !== 'free'
    && subscription.status === 'active'
    && new Date(subscription.current_period_end) >= new Date()

  // Check shared Family seats (migration 025) — only run if no direct subscription
  const { data: familySeat, isLoading: seatLoading } = useQuery({
    queryKey: ['family-seat', userId],
    queryFn: () => hasActiveFamilySeat(userId!),
    enabled: !!userId && !hasOwnedAI,
  })

  const hasAI = hasOwnedAI || familySeat === true

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['ai-usage', userId],
    queryFn: () => getMonthlyUsage(userId!),
    enabled: !!userId && hasAI,
  })

  const { data: imports, isLoading: importsLoading } = useQuery({
    queryKey: ['ai-imports', userId],
    queryFn: () => getMonthlyImports(userId!),
    enabled: !!userId,
  })

  const usageDollars = usage?.totalCost ?? 0
  const usagePercent = usage?.percentUsed ?? 0
  const isWarning = usage?.isWarning ?? false
  const isLimitReached = usage?.isLimitReached ?? false
  const limitDollars = usage?.limitDollars ?? 4.0

  const importsUsed = imports?.count ?? 0
  const importsRemaining = imports?.remaining ?? RECIPE_IMPORT_FREE_CAP
  const importsLimit = imports?.limit ?? RECIPE_IMPORT_FREE_CAP
  const importsCapReached = imports?.isLimitReached ?? false

  const canUse = hasAI && !isLimitReached
  const canImportRecipe = hasAI ? !isLimitReached : !importsCapReached

  function checkAIAccess(): boolean {
    if (canUse) return true
    setUpgradeReason(isLimitReached ? 'ai_limit' : 'ai')
    setShowUpgradeModal(true)
    return false
  }

  function checkRecipeImportAccess(): boolean {
    if (canImportRecipe) return true
    setUpgradeReason(hasAI ? 'ai_limit' : 'recipe_import_cap')
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
    importsUsed,
    importsRemaining,
    importsLimit,
    canImportRecipe,
    isLoading: subLoading || seatLoading || usageLoading || importsLoading,
    showUpgradeModal,
    upgradeReason,
    setShowUpgradeModal,
    checkAIAccess,
    checkRecipeImportAccess,
  }
}

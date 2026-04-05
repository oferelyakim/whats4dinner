import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SubscriptionTier = 'free' | 'premium' | 'family'

interface SubscriptionState {
  tier: SubscriptionTier
  setTier: (tier: SubscriptionTier) => void
}

// For now, tier is stored locally. In production, this would come from
// Stripe webhook → Supabase profiles table → client
export const useSubscription = create<SubscriptionState>()(
  persist(
    (set) => ({
      tier: 'free' as SubscriptionTier,
      setTier: (tier) => set({ tier }),
    }),
    { name: 'w4d-subscription' }
  )
)

// Feature limits per tier
export const TIER_LIMITS = {
  free: {
    canCreateCircles: false,      // Can join, not create
    canCreateEvents: false,       // Can participate, not organize
    canShareLists: false,         // Can view shared lists, not create sharing
    maxRecipes: 20,
    maxEventsPerMonth: 0,         // Can participate in unlimited events, just can't create
    aiImportsPerMonth: 0,
    unlimitedCircleJoins: true,   // Can join unlimited circles
    canAddToSharedLists: true,    // Can add items to lists shared with them
    canClaimEventItems: true,     // Can volunteer for event items
    mealPlanning: true,           // Basic - current week only
    storeRoutes: false,
  },
  premium: {
    canCreateCircles: true,
    canCreateEvents: true,
    canShareLists: true,
    maxRecipes: Infinity,
    maxEventsPerMonth: Infinity,
    aiImportsPerMonth: 20,
    unlimitedCircleJoins: true,
    canAddToSharedLists: true,
    canClaimEventItems: true,
    mealPlanning: true,
    storeRoutes: true,
  },
  family: {
    canCreateCircles: true,
    canCreateEvents: true,
    canShareLists: true,
    maxRecipes: Infinity,
    maxEventsPerMonth: Infinity,
    aiImportsPerMonth: 50,
    unlimitedCircleJoins: true,
    canAddToSharedLists: true,
    canClaimEventItems: true,
    mealPlanning: true,
    storeRoutes: true,
  },
} as const

// Check if a feature is available
export function canUse(tier: SubscriptionTier, feature: keyof typeof TIER_LIMITS['free']): boolean {
  const limits = TIER_LIMITS[tier]
  const value = limits[feature]
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  return true
}

// Pricing info
export const PRICING = {
  premium: {
    monthly: 4.99,
    yearly: 39.99,
    yearlyMonthly: 3.33,
  },
  family: {
    monthly: 7.99,
    yearly: 59.99,
    yearlyMonthly: 5.00,
    members: 5,
  },
}

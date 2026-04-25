// Replanish AI — single tier, two billing periods
export const AI_PRICING = {
  monthly: {
    price: 6.0,
    label: 'Replanish AI',
    description: 'Billed monthly',
  },
  annual: {
    price: 60.0,
    perMonth: 5.0,
    label: 'Replanish AI',
    description: 'Billed annually — 14-day free trial',
    trialDays: 14,
  },
} as const

/** Maximum number of seats per subscription (owner + 3 invitees). */
export const SEAT_CAP = 4

export const USAGE_CAP_USD = 4.0
export const WARNING_THRESHOLD_USD = 3.0

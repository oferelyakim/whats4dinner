// AI Plan pricing — all core features are free, only AI features are gated
export const AI_PRICING = {
  ai_individual: {
    monthly: 4.99,
    label: 'AI Individual',
  },
  ai_family: {
    monthly: 6.99,
    members: 5,
    label: 'AI Family',
  },
} as const

export const USAGE_CAP_USD = 4.0
export const WARNING_THRESHOLD_USD = 3.0

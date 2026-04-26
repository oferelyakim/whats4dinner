import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// Mock @/services/supabase since the engine's ai client imports it transitively
vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      // v2.3.0: applyInterviewResult → generatePlanAsync → createMealPlanJob
      // calls getUser. Return null user — the create call will throw
      // "Not authenticated" which the test catches around the
      // applyInterviewResult call so the cuisine-propagation pass that
      // already ran is what we assert on.
      getUser: async () => ({ data: { user: null } }),
    },
  },
}))

// crypto.randomUUID polyfill for jsdom
if (typeof crypto.randomUUID !== 'function') {
  ;(crypto as unknown as { randomUUID: () => string }).randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}

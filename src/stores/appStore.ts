import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile, Circle } from '@/types'

export type FontSize = 'sm' | 'md' | 'lg'

export interface NotificationPrefs {
  enabled: boolean
  chores: boolean
  activities: boolean
  lists: boolean
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  chores: true,
  activities: true,
  lists: false,
}

interface AppState {
  // Theme
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void

  // Font size
  fontSize: FontSize
  setFontSize: (size: FontSize) => void

  // Keep screen on while viewing a recipe
  keepScreenOn: boolean
  setKeepScreenOn: (enabled: boolean) => void

  // Auth
  profile: Profile | null
  setProfile: (profile: Profile | null) => void

  // Active circle context
  activeCircle: Circle | null
  setActiveCircle: (circle: Circle | null) => void

  // UI state
  bottomNavVisible: boolean
  setBottomNavVisible: (visible: boolean) => void

  // Calendar view state (persisted)
  calendarView: 'month' | 'week' | 'day'
  setCalendarView: (view: 'month' | 'week' | 'day') => void
  calendarDate: string
  setCalendarDate: (date: string) => void

  // Household last-visited tab (persisted)
  lastHouseholdTab: 'chores' | 'activities'
  setLastHouseholdTab: (tab: 'chores' | 'activities') => void

  // Personal skin override — wins over the active circle's skin_id on this device only.
  // null = use the circle's skin (default).
  personalSkinId: string | null
  setPersonalSkinId: (id: string | null) => void

  // Notification preferences (persisted)
  notificationPrefs: NotificationPrefs
  setNotificationPref: (key: keyof NotificationPrefs, value: boolean) => void

  // Plan-v2 view mode (persisted)
  planMode: 'plan' | 'use'
  setPlanMode: (mode: 'plan' | 'use') => void

  // Push notification subscription endpoint (persisted so we can unsubscribe
  // and detect stale endpoints without a fresh subscribe call).
  pushEndpoint: string | null
  setPushEndpoint: (endpoint: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },

      fontSize: 'md',
      setFontSize: (fontSize) => {
        set({ fontSize })
        applyFontSize(fontSize)
      },

      keepScreenOn: false,
      setKeepScreenOn: (keepScreenOn) => set({ keepScreenOn }),

      profile: null,
      setProfile: (profile) => set({ profile }),

      activeCircle: null,
      setActiveCircle: (circle) => set({ activeCircle: circle }),

      bottomNavVisible: true,
      setBottomNavVisible: (visible) => set({ bottomNavVisible: visible }),

      calendarView: 'month',
      setCalendarView: (view) => set({ calendarView: view }),
      calendarDate: new Date().toISOString().split('T')[0],
      setCalendarDate: (date) => set({ calendarDate: date }),

      lastHouseholdTab: 'chores',
      setLastHouseholdTab: (tab) => set({ lastHouseholdTab: tab }),

      personalSkinId: null,
      setPersonalSkinId: (id) => set({ personalSkinId: id }),

      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      setNotificationPref: (key, value) =>
        set((state) => ({
          notificationPrefs: { ...state.notificationPrefs, [key]: value },
        })),

      planMode: 'plan',
      setPlanMode: (mode) => set({ planMode: mode }),

      pushEndpoint: null,
      setPushEndpoint: (endpoint) => set({ pushEndpoint: endpoint }),
    }),
    {
      name: 'w4d-app',
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        keepScreenOn: state.keepScreenOn,
        activeCircle: state.activeCircle,
        calendarView: state.calendarView,
        calendarDate: state.calendarDate,
        lastHouseholdTab: state.lastHouseholdTab,
        personalSkinId: state.personalSkinId,
        notificationPrefs: state.notificationPrefs,
        planMode: state.planMode,
        pushEndpoint: state.pushEndpoint,
      }),
    }
  )
)

// Theme preference is persisted but does NOT toggle the `.dark` class.
// SkinProvider / applySkin own the class so the skin's token palette always
// wins (see SkinProvider.tsx for rationale). Kept as a no-op to preserve the
// shape of `setTheme` for existing callers.
function applyTheme(_theme: 'dark' | 'light' | 'system') {
  // intentionally empty
}

const FONT_SIZE_SCALE: Record<FontSize, string> = {
  sm: '87.5%',
  md: '100%',
  lg: '115%',
}

function applyFontSize(size: FontSize) {
  document.documentElement.style.fontSize = FONT_SIZE_SCALE[size]
}

// Apply theme + font size on load
const persisted = JSON.parse(localStorage.getItem('w4d-app') ?? '{}')?.state ?? {}
applyTheme(persisted.theme ?? 'dark')
applyFontSize((persisted.fontSize as FontSize | undefined) ?? 'md')

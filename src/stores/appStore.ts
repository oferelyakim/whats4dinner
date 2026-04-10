import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile, Circle } from '@/types'

interface AppState {
  // Theme
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void

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
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },

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
    }),
    {
      name: 'w4d-app',
      partialize: (state) => ({
        theme: state.theme,
        activeCircle: state.activeCircle,
        calendarView: state.calendarView,
        calendarDate: state.calendarDate,
      }),
    }
  )
)

function applyTheme(theme: 'dark' | 'light' | 'system') {
  const root = document.documentElement
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}

// Apply theme on load
const savedTheme = JSON.parse(localStorage.getItem('w4d-app') ?? '{}')?.state?.theme ?? 'dark'
applyTheme(savedTheme)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile, Circle } from '@/types'

export type FontSize = 'sm' | 'md' | 'lg'

interface AppState {
  // Theme
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void

  // Font size
  fontSize: FontSize
  setFontSize: (size: FontSize) => void

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

      fontSize: 'md',
      setFontSize: (fontSize) => {
        set({ fontSize })
        applyFontSize(fontSize)
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
        fontSize: state.fontSize,
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

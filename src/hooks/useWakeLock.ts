import { useEffect } from 'react'

type WakeLockSentinel = {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
}

export function useWakeLock(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return

    const nav = navigator as WakeLockNavigator
    if (!nav.wakeLock) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        const next = await nav.wakeLock!.request('screen')
        if (cancelled) {
          await next.release().catch(() => {})
          return
        }
        sentinel = next
      } catch {
        // User may deny, or tab not visible — safe to ignore
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
        acquire()
      }
    }

    acquire()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (sentinel && !sentinel.released) {
        sentinel.release().catch(() => {})
      }
      sentinel = null
    }
  }, [enabled])
}

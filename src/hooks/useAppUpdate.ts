// PWA update detection + auto-check on visibility change.
//
// Wraps `useRegisterSW` from vite-plugin-pwa so the rest of the app talks to
// one stable interface. Two layers of update detection:
//
//   1. The service worker's built-in "an update was found while you were
//      using the app" event (fires whenever Workbox finishes downloading a
//      new bundle in the background).
//   2. An explicit `r.update()` poll on every `visibilitychange` to visible
//      and on the `online` event. Keeps stale tabs honest without busy-polling.
//
// Workbox is configured with `skipWaiting + clientsClaim` (vite.config.ts), so
// calling `updateServiceWorker(true)` activates the new SW immediately and
// reloads the page — no tab-close required.

import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export interface AppUpdateState {
  /** True when a new SW is downloaded and waiting. */
  needRefresh: boolean
  /** True for the first second after manually triggered update check (UI feedback). */
  isCheckingForUpdate: boolean
  /** Activate the waiting SW + reload. Call this from the user's "Refresh" tap. */
  applyUpdate: () => void
  /** Manually probe the registration for a new SW. Useful for a "Check for updates" button. */
  checkForUpdate: () => Promise<void>
  /** Dismiss the needRefresh banner without applying. Hidden until next detection. */
  dismiss: () => void
}

export function useAppUpdate(): AppUpdateState {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (r) setRegistration(r)
    },
    onRegisterError(err) {
      console.warn('[pwa] register error', err)
    },
  })

  // Auto-check when the user returns to the tab (covers the most common
  // "I left it open for two days" case). Cheap — Workbox short-circuits if
  // no new bundle is on the server.
  useEffect(() => {
    if (!registration) return
    const handler = () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {
          // network error, ignore — next visibilitychange will retry
        })
      }
    }
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('online', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('online', handler)
    }
  }, [registration])

  async function checkForUpdate() {
    if (!registration) return
    setIsCheckingForUpdate(true)
    try {
      await registration.update()
    } catch {
      // ignore — UI just shows "no update" state
    } finally {
      // Short delay so the spinner doesn't flicker invisibly.
      setTimeout(() => setIsCheckingForUpdate(false), 800)
    }
  }

  function applyUpdate() {
    void updateServiceWorker(true)
  }

  function dismiss() {
    setNeedRefresh(false)
  }

  return {
    needRefresh,
    isCheckingForUpdate,
    applyUpdate,
    checkForUpdate,
    dismiss,
  }
}

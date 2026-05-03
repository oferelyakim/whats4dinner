/**
 * usePushSubscription — lifecycle hook for Web Push subscriptions.
 *
 * Subscribes / unsubscribes the device whenever the user toggles
 * `notificationPrefs.enabled`. Syncs with the backend's `subscribe-push`
 * edge function (POST = upsert, DELETE = remove).
 *
 * Also listens for PUSH_NAVIGATE messages posted by the service worker's
 * notificationclick handler and routes the browser in-app.
 *
 * Mount this once globally in App.tsx — do not mount inside a page component.
 */

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { supabase } from '@/services/supabase'
import { urlBase64ToUint8Array, isPushSupported } from '@/lib/pushUtils'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** POST (upsert) or DELETE the push subscription on the backend. */
async function syncSubscriptionToServer(
  sub: PushSubscription,
  method: 'POST' | 'DELETE'
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string ||
    'https://zgebzhvbszhqvaryfiwk.supabase.co'

  const url = `${supabaseUrl}/functions/v1/subscribe-push`

  const body = method === 'DELETE'
    ? JSON.stringify({ endpoint: sub.endpoint })
    : JSON.stringify(sub.toJSON())

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.warn(`[push] ${method} subscribe-push failed:`, response.status, text)
  }
}

export function usePushSubscription(): void {
  const { notificationPrefs, setPushEndpoint } = useAppStore()
  const navigate = useNavigate()

  // Track whether we've already run the subscribe flow for the current
  // enabled=true state, so we don't re-subscribe on every re-render.
  const subscribedRef = useRef(false)

  // ── PUSH_NAVIGATE message from service worker ──────────────────────────────
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'PUSH_NAVIGATE' &&
        typeof event.data.url === 'string'
      ) {
        navigate(event.data.url as string)
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage)
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage)
    }
  }, [navigate])

  // ── Subscribe / unsubscribe when enabled changes ───────────────────────────
  useEffect(() => {
    if (!notificationPrefs.enabled) {
      // User toggled OFF — unsubscribe from push.
      subscribedRef.current = false

      if (!isPushSupported()) return

      void (async () => {
        try {
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            await syncSubscriptionToServer(sub, 'DELETE')
            await sub.unsubscribe()
          }
          setPushEndpoint(null)
        } catch (err) {
          console.warn('[push] unsubscribe error:', err)
        }
      })()

      return
    }

    // enabled === true
    if (subscribedRef.current) return
    if (!isPushSupported()) return

    // VAPID key not configured — skip silently in dev.
    if (!VAPID_PUBLIC_KEY) {
      console.info('[push] VITE_VAPID_PUBLIC_KEY not set — skipping subscribe')
      return
    }

    subscribedRef.current = true

    void (async () => {
      try {
        // Request permission only when not yet granted.
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission()
          if (result !== 'granted') {
            subscribedRef.current = false
            return
          }
        }

        if (Notification.permission !== 'granted') {
          subscribedRef.current = false
          return
        }

        const reg = await navigator.serviceWorker.ready

        // Reuse an existing subscription (browser may have rotated the endpoint
        // after a browser update — POST it again to upsert on the server).
        const existing = await reg.pushManager.getSubscription()

        let sub: PushSubscription
        if (existing) {
          sub = existing
        } else {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
        }

        await syncSubscriptionToServer(sub, 'POST')
        setPushEndpoint(sub.endpoint)
      } catch (err) {
        console.warn('[push] subscribe error:', err)
        subscribedRef.current = false
      }
    })()
  }, [notificationPrefs.enabled, setPushEndpoint])
}

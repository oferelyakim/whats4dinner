/// <reference lib="WebWorker" />

/**
 * Replanish service worker — injectManifest strategy.
 *
 * Compiled by vite-plugin-pwa (not part of the regular Vite bundle).
 * Do NOT import this file from any app code.
 *
 * Responsibilities:
 *   1. Precache the app shell (Workbox injects __WB_MANIFEST at build time)
 *   2. NetworkFirst runtime cache for Supabase API calls
 *   3. skipWaiting + clientsClaim so updates activate immediately
 *   4. Push event — show OS-level notification
 *   5. notificationclick — focus/open the relevant in-app URL
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import type { PushPayload } from './types/push'

declare let self: ServiceWorkerGlobalScope

// ── Precaching ──────────────────────────────────────────────────────────────
// __WB_MANIFEST is replaced at build time by vite-plugin-pwa with the list of
// assets to precache (app shell JS/CSS/HTML chunks).
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── Skip waiting + claim clients ────────────────────────────────────────────
// Mirrors the old workbox.skipWaiting / clientsClaim config that lived in
// vite.config.ts before the switch to injectManifest.
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── Runtime caching — Supabase API ──────────────────────────────────────────
// NetworkFirst with a 3-second timeout so the app works offline (cache hit)
// while preferring fresh data when online.
registerRoute(
  ({ url }) => url.origin.includes('.supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
    ],
  })
)

// ── Push event ───────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload: PushPayload = {
    title: 'Replanish',
    body: 'You have a new notification.',
  }

  try {
    if (event.data) {
      payload = event.data.json() as PushPayload
    }
  } catch {
    console.warn('[sw] push event data is not valid JSON')
  }

  const { title, body, tag, url } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag ?? 'replanish-default',
      data: { url: url ?? '/' },
    })
  )
})

// ── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl: string =
    (event.notification.data as { url?: string } | null)?.url ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existingClient = clientList.find(
          (c) => c.url.includes(self.location.origin)
        )
        if (existingClient) {
          // Focus the existing tab and tell the React app to navigate.
          existingClient.focus()
          existingClient.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl })
          return
        }
        // No open tab — open a new one.
        return self.clients.openWindow(targetUrl)
      })
  )
})

// ── Notification close ───────────────────────────────────────────────────────
// No-op in v1. Included so future analytics / A-B tests can hook in here
// without changing the event registration surface.
self.addEventListener('notificationclose', (_event) => {
  // reserved for future analytics
})

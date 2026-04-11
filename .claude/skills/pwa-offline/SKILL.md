---
name: pwa-offline
description: "PWA and offline-first patterns for OurTable. Use when working on: 'PWA', 'offline', 'service worker', 'cache', 'install', 'sync', 'IndexedDB', 'workbox', 'manifest', 'mobile'."
---

# PWA & Offline

Progressive Web App with offline-first shopping lists.

## PWA Setup

- Plugin: `vite-plugin-pwa` with Workbox
- Config in `vite.config.ts`
- Auto-update strategy for service worker
- Install prompt handling for "Add to Home Screen"

## Service Worker

Workbox handles caching strategies:

| Resource | Strategy | Rationale |
|----------|----------|-----------|
| App shell (HTML, JS, CSS) | Precache | Must work offline |
| Supabase API calls | Network-first | Fresh data preferred, cache fallback |
| Images | Cache-first | Rarely change, save bandwidth |
| Fonts | Cache-first | Static assets |

## Offline Shopping Lists

The primary offline use case — users check off items in grocery stores with poor connectivity.

### IndexedDB Persistence
- Shopping list data cached in IndexedDB
- Check/uncheck operations work fully offline
- Queue changes for sync when back online

### Sync Strategy
1. User makes changes offline (check items, reorder, add)
2. Changes queued in IndexedDB with timestamps
3. When connectivity returns, sync queue replays against Supabase
4. Conflict resolution: last-write-wins with timestamp comparison
5. Supabase Realtime re-subscribes on reconnection

## Install Prompt

```ts
// Listen for beforeinstallprompt event
// Show custom install banner/button
// Track installation for analytics
```

## Mobile-First Design

- Bottom navigation (5 tabs) — thumb-friendly
- Touch targets minimum 44x44px
- Pull-to-refresh where appropriate
- Viewport meta tag for proper mobile rendering
- Safe area insets for notched devices

## Manifest

Key manifest properties:
- `name`: "OurTable"
- `short_name`: "OurTable"  
- `theme_color`: "#f97316"
- `display`: "standalone"
- `orientation`: "portrait"
- `start_url`: "/"

## Testing PWA

1. Build production: `npm run build`
2. Serve locally: `npx serve dist`
3. Open Chrome DevTools → Application tab
4. Check: Service Worker registered, Manifest valid, Installable
5. Test offline: DevTools → Network → Offline → verify shopping lists work

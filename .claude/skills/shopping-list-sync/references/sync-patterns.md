# Sync Patterns — Shopping Lists

## Three-Layer Architecture

```
Layer 1: UI (React + TanStack Query)
  ↕ optimistic setQueryData / invalidateQueries

Layer 2: IndexedDB (queryPersist.ts)
  ↕ snapshot every 30s + on visibilitychange

Layer 3: Supabase (PostgreSQL + Realtime)
  ↕ postgres_changes subscription per list
```

## Offline Read (Cache Restore)

On app startup (`App.tsx`):
```ts
restoreQueryCache(queryClient)  // reads IndexedDB → populates query cache
```
Skips entries older than 24 hours. Stale queries re-fetch in background automatically.

## Offline Write

TanStack Query `networkMode: 'offlineFirst'` — mutations attempted immediately, queued internally if network unavailable, replayed on reconnect.

Note: `savePendingMutation` / `replayPendingMutations` in `queryPersist.ts` exist but are not wired up.

## Online Recovery

```ts
window.addEventListener('online', () => queryClient.invalidateQueries())
```
Blunt full-cache invalidation — no selective per-list invalidation.

## Realtime Subscription Lifecycle

- Subscribed: when `ShoppingListPage` mounts (`useEffect([id])`)
- Unsubscribed: on unmount (`supabase.removeChannel(channel)`)
- One channel per list (`list-${id}`), server-side filter
- Handler calls `invalidateQueries` — event payload not used directly

## Cache Persistence

```ts
setInterval(() => persistQueryCache(queryClient), 30_000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistQueryCache(queryClient)
})
```
Only serializes queries with `status === 'success'` and non-undefined data.

## Optimistic Toggle Pattern

```ts
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey })        // prevent overwrite
  queryClient.setQueryData(queryKey, (old) => merge(old, variables))  // snap forward
  // No rollback snapshot saved
},
onSettled: () => {
  queryClient.invalidateQueries({ queryKey })          // reconcile with server
},
```

## Conflict Resolution

Last-write-wins at DB level. Both users receive authoritative state via Realtime within seconds.

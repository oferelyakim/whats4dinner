---
name: shopping-list-sync
description: "Shopping list offline-first + realtime sync patterns for OurTable. Use when working on: 'shopping list', 'sync', 'offline', 'realtime', 'reorder', 'store route', 'dnd', 'drag and drop', 'toggle item', 'check item', 'optimistic update', 'IndexedDB', 'list items'."
---

# Shopping List Sync

Offline-first shopping lists with Supabase Realtime collaboration. The primary daily-retention feature — used 2-3x/week in grocery stores with spotty connectivity.

## Key Files

| File | Role |
|------|------|
| `src/services/shoppingLists.ts` | All Supabase CRUD: lists, items, recipe-to-list, deduplication, sharing |
| `src/services/stores.ts` | Store and store route CRUD; `updateRouteOrder` for DnD dept reordering |
| `src/pages/ShoppingListPage.tsx` | Primary UX: Realtime sub, optimistic toggle, dnd-kit reorder, sort modes |
| `src/pages/ListsPage.tsx` | Lists index: TanStack Query fetch, active/completed split |
| `src/pages/NewListPage.tsx` | Create form: RPC call, seeds empty cache entry, redirects to detail |
| `src/lib/queryPersist.ts` | IndexedDB persistence layer for TanStack Query cache |
| `src/App.tsx` | Bootstraps offline: restores cache on load, persists every 30s + on hide |

## Data Flow

```
User action
  → React state / TanStack mutation
    → optimistic update via queryClient.setQueryData (toggle/reorder)
      → Supabase write (service fn)
        → Realtime postgres_changes event fires on all subscribers
          → queryClient.invalidateQueries(['shopping-list', id])
            → UI re-renders with authoritative data
```

## Offline Strategy

Two independent layers:
1. **TanStack Query `networkMode: 'offlineFirst'`** — mutations queue offline and fire when reconnected
2. **IndexedDB snapshot** (`queryPersist.ts`) — full query cache serialized every 30s + on `visibilitychange`. Restored on app load

When device comes online: `queryClient.invalidateQueries()` refreshes all stale data.
Conflict resolution: **last-write-wins**. No CRDT or merge logic.

## Realtime Subscription

Per-component, per-list, in `ShoppingListPage`:
```ts
const channel = supabase
  .channel(`list-${id}`)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'shopping_list_items',
    filter: `list_id=eq.${id}`,
  }, () => queryClient.invalidateQueries({ queryKey: ['shopping-list', id] }))
  .subscribe()
```
Handler invalidates only — does NOT merge the payload.

## Optimistic Updates

Only `toggleListItem` uses optimistic update (latency matters in grocery stores). No rollback snapshot — errors resolved via `onSettled` invalidation.

`addItem` and `removeItem` do NOT use optimistic updates.

## DnD Reorder (dnd-kit)

Only in `default` sort mode. Disabled in `department` and `route` sort modes.
Sensors: `PointerSensor` (distance: 8) + `TouchSensor` (delay: 200ms, tolerance: 5).
On drag end: optimistic reorder via `setQueryData` + `arrayMove`, then N parallel sort_order updates.

## Sort Modes

| Mode | Behavior | DnD |
|------|----------|-----|
| `default` | `sort_order` from DB | Enabled |
| `department` | grouped by `category` | Disabled |
| `route` | ordered by `store_routes` for selected store | Disabled |

Items with no matching route department get order `999` (rendered last).

## TanStack Query Keys

- `['shopping-lists']` — ListsPage index
- `['shopping-list', id]` — detail (list + items)
- `['stores']` — store picker
- `['store-routes', storeId]` — fetched only when sortBy === 'route'

## Known Gaps

- `replayPendingMutations` in `queryPersist.ts` defined but never called — offline writes rely solely on TanStack Query's built-in queue
- No optimistic rollback on error for add/remove
- `item_requests` table exists in DB but has no UI

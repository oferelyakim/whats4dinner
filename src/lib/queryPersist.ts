import { openDB, type IDBPDatabase } from 'idb'
import type { QueryClient } from '@tanstack/react-query'

const DB_NAME = 'w4d-cache'
const STORE_NAME = 'query-cache'
const DB_VERSION = 1

let db: IDBPDatabase | null = null

async function getDb() {
  if (db) return db
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    },
  })
  return db
}

// Save query cache to IndexedDB
export async function persistQueryCache(queryClient: QueryClient) {
  try {
    const database = await getDb()
    const cache = queryClient.getQueryCache().getAll()

    const serializable = cache
      .filter((q) => q.state.status === 'success' && q.state.data !== undefined)
      .map((q) => ({
        queryKey: q.queryKey,
        data: q.state.data,
        dataUpdatedAt: q.state.dataUpdatedAt,
      }))

    await database.put(STORE_NAME, serializable, 'cache')
  } catch {
    // Silently fail - offline persistence is best-effort
  }
}

// Restore query cache from IndexedDB
export async function restoreQueryCache(queryClient: QueryClient) {
  try {
    const database = await getDb()
    const cached = await database.get(STORE_NAME, 'cache')
    if (!cached || !Array.isArray(cached)) return

    const maxAge = 1000 * 60 * 60 * 24 // 24 hours

    for (const entry of cached) {
      if (Date.now() - entry.dataUpdatedAt > maxAge) continue

      queryClient.setQueryData(entry.queryKey, entry.data, {
        updatedAt: entry.dataUpdatedAt,
      })
    }
  } catch {
    // Silently fail
  }
}

// Save pending mutations for offline replay
export async function savePendingMutation(mutation: {
  id: string
  endpoint: string
  method: string
  body: unknown
}) {
  try {
    const database = await getDb()
    const pending = (await database.get(STORE_NAME, 'pending-mutations')) ?? []
    pending.push({ ...mutation, timestamp: Date.now() })
    await database.put(STORE_NAME, pending, 'pending-mutations')
  } catch {}
}

// Get and clear pending mutations
export async function replayPendingMutations(): Promise<Array<{
  id: string
  endpoint: string
  method: string
  body: unknown
  timestamp: number
}>> {
  try {
    const database = await getDb()
    const pending = (await database.get(STORE_NAME, 'pending-mutations')) ?? []
    await database.put(STORE_NAME, [], 'pending-mutations')
    return pending
  } catch {
    return []
  }
}

import { db } from '../db'
import { SYSTEM_PRESETS } from './seeded'

let seedPromise: Promise<void> | null = null

export function seedSystemPresets(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    const existing = await db.presets.where('source').equals('system').count()
    if (existing >= SYSTEM_PRESETS.length) return
    await db.presets.bulkPut(SYSTEM_PRESETS)
  })()
  return seedPromise
}

/** Test-only: forget the cached seed promise so a fresh DB can be seeded again. */
export function __resetSeedCache() {
  seedPromise = null
}

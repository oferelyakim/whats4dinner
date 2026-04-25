import { db } from '../db'
import { SYSTEM_PRESETS } from './seeded'

let seedPromise: Promise<void> | null = null

export function seedSystemPresets(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    const existing = await db.presets.where('source').equals('system').count()
    if (existing < SYSTEM_PRESETS.length) {
      await db.presets.bulkPut(SYSTEM_PRESETS)
    }
    // Anti-Mediterranean-bias seed for fresh users.
    await seedAntiMedHistory()
  })()
  return seedPromise
}

/**
 * On first-launch (no dishHistory yet), pre-load synthetic Mediterranean /
 * Middle-Eastern entries into dishHistory so the anti-repeat picker
 * structurally pushes the FIRST plan AWAY from the model's training prior.
 *
 * This is the single highest-leverage line in the variety system:
 *   - Without it, plan #1 has no anti-repeat penalty, so Haiku's bias
 *     toward Mediterranean dominates.
 *   - With it, plan #1 sees "kabob, shakshuka, falafel..." in the recent-dish
 *     ban window and is forced to pick from the other 21 cuisines.
 *
 * Once the user generates real plans, these synthetic rows age out of the
 * relevant windows naturally (decayWindow=12 in the picker) and stop biasing
 * future plans.
 */
async function seedAntiMedHistory(): Promise<void> {
  const count = await db.dishHistory.count()
  if (count > 0) return

  const now = Date.now()
  const synthetic = [
    { cuisineId: 'israeli', dishName: 'Shakshuka with feta' },
    { cuisineId: 'israeli', dishName: 'Chicken shawarma plate' },
    { cuisineId: 'israeli', dishName: 'Falafel bowl' },
    { cuisineId: 'persian', dishName: 'Chicken kabob' },
    { cuisineId: 'persian', dishName: 'Lamb koobideh' },
    { cuisineId: 'greek', dishName: 'Lamb gyros' },
    { cuisineId: 'greek', dishName: 'Greek chicken souvlaki' },
    { cuisineId: 'spanish-tapas', dishName: 'Patatas bravas' },
  ]
  const rows = synthetic.map((d, i) => ({
    id: crypto.randomUUID(),
    slotId: '__synthetic__',
    planId: '__synthetic__',
    dishName: d.dishName,
    cuisineId: d.cuisineId,
    styleId: 'grilled',
    flavorId: 'herby',
    plannedAt: now - (i + 1) * 1000, // recent enough to be in the soft window
  }))
  await db.dishHistory.bulkAdd(rows)
}

/** Test-only: forget the cached seed promise so a fresh DB can be seeded again. */
export function __resetSeedCache() {
  seedPromise = null
}

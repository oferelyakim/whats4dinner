// Pure, deterministic randomization with anti-repeat weighting.
// No Dexie, no AI — easy to unit-test.

export interface HasIdLike {
  // accept any record with a stable string handle (`id` for cuisines/styles/flavors,
  // `name` for proteins/veggies/starches)
  id?: string
  name?: string
  family?: string
  tags?: string[]
}

function handle<T extends HasIdLike>(it: T): string {
  return (it.id ?? it.name ?? '') as string
}

export interface PickOptions<T extends HasIdLike> {
  pool: T[]
  recentlyUsed?: string[] // ordered most-recent first
  banWindow?: number // hard ban: items in first N of recentlyUsed are excluded
  decayWindow?: number // soft ban: positions banWindow..decayWindow get half-weight
  mustHaveTag?: string[]
  mustAvoidTag?: string[]
  mustHaveFamily?: string[]
  mustAvoidFamily?: string[]
  mustAvoidIds?: string[]
  rng?: () => number
}

/**
 * Weighted random pick that penalizes recent repeats.
 *
 * - Items in `recentlyUsed[0..banWindow-1]` are excluded.
 * - Items in `recentlyUsed[banWindow..decayWindow-1]` get linearly increasing
 *   weight from 0.5 (most recent of the soft window) to 1.0 (oldest).
 * - All other items get weight 1.0.
 * - If filtering produces zero candidates, hard-ban relaxes to zero (last-resort).
 */
export function pickWithDiversity<T extends HasIdLike>(opts: PickOptions<T>): T | null {
  const {
    pool,
    recentlyUsed = [],
    banWindow = 5,
    decayWindow = 12,
    mustHaveTag = [],
    mustAvoidTag = [],
    mustHaveFamily,
    mustAvoidFamily = [],
    mustAvoidIds = [],
    rng = Math.random,
  } = opts

  const banned = new Set(recentlyUsed.slice(0, banWindow))
  const decayed = new Map<string, number>()
  const softWindow = recentlyUsed.slice(banWindow, decayWindow)
  softWindow.forEach((id, i) => {
    const span = Math.max(1, softWindow.length)
    decayed.set(id, 0.5 + 0.5 * (i / span))
  })

  const candidates = pool
    .filter((it) => !banned.has(handle(it)))
    .filter((it) => !mustAvoidIds.includes(handle(it)))
    .filter((it) => !mustAvoidFamily.includes(it.family ?? ''))
    .filter((it) => !mustHaveFamily || mustHaveFamily.includes(it.family ?? ''))
    .filter((it) => mustHaveTag.every((t) => (it.tags ?? []).includes(t)))
    .filter((it) => !mustAvoidTag.some((t) => (it.tags ?? []).includes(t)))

  if (candidates.length === 0) {
    if (banWindow > 0) {
      return pickWithDiversity({ ...opts, banWindow: 0 })
    }
    return null
  }

  const weights = candidates.map((it) => decayed.get(handle(it)) ?? 1)
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = rng() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

/** Deterministic seedable PRNG (mulberry32) — for tests. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

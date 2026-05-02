// Edge function version probe.
//
// On app boot we ping the deployed edge functions, compare to APP_VERSION,
// and surface a banner if there's a mismatch — so the user knows AI features
// may misbehave until the deploy catches up, instead of clicking and
// getting opaque 500s.

import { APP_VERSION } from '@/lib/version'

interface PingResponse {
  fn: string
  version: string
  model?: string
  composeModel?: string
  deployedAt: string
}

const FUNCTIONS = ['meal-engine', 'event-engine', 'weekly-drop-generator'] as const
const STORAGE_KEY = 'edgeVersionMismatch'

function getSupabaseFnUrl(): string {
  const raw = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  return raw.replace(/\/$/, '')
}

async function pingFn(fn: string, signal: AbortSignal): Promise<PingResponse | null> {
  const base = getSupabaseFnUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/functions/v1/${fn}?ping=1`, {
      method: 'GET',
      signal,
      headers: { apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '' },
    })
    if (!res.ok) return null
    return (await res.json()) as PingResponse
  } catch {
    return null
  }
}

export interface EdgeVersionMismatch {
  fn: string
  serverVersion: string
  appVersion: string
}

/**
 * Pings each edge function once on boot. Stores any mismatch in localStorage
 * so AI dialogs can render a "server is on older version" banner without
 * needing to retry the probe themselves.
 *
 * Silent on success — only logs when something is wrong.
 */
export async function probeEdgeVersions(): Promise<EdgeVersionMismatch[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  const mismatches: EdgeVersionMismatch[] = []
  try {
    const results = await Promise.all(FUNCTIONS.map((fn) => pingFn(fn, ctrl.signal)))
    for (let i = 0; i < FUNCTIONS.length; i++) {
      const fn = FUNCTIONS[i]
      const ping = results[i]
      if (!ping) {
        // ping endpoint missing — almost certainly the function hasn't been
        // redeployed since v1.16.0. Surface as a mismatch.
        mismatches.push({ fn, serverVersion: 'pre-1.16', appVersion: APP_VERSION })
        continue
      }
      if (ping.version !== APP_VERSION) {
        mismatches.push({ fn, serverVersion: ping.version, appVersion: APP_VERSION })
      }
    }
  } finally {
    clearTimeout(timer)
  }
  if (mismatches.length === 0) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* no-op */
    }
    return []
  }
  console.warn('[edgeVersionProbe] mismatch detected:', mismatches)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mismatches))
  } catch {
    /* no-op */
  }
  return mismatches
}

/** Read the most recent mismatch from localStorage (sync — for UI gating). */
export function getEdgeVersionMismatch(): EdgeVersionMismatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as EdgeVersionMismatch[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

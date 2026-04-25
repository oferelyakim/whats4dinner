// In-app review prompt with 90-day cooldown. PWA-only for now — no native bridge.
// Triggers at value moments (shopping list mostly checked, event item claimed, AI meal plan saved).

const COOLDOWN_KEY = 'rp_review_prompt_last'
const SESSION_KEY = 'rp_review_session_count'
const DISMISSED_KEY = 'rp_review_dismissed_forever'
const COOLDOWN_DAYS = 90
const SKIP_FIRST_SESSIONS = 3

// TODO: replace with real store URL once TWA / store listing ships
export const REVIEW_STORE_URL = 'https://app.replanish.app/?review=1'

let sessionBumped = false

function bumpSessionCount(): number {
  if (typeof window === 'undefined') return 0
  if (sessionBumped) return Number(localStorage.getItem(SESSION_KEY) || '0')
  sessionBumped = true
  const next = Number(localStorage.getItem(SESSION_KEY) || '0') + 1
  localStorage.setItem(SESSION_KEY, String(next))
  return next
}

let listeners = new Set<() => void>()
let isOpen = false

export function shouldPromptReview(): boolean {
  if (typeof window === 'undefined') return false
  if (localStorage.getItem(DISMISSED_KEY) === '1') return false
  const sessions = bumpSessionCount()
  if (sessions <= SKIP_FIRST_SESSIONS) return false
  const last = Number(localStorage.getItem(COOLDOWN_KEY) || '0')
  if (!last) return true
  const elapsedMs = Date.now() - last
  return elapsedMs > COOLDOWN_DAYS * 24 * 60 * 60 * 1000
}

export function maybeRequestReview(): void {
  if (!shouldPromptReview()) return
  // Mark cooldown immediately so we don't show twice in one session even on re-trigger.
  localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
  isOpen = true
  listeners.forEach((cb) => cb())
}

export function dismissReviewPrompt(forever = false): void {
  if (forever) localStorage.setItem(DISMISSED_KEY, '1')
  isOpen = false
  listeners.forEach((cb) => cb())
}

export function getReviewPromptOpen(): boolean {
  return isOpen
}

export function subscribeReviewPrompt(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

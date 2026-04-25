export const CANONICAL_APP_URL = 'https://app.replanish.app'

export function getShareOrigin(): string {
  if (typeof window === 'undefined') return CANONICAL_APP_URL
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return window.location.origin
  }
  return CANONICAL_APP_URL
}

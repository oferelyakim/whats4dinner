/** Sentinel error: a Stage was aborted by the user (e.g. via cancelSlot). */
export class AbortedByUserError extends Error {
  constructor() {
    super('Aborted by user')
    this.name = 'AbortedByUserError'
  }
}

/**
 * v1.16.0: edge function returned 429 with a `retry-after` hint. Engine catches
 * this and sets the slot to `error_rate_limited` (vs. plain `error`), then
 * schedules an automatic resume. The user sees a countdown rather than a
 * Retry button they have to mash.
 */
export class RateLimitedError extends Error {
  retryAfterMs: number
  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'RateLimitedError'
    this.retryAfterMs = retryAfterMs
  }
}

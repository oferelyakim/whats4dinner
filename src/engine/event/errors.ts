// Event Planner v2 — error classes.
//
// Mirrors src/engine/errors.ts so the engine's catch sites can distinguish
// rate-limited, aborted, and ordinary errors.

export class PlannerAbortedError extends Error {
  constructor(message = 'Aborted by user') {
    super(message)
    this.name = 'PlannerAbortedError'
  }
}

export class PlannerRateLimitedError extends Error {
  retryAfterMs: number
  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'PlannerRateLimitedError'
    this.retryAfterMs = retryAfterMs
  }
}

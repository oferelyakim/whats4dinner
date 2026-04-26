// Shared Anthropic Messages API helper.
//
// v1.16.0: extracted from meal-engine/index.ts so plan-event and other edge
// functions get the same robust 429/5xx retry behavior. Replaces the previous
// raw `fetch` calls in plan-event (which had zero retry).
//
// Behavior:
//   - Retries on 429/529/5xx up to `retries` times (default 3) with backoff.
//   - Honors `retry-after` header when present (server tells us when to come back).
//   - Backoff caps at `maxBackoffMs` (default 8s) per attempt.
//   - On non-retriable 4xx (400/401/403/404), throws immediately.
//   - Returns `{ ...response, _meta: { tokensIn, tokensOut, retryAfterMs? } }` so
//     callers can surface rate-limit awareness to clients.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export interface AnthropicContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  id?: string
}

export interface AnthropicResponse {
  content: AnthropicContentBlock[]
  stop_reason: string
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

export interface AnthropicCallMeta {
  tokensIn: number
  tokensOut: number
  /** When non-zero, server told us to back off at least this long. */
  retryAfterMs?: number
  /** Number of retry attempts before success (0 = first try). */
  attempts: number
}

export interface AnthropicCallOptions {
  /** Max retry attempts on retriable errors. Default 3. */
  retries?: number
  /** Backoff cap per attempt. Default 8000ms. */
  maxBackoffMs?: number
  /** Hard upper bound on retry-after we'll honor before giving up. Default 30s. */
  maxRetryAfterMs?: number
  /** AbortSignal for cancellation. */
  signal?: AbortSignal
}

export class AnthropicRateLimitError extends Error {
  retryAfterMs: number
  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'AnthropicRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)
  // HTTP-date format — convert to ms-from-now.
  const date = Date.parse(value)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return undefined
}

function backoffMs(attempt: number, cap: number): number {
  // Exponential: 0ms, 1s, 3s, 7s, ... capped at `cap`.
  if (attempt === 0) return 0
  return Math.min(cap, Math.round(1000 * (2 ** attempt - 1) + Math.random() * 250))
}

/**
 * Call Anthropic with retry + retry-after awareness. Throws on non-retriable
 * errors or after exhausting retries; on success returns the response with
 * `_meta` carrying token usage and (if applicable) retry-after the SERVER
 * suggested at any point during the call sequence.
 */
export async function anthropicWithRetry(
  apiKey: string,
  body: Record<string, unknown>,
  opts: AnthropicCallOptions = {},
): Promise<AnthropicResponse & { _meta: AnthropicCallMeta }> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const retries = opts.retries ?? 3
  const maxBackoff = opts.maxBackoffMs ?? 8000
  const maxRetryAfter = opts.maxRetryAfterMs ?? 30000

  let lastErr: unknown = null
  let lastRetryAfter: number | undefined

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (attempt > 0) {
      // Either retry-after from the previous response OR exponential backoff.
      const wait = lastRetryAfter ?? backoffMs(attempt, maxBackoff)
      await new Promise((r) => setTimeout(r, wait))
      lastRetryAfter = undefined
    }
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
      if (res.ok) {
        const data = (await res.json()) as AnthropicResponse
        return {
          ...data,
          _meta: {
            tokensIn: data.usage?.input_tokens ?? 0,
            tokensOut: data.usage?.output_tokens ?? 0,
            attempts: attempt,
          },
        }
      }
      const status = res.status
      const text = await res.text().catch(() => '')
      const headerRetryAfter = parseRetryAfter(res.headers.get('retry-after'))
      // Non-retriable: 400/401/403/404. Throw immediately.
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        throw new Error(`Anthropic ${status}: ${text}`)
      }
      // Retriable: capture retry-after if Anthropic supplied one.
      if (status === 429) {
        lastRetryAfter = headerRetryAfter !== undefined
          ? Math.min(headerRetryAfter, maxRetryAfter)
          : undefined
        // If retry-after exceeds our budget, surface it as a structured error.
        if (lastRetryAfter !== undefined && lastRetryAfter > maxRetryAfter) {
          throw new AnthropicRateLimitError(`Anthropic 429: ${text}`, lastRetryAfter)
        }
      }
      lastErr = new Error(`Anthropic ${status}: ${text}`)
    } catch (err) {
      // Network errors are retriable.
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (err instanceof AnthropicRateLimitError) throw err
      // For other thrown errors that came from the non-retriable branch above,
      // re-throw if we hit the final attempt.
      lastErr = err
      if (attempt >= retries) throw err
    }
  }
  // If we get here, we ran out of attempts with retriable errors.
  if (lastRetryAfter !== undefined) {
    throw new AnthropicRateLimitError(
      `Anthropic rate-limited after ${retries + 1} attempts`,
      lastRetryAfter,
    )
  }
  throw lastErr instanceof Error ? lastErr : new Error('Anthropic call failed after retries')
}

/** Convenience: pull a tool_use block out of a response, by tool name. */
export function pickToolUse(
  resp: AnthropicResponse,
  name: string,
): Record<string, unknown> | null {
  for (const block of resp.content) {
    if (block.type === 'tool_use' && block.name === name && block.input) {
      return block.input
    }
  }
  return null
}

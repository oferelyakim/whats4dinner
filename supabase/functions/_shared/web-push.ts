// Shared Web Push helper — thin wrapper over the npm `web-push` package via
// Deno's built-in npm compatibility (Supabase Edge Runtime supports `npm:`
// specifiers natively).
//
// Usage:
//   import { sendPushNotification } from '../_shared/web-push.ts'
//   const result = await sendPushNotification(sub, payload)
//   // result === null → delivered; result === 'stale' → 404/410, caller should delete sub
//
// Reads VAPID_PRIVATE_KEY, VAPID_SUBJECT, VAPID_PUBLIC_KEY from Deno.env.
// VAPID_PRIVATE_KEY: raw base64url-encoded P-256 private key (32 bytes).
// VAPID_PUBLIC_KEY:  raw base64url-encoded P-256 public key (65 bytes uncompressed).
// VAPID_SUBJECT:     mailto: or https: URI identifying the sender.
//
// VAPID details are configured once on cold-start to avoid repeated work.

// deno-lint-ignore-file no-explicit-any
import webpush from 'npm:web-push@3.6.7'

export interface PushSubscription {
  endpoint: string
  p256dh: string
  auth_key: string
}

export interface PushPayload {
  title: string
  body: string
  tag?: string
  url?: string
}

let _configured = false

function configure(): void {
  if (_configured) return

  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const publicKey  = Deno.env.get('VAPID_PUBLIC_KEY')
  const subject    = Deno.env.get('VAPID_SUBJECT')

  if (!privateKey) throw new Error('VAPID_PRIVATE_KEY env var is not set')
  if (!publicKey)  throw new Error('VAPID_PUBLIC_KEY env var is not set')
  if (!subject)    throw new Error('VAPID_SUBJECT env var is not set')

  ;(webpush as any).setVapidDetails(subject, publicKey, privateKey)
  _configured = true
}

/**
 * Send a Web Push notification to a single subscription endpoint.
 *
 * Returns:
 *   null      — successfully delivered (2xx from push provider)
 *   'stale'   — 404 or 410 from provider; caller should delete the subscription
 *
 * Throws on any other error (network failure, 5xx, bad VAPID config, etc.).
 */
export async function sendPushNotification(
  sub: PushSubscription,
  payload: PushPayload,
): Promise<null | 'stale'> {
  configure()

  const data = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    tag:   payload.tag,
    url:   payload.url,
  })

  try {
    await (webpush as any).sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth:   sub.auth_key,
        },
      },
      data,
    )
    return null
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'stale'
    throw err
  }
}

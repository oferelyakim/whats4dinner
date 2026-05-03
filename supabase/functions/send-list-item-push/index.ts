// send-list-item-push — database webhook handler for shopping list item inserts.
//
// Triggered by a Supabase database webhook on public.shopping_list_items INSERT
// (configured manually in the Supabase dashboard — see migration 044 comments).
//
// Deploy with --no-verify-jwt (database webhooks do not carry bearer tokens).
//
// Flow:
//   1. Receive the webhook payload (type='INSERT', table='shopping_list_items')
//   2. Resolve list_id → circle_id + list name
//   3. Get all circle member user_ids
//   4. Exclude the user who added the item (added_by)
//   5. Fetch push_subscriptions for all remaining users
//   6. Send notification to each subscription
//   7. Prune stale (404/410) subscriptions
//
// No dedup log — the webhook fires exactly once per INSERT. The notification
// tag ('list-update:{list_id}') lets the OS collapse rapid successive adds into
// a single notification on the user's device.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushNotification, type PushSubscription } from '../_shared/web-push.ts'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_VERSION      = '1.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Supabase webhook payload shape for postgres_changes.
interface WebhookPayload {
  type:   string
  table:  string
  schema: string
  record: {
    id:       string
    list_id:  string
    name:     string
    added_by: string | null
    [key: string]: unknown
  }
  old_record: null | Record<string, unknown>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method === 'GET' && new URL(req.url).searchParams.get('ping') === '1') {
    return json(200, { fn: 'send-list-item-push', version: APP_VERSION })
  }

  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  // Only handle INSERT events on shopping_list_items.
  if (payload.type !== 'INSERT' || payload.table !== 'shopping_list_items') {
    return json(200, { ok: true, skipped: 'not_an_insert_on_shopping_list_items' })
  }

  const { list_id, name: itemName, added_by: addedBy } = payload.record

  if (!list_id) {
    return json(400, { error: 'missing_list_id' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    // ── 1. Resolve list → circle_id + list name ──────────────────────────
    const { data: listRow, error: listError } = await supabase
      .from('shopping_lists')
      .select('id, name, circle_id')
      .eq('id', list_id)
      .single()

    if (listError || !listRow) {
      return json(500, { error: 'list_not_found', detail: listError?.message ?? 'no row' })
    }

    const { circle_id: circleId, name: listName } = listRow

    // ── 2. Get all circle member user_ids ──────────────────────────────
    const { data: members, error: membersError } = await supabase
      .from('circle_members')
      .select('user_id')
      .eq('circle_id', circleId)

    if (membersError) {
      return json(500, { error: 'members_query_failed', detail: membersError.message })
    }

    // ── 3. Filter out the user who added the item ──────────────────────
    const targetUserIds = (members ?? [])
      .map((m: { user_id: string }) => m.user_id)
      .filter((uid: string) => uid !== addedBy)

    if (!targetUserIds.length) {
      return json(200, { ok: true, sent: 0, stale_pruned: 0, reason: 'no_other_members' })
    }

    // ── 4. Fetch all subscriptions for target users in one query ───────
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth_key')
      .in('user_id', targetUserIds)

    if (subsError) {
      return json(500, { error: 'subscriptions_query_failed', detail: subsError.message })
    }

    if (!subs?.length) {
      return json(200, { ok: true, sent: 0, stale_pruned: 0, reason: 'no_subscriptions' })
    }

    // ── 5. Send to each subscription ──────────────────────────────────
    const payload_notification = {
      title: 'Shopping list updated',
      body:  `${itemName} added to ${listName}`,
      tag:   `list-update:${list_id}`,
      url:   `/lists/${list_id}`,
    }

    let sent = 0
    let stale_pruned = 0

    for (const sub of subs) {
      try {
        const subscription: PushSubscription = {
          endpoint: sub.endpoint,
          p256dh:   sub.p256dh,
          auth_key: sub.auth_key,
        }

        const result = await sendPushNotification(subscription, payload_notification)

        if (result === 'stale') {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', sub.user_id)
            .eq('endpoint', sub.endpoint)
          stale_pruned++
        } else {
          await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('user_id', sub.user_id)
            .eq('endpoint', sub.endpoint)
          sent++
        }
      } catch (err) {
        console.error(
          `sendPushNotification error for user ${sub.user_id} endpoint ${sub.endpoint.slice(0, 60)}:`,
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    return json(200, { ok: true, sent, stale_pruned })
  } catch (err) {
    return json(500, {
      error:  'handler_threw',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

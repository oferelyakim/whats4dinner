import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Map Stripe subscription status strings to our app status values. */
function mapStatus(stripeStatus: string): 'active' | 'cancelled' | 'expired' {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active'
  if (stripeStatus === 'canceled') return 'cancelled'
  // past_due, unpaid, incomplete_expired, paused, etc.
  return 'expired'
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Webhook signature verification failed:', message)
    return new Response(`Webhook Error: ${message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        // billing_period is written by create-checkout into both session metadata
        // and subscription_data.metadata. Prefer session-level metadata.
        const billingPeriod =
          session.metadata?.billing_period ||
          session.metadata?.plan ||
          'monthly'

        if (!userId) {
          console.error('checkout.session.completed: missing supabase_user_id in metadata')
          break
        }

        if (!session.subscription) {
          console.error('checkout.session.completed: session has no subscription id')
          break
        }

        // Fetch the actual Stripe subscription to get real period boundaries + trial info
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)

        const periodStart = new Date(stripeSub.current_period_start * 1000).toISOString()
        const periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString()
        const trialEnd = stripeSub.trial_end
          ? new Date(stripeSub.trial_end * 1000).toISOString()
          : null
        const status = mapStatus(stripeSub.status)

        const { data: subRow, error: upsertError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan: billingPeriod,
            billing_period: billingPeriod,
            status,
            stripe_subscription_id: stripeSub.id,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            trial_end: trialEnd,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
          .select('id')
          .single()

        if (upsertError) {
          console.error('Failed to upsert subscription:', upsertError.message)
          break
        }

        if (subRow?.id) {
          // Ensure an owner seat exists for the purchaser
          const { error: seatError } = await supabase
            .from('subscription_seats')
            .insert({ subscription_id: subRow.id, user_id: userId, role: 'owner' })
            .throwOnError()
            // ON CONFLICT DO NOTHING equivalent: ignore unique-violation
            .then((res) => res)
            .catch((err: unknown) => {
              // Ignore duplicate (owner seat already present from a previous checkout)
              const message = err instanceof Error ? err.message : String(err)
              if (!message.includes('duplicate') && !message.includes('unique')) {
                console.error('Failed to insert owner seat:', message)
              }
              return { error: null }
            })
          void seatError
        }

        console.log(`Subscription activated: ${userId} → ${billingPeriod} (${status})`)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const billingPeriod =
          (subscription.metadata?.billing_period as string | undefined) || undefined

        const status = mapStatus(subscription.status)
        const trialEnd = subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null

        const updatePayload: Record<string, unknown> = {
          status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          trial_end: trialEnd,
          updated_at: new Date().toISOString(),
        }
        if (billingPeriod) {
          updatePayload.plan = billingPeriod
          updatePayload.billing_period = billingPeriod
        }

        await supabase
          .from('subscriptions')
          .update(updatePayload)
          .eq('stripe_subscription_id', subscription.id)

        console.log(`Subscription updated: ${subscription.id} → ${status}`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subscription.id)

        console.log(`Subscription cancelled: ${subscription.id}`)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        // Refresh period_end to match the new invoice cycle
        const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription as string)
        await supabase
          .from('subscriptions')
          .update({
            status: mapStatus(stripeSub.status),
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
            trial_end: stripeSub.trial_end
              ? new Date(stripeSub.trial_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', stripeSub.id)

        console.log(`Invoice payment succeeded: ${invoice.id}, refreshed period_end`)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        await supabase
          .from('subscriptions')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', invoice.subscription as string)

        console.log(`Invoice payment failed: ${invoice.id}, status → expired`)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Error processing ${event.type}:`, message)
    return new Response(`Webhook handler error: ${message}`, { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

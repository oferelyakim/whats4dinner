import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        const plan = session.metadata?.plan
        if (!userId || !plan) break

        const now = new Date()
        const periodEnd = new Date(now)
        periodEnd.setMonth(periodEnd.getMonth() + 1)

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          plan,
          status: 'active',
          stripe_subscription_id: session.subscription as string,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: 'user_id' })

        console.log(`Subscription activated: ${userId} → ${plan}`)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const stripeSubId = subscription.id

        const status = subscription.status === 'active' ? 'active'
          : subscription.status === 'canceled' ? 'cancelled'
          : 'expired'

        await supabase
          .from('subscriptions')
          .update({
            status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', stripeSubId)

        console.log(`Subscription updated: ${stripeSubId} → ${status}`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)

        console.log(`Subscription cancelled: ${subscription.id}`)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (err: any) {
    console.error(`Error processing ${event.type}:`, err.message)
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

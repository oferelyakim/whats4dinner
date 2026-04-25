import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PRICE_IDS: Record<string, string> = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY') || '',
  annual: Deno.env.get('STRIPE_PRICE_ANNUAL') || '',
}

/** Normalise legacy `plan` values to the new `billingPeriod` enum */
function normaliseBillingPeriod(body: Record<string, unknown>): 'monthly' | 'annual' | null {
  // Prefer explicit billingPeriod field
  if (body.billingPeriod === 'monthly' || body.billingPeriod === 'annual') {
    return body.billingPeriod as 'monthly' | 'annual'
  }
  // Legacy: plan field (ai_individual → monthly, ai_family → monthly)
  if (body.plan === 'annual') return 'annual'
  if (
    body.plan === 'monthly' ||
    body.plan === 'ai_individual' ||
    body.plan === 'ai_family'
  ) {
    return 'monthly'
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: 'Stripe not configured. Use mock mode.' }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json() as Record<string, unknown>
    const billingPeriod = normaliseBillingPeriod(body)

    if (!billingPeriod || !PRICE_IDS[billingPeriod]) {
      return new Response(
        JSON.stringify({ error: 'Invalid billing period. Expected "monthly" or "annual".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single()

    const customers = await stripe.customers.list({ email: profile?.email, limit: 1 })
    const customer = customers.data.length > 0
      ? customers.data[0]
      : await stripe.customers.create({
          email: profile?.email || user.email,
          metadata: { supabase_user_id: user.id },
        })

    // Build subscription_data — annual gets a 14-day trial
    const subscriptionData: Stripe.Checkout.SessionCreateParams['subscription_data'] = {
      metadata: { billing_period: billingPeriod },
      ...(billingPeriod === 'annual' ? { trial_period_days: 14 } : {}),
    }

    // Create checkout session
    const origin = req.headers.get('Origin') || 'https://app.replanish.app'
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      line_items: [{ price: PRICE_IDS[billingPeriod], quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}/profile?subscription=success`,
      cancel_url: `${origin}/profile?subscription=cancelled`,
      subscription_data: subscriptionData,
      metadata: {
        supabase_user_id: user.id,
        billing_period: billingPeriod,
        // Keep legacy plan field so old webhook code doesn't break mid-deploy
        plan: billingPeriod,
      },
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

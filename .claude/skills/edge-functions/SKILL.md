---
name: edge-functions
description: "Supabase Edge Function patterns for OurTable: shared boilerplate (CORS, auth, error handling), AI usage tracking, Claude API integration, Stripe webhooks. Use when working on: 'edge function', 'supabase function', 'deploy function', 'CORS', 'AI usage', 'stripe webhook', 'create-checkout'."
---

# Edge Functions

5 Supabase Edge Functions in `supabase/functions/`. All use Deno + `serve()` from std lib.

## Shared Patterns

### CORS Headers
Every function starts with:
```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
// OPTIONS preflight handler
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}
```

### Auth Validation (for authenticated functions)
```ts
const authHeader = req.headers.get('Authorization')
if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const token = authHeader.replace('Bearer ', '')
const { data: { user }, error: authError } = await supabase.auth.getUser(token)
if (authError || !user) return unauthorized()
```

### API Key Guard (for AI functions)
```ts
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
if (!ANTHROPIC_API_KEY) {
  return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 501 })
}
```

### AI Usage Metadata
All AI functions return `_ai_usage` in response:
```ts
const tokensIn = result.usage?.input_tokens || 0
const tokensOut = result.usage?.output_tokens || 0
const cost = (tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M

return { ..., _ai_usage: { model: MODEL, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost } }
```

### Error Response Format
```ts
return new Response(JSON.stringify({ error: 'message' }), {
  status: 400|401|500|501,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})
```

## Function Categories

| Function | Auth | AI | Purpose |
|----------|------|----|---------|
| `scrape-recipe` | No | Yes (Haiku) | Extract recipe from URL or photo |
| `generate-meal-plan` | Yes | Yes (Haiku) | Generate weekly meal plan |
| `nlp-action` | Yes | Yes (Haiku) | Parse natural language quick actions |
| `create-checkout` | Yes | No | Create Stripe checkout session |
| `stripe-webhook` | No (Stripe sig) | No | Handle Stripe subscription events |

## Deployment
```bash
npx supabase functions deploy <name> --no-verify-jwt
# Functions not yet deployed: generate-meal-plan, nlp-action, create-checkout, stripe-webhook
```

## Environment Variables
- `ANTHROPIC_API_KEY` — Claude API key (AI functions)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Stripe (not yet configured)
- `STRIPE_PRICE_AI_INDIVIDUAL` / `STRIPE_PRICE_AI_FAMILY` — Stripe price IDs

# Edge Function Inventory

## scrape-recipe
- **Path**: `supabase/functions/scrape-recipe/index.ts`
- **Auth**: None (public, `--no-verify-jwt`)
- **AI**: Claude Haiku 4.5, max 4096 tokens
- **Input**: `{ url?: string, image_base64?: string }`
- **Output**: `{ title, description, instructions, ingredients[], prep_time_min, cook_time_min, servings, source_url, image_url?, _ai_usage }`
- **Notes**: URL mode fetches HTML (truncated to 30K chars). Image mode detects JPEG/PNG from base64 prefix. No auth = anyone can call it.
- **Deployed**: Yes

## generate-meal-plan
- **Path**: `supabase/functions/generate-meal-plan/index.ts`
- **Auth**: Bearer token → `supabase.auth.getUser()`
- **AI**: Claude Haiku 4.5, max 2000 tokens
- **Input**: `{ circleId, dates: string[], preferences?: string }`
- **Output**: `{ plan: [{ date, meal_type, recipe_title, recipe_id }], _ai_usage }`
- **Notes**: Fetches user's top 50 recipes for context. Filters out supply kits (`.is('type', null)`). Plans breakfast/lunch/dinner per date.
- **Deployed**: No

## nlp-action
- **Path**: `supabase/functions/nlp-action/index.ts`
- **Auth**: Bearer token → `supabase.auth.getUser()`
- **AI**: Claude Haiku 4.5, max 500 tokens
- **Input**: `{ text, circleId? }`
- **Output**: `{ action, params, confirmation, executed?, _ai_usage }`
- **Actions**: `add_to_list` | `add_activity` | `add_chore` | `search_recipe` | `unknown`
- **Notes**: For `add_to_list`, auto-executes by finding the most recent active list and inserting items. Sets `executed: true` when it acts.
- **Deployed**: No

## create-checkout
- **Path**: `supabase/functions/create-checkout/index.ts`
- **Auth**: Bearer token → `supabase.auth.getUser()`
- **AI**: None
- **Input**: `{ plan: 'ai_individual' | 'ai_family' }`
- **Output**: `{ url: string }` (Stripe checkout URL)
- **Notes**: Gets/creates Stripe customer by email. Creates subscription checkout session. Returns 501 if `STRIPE_SECRET_KEY` not set (mock mode).
- **Deployed**: No
- **Env vars needed**: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_AI_INDIVIDUAL`, `STRIPE_PRICE_AI_FAMILY`

## stripe-webhook
- **Path**: `supabase/functions/stripe-webhook/index.ts`
- **Auth**: Stripe signature verification (not Supabase auth)
- **AI**: None
- **Input**: Stripe webhook event (raw body)
- **Handles**:
  - `checkout.session.completed` → upsert subscription (active, 1-month period)
  - `customer.subscription.updated` → update status + period dates
  - `customer.subscription.deleted` → mark cancelled
- **Deployed**: No
- **Env vars needed**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

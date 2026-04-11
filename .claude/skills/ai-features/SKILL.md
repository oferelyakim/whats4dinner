---
name: ai-features
description: "AI gating, usage tracking, and subscription tier logic for OurTable. Use when working on: 'AI', 'subscription', 'upgrade', 'usage', 'gating', 'AIUpgradeModal', 'useAIAccess', 'UsageMeter', 'logAIUsage', 'meal plan AI', 'recipe import', 'NLP', 'Stripe', 'canUseAI'."
---

# AI Features — Gating, Usage Tracking, Subscriptions

AI features are pay-gated (subscription) and cost-capped ($4.00/mo). All core app features remain free.

## Subscription Tiers

Defined in `src/lib/subscription.ts`:

| Plan | Price | AI Access |
|------|-------|-----------|
| `free` | $0 | None |
| `ai_individual` | $4.99/mo | Yes, 1 user |
| `ai_family` | $6.99/mo | Yes, up to 5 members (currently checks only subscribing user) |

Usage caps: **$4.00/mo hard cap** (blocks AI), **$3.00/mo warning** (orange banner).

## AI-Gated Features

| Feature | Page | Action Type |
|---------|------|-------------|
| Recipe import from URL | `RecipeImportPage` | `recipe_import_url` |
| Recipe import from photo | `RecipeImportPage` | `recipe_import_photo` |
| AI meal plan generation | `PlanPage` | `meal_plan` |
| NLP quick actions | `HomePage` | `nlp_action` |

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useAIAccess.ts` | Core hook — subscription + usage check |
| `src/services/ai-usage.ts` | DB queries + `logAIUsage()` |
| `src/lib/subscription.ts` | Pricing constants, caps |
| `src/components/ui/UpgradePrompt.tsx` | `AIUpgradeModal` + `UsageMeter` components |
| `src/components/layout/AppShell.tsx` | Global warning banner |
| `supabase/migrations/018_subscriptions_and_ai_usage.sql` | DB schema |

## Architecture

```
useAIAccess hook
  ├── getUserSubscription() → subscriptions table
  ├── getMonthlyUsage() → get_user_monthly_usage() SQL fn
  ├── canUseAI: hasAI && !isLimitReached
  └── checkAIAccess(): returns bool, opens modal if blocked

AI call site pattern:
  1. ai.checkAIAccess() → false = bail + show modal
  2. supabase.functions.invoke(...)
  3. Extract _ai_usage from response
  4. logAIUsage(userId, actionType, ...) → insert into ai_usage table
```

## canUseAI Conditions (all must be true)

1. `subscription.plan !== 'free'`
2. `subscription.status === 'active'`
3. `current_period_end >= now`
4. `usageDollars < $4.00`

## Database Tables

### `subscriptions` — one row per user (UNIQUE on user_id)
`plan`, `status` (active/cancelled/expired), `stripe_subscription_id` (nullable), `current_period_start/end`

### `ai_usage` — one row per AI call
`action_type`, `api_cost_usd`, `model_used`, `tokens_in/out`, `period_start`
Indexed on `(user_id, period_start)`.

### `get_user_monthly_usage(p_user_id)` — SQL function
Returns `{ total_cost, usage_count }` for current billing period.

## Usage Pattern in Pages

```tsx
const ai = useAIAccess()

function handleAIAction() {
  if (!ai.checkAIAccess()) return  // guard + modal
  doTheMutation()
}

<AIUpgradeModal open={ai.showUpgradeModal} onOpenChange={ai.setShowUpgradeModal} isLimitReached={ai.isLimitReached} />
```

## Adding a New AI Feature

1. Add action type to `AIActionType` in `src/types/index.ts`
2. Call `ai.checkAIAccess()` before invoking Edge Function
3. Extract `_ai_usage` from response
4. Call `logAIUsage(...)` — fire and forget
5. Render `<AIUpgradeModal>` with hook state

## Stripe Status

Edge Functions exist but secrets not configured. `activateSubscription()` falls back to mock DB upsert.

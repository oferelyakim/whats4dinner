# AI Usage Tracking — End-to-End

## Flow

```
Edge Function response
  → includes _ai_usage: { model, tokens_in, tokens_out, cost_usd }

Frontend destructures _ai_usage from response
  → logAIUsage(userId, actionType, model, tokensIn, tokensOut, costUsd)
    → INSERT into ai_usage table (with period_start from subscriptions)

get_user_monthly_usage() SQL fn
  → SUM(api_cost_usd) WHERE period_start = current billing period

useAIAccess hook reads totalCost via TanStack Query
  → updates isWarning / isLimitReached / usagePercent

UsageMeter renders progress bar
AppShell renders warning banner if thresholds exceeded
```

## Where Logging Happens

| Feature | File | Pattern |
|---------|------|---------|
| NLP quick actions | `src/pages/HomePage.tsx` | Inline after invoke |
| AI meal plan | `src/pages/PlanPage.tsx` | Inline after invoke |
| Recipe from URL/photo | `src/services/recipeImport.ts` | `logUsageFromResponse()` helper |

## `logAIUsage()` — `src/services/ai-usage.ts`

Reads user's `current_period_start` from `subscriptions` to set `period_start` on usage row.

## UsageMeter — `src/components/ui/UpgradePrompt.tsx`

Bar color: green (normal) → orange (>= $3.00) → red (>= $4.00).

## TanStack Query Keys

- `['subscription', userId]` — subscription row
- `['ai-usage', userId]` — monthly usage rollup (only fires when `hasAI` is true)

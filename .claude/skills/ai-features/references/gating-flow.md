# AI Gating Flow

## Decision Chain

```
user triggers AI action
        │
        ▼
ai.checkAIAccess()          ← from useAIAccess hook
        │
        ├─ canUseAI === true  → proceed with action
        │
        └─ canUseAI === false
                │
                ├─ setShowUpgradeModal(true)
                └─ returns false (caller bails out)
                        │
                        ▼
                AIUpgradeModal opens
                        │
                        ├─ isLimitReached=true  → "Limit reached" sheet
                        └─ isLimitReached=false → Plan selection
                                                    │
                                                    ├─ Stripe live → redirect to checkout URL
                                                    └─ Mock mode → upsert subscriptions table
```

## Warning Banner (AppShell)

`AppShell` calls `useAIAccess()` at shell level:
- `isWarning` (>= $3.00): orange dismissible banner
- `isLimitReached` (>= $4.00): red dismissible banner

Session-dismissed only (local `useState`), not persisted.

## Pages Using This Pattern

`RecipeImportPage`, `PlanPage`, `HomePage`, `RecipesPage` (SpeedDial), `MorePage` (subscription management).

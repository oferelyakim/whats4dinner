# Replanish — Deploy Runbook

**Last verified: v3.0.0, 2026-05-02.** Update this file every time the deploy process changes.

**Pre-flight gate (read before pushing to master):** Run `npx tsc -b` (not just `npx tsc --noEmit`). Vercel's build is `rm -rf node_modules/.tmp dist && tsc -b && vite build`, which is stricter than `--noEmit` — it picks up unused imports, unused parameters, wrong-enum assignments. `--noEmit` is fine while editing; `tsc -b` is the deploy gate.

---

## v3.0.0 — Bank-Driven Weekly Drop + Per-Meal AI

This release retires per-user AI weekly plans in favor of a **shared cron-generated weekly drop** + **manual planning** + **four per-meal AI hooks**. See `docs/v3/PRODUCT.md` for the full product story and `docs/v3/RELEASE-NOTES-v3.0.md` for the changelog.

### What's new in this release

- **Migrations 035–038:**
  - `035_weekly_menu.sql` — `weekly_menu` + `weekly_menu_drops` tables + `get_current_weekly_drop()` / `get_weekly_drop_for_week()` / `iso_monday()` RPCs.
  - `036_pantry_match.sql` — `match_recipes_by_ingredients` RPC for the pantry-reroll AI hook.
  - `037_drop_meal_plan_jobs.sql` — drops the retired async job tables (`meal_plan_jobs`, `meal_plan_job_slots`).
  - `038_pg_cron_weekly_drop.sql` — schedules `weekly-drop-generator` every Sunday at 10:00 UTC (06:00 EDT / 05:00 EST).
- **NEW edge function:** `weekly-drop-generator` — picks 126 cards/week from `recipe_bank` (10 dinner + 5 lunch + 3 breakfast per day × 7).
- **RETIRED edge functions:** `meal-plan-worker`, `plan-event`, `generate-meal-plan` (deleted from `supabase/functions/`).
- **RETIRED meal-engine ops:** `propose-plan`, `parse-intake`, `day-plan`. Remaining ops: `dish`, `find-recipe`, `extract`, `compose-fallback`, `sample-from-bank`, `fetch-recipe-url`.
- **NEW client service:** `src/services/recipe-bank.ts` (`getCurrentWeeklyDrop`, `searchBank`, `matchByPantry`).
- **NEW engine method:** `MealPlanEngine.addFromBank(slotId, recipeBankId)` — used by the upcoming "Add from this week's drop" UX.

### Deploy steps (in this order)

```bash
# 1. Apply migrations 035–038 (run from MAIN repo path, not a worktree).
npx supabase db query --linked -f supabase/migrations/035_weekly_menu.sql
npx supabase db query --linked -f supabase/migrations/036_pantry_match.sql
npx supabase db query --linked -f supabase/migrations/037_drop_meal_plan_jobs.sql
npx supabase db query --linked -f supabase/migrations/038_pg_cron_weekly_drop.sql

# 2. Verify pg_cron schedule is registered.
npx supabase db query --linked "SELECT jobname, schedule, active FROM cron.job WHERE jobname IN ('weekly-drop-generator', 'recipe-bank-refresher')"
# Expected: both rows present, active=t.

# 3. Deploy edge functions (mandatory after function code changes).
npm run deploy:functions
# v3.0 ships: meal-engine, ai-chat, recipe-bank-refresher, event-engine,
#             auditor-from-imports, weekly-drop-generator (NEW).

# 4. Verify ?ping=1 returns 3.0.0 on the new function.
curl 'https://<project>.functions.supabase.co/weekly-drop-generator?ping=1'
curl 'https://<project>.functions.supabase.co/meal-engine?ping=1'

# 5. Push frontend (Vercel auto-deploys from master).
git push origin master

# 6. Verify the bank has enough coverage BEFORE the first weekly drop runs.
npx supabase db query --linked "SELECT count(*) FROM recipe_bank WHERE retired_at IS NULL"
# Target: ≥400 rows.

npx supabase db query --linked "SELECT * FROM recipe_bank_coverage ORDER BY row_count ASC LIMIT 10"
# Every (diet × meal_type × slot_role) cell should have ≥10 rows.

# 7. (Optional) Manually trigger the first drop to verify generation.
curl -X POST 'https://<project>.functions.supabase.co/weekly-drop-generator' \
  -H 'content-type: application/json' -d '{}'
# Expected response: { "ok": true, "week_start": "YYYY-MM-DD", "total_recipes": 126, "diet_coverage": {...} }
```

### Bank coverage — getting to 400

If `recipe_bank_coverage` shows gaps, run the seed script (one-time, ~$5 in Anthropic Haiku spend):

```bash
# Pre-flight: verify Anthropic credit balance > $10.
# Then seed up to the gap.
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
ANTHROPIC_API_KEY=... \
  node scripts/seed-recipe-bank-urls.mjs --target=10 --limit=250
```

After v3.0 ships, the `recipe-bank-refresher` cron (every 6h, see migration 032) keeps the corpus topped up automatically. The `auditor-from-imports` flow promotes user URL imports to the shared bank.

### Database webhook (one-time, already configured for v2.0.0)

Source: `public.recipes` · Event: `INSERT` · Filter: `source_url IS NOT NULL` · Target: `auditor-from-imports`. If this isn't already set up, see the v2.0.0 entry below.

---

## Standard runbook (every release)

### 1. Type-check
```bash
npx tsc -b
```
**Vercel runs this — must be clean before push.**

### 2. Run vitest + production build
```bash
npx vitest run
npm run build
```

### 3. Bump version
- `src/lib/version.ts` — `APP_VERSION = 'X.Y.Z'`
- `package.json` — `"version": "X.Y.Z"`
- `supabase/functions/<changed>/index.ts` — `APP_VERSION` constant matches

### 4. Deploy edge functions (only if any function changed)
```bash
npm run deploy:functions
```
**Run from the MAIN repo path, NOT a worktree** — the supabase CLI resolves project linkage from the working directory.

### 5. Apply migrations (only if any new migration)
```bash
npx supabase db query --linked -f supabase/migrations/<NNN>_<name>.sql
```

### 6. Push to master (triggers Vercel)
```bash
git push origin master
```

### 7. Verify deploy
- Frontend: visit `https://app.replanish.app`, check the version in the AI chat welcome.
- Edge functions: `curl '<project>.functions.supabase.co/<fn>?ping=1'` — version must match `APP_VERSION`.
- The `edgeVersionProbe.ts` client probe will surface mismatches in DevTools console.

### Vercel deployment behavior
- Pushing to `master` = production deploy.
- Pushing to any other branch = Preview deploy only.
- "Promote to Production" in the Vercel UI works for any deploy on master.

---

## Edge functions in v3.0

| Function | Purpose | Trigger |
|---|---|---|
| `meal-engine` | Slot pipeline (Stage A/B/C/D), pantry/swap AI, recipe URL hydration | Client-invoked |
| `ai-chat` | Chat assistant (paid tier) + scope-limited free fallback | Client-invoked |
| `event-engine` | v1.20.0 dynamic event-planner questionnaire | Client-invoked |
| `recipe-bank-refresher` | Cron — tops up under-covered bank cells (every 6h) | pg_cron |
| `weekly-drop-generator` | Cron — picks 126 cards/week for the shared drop | pg_cron (Sundays 10:00 UTC) |
| `auditor-from-imports` | Promotes user URL imports to the shared bank | Supabase database webhook |
| `nlp-action` | Quick-action input on home page | Client-invoked |
| `scrape-recipe`, `get-recipe` | Recipe URL extraction (legacy chat path) | Client-invoked |
| `create-checkout`, `stripe-webhook` | Stripe billing | Client + webhook |
| `kroger-*` | Kroger affiliate integration (flagged) | Client-invoked |

---

## Retired in v3.0 (deleted from `supabase/functions/`)

| Function | What it did | Replacement |
|---|---|---|
| `meal-plan-worker` | Async per-user weekly plan generation | Retired — weekly drop replaces |
| `plan-event` | v1.15.6 single-shot event AI | Retired — superseded by `event-engine` (v1.20.0) |
| `generate-meal-plan` | v1.x chat-driven plan flow | Retired — chat redirects to `/plan-v2` |

---

## Common issues

### "edge function returned non-2xx"
Run `curl '<project>.functions.supabase.co/<fn>?ping=1'`. Compare the `version` field to `src/lib/version.ts`. If they differ, the function wasn't redeployed — run `npm run deploy:functions`.

### Vercel build fails on `tsc -b` but `tsc --noEmit` was clean
You hit `noUnusedLocals` / `noUnusedParameters`. Use `npx tsc -b` locally before pushing.

### Migration silently no-ops
Verify the migration file is in `supabase/migrations/` and named `NNN_name.sql`. The `db query --linked -f <path>` command runs the file directly — it does not consult the migration history table.

### Cron job didn't fire
```sql
SELECT jobname, schedule, active, last_run FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY end_time DESC LIMIT 10;
```
Check `pg_cron` is enabled (`CREATE EXTENSION pg_cron`). The migration files do this idempotently.

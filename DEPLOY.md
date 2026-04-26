# Replanish — Deploy Runbook

**Last verified: v2.2.0, 2026-04-26.** Update this file every time the deploy process changes.

**Pre-flight gate (read this before pushing to master):** Run `npx tsc -b` (not just `npx tsc --noEmit`). Vercel's build is `rm -rf node_modules/.tmp dist && tsc -b && vite build`, which is stricter than `--noEmit` — it picks up unused imports, unused parameters, wrong-enum assignments. v2.0.0 → v2.0.2 burned three deploys because of this exact gap. `--noEmit` is fine while editing; `tsc -b` is the deploy gate.

## v2.0.0 — Bank link-first + Interactive Interview + Auditor (NEW)

This release ships the bank-first / link-first / interview-driven meal planner. Read this section before shipping v2.0.0 — it has steps that the standard runbook below doesn't cover (database webhook configuration, mig 034, new edge fn, new env var).

**New surface:**
- Migration 034 — `recipe_bank` link-first columns + new RPCs (`under_covered_cells`, `retire_stale_recipes`) + `recipe_bank_audit_log` table.
- New edge fn `auditor-from-imports` — promotes user URL imports to the bank.
- Updated `recipe-bank-refresher` — new `BANK_MODE` env (default `link-first`).
- Updated `meal-engine` — three new ops (`parse-intake`, `propose-plan`, `fetch-recipe-url`).
- Frontend `MealPlannerBanner` + `MealPlannerInterview` on `/plan-v2`.

**Deploy steps (in this order):**

```bash
# 1. Apply migration 034 (run from MAIN repo path, not a worktree).
npx supabase db query --linked -f supabase/migrations/034_recipe_bank_link_first.sql

# 2. ONE-TIME database webhook (Supabase dashboard → Database → Webhooks):
#    Source table: public.recipes  |  Event: INSERT
#    HTTP target: https://<project>.functions.supabase.co/auditor-from-imports
#    Filter: source_url IS NOT NULL
#    Headers: Authorization: Bearer <SERVICE_ROLE_KEY>

# 3. Deploy edge functions (mandatory after function code changes).
npm run deploy:functions
# now covers: meal-engine, plan-event, ai-chat, meal-plan-worker,
#             recipe-bank-refresher, auditor-from-imports (new)

# 4. Verify ?ping=1 returns 2.0.0:
curl 'https://<project>.functions.supabase.co/meal-engine?ping=1'
curl 'https://<project>.functions.supabase.co/auditor-from-imports?ping=1'

# 5. Push frontend (Vercel auto-deploys).
git push origin master

# 6. Backfill the bank with link-first rows (one-time).
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
  node scripts/seed-recipe-bank-urls.mjs --target=30 --limit=20

# 7. Smoke the auditor end-to-end.
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/smoke-auditor.mjs
```

**Post-deploy browser smoke (mandatory):**

1. Open `app.replanish.app/plan-v2` as a paid user → AI banner visible.
2. Click banner → interview opens. In q_freeform type "dinner only, 3 dishes — kids hate fish".
3. Confirm `q_dietary` / `q_dislikes` get skipped (parse-intake worked).
4. Approve → some slots show "From <domain> — tap to open" (`link_ready` state).
5. Tap one → recipe loads + caches.
6. As free user → banner shows disabled state with "Upgrade to plan with AI →" CTA.
7. Quick fill button (replaces old "Generate plan") works for both tiers.

**Rollback:** mig 034 is column-additive (never drops). Set `BANK_MODE=composed-legacy` on `recipe-bank-refresher` env to revert generation. The `composed_payload` archive means no data loss even on full revert. Roll the frontend tag in Vercel to revert UI without touching the DB.

---

This file is the single source of truth for deploying Replanish. The two deploy targets (Vercel for frontend, Supabase for edge functions + migrations) each have a different command and a different "is it actually live?" check. Skipping or confusing them is the most common cause of "I deployed but the change isn't there."

## Pre-flight (every deploy)

Run these from the worktree you're shipping (project root, `package.json` next to you):

```bash
npx tsc --noEmit            # 0 errors — frontend type-check
npx vitest run              # all tests pass — engine invariants
```

If either fails, **don't deploy**. Investigate first.

Then bump the version. Two files MUST stay in sync — bump both:

```
src/lib/version.ts   →  export const APP_VERSION = 'X.Y.Z'
package.json         →  "version": "X.Y.Z"
```

Versioning convention:

- **Patch (1.15.5 → 1.15.6)** — bug fix, small UX, prompt tweak, doc-only release.
- **Minor (1.15.6 → 1.16.0)** — new feature, new edge function, new migration.
- **Major (1.x → 2.0.0)** — architecture change, breaking schema, full reskin.

Bump on **every** production push. The version is shown in the chat welcome screen + Profile footer ("Replanish v{APP_VERSION}") so the user can confirm which build they're testing.

## 1. Frontend (Vercel) — `git push origin master`

Vercel auto-deploys from GitHub `master`. Pushing to master IS the deploy.

```bash
git add <specific files>                      # never -A; avoid .env / settings.local.json
git commit -m "feat|fix|chore(scope): vX.Y.Z — message"
git push origin master                        # ← Vercel deploy fires here
```

If you're working on a Claude worktree branch (`claude/<name>`), push the branch HEAD to master directly:

```bash
git push origin HEAD:master                   # fast-forward push from any branch
```

This works only if your branch was based on the current origin/master HEAD (no divergence). If the push is rejected as non-fast-forward, you have unmerged work elsewhere — `git fetch origin && git rebase origin/master` first, never `--force`.

**Verify:**

- Open the production URL: https://app.replanish.app (and https://replanish.app for the marketing site).
- Open the in-app chat or the Profile footer — confirm it shows `v{APP_VERSION}` matching what you just bumped.
- Vercel dashboard: https://vercel.com/oferelyakim (deploy is "Ready" within ~90s).

## 2. Edge Functions (Supabase) — `npx supabase functions deploy`

**Vercel does NOT deploy edge functions.** Supabase edge functions live on Supabase's runtime and only ship via the Supabase CLI. If you change anything in `supabase/functions/<name>/`, you MUST redeploy that function or the change won't be live for users.

Run from the **main repo path** (NOT a Claude worktree — only the main checkout has the linked Supabase project):

```bash
cd C:/Users/OferElyakim/oferProjects/Replanish_App
npx supabase functions deploy <function-name> --no-verify-jwt
```

The `--no-verify-jwt` flag tells the CLI not to require a fresh JWT — the functions handle auth internally via the request `Authorization` header.

**The 14 edge functions:**

| Function | Purpose | Redeploy when |
|---|---|---|
| `ai-chat` | In-app chat assistant (Claude Haiku) | Prompt changes, tool changes, scope rules |
| `meal-engine` | Slot-based `/plan-v2` engine (Stages A/B/C/D) | Variety taxonomy, prompts, retry policy |
| `plan-event` | AI Event Planner (legacy single-shot, v1.15.6 → v1.19.0; deprecated in v1.20.0, deletable in v1.21.0) | Tool schema, prompts (e.g. activities) |
| `event-engine` | Event Planner v2 dynamic questionnaire (v1.20.0+) — 3 ops: intake / propose / revise | Question tree, prompts, edge ops |
| `generate-meal-plan` | Legacy chat-driven plan flow (dead post-v1.15.5) | Don't — being retired |
| `scrape-recipe` | Recipe URL import | HTML preprocessing, JSON-LD parsing |
| `get-recipe` | Recipe URL fetcher used by /plan-v2 Stage C | URL discovery / extraction logic |
| `nlp-action` | Home quick-action input | Prompt changes |
| `create-checkout` | Stripe checkout session | Pricing, billing periods, trial config |
| `stripe-webhook` | Stripe webhook receiver | Webhook signature, plan mapping |
| `kroger-oauth-start`, `kroger-oauth-callback` | Kroger grocer OAuth | Kroger API changes |
| `kroger-search`, `kroger-stores`, `kroger-add-to-cart` | Kroger product flow | Kroger API changes |

You can deploy multiple in one command:

```bash
npx supabase functions deploy ai-chat plan-event meal-engine --no-verify-jwt
```

**v1.16.0+ shortcut:** `npm run deploy:functions` ships `meal-engine`, `plan-event`, and `ai-chat` together. Use this whenever you change any of those three. From the **main repo path** (the worktree script invocation just shells out):

```bash
cd C:/Users/OferElyakim/oferProjects/Replanish_App
npm run deploy:functions
```

**v1.16.0+ version probe:** both `meal-engine` and `plan-event` now expose `GET ?ping=1` returning `{ fn, version, model, deployedAt }`. The client calls these on every app boot and surfaces a console warning + localStorage flag if the deployed version doesn't match the bundled `APP_VERSION`. If a user reports an AI feature failing right after a deploy, ask them to open DevTools console — `[edgeVersionProbe] mismatch detected: …` is the unambiguous signal that step 2 was skipped.

**v1.17.0+ migration application:** `npx supabase db push` will fail when local migrations include duplicate-version files (two `019_*.sql` exist). The reliable workaround that worked for migration 030 is `npx supabase db query --linked -f supabase/migrations/030_recipe_bank.sql` — runs the SQL directly via the Management API, bypasses the schema_migrations conflict. Use `npx supabase migration repair --status applied <version>` first if you want `db push` to track the row going forward.

**v1.18.0+ async job queue:** migration 031 must be applied before deploying `meal-plan-worker`. Use `npx supabase db query --linked -f supabase/migrations/031_meal_plan_jobs.sql`. The migration adds `meal_plan_jobs` + `meal_plan_job_slots` + the `claim_next_meal_plan_job()` RPC + adds both tables to the `supabase_realtime` publication (for postgres_changes subscriptions). The `npm run deploy:functions` script now includes `meal-plan-worker` and `recipe-bank-refresher` (5 functions total as of v1.19.0: meal-engine, plan-event, ai-chat, meal-plan-worker, recipe-bank-refresher). The worker is invoked immediately after job-create via `triggerWorker()` from client.

**v1.19.0+ recipe-bank cron:** migration 032 (`supabase/migrations/032_pg_cron_recipe_bank_refresher.sql`) registers a `pg_cron` job named `recipe-bank-refresher` running `0 */6 * * *` that POSTs to the `recipe-bank-refresher` edge function. Apply via `npx supabase db query --linked -f supabase/migrations/032_pg_cron_recipe_bank_refresher.sql`. Idempotent — safe to re-run. Verify after with `npx supabase db query --linked "SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'recipe-bank-refresher';"` — should return `active: true`.

**v1.20.0+ event-engine + planner v2:** migration 033 (`supabase/migrations/033_event_planner_v2.sql`) adds `events.archetype text` + `events.questionnaire jsonb default '{}'` + `events.draft_plan jsonb` columns + the `event_activity_catalog` table seeded with 31 vendor / activity rows + the `match_event_activities()` RPC that powers the engine's deterministic catalog-fallback path. Apply via `npx supabase db query --linked -f supabase/migrations/033_event_planner_v2.sql`. Idempotent (`ADD COLUMN IF NOT EXISTS` + `ON CONFLICT (slug) DO UPDATE`). The `npm run deploy:functions` script now includes `event-engine` (6 functions total as of v1.20.0: meal-engine, plan-event, ai-chat, meal-plan-worker, recipe-bank-refresher, event-engine). Verify edge fn after deploy: `curl -s "https://zgebzhvbszhqvaryfiwk.supabase.co/functions/v1/event-engine?ping=1"` should return `{"fn":"event-engine","version":"1.20.0",...}`. The legacy `plan-event` edge fn is kept one release as a fallback; safe to delete in v1.21.0 cleanup.

**v1.17.0+ recipe-bank seeding:** two paths after migration 030 is applied.
- Quick (no key needed): `npx supabase db query --linked -f supabase/seeds/recipe_bank_starter.sql` — inserts 12 hand-crafted starters covering common dinner mains + a few breakfasts/lunches.
- Full coverage (~50 recipes, ~$0.50 in Anthropic spend): from main repo path, `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ANTHROPIC_API_KEY=… node scripts/seed-recipe-bank.mjs`. The Anthropic key is NOT in repo `.env` — pull it from https://console.anthropic.com or the Supabase Edge Function secrets dashboard.

**Verify the function is live:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://zgebzhvbszhqvaryfiwk.supabase.co/functions/v1/<function-name>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

- **`401`** = function deployed and authenticating (expected — your curl has no token).
- **`404`** = function not deployed.
- **`501`** = function up but a required secret (e.g. `ANTHROPIC_API_KEY`) is missing.
- **`500`** = function deployed but threw — check the dashboard logs.

Dashboard: https://supabase.com/dashboard/project/zgebzhvbszhqvaryfiwk/functions

**Common pitfall: "Cannot find project ref. Have you run supabase link?"** — the worktree you're in isn't linked. Run from `C:/Users/OferElyakim/oferProjects/Replanish_App` (the main repo path), not from `.claude/worktrees/<name>/`.

## 3. Database Migrations (Supabase) — manual paste

Migrations live in `supabase/migrations/NNN_description.sql`. They are **NOT auto-applied** by `supabase db push` in this project's current setup — they get pasted manually into the SQL Editor.

Process:

1. Open https://supabase.com/dashboard/project/zgebzhvbszhqvaryfiwk/sql/new
2. Paste the migration contents.
3. Run it.
4. Confirm success in the result panel.

**Migrations must be idempotent.** If a migration adds a column, use `ADD COLUMN IF NOT EXISTS`. If it creates a function, use `CREATE OR REPLACE FUNCTION`. If a migration ever needs to be re-run after a partial failure, idempotency is what saves you.

Current migration state: master is at **032_pg_cron_recipe_bank_refresher.sql** (applied 2026-04-26). Migration 033 (`033_event_planner_v2.sql`) is on branch `claude/festive-poitras-ab2661` for the v1.20.0 Event Planner v2 — pending merge + apply.

## 4. Worktree etiquette

The repo uses git worktrees heavily — each Claude session gets a `.claude/worktrees/<name>/` checkout. **The `master` branch is checked out at the main repo path** (`C:/Users/OferElyakim/oferProjects/Replanish_App`). Worktrees track their own `claude/<name>` branch.

When you finish a session's work:

1. Push the branch HEAD to origin/master (fast-forward) — see § 1.
2. In the main repo path: `git pull --ff-only origin master` to sync local master.
3. Other worktrees stay on their own branches; they auto-see the new origin/master via `git fetch`.
4. Worktrees with abandoned work should be flagged in CLAUDE.md ("Lost branches") and either committed-and-pushed or removed via `git worktree remove`.

`.claude/settings.local.json` is per-machine and **must never be committed**. If git status shows it as untracked in a worktree, ignore it.

## 5. Common scenarios

### "My edge function change isn't taking effect"

You forgot step 2. The Vercel push only ships frontend code. Edge functions need their own `supabase functions deploy`.

### "I see version 1.15.5 but I just shipped 1.15.6"

Hard-refresh the browser (Ctrl+Shift+R). Vercel may serve a cached `index.html` for ~30s after deploy. The PWA service worker can also cache an older bundle — the user can resolve via DevTools → Application → Service Workers → Unregister.

### "I added a new edge function — how do I add it to the deploy?"

`npx supabase functions deploy <new-name> --no-verify-jwt` (from the linked main repo path) once. After that any time you edit it, redeploy with the same command. Add an entry to the function table in § 2.

### "The branch already had unrelated uncommitted work"

Stop. Stage only the files for the current change (`git add <specific files>` — never `-A`). If unrelated work is present, finish it and commit it first OR stash it. Mixing concerns in one commit makes the deploy harder to revert if something breaks.

### "Pre-commit hook failed mid-commit"

The commit didn't happen. Fix the issue, re-stage, **make a NEW commit** (never `--amend` after a hook failure — `--amend` modifies the previous commit and can lose work).

## 6. Where things live

- **GitHub repo**: https://github.com/oferelyakim/whats4dinner
- **App**: https://app.replanish.app
- **Marketing site**: https://replanish.app
- **Vercel dashboard**: https://vercel.com/oferelyakim
- **Supabase dashboard**: https://supabase.com/dashboard/project/zgebzhvbszhqvaryfiwk
- **Edge function logs**: https://supabase.com/dashboard/project/zgebzhvbszhqvaryfiwk/functions

## 7. Quick reference (copy-paste)

```bash
# Pre-flight
npx tsc --noEmit && npx vitest run

# Frontend deploy (from any worktree on a branch based on origin/master)
git add <files>
git commit -m "..."
git push origin HEAD:master

# Edge function deploy (from main repo path only)
cd C:/Users/OferElyakim/oferProjects/Replanish_App
npx supabase functions deploy <name> --no-verify-jwt

# Sync local master
git pull --ff-only origin master

# Function smoke test
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://zgebzhvbszhqvaryfiwk.supabase.co/functions/v1/<name>" \
  -H "Content-Type: application/json" -d '{}'
```

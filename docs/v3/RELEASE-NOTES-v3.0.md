# Replanish 3.0 — Release Notes

**Release date:** *(to be set on deploy)*
**Codename:** Bank-Driven Drop

This is the biggest release in Replanish's history. v3.0 rethinks how meal planning works in the app, makes the core experience free and predictable, and repositions Replanish AI for the moments where it actually adds value.

If you're a returning user from v2.x, see the **What changed for v2 users** section at the bottom.

---

## TL;DR

- **NEW: Weekly drop.** Every Sunday at 6 AM ET, 126 curated recipes land in the app — 10 dinners + 5 lunches + 3 breakfasts per day, tagged for every diet. Free for everyone.
- **NEW: Manual planning.** Drag dishes from the drop into your week, mix in your saved recipes, or apply a template. The shopping list builds itself.
- **NEW: AI repositioned.** Replanish AI ($6/mo, $60/yr) now focuses on per-meal swaps, pantry rerolls, unlimited URL imports, and smart shopping consolidation — daily-decision moments, not weekly batch operations.
- **REMOVED: Per-user AI weekly plans.** Replaced by the shared weekly drop (more variety, more reliable, free).
- **400+ recipes** in the bank at launch, growing weekly via cron + user imports.

---

## What's new

### The weekly drop

Every Sunday at 6 AM ET, a fresh menu drops in Replanish:

- **10 dinner options per day**
- **5 lunch options per day**
- **3 breakfast options per day**
- Total: **126 curated recipes per week**
- Tagged across **9 diets**: omnivore, vegetarian, vegan, gluten-free, dairy-free, kosher, halal, low-carb, Mediterranean.

The drop is **free for everyone**. No login required to browse. The recipes come from real food blogs and recipe sites — we link to the original page for the full instructions and credit the author.

→ Read more: how it works (`/how-it-works`)
→ Read more: where the recipes come from (`/sources`)

### Manual week planning

Open `/plan-v2` and you'll see this week's drop strip across the top, then 7 day cards below. Tap a day, tap a meal slot, and pick from:

- This week's drop
- Your saved recipes
- A meal template (Taco Tuesday, Pasta Wednesday, etc.)
- "Suggest a meal" — AI swap, paid only

Drag-and-drop works on desktop. Tap-and-pick works on mobile. The shopping list builds in real time as you add meals.

### Quick fill

One tap to populate your whole week from this week's drop. Uses a deterministic round-robin to balance diets and avoid repetition. Great for "I just want dinners on the calendar without thinking about it."

### Replanish AI — repositioned

Four hooks, all designed for daily-decision moments:

| Feature | What it does |
|---|---|
| **Per-meal swap & personalize** | "Make this dinner vegan", "swap chicken for tofu", "lower carbs" — rewrites just the slot you tapped. |
| **Pantry / leftover reroll** | "I have chicken and broccoli" → 3 dishes from the bank that match. |
| **Unlimited recipe URL imports** | Free tier is capped at 10/month. AI users have no cap. |
| **Smart shopping consolidation** | Dedupes ingredients across the week's recipes; adds the result to an existing shopping list or creates a new one. |

**Pricing unchanged:** $6/month or $60/year (14-day trial on annual). 4 seats included on annual — share with your household.

---

## What changed for v2 users

If you've been using Replanish through v2.x, here's what's different:

### The "Generate plan" button is gone
The per-user weekly AI plan caused four straight bug-fix releases (v2.3 → v2.6.2). It also wasn't the right product shape — Sunday batch generation isn't where AI helps most. **What replaces it:** the curated weekly drop (which is free) plus per-meal AI swaps (which is paid and lives at the slot level, not the week level).

### The interview / questionnaire flow is gone
The "Tell me about your week" questionnaire was the entry to per-user generation. With the drop, there's nothing to interview about — every diet is already covered. **What replaces it:** Quick fill (one-tap week) for the no-friction case, manual drag-and-drop for the picky case.

### Your saved recipes, plans, and lists are intact
Nothing in your account changes. Old plans stay readable. Old recipes stay in your library. Old shopping lists stay yours.

### The `/plan` URL still works
It redirects to `/plan-v2` (the new planner). Nothing to update.

### The AI event planner is unchanged
The dynamic-questionnaire event planner introduced in v1.20.0 stays. v3.0 only changed the meal planner.

### Your Replanish AI subscription is honored
If you were paying for Replanish AI in v2.x, you keep your subscription. The four new hooks are available immediately.

---

## Behind the scenes

For the developers / contributors / curious:

- **Migration 035** adds the `weekly_menu` table.
- **Migration 036** adds the `match_recipes_by_ingredients` RPC for pantry rerolls.
- **Migration 037** drops the now-unused `meal_plan_jobs` and `meal_plan_job_slots` tables.
- **Migration 038** schedules `weekly-drop-generator` via pg_cron for Sundays at 06:00 ET.
- **New edge function**: `weekly-drop-generator` (cron-invoked, picks ~126 cards/week from the recipe bank, no AI in the loop).
- **Retired edge functions**: `meal-plan-worker`, `plan-event` (legacy), `generate-meal-plan` (legacy).
- **Retired ops in `meal-engine`**: `propose-plan`, `parse-intake`, `day-plan`. The remaining ops (`dish`, `find-recipe`, `extract`, `compose-fallback`, `sample-from-bank`) power the per-meal swap and pantry reroll.
- **Bank coverage at launch**: ≥10 recipes per (meal × role × diet) cell, ~400 distinct rows. Verified via `recipe_bank_coverage` view before the drop generator runs.

---

## What's coming next

| Version | Focus |
|---|---|
| **v3.0.x** | Hotfixes against the new surface, especially the drop generator and the four AI hooks. |
| **v3.1** | **Walmart cart export** — one-tap send the shopping list to a Walmart cart. The first revenue stream from the affiliate channel. |
| **v3.2** | Instacart integration, Amazon Fresh integration. |
| **v3.3+** | Retailer-partnered features: price comparison, deals surfaced in the planner, regional grocery store routing. |

---

## Thanks

Replanish v3.0 is the result of three months of user feedback, four "fixed it" patch releases on the old per-user AI plan, and a hard look at where AI actually earns its $6/month. If you're a v2 user, thanks for sticking with us through the rough edges. If you're new, welcome — we hope the Sunday drop saves you a few hours a week.

If you find a bug or have a suggestion, email *(insert)* or use the in-app feedback button.

— The Replanish team

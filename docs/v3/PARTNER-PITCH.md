# Replanish — Retailer Partner Pitch

**Audience:** Walmart, Instacart, Amazon Fresh, regional grocery chains. BD / partnerships teams.
**Use:** outbound email + supporting deck content. Numbers are the headline; tweak by partner.

---

## The 60-second version

Replanish is a free family meal planner — web + PWA, US-first — built around a curated weekly recipe drop and a shared household shopping list. **Our core revenue model is retailer cart affiliate**, and we want to make {{partner}} the primary cart destination from day one.

Here's why that's a good deal for {{partner}}:

- **Pre-qualified shopping intent.** When a user adds a meal to their week in Replanish, they've already committed to eating it. The shopping list isn't aspirational — it's tonight's dinner.
- **Deduped, structured baskets.** We dedupe across the week's recipes (e.g., 3 dishes that all need onions = 1 onion entry) and ship the basket as a clean structured payload, not a free-text list.
- **High-frequency surface.** Shopping lists get used 2–3× per week per active user. Far more frequent than a once-a-week cookbook search.
- **Free tier scales.** No per-user AI cost on the planner means we can support a large free user base without unit economics breaking.

---

## What Replanish does

### For users
- **Weekly drop**: every Sunday, 126 curated recipes (10 dinners + 5 lunches + 3 breakfasts per day) covering 9 diets.
- **Drag-and-drop planning**: pick what fits the week, the shopping list builds itself.
- **Shared household lists**: real-time sync across the household. Real-time-edited grocery lists are the daily-habit hook.
- **Coordination layer**: events / potlucks, chores, recurring activities. Keeps users in the app between Sunday plan + Wednesday grocery run.

### For partners
- **One-tap cart export** from a structured shopping list to {{partner}}'s cart.
- **Affiliate referral compensation** per the affiliate program terms.
- **Aggregate insights**: weekly trending dishes, weekly basket compositions, regional preferences — all anonymized.

---

## The numbers

> **These numbers should be filled in from production analytics before any partner conversation.** Below is the template; the *italic placeholders* are the data points to pull.

### Bank depth (at v3.0 launch)
- **Total recipes in bank:** *400+*
- **Diets covered:** 9 (omnivore, vegetarian, vegan, gluten-free, dairy-free, kosher, halal, low-carb, Mediterranean)
- **Source domains:** *15–25 reputable food blogs and recipe sites*
- **Bank growth rate:** *X new recipes per week via cron + user imports*

### Drop cadence
- **Drops per year:** 52
- **Recipes per drop:** 126
- **Drop time:** Sunday 06:00 ET (deliberate alignment with US Sunday meal-planning behavior)

### User behavior (target)
- **Active users:** *X*
- **Active circles (households):** *X*
- **Average household size:** *2.X people*
- **Recipes added to plan per active user per week:** *X*
- **Shopping lists generated per week:** *X*
- **Shopping list items per generated list:** *X*
- **Weekly retention (D7):** *X%*
- **Monthly retention (D30):** *X%*

### Replanish AI conversion
- **Free → AI conversion rate:** *X%*
- **AI users planning weekly:** *X%*
- **Average week-over-week active rate among AI users:** *X%*

### Partner-relevant cohort
- **Estimated weekly basket-export volume (at current scale):** *X baskets*
- **Estimated average basket size (in items):** *X items*
- **Geographic concentration:** *top 10 metros, sortable by ZIP if {{partner}} wants region-specific terms*

---

## Why we're a different fit than a recipe site or another meal planner

| | Recipe sites (NYT Cooking, Allrecipes) | General meal planners (Mealime, PlateJoy) | Replanish |
|---|---|---|---|
| **Shopping list as core surface** | Optional add-on | Yes | **Yes — daily habit hook** |
| **Real-time household sync** | No | Partial | **Yes — first-class** |
| **Free tier with full features** | Behind paywall | Limited | **Yes** |
| **Structured basket export** | Free-text | Partial | **Yes — JSON-clean** |
| **Affiliate-ready architecture** | Display-ad model | Subscription | **Affiliate cart is the business model** |
| **Coordination beyond meals** | No | No | **Events, chores, activities** |

The structural difference: Replanish was designed from day one with retailer cart export as the primary revenue stream, not as an afterthought. Every product decision (offline-first lists, real-time sync, deduped baskets, link-first recipes) is in service of that endpoint.

---

## What we're asking for from {{partner}}

### Phase 1 (v3.1, ~6 weeks from v3.0 launch)
- API access for cart-add via affiliate program.
- Sandbox credentials for testing.
- Standard affiliate program terms.

### Phase 2 (v3.2+)
- Co-marketing on the launch ("Send your week to {{partner}} in one tap").
- Product feedback loop on what cart shapes convert best.
- Optional: shared SKU mapping for ingredient → product matching (we'll do the work, but having {{partner}}'s SKU catalog speeds it up).

### What we're NOT asking for
- Up-front payment / minimum guarantees.
- Exclusive partnership (we want to support multiple retailers; users pick).
- Modifications to {{partner}}'s checkout — we send users to {{partner}}'s standard cart.

---

## Roadmap visibility

| Phase | Timeline | What ships |
|---|---|---|
| **v3.0** | *(launch date)* | Curated weekly drop + manual planning + per-meal AI. **Live now.** |
| **v3.1** | +6 weeks | **Walmart cart export.** *(Or {{partner}} if we close first.)* |
| **v3.2** | +12 weeks | Multi-retailer support. User picks default per circle. |
| **v3.3** | +20 weeks | Price comparison surfacing — show {{partner}} prices in the planner. |
| **v3.4+** | +28 weeks | Regional retailer integrations (HEB, Wegmans, Publix, etc.). |

---

## Contact

**Founder / Product:** *(insert name + email)*
**Schedule a call:** *(insert calendar link)*
**Replanish app:** <https://app.replanish.app>
**Marketing site:** <https://replanish.app>
**Roadmap / blog:** <https://replanish.app/blog>

---

## One-pager version (for cold outreach)

Subject: **Replanish — affiliate cart partnership for US household meal planning**

Hi {{first name}},

I'm {{your name}}, founder of Replanish — a free family meal planner with a weekly recipe drop, shared household shopping lists, and a US-first user base.

**Our core revenue model is retailer cart affiliate.** Users plan a week, the shopping list builds automatically, and we want to make {{partner}} the one-tap cart destination from the moment that list is ready.

We're shipping our first cart integration in ~6 weeks (v3.1) and we're talking to a small set of retailers. {{Reason this partner is a fit}}.

Quick numbers:
- *X* active US households on the platform.
- *X* shopping lists generated per week.
- Average basket: *X items, deduped across the week's recipes.*
- Bank: 400+ recipes covering every major diet, growing weekly.

We're asking for affiliate API access and standard program terms. We're not asking for {{partner}} to do any custom work.

Open to a 20-minute call this week or next?

— {{your name}}
{{your email}} · {{your phone}} · <https://replanish.app>

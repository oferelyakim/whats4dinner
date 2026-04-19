# Replanish — Campaign Hub
**Last Updated:** April 2026 | **Status:** Ready to Execute (organic channels)

---

## Campaign Index

| # | Campaign | File | Priority | Timing | Stripe Needed? | Effort |
|---|---|---|---|---|---|---|
| 01 | **Potluck, Solved** | `01-potluck-solved.md` | HIGHEST | Start now — evergreen | No | Low-Medium |
| 02 | **The Cozi Alternative** | `02-cozi-alternative.md` | URGENT | Start now — window closing | No | Low |
| 03 | **אנחנו מתכננים (Israel First)** | `03-israel-first.md` | HIGH | Start now, build 8 weeks | No | Medium |

---

## Pre-Campaign Dependencies

Before spending a single dollar on paid promotion, resolve these in order:

### 1. CRITICAL — Fix the domain (Week 1)
**Problem:** The app lives at `whats4dinner-gamma.vercel.app`. This URL:
- Cannot be in a press pitch (kills credibility immediately)
- Cannot be in a TikTok caption (looks unfinished)
- Cannot be the link you share with influencers

**Fix:** Set up `replanish.app` as the production domain on Vercel. Until this is done, all CTAs in campaigns use `replanish.app` as the target — make sure it works.

---

### 2. CRITICAL — Fix Stripe before any paid promotion (Week 2–4)
**Problem:** The "Upgrade to AI" flow is mock-only. Stripe secrets are not configured. If any organic user taps "Upgrade," they see a fake payment form. This is a catastrophic trust failure.

**Fix required before:**
- Any paid advertising
- Any influencer partnership that mentions AI features
- Any Product Hunt launch
- Any press article that mentions subscription pricing

**What to deploy:**
```bash
npx supabase functions deploy create-checkout --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
```
Then set in Supabase secrets:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_INDIVIDUAL` (AI Individual $4.99/mo)
- `STRIPE_PRICE_FAMILY` (AI Family $6.99/mo)

**Campaigns 01, 02, and 03 do NOT mention AI or paid features, so they can run before this is fixed.**

---

### 3. HIGH — Deploy the generate-meal-plan Edge Function (Week 3–4)
**Problem:** The AI meal planning feature is gated in the UI but the Edge Function is not deployed. Advertising this before it works creates churn and bad reviews.

**Fix:** Deploy the function, test end-to-end:
```bash
npx supabase functions deploy generate-meal-plan --no-verify-jwt
```
Only promote AI meal planning after this is verified working in production.

---

### 4. MEDIUM — Polish the event invite landing page (Before Campaign 01 launches)
**Problem:** The `/join-event/:code` page is the #1 viral acquisition surface. Its current conversion optimization is unclear.

**Fix needed:**
- Make sure the page shows clearly what guests can do (claim dishes)
- Add a "Powered by Replanish — Plan your own event free →" footer
- Add soft name+email gate to claiming (converts guests to leads)
- Test on mobile — this page will be opened on phones from WhatsApp links

---

### 5. LOW — Set up analytics (Week 1)
**Problem:** Without analytics, you can't measure which campaigns are working.

**Minimum needed:**
- Simple sign-up tracking with "how did you hear about us?" single question in onboarding
- UTM parameters on all campaign links (e.g., `replanish.app?utm_source=reddit&utm_campaign=cozi`)
- Monitor Supabase `auth.users` created_at timestamps against campaign activity dates

---

## Recommended Execution Sequence

### Right Now (Today)
1. Go to Reddit and search `"cozi" "alternative"`. Find 3 threads with recent activity. Reply genuinely.
2. Set up Google Alerts for: "cozi alternative", "family organizer app", "potluck planning app"
3. DM @bengingi on TikTok with the personalized pitch from Campaign 03

### Week 1
- [ ] Confirm `replanish.app` domain works
- [ ] Film TikTok Script 1 from Campaign 01 (The Restaurant Moment) — 30 minutes of filming
- [ ] Post TikTok + Instagram Reel (potluck invite demo)
- [ ] Post Reddit thread in r/mealplanning (authentic — see Campaign 02 post)
- [ ] Create AlternativeTo.net listing for Replanish, add Cozi as alternative
- [ ] DM @raheli_krut on Instagram (Campaign 03 pitch)

### Week 2
- [ ] Film TikTok Script 2 from Campaign 01 (WhatsApp Count)
- [ ] Post the "We switched from Cozi" TikTok (Campaign 02, Script 1)
- [ ] Create Canva carousel: "Potluck chaos vs. Replanish"
- [ ] Publish blog post "Best Free Cozi Alternative in 2026" (Medium or basic blog)
- [ ] Post in 2 Israeli Facebook groups (Campaign 03)
- [ ] Reply to any new Reddit "cozi alternative" threads

### Week 3
- [ ] Film TikTok Script 3 from Campaign 01 (Live event creation, 60 sec)
- [ ] Post Hebrew TikTok 1 (Campaign 03)
- [ ] Post Cozi comparison TikTok (Campaign 02, Script 2)
- [ ] Send press pitch to Geektime (Campaign 03)
- [ ] Follow up with any influencer DMs (3-day follow-up)
- [ ] Check AlternativeTo.net — any traffic? Comments?

### Week 4
- [ ] Film Hebrew TikTok 2 — Passover angle (Campaign 03)
- [ ] Post Instagram Caption 2 (potluck campaign)
- [ ] Post Hebrew Instagram Caption 1 (Israel campaign)
- [ ] Send press pitch to CTech (English pitch from Campaign 03)
- [ ] Review analytics — which content is performing? Double down.
- [ ] Begin Stripe deployment (if not already done)

### Weeks 5–8
- [ ] Full 8-week Israel campaign content calendar (Campaigns 03)
- [ ] Pitch one micro-influencer per week for product review
- [ ] If Stripe is live: begin promoting AI features in separate content
- [ ] Set up Pinterest boards (potluck ideas, Hebrew meal planning — evergreen)
- [ ] Product Hunt submission preparation

---

## Which Campaign Must Come First

**If you can only do one thing today:** Execute Campaign 02 (Cozi Alternative) on Reddit.

**Why:** Zero production cost, zero design work, zero filming. Copy the Reddit post from Campaign 02, go to r/mealplanning, post it. This is 30 minutes of work and can drive sign-ups within 24 hours. The window for Cozi refugees is open now — every week you wait, competitors get more of this traffic.

**Second priority today:** Film the Campaign 01 hero TikTok (The Restaurant Moment). This requires a phone and 30 minutes. No crew, no equipment. The screen recording is the content.

**Third priority:** DM one Israeli influencer (Campaign 03). Personalize the message using the templates in Campaign 03. Send it today. These relationships take time to develop.

---

## Campaign Budget Summary

| Campaign | Organic Cost | Optional Paid Spend | Paid Spend Target |
|---|---|---|---|
| 01 — Potluck, Solved | $0 | Instagram/TikTok boost of best video | $50–100 in Week 3 (only if 10K+ organic views) |
| 02 — Cozi Alternative | $0 | Blog post hosting, optional SEO tools | $0–50 |
| 03 — Israel First | $0 (organic) | Influencer gifting (lifetime account = $0 cash) | $0 cash; optional $100–300 micro-influencer fee if needed |
| **Total (organic)** | **$0** | — | — |
| **Total (optional paid)** | — | — | **$150–450 maximum** |

**Rule:** Do not spend on paid promotion until:
1. Stripe is live (so upgrades work)
2. At least one organic video has 10,000+ views (proof the content works)
3. The event invite landing page is conversion-optimized

---

## Content Asset Tracker

Track what's been created vs. what's still needed:

| Asset | Campaign | Status | Priority |
|---|---|---|---|
| Screen recording: event creation flow | 01, 03 | Not created | HIGH |
| Screen recording: guest claiming a dish | 01 | Not created | HIGH |
| Screen recording: Hebrew UI | 03 | Not created | HIGH |
| Canva: Potluck chaos vs. one link (before/after) | 01 | Not created | HIGH |
| Canva: Cozi vs. Replanish comparison table | 02 | Not created | MEDIUM |
| Canva: Hebrew app screenshots | 03 | Not created | MEDIUM |
| Blog post: "Best Free Cozi Alternative in 2026" | 02 | Not created | HIGH |
| TikTok: "The Restaurant Moment" (Script 1) | 01 | Not filmed | HIGH |
| TikTok: "The WhatsApp Count" (Script 2) | 01 | Not filmed | MEDIUM |
| TikTok: "Live Event Creation" (Script 3) | 01 | Not filmed | MEDIUM |
| TikTok: "We Switched From Cozi" (Script 1) | 02 | Not filmed | HIGH |
| TikTok: "Feature Comparison" (Script 2) | 02 | Not filmed | MEDIUM |
| TikTok: Hebrew "סוף סוף" (Script 1) | 03 | Not filmed | HIGH |
| TikTok: Hebrew "פסח 22 איש" (Script 2) | 03 | Not filmed | MEDIUM |
| Reddit post: Cozi alternative | 02 | Written, ready | IMMEDIATE |
| Reddit post: potluck coordination | 01 | Written, ready | HIGH |
| Instagram captions (×3 potluck) | 01 | Written, ready | HIGH |
| Instagram captions (×2 Cozi) | 02 | Written, ready | HIGH |
| Instagram captions (×2 Hebrew) | 03 | Written, ready | HIGH |
| Hebrew Facebook group post | 03 | Written, ready | MEDIUM |
| Geektime press pitch (Hebrew) | 03 | Written, ready | MEDIUM |
| CTech press pitch (English) | 03 | Written, ready | MEDIUM |
| Influencer DM: @raheli_krut | 03 | Written, ready | HIGH |
| Influencer DM: @bengingi | 03 | Written, ready | HIGH |

---

## What These Campaigns Do NOT Cover

These are out of scope for the current 3 campaigns and require additional work:

- **Paid Google Ads** — requires Stripe live, landing page optimization
- **Product Hunt launch** — requires domain, polished screenshots, Stripe live
- **YouTube walkthrough video** — high production cost, defer to Month 2
- **Pinterest** — worth doing but set-and-forget; set up after Week 4
- **Referral program** — requires product build (in-app referral flow)
- **App Store listing** — PWA only; native app not available
- **AI features campaign** — defer until generate-meal-plan Edge Function is deployed and Stripe is live

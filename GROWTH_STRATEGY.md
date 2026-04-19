# Replanish Growth Strategy — Zero-Budget Playbook
**Date:** April 2026 | **Author:** Growth Research (Claude Code)

---

## 1. Executive Summary

**Three bets that will move the needle for Replanish specifically:**

### Bet 1: Own the Cozi Refugee Segment (fastest ROI)
Cozi degraded its free tier in May 2024, limiting calendar history to 30 days. Their Trustpilot rating cratered to 2.1 stars. Families who used Cozi for 8–10 years are actively switching. Replanish is free, does more (meals + shopping + events + chores), and has no data-retention paywall. This is a ready-made acquisition narrative that requires zero product changes and can be executed this week through Reddit + review sites + targeted content.

**Why this for Replanish:** You already have the features Cozi lost. You just need to be visible when people search for the exit.

### Bet 2: Activate the Event Invite Viral Loop (highest K-factor leverage)
Every potluck or family dinner planned through Replanish generates a `/join-event/:code` link sent to non-users. If even 10% of guests sign up, and each of those users creates one event, growth compounds without any ad spend. The current invite landing page is the single highest-leverage product surface to optimize.

**Why this for Replanish:** No competitor owns potluck/event coordination. This is Replanish's category-defining feature, and every event shared is a free acquisition touch.

### Bet 3: Israeli Market First-Mover (zero competition, built-in moat)
There is no meaningful Hebrew-first family management app. Zero. Replanish has full RTL support, Hebrew translations, and an already-built product. The Israeli market is smartphone-saturated (88%+ penetration), Facebook-group-heavy, and notoriously loyal to products in their language. Capturing even 5,000 Israeli families creates a defensible beachhead before any competitor can build RTL support from scratch.

**Why this for Replanish:** This is an unfair advantage that is non-reproducible in the short term. Use it.

---

## 2. Priority Growth Channels — Effort vs. Impact

| Channel | Effort (1–5) | Expected Impact | Time to Results | Priority |
|---|---|---|---|---|
| Cozi refugee targeting (Reddit + review sites) | 2 | High — captures high-intent switchers | 1–4 weeks | **#1** |
| Event invite viral loop optimization | 3 | Very High — compounds over time | 2–8 weeks | **#2** |
| Israeli Facebook groups outreach | 2 | High — first-mover, no competition | 2–6 weeks | **#3** |
| App Store Optimization (ASO) | 2 | Medium-High — passive acquisition | 4–12 weeks | **#4** |
| Reddit community building | 3 | Medium-High — trust-based | 8–16 weeks | **#5** |
| SEO content blog | 4 | High — long-term compounding | 3–9 months | **#6** |
| Pinterest meal planning traffic | 2 | Medium — top-of-funnel | 2–6 months | **#7** |
| Product Hunt launch | 3 | Medium — one-time spike + credibility | Single day | **#8** |
| Micro-influencer outreach | 3 | Medium — depends on match quality | 4–10 weeks | **#9** |
| Build-in-public (IH + HN) | 2 | Medium — developer/maker audience | 4–12 weeks | **#10** |
| Press (Geektime, CTech, etc.) | 3 | Medium — credibility + Israeli market | 6–12 weeks | **#11** |
| Referral program in-product | 4 | Very High — but needs product build | 2–4 months | **#12** |

---

## 3. The Cozi Opportunity

### What Happened
In May 2024, Cozi restricted free accounts to a 30-day calendar window. Families who had used the app for 8–10 years suddenly couldn't access past or future events without paying $40–$60/year. Trustpilot rating: 2.1 stars. Reviews use words like "bait and switch," "scammy," and "blackmail." The app hasn't been redesigned since ~2010 and carries data privacy warnings from Common Sense Privacy (user data sold to advertisers).

### Where to Find These Users
- **Reddit communities to monitor and engage:**
  - r/mealplanning (~100k members)
  - r/family
  - r/Parenting
  - r/organization
  - r/productivity
  - r/frugal (angle: "free family app")
  - Search Reddit for: `"cozi" "alternative"`, `"cozi" "free"`, `"cozi" "switched"`
- **Review sites to post on:**
  - AlternativeTo.net — create or update the Replanish listing; add a thorough comparison to Cozi
  - Capterra — get Replanish listed and reviewed
  - Product Hunt — create a listing (even without a formal launch)
- **App Store review responses** — if Cozi has public reviews, platforms like AppFollow let you monitor competitor reviews; find the ones looking for alternatives

### Messaging to Use

**Positioning statement:**
> "Replanish is the family app Cozi should have become — free, modern, and built for how families actually coordinate: meals, shopping, events, chores, and schedules together."

**Specific comparison points (use in reviews, posts, landing page):**
- Cozi: 30-day calendar limit on free tier → Replanish: unlimited, always free core
- Cozi: data sold to advertisers, Common Sense Privacy warning → Replanish: Supabase RLS, no ad targeting
- Cozi: no meal planning, no potluck coordination → Replanish: full recipe + AI meal plan + event coordination
- Cozi: interface from 2010 → Replanish: mobile-first, dark mode, RTL support

### Where to Post
1. Search Reddit for active "alternatives to Cozi" threads and reply with a direct, genuine recommendation (never sound promotional — describe what you built and why)
2. Post in r/mealplanning: "I switched from Cozi, built my own — here's what I learned" (personal builder story, link at the end)
3. Update/create Replanish listing on AlternativeTo.net with detailed Cozi comparison
4. Write a blog post titled "Why We're the Best Cozi Alternative in 2026" — this will rank within weeks for the search term "cozi alternative free"

### Features to Highlight
- Unlimited calendar history (no paywall)
- Shopping lists + meals + events in one app (Cozi only does calendar + basic lists)
- Real-time family sharing (Circles)
- No ads, no data selling
- AI meal planning (something Cozi charges extra for in their Max tier at $60/yr)

---

## 4. Viral Loop: Event Invite Amplification

### Current State
The `/join-event/:code` route lets event guests (non-users) see a "who's bringing what" page. This is the highest-value growth surface in the app.

### Why This is Replanish's Best Viral Mechanic
Every event host shares one link with 5–15 people. Those people land on a page, see value, and may sign up. If 15% convert (conservative for high-intent social context), and each new user creates one event that reaches 10 people, K-factor = 1.5 — which means viral growth by definition.

### What Non-Users Should See (Optimize This First)
When someone opens a join-event link, they currently see the event coordination page. To maximize conversion:

1. **Above the fold:** The event name, host name, what's needed, and clear "what they can bring/claim" action — this is the value-first moment
2. **Soft signup gate:** Show the full list, but to claim an item or RSVP, prompt for name + email (not full account creation). Convert them to guest → account later.
3. **Social proof line:** "Powered by Replanish — 1,000+ families use it to coordinate meals and events." (Update number as you grow)
4. **One clear CTA after they claim:** "Want to organize your own dinner? Free, 60 seconds." → account creation flow
5. **Preview what Replanish does:** 3 icons — Meals | Shopping | Events. Not a feature list, just a hint of more

### Reduce Friction on Sharing
- Add a native share sheet button to the event creation confirmation screen ("Share with guests →")
- Pre-populate WhatsApp share message (Israel: WhatsApp is dominant): "I'm planning [event name] — use this link to see what to bring: [link]"
- Add a "copy link" tap-to-copy button on the event detail page, not buried in a menu
- Send a reminder share prompt 3 days before the event: "You haven't shared your event with guests yet"

### Viral Coefficient Estimate
- Current estimated K-factor (no optimization): ~0.1–0.2 (link shared but low conversion on generic landing page)
- After landing page optimization + WhatsApp integration: estimated K-factor: 0.4–0.7
- With in-app sharing prompt + guest-to-account flow: estimated K-factor: 0.8–1.2

Getting above K=1 means events alone can sustain user growth without any other channel.

---

## 5. App Store Optimization (ASO) Plan

### Keyword Research Findings
High-value keywords to target (mix of volume and competition):

**Primary (higher volume, higher competition — own your niche):**
- `family meal planner`
- `meal planning app`
- `family shopping list`
- `grocery list app`

**Secondary (medium volume, lower competition — easier to rank):**
- `family organizer app free`
- `potluck planner app`
- `shared shopping list family`
- `weekly meal planner family`
- `dinner planning app`
- `chore tracker family`

**Long-tail (low volume, low competition — quick wins):**
- `who brings what potluck app`
- `family circle app free`
- `AI meal planning app free`
- `hebrew family planner` (virtually zero competition)
- `cozi alternative free` (captures switchers directly)

### Title Recommendation (30 chars max)
`Replanish: Family Meal Planner`

This hits the primary keyword "Family Meal Planner" upfront, which is the single highest-value category keyword.

### Subtitle Recommendation (30 chars max)
`Meals, Lists & Events Together`

Covers three use cases in one line, differentiates from single-purpose apps.

### Description Strategy

**First 3 lines (shown without "more" tap — most critical for ASO):**
> Plan meals, build shopping lists, and coordinate family events — all in one free app. Replanish replaces four apps with one. Organize your week in minutes.

**Body (after "more"):**
- Lead with the Cozi pain: "Tired of paying for basic family features? Replanish is free — no limits, no ads, no data selling."
- Bullet list: AI meal planning · Shared shopping lists · Potluck coordination · Chores & activities · Family calendar
- Social angle: "Invite family members with one link. See who's bringing what to every dinner party."
- Close with: "Used by families in Israel and worldwide. Full Hebrew/RTL support."

### Rating Strategy
Trigger the in-app review prompt at these moments (not before):
1. After user successfully completes their first shared shopping list (value realized)
2. After an event guest claims an item via invite link (viral moment = satisfied user)
3. After a meal plan is generated by AI and the user swipes to accept it
4. Never on first 3 sessions, never after an error, 90-day cooldown between prompts

---

## 6. SEO Content Strategy

### 10 Blog Post Topics with Keyword Targets

| # | Title | Target Keyword | Format | Priority |
|---|---|---|---|---|
| 1 | "Best Free Cozi Alternative in 2026" | `cozi alternative free` | Comparison + feature table | Immediate |
| 2 | "7 Meal Planning Apps for Families Compared (2026)" | `best meal planning app family` | Comparison listicle | Week 2 |
| 3 | "How to Plan a Potluck Without the Chaos" | `potluck planner app` | How-to guide | Week 3 |
| 4 | "Weekly Meal Planning for Busy Families: A Step-by-Step System" | `weekly meal planner family` | Long-form guide | Week 4 |
| 5 | "Free Family Organizer Apps That Don't Sell Your Data" | `family organizer app free no ads` | Listicle | Month 2 |
| 6 | "How AI Meal Planning Works (And Why It Beats Pinterest)" | `AI meal planning` | Explainer | Month 2 |
| 7 | "The Ultimate Shabbat Dinner Planning Guide" | `shabbat dinner planning` | Cultural + practical guide | Month 2 |
| 8 | "Holiday Meal Planning for Extended Families" | `holiday meal planning family` | Seasonal (Aug/Sep publish) | Month 3 |
| 9 | "How to Split Grocery Shopping Across Family Members" | `shared grocery list family` | How-to guide | Month 3 |
| 10 | "Building a Family Routine: Chores, Meals, and Activities in One System" | `family routine app` | System design post | Month 3 |

### Content Format Recommendation
- Posts 1–3: Comparison format performs best for high-intent switcher keywords. Include feature tables, screenshots, honest pros/cons.
- Posts 4–10: Long-form (1,500–2,500 words) for informational keywords. Include section headers for featured snippet capture.
- All posts: Include Replanish naturally as the recommended solution — not in every paragraph, but clearly positioned by the end.

### Blog Setup Recommendation
- Platform: **Ghost** (free tier or $9/mo) deployed via custom domain (replanish.app/blog or blog.replanish.app). Ghost has built-in SEO, RSS, email newsletter, and clean performance. Alternatively, use **Hashnode** (free, SEO-optimized, custom domain support) which is zero-cost to start.
- Do not use Medium — you don't own the SEO juice.
- Integrate with Vercel via subdomain redirect or use Ghost's Vercel hosting integration.

### Backlink Strategy (Directory Submissions — Do First)
1. **AlternativeTo.net** — Create Replanish listing, list Cozi as an alternative. This site ranks for "[app] alternative" searches.
2. **ProductHunt.com** — Add the product even before a formal launch
3. **Capterra.com** — Free listing in "Family Management" and "Meal Planning" categories
4. **GetApp.com** — Companion to Capterra, same company
5. **SaaSHub.com** — Developer/maker audience
6. **AppAdvice.com** — iOS-focused directory
7. **F-Droid / Fossdroid** — If PWA is listed, some open-source directories accept it
8. **Alternativeto.net** (again, critical — see Cozi opportunity above)
9. **G2.com** — Free listing, influences search results
10. **Indie Hackers product page** — Free, gets indexed

---

## 7. Community Growth Plan

### Reddit Strategy

**Cardinal rule:** Build a 4-week karma base before any product mention. Comment helpfully in your target subreddits on existing posts. Then introduce your product naturally when someone asks a question it answers.

**Target Subreddits and Angles:**

| Subreddit | Size | Post Angle | Timing |
|---|---|---|---|
| r/mealplanning | ~100k | "I built a free app after getting frustrated with [problem]" — builder story | Week 3–4 |
| r/Cooking | ~3M | Share a useful recipe import tip, mention the app contextually | Month 2 |
| r/family | ~50k | "How do you coordinate who brings what to family dinners?" — seed the problem | Week 3 |
| r/Parenting | ~5M | "Family organization system that's actually worked for us" — practical post | Month 2 |
| r/frugal | ~2M | "We cut our grocery bill with this free meal planning system" | Month 2 |
| r/organization | ~500k | "Our family's coordination setup (no paid apps)" | Month 2 |
| r/sideprojects | ~100k | "Built a free family planner — lessons learned" | Week 4 |
| r/selfhosted | niche | Not relevant unless you offer self-hosted option | Skip |

**Post Ideas (that won't get banned):**

1. **r/mealplanning — Week 4:**
   Title: "After a year of trying every meal planning app, here's what actually changed our family's habits"
   Content: Honest comparison post with a tool comparison table. Mention Replanish as what you ended up building after not finding the right tool.

2. **r/family — Week 3:**
   Title: "What do you use to coordinate who brings what to family dinners/potlucks?"
   Content: Ask the question, answer comments. Later reveal you built something for this.

3. **r/frugal — Month 2:**
   Title: "Meal planning cut our grocery bill by ~30% — here's the exact system"
   Content: Practical framework post, no app mention until the last paragraph, as "the tool we use."

### The Build-in-Public Angle

**Indie Hackers (indiehackers.com):**
- Post a "How I built X" story focusing on the Israeli market angle (unique, editors love geographic niches)
- Share monthly revenue/user count updates (even at zero — the journey is the content)
- Ask the community: "Would you pay for X feature?" — generates comments and backlinks

**Hacker News:**
- Submit under "Show HN: I built a free family planning PWA with Hebrew/RTL support"
- The RTL + Hebrew angle is technically interesting to HN audience — this is not a me-too post
- Timing: Tuesday–Thursday, 8–10am EST for best visibility

**Expected from HN "Show HN":** 0–100 upvotes, 5–30 signups if it lands on front page, valuable technical feedback, potential backlinks from tech blogs.

---

## 8. Product Hunt Launch Plan

### Timing Recommendation
**Target: Tuesday or Wednesday, 12:01 AM PST**
- Weekday launches need ~400–600 upvotes for a top-3 spot
- Avoid Monday (high competition from weekend-prep launches)
- Best window: 6–10 weeks from now to allow prep time

### Pre-Launch Preparation (6 weeks before)
1. **Create a PH account and engage** — comment on 3–5 launches/day for 4 weeks to build history
2. **Create a "coming soon" product page** — gather followers before launch day
3. **Prepare assets:**
   - Thumbnail: 240x240, bold orange Replanish logo on white
   - Gallery images: 5 screenshots — Home, Meal Plan, Event invite page, Shopping List, Hebrew/RTL mode
   - Maker video: 60-second screen recording with voiceover (Loom works)
   - Tagline: "Meals, shopping, and family events — free, together"
   - Description: Lead with the event invite viral mechanic as the hook

4. **Build a launch list:** Email everyone who has used the app, post in Indie Hackers asking for support, post in r/sideprojects 1 day before with "dropping tomorrow on Product Hunt"

### Finding a Hunter
- A "hunter" is a PH power user who submits your product (historically got more visibility, less critical now but still helpful)
- Find hunters at: hunters.ship.so or by searching PH for hunters in the productivity/lifestyle category
- Reach out with: product overview, your launch date, link to preview — keep it under 100 words

### Launch Day Checklist
- [ ] Post at exactly 12:01 AM PST
- [ ] Post in your personal and company social channels at 9 AM PST when US East Coast wakes up
- [ ] Post in Indie Hackers "I just launched, would love your support" thread
- [ ] Post in relevant Slack communities (Makerlog, WIP, IndieWorldwide)
- [ ] Reply to every single comment within 2 hours — PH algorithm rewards engagement
- [ ] Update your status in Israeli tech Discord/Slack communities
- [ ] Do NOT ask for upvotes directly (violates PH terms) — ask people to "check it out and share feedback"

### Expected Results (based on comparable indie app launches)
- With prep: 200–500 upvotes, top 5 on launch day, 50–200 signups
- Without prep: 30–80 upvotes, no homepage feature, 5–20 signups
- Long-tail: PH listing ranks on Google for "[app category] app" searches for months

---

## 9. Israeli Market Growth Plan

### Why Israel is the Right First Market
Israel has 88%+ smartphone penetration, one of the highest globally. Families coordinate heavily via WhatsApp groups. There is zero Hebrew-first family management app competing with Replanish. The cultural calendar (Shabbat, High Holidays, Passover seder, etc.) creates recurring, high-intensity family coordination moments that map directly to Replanish's event + meal planning features.

### Israeli Facebook Groups to Target
Israel's Facebook usage remains extremely high compared to global averages. Target these types of groups (search in Hebrew on Facebook):

- **"אמהות ואבות לחיים"** type groups (parenting/family groups, 50k–500k members each)
- **"קבוצת מתכונים"** (recipe/cooking groups) — multiple groups with 100k–300k members
- **"חיסכון וניהול הוצאות משפחתיות"** (family budget/savings groups)
- **"אמהות ישראליות"** (Israeli mothers groups — very active, sharing app recommendations is common)
- **"בישול ואפייה בישראלי"** (Israeli cooking and baking)
- Search: `קבוצות פייסבוק תכנון ארוחות משפחה` to find active groups

**Approach:** Join groups as a genuine participant for 2–3 weeks. Then share a post about Replanish framed as "I built this app for Israeli families, would love your feedback" — Israeli users respond warmly to personal builder stories, especially in Hebrew.

**Sample Hebrew post opener:**
> בניתי אפליקציה לניהול המשפחה — מתכונים, קניות, ואירועים ביחד. הכל בעברית ובחינם. מי רוצה לנסות?

### Israeli Influencers to Reach
Focus on micro-influencers (5k–50k followers) in these niches:
- **Food bloggers in Hebrew** — search Instagram: `#מתכוניםבעברית`, `#בישולישראלי`
- **"Mom influencers" (אמהות מהרשת)** — parenting lifestyle accounts in Hebrew
- **Family organization bloggers** — search: `#ארגוןהבית`, `#ניהולמשפחה`

Key names to research (search Instagram/TikTok for these hashtags to find current active creators):
- Creators posting about `#תכנוןארוחות` (meal planning in Hebrew)
- Creators posting about `#קניות` + family content

**Offer for outreach:** Free lifetime AI subscription ($4.99/mo value) in exchange for an honest review post. No scripts — let them use it genuinely.

### Hebrew App Store Listing Optimization
- **App name (Hebrew):** `ריפלניש — תכנון המשפחה` or `שולחן משפחתי — ארוחות וקניות`
- **Subtitle:** `ארוחות, קניות ואירועים ביחד`
- **Keywords to target:** `תכנון ארוחות`, `רשימת קניות משפחתית`, `ארגון משפחה`, `תפריט שבועי`
- **Screenshots:** Add a dedicated Hebrew-UI screenshot set showing RTL layout — show that the app is truly built for Hebrew, not just translated
- **Description first line:** "האפליקציה היחידה לניהול משפחה בעברית מלאה — ארוחות, קניות ואירועים במקום אחד"

### Israeli Press Outlets to Pitch
1. **Geektime (geektime.co.il)** — Israel's leading tech media. Pitches should go to the editor with a 1-paragraph Hebrew or English summary. They run "Israeli founders" features regularly. The unique angle: first Hebrew-first family management app, built by an Israeli solo developer.
2. **CTech / Calcalist Tech (calcalistech.com)** — Covers Israeli startups and consumer tech. Best angle: "Israeli app captures underserved Hebrew-speaking family market."
3. **Ynet Tech section** — More consumer-facing than Geektime, reaches non-tech audience.
4. **The Marker (themarker.com)** — Business/tech section, good for subscription/monetization story once Stripe is live.
5. **Walla Tech** — Consumer tech, good for product feature stories.

**Pitch structure (all outlets):**
- Subject: "ישראלי בנה אפליקציית ניהול משפחה בעברית — ראשון מסוגו"
- Para 1: The gap (no Hebrew-first family app exists)
- Para 2: What Replanish does differently (AI meal planning + event coordination + RTL)
- Para 3: Traction and who it's for
- CTA: "Happy to demo via Zoom"

### Cultural Angles

**Shabbat dinner coordination:**
- Shabbat creates a weekly high-stakes family coordination event: who's coming, who brings what, what's being served
- Replanish's event + meal planning combo solves this perfectly
- Create a dedicated "Shabbat Dinner Planner" template accessible from the app home screen
- Blog post: "How Israeli families use Replanish to plan Shabbat dinner without the WhatsApp chaos"

**High Holiday meals (Rosh Hashana, Passover, Purim):**
- Create seasonal "Seder Night Planner" and "Rosh Hashana Meal" templates
- Publish blog posts 6 weeks before each holiday
- These are extremely high-search-volume moments in Israel

**Holiday timing calendar:**
- Rosh Hashana 2026: September 20 → Start marketing August 1
- Passover 2027: April → Start marketing February 15
- Purim 2027: March → Start marketing February 1

---

## 10. Referral Mechanics: What to Build

### Recommended Feature: "Family Invite After Value Moment"

**The mechanic:**
When a user completes their first shared shopping list trip (checks off 80%+ of items), show a single-screen moment:

> "Nice work! This list was shared with [name]. Want to invite [2 more family members] to Replanish?"

Pre-populate suggested contacts from the Circle members they've already worked with. One tap adds them.

**Why after the shopping list specifically:**
- This is the moment of highest satisfaction (task complete)
- The social context is already present (they just shared with someone)
- The "invite more" ask feels natural, not promotional

**What this is not:** A generic "invite friends for credits" referral program. Those feel transactional and reduce trust. This is a contextual prompt at a value moment.

### Secondary Feature: WhatsApp Deep Link Share

Since Israeli users live in WhatsApp:
- On the event invite screen, add a dedicated WhatsApp share button (uses `https://wa.me/?text=`)
- Pre-populate message: "פתח/פתחי כאן לראות מה להביא: [link]"
- On shopping list, add "Share list via WhatsApp" option
- These are 1–2 hour development tasks with outsized impact in the Israeli market

### Expected Impact
- Contextual invite prompt: +15–25% increase in circle member invites
- WhatsApp integration: Estimated 2–3x increase in event link share rate among Israeli users
- Combined viral coefficient improvement: from estimated K=0.15 → K=0.5–0.8

---

## 11. 90-Day Zero-Budget Action Plan

### Week 1–2: Foundation (Non-Negotiable Before Any Marketing)

**Critical pre-condition:** Fix Stripe payment before any marketing push. Acquiring users to a broken payment flow wastes the acquisition. This is the single most important technical task.

- [ ] Fix Stripe integration (create-checkout + stripe-webhook Edge Functions, configure secrets)
- [ ] Create Replanish listing on AlternativeTo.net with thorough Cozi comparison
- [ ] Submit to Capterra (free) and G2 (free) directories
- [ ] Set up Ghost or Hashnode blog on a subdomain
- [ ] Write and publish blog post: "Best Free Cozi Alternative in 2026"
- [ ] Create Product Hunt "coming soon" page
- [ ] Update App Store listing with new title/subtitle/description from ASO plan
- [ ] Set up Hebrew App Store listing screenshots (RTL UI showcased)
- [ ] Join 5–7 Israeli Facebook family groups (observe, don't post yet)
- [ ] Create Reddit account (if not already active) and start building karma in r/mealplanning

### Week 3–4: First Content and Community

- [ ] Publish blog post #2: "7 Meal Planning Apps for Families Compared (2026)"
- [ ] Post in r/family: "How do you coordinate who brings what to family dinners?" (seed the problem, no product mention yet)
- [ ] Post in r/sideprojects: "I built a free family planning app — lessons learned" (builder story)
- [ ] Post in 2–3 Israeli Facebook groups (personal builder introduction in Hebrew)
- [ ] Write and publish Indie Hackers product page + first update post
- [ ] Set up Pinterest account, create 5 boards (meal planning, family organization, recipes, event planning, weekly planning)
- [ ] Pin 15 pieces of content (repurpose blog posts as pin images)
- [ ] Reach out to 5 Hebrew food/family micro-influencers with a personal, genuine message
- [ ] Implement WhatsApp share button on event invite flow (development task, ~2 hours)

### Month 2: Campaigns and Influencer Outreach

- [ ] Publish 2 more blog posts (see content calendar in Section 6)
- [ ] Submit "Show HN" to Hacker News (Tuesday, 9am EST)
- [ ] Post in r/mealplanning: builder story with product reveal
- [ ] Post in r/frugal: grocery bill reduction system post
- [ ] Follow up with influencers (second touch, offer specific collaboration idea)
- [ ] Create Pinterest pins for top 3 blog posts (3–5 design variants each)
- [ ] Pitch Geektime and Walla Tech (email pitch in Hebrew/English)
- [ ] Optimize event invite landing page for conversion (Section 4 recommendations)
- [ ] Implement in-app review prompt at 2 defined value moments
- [ ] Set up rating prompt → target 20+ App Store reviews as social proof

### Month 3: Product Hunt and Press

- [ ] Finalize Product Hunt launch assets (thumbnail, gallery, video, description)
- [ ] Find a hunter (hunters.ship.so)
- [ ] Build launch email list (everyone who has used the app)
- [ ] 1 week before launch: post in Indie Hackers + r/sideprojects "launching next Tuesday"
- [ ] Product Hunt launch day (full checklist from Section 8)
- [ ] Publish "Best Free Cozi Alternative" follow-up with updated comparison
- [ ] Pitch CTech with traction update
- [ ] Publish Shabbat dinner planning post (SEO + Israeli press hook)
- [ ] Review which channels produced signups — double down on what worked

---

## 12. Quick Wins (Do This Week)

Five actions under 2 hours each with measurable, direct impact:

### 1. Create the AlternativeTo.net Listing (30 minutes)
Go to alternativeto.net, create a Replanish listing, and explicitly mark Cozi as an alternative it replaces. Include a detailed description comparing features. People actively searching "cozi alternative" will find this within 1–2 weeks. This is the fastest path to capturing high-intent switchers.

**Measurable impact:** Referral traffic from AlternativeTo within 2–4 weeks.

### 2. Update the App Store Title and Description (45 minutes)
Change the title to "Replanish: Family Meal Planner" and update the first 3 lines of the description to match the ASO strategy in Section 5. This costs nothing and permanently improves discoverability for the most-searched category keywords.

**Measurable impact:** Track ASO impressions via App Store Connect analytics — improvement should be visible within 30 days.

### 3. Add a WhatsApp Share Button to Event Invite Flow (90 minutes, developer task)
One `wa.me` deep link pre-populated with the event name and join URL. In Israel, this single button will meaningfully increase the share rate for every event created. It's 10 lines of code.

**Measurable impact:** Track event shares before/after. Expect 2–3x share rate improvement among Israeli users.

### 4. Write and Publish "Best Free Cozi Alternative in 2026" (2 hours)
500–800 word post, published on your blog. Structured as: problem (Cozi paywall) → what to look for → comparison table → why Replanish. Submit URL to Google Search Console after publishing. This will rank within 4–8 weeks for "cozi alternative free" — a high-intent keyword with minimal competition.

**Measurable impact:** Organic search traffic and keyword rankings in Google Search Console.

### 5. Post in r/mealplanning — Answer One Question, No Product Mention (20 minutes)
Find an active question thread, give a genuinely useful answer about meal planning, batch cooking, or family coordination. Do not mention Replanish. This starts building the karma and community presence needed for the Week 4 builder story post.

**Measurable impact:** Karma + community familiarity. The payoff is the Week 4 post landing well instead of getting flagged as spam.

---

## Appendix: Sources and Research

- [Cozi Review 2026: Honest Take After the Paywall - Calendara](https://www.usecalendara.com/blog/cozi-review-2026)
- [Best Cozi Alternative 2026: Why Parents Switch - Calendara](https://www.usecalendara.com/blog/best-cozi-alternative-2026)
- [Product Hunt Launch Checklist 2025 | Whale](https://usewhale.io/blog/product-hunt-launch-checklist/)
- [How to Successfully Launch on Product Hunt in 2025](https://www.marketingideas.com/p/how-to-successfully-launch-on-product)
- [12 Low Cost App Marketing Strategies That Actually Work in 2025 – Indie App Santa](https://indieappsanta.com/2025/11/21/10349/)
- [Organic App Growth Strategies That Actually Work | MobileAction](https://www.mobileaction.co/blog/organic-app-growth-in-2025/)
- [Reddit Organic Marketing: How Startups Gain Traction Without Ads](https://www.stackmatix.com/blog/reddit-organic-marketing-startups)
- [Reddit Marketing 101: How To Market Your Brand on Reddit - Shopify](https://www.shopify.com/blog/reddit-marketing)
- [Micro-Influencer Marketing Strategy: A Complete Guide for 2025](https://houseofmarketers.com/micro-influencer-marketing-strategy/)
- [Pinterest Marketing: The Complete 2025 Guide - Tailwind Blog](https://www.tailwindapp.com/blog/pinterest-marketing-2025)
- [Geektime - Overview and Company Profile | Tracxn](https://tracxn.com/d/companies/geektime/__D5Kt9NGTxV5MOufRjrqhThecgrNKkCKTQ-eO1yuPOUA)
- [The 50 Most Promising Israeli Startups - 2025 | CTech](https://www.calcalistech.com/ctechnews/article/923yvb6hw)
- [Indie Hackers Launch Strategy 2025](https://awesome-directories.com/blog/indie-hackers-launch-strategy-guide-2025/)
- [Top 5 Viral Referral Campaign Ideas for B2C Brands in 2025](https://viral-loops.com/blog/b2c-viral-referral-campaign-ideas/)
- [When to Ask for App Ratings: Early vs. the "Aha Moment" - Appbot](https://appbot.co/blog/prompting-for-ratings-prompt-early-or-wait/)
- [Best Meal Planning Apps for Families in 2026 - Ollie](https://ollie.ai/2025/10/29/best-meal-planning-apps-2025/)
- [Top Meal Planning Keywords | KeySearch](https://www.keysearch.co/top-keywords/meal-planning-keywords)

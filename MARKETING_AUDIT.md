# Replanish — Marketing Audit
**Prepared:** April 2026 | **Auditor:** Claude Code (app-audit skill)
**Scope:** Marketing and positioning analysis based on live codebase, feature inventory, and user-facing strings.

---

## 1. The One-Line Pitch

> **"One app for every meal, chore, activity, and gathering your family shares."**

**Runner-up (Hebrew-market focused):**
> "The family command center for meals, errands, and everything in between."

---

## 2. The Elevator Pitch (30 seconds)

**Problem:**
Every family juggles five different apps — a notes app for the shopping list, a group chat for potluck planning, a calendar for kids' activities, a whiteboard for chores. Nothing talks to anything else, and someone always drops the ball.

**Solution:**
Replanish puts it all in one place. Your family shares a private Circle — a group where you plan meals for the week, build shopping lists together in real time, coordinate who's bringing what to Friday's dinner party, track chores with a points system, and schedule soccer practice alongside piano lessons on a shared calendar.

**Differentiator:**
It's the only app that connects meal planning directly to shopping lists, event potluck coordination, household chores, and recurring activities — all scoped to your family group, with Claude AI to import any recipe from any website and generate an entire week's meal plan in seconds. And it's the only app in this category with full Hebrew and RTL support.

**CTA:**
Free to start. Create your family Circle in 60 seconds at replanish.app.

---

## 3. Feature Inventory (What Actually Exists Today)

### Authentication & Identity
- **Email/password sign-up + Google OAuth** — standard auth with email confirmation
- **3-step onboarding flow** — Welcome → Create/Join Circle → Done; gated by `has_onboarded` flag

### Circles (the Social Foundation)
- **Circle creation** — family/household groups with custom name and icon
- **Invite by link, code, or email** — share-able links work on WhatsApp/SMS; email adds instantly if account exists
- **Member management** — view, add, and remove circle members
- **Multi-circle support** — one user can belong to multiple circles (family + friends + roommates)

### Recipes
- **Full CRUD recipe management** — title, description, ingredients (with autocomplete from 129 seeded items), instructions, tags, prep/cook time, servings
- **AI recipe import from URL** — paste any recipe site URL, AI extracts structured recipe (Claude-powered, AI plan required)
- **AI recipe import from photo** — photograph a printed recipe, AI parses it (AI plan required)
- **Multi-ingredient search** — search recipes by what you have in your fridge
- **Recipe sharing via link** — public `/r/:code` share links; anyone can view without signing in
- **Auto-tagging** — tags generated automatically from ingredients and recipe metadata
- **Essentials lists** — reusable non-food supply lists (Bathroom Restock, Party Supplies, etc.)

### Shopping Lists
- **Full CRUD shopping lists** — create, name, share with your Circle
- **Real-time collaborative sync** — Supabase Realtime; multiple people can check items simultaneously
- **Drag-and-drop reorder** — reorder items manually
- **Check/uncheck items** — marks individual items complete
- **Ingredient deduplication** — when adding from multiple recipes, duplicate ingredients are merged
- **Store route sorting** — sort list by your custom aisle/department order per store
- **Offline support** — IndexedDB persistence, syncs when back online

### Store Routes
- **Custom store management** — create stores with department/aisle categories
- **Drag-and-drop department ordering** — set your personal store route
- **Sort-by-aisle** — applies your route to any shopping list instantly

### Meal Planning
- **Week-view planner** — breakfast/lunch/dinner/snack slots for 7 days, shared with Circle
- **Multi-recipe per slot** — assign multiple dishes to a single meal slot
- **Meal plan templates** — save and reuse weekly meal plans
- **Copy week** — duplicate current week's plan to the next week
- **Add week to list** — convert the week's recipe ingredients into a shopping list (deduplicated)
- **Calendar export** — export meal plan to calendar app (iCal)
- **AI meal plan generation** — tell the AI your dietary restrictions, cuisine preferences, cooking style, and calories; receive a full week of personalized meal suggestions with new recipes created automatically (Claude-powered, AI plan required)
- **Meal plan preferences** — Kosher, vegetarian, vegan, gluten-free, dairy-free, nut-free, low-carb; Israeli/Mediterranean, Italian, Asian, Mexican, American, Indian, Mixed cuisines; Quick/Balanced/Gourmet cooking styles; Light/Regular/Hearty calorie targets

### Events (Potluck & Gathering Coordination)
- **Full event creation** — name, date/time, location, description
- **5-tab event detail page** — Overview, Mine, Menu, Supplies, Tasks
- **Menu coordination** — add dishes to event menu; guests claim "I'll bring it"
- **Supplies coordination** — add supplies; guests claim items
- **Task assignment** — add tasks; guests claim "I'll do it"
- **Co-organizer support** — multiple hosts per event
- **Event invite links** — public join links; anyone can join and participate
- **Clone event** — duplicate past event with all items for reuse
- **Calendar export** — add event to calendar app (iCal)
- **Pending approval** — item assignment approval flow (UI built)

### Activities (Family Schedule)
- **Recurring activity scheduling** — daily, weekly, bi-weekly, monthly, yearly frequencies
- **Multi-day recurrence** — select specific days of the week
- **Categories** — Sports, Music, Arts, Education, Social, Carpool, Chores, Other
- **Assignment** — assign to circle members or free-text names
- **Participant roles** — Participants, Escorts, Drivers, Supervisors
- **Bring items** — list what to bring to each activity (water bottle, cleats, etc.)
- **Location** — optional location field per activity
- **Month/Week/Day calendar views** — drill-down calendar with Zustand-persisted view state
- **Activity reminders** — flexible timing (minutes/hours/days/weeks/months before); browser Notification API
- **Skip holidays/breaks** — option to skip school holidays and breaks

### Chores
- **Chore creation** — name, emoji icon, frequency (daily/weekly/bi-weekly/monthly/once), recurrence days, due time, description
- **Circle member assignment** — assign to specific family members via autocomplete
- **Completion tracking** — mark done per day; streak tracking; weekly summary
- **Points system** — assign point values to chores; track family points
- **Assignee filter chips** — filter view by family member (defaults to "Me")
- **Colored person headers** — visual grouping by assigned person

### Home Dashboard
- **Daily dashboard** — today's activities, today's chores, active shopping lists, upcoming events, recent recipes
- **Upcoming reminders widget** — surface next reminders from activities
- **NLP quick-action input** — type natural language ("Add soccer practice every Monday 3-5pm") to create items via AI (AI plan required, Edge Function not yet deployed)

### AI & Subscriptions
- **Free tier** — all core features (recipes, lists, planning, events, chores, activities) — no paywall
- **AI Individual plan** — $4.99/month: URL recipe import, photo recipe import, AI meal plan generation
- **AI Family plan** — $6.99/month: all AI features shared across up to 5 circle members
- **Usage meter** — visible monthly credit usage in Profile/Settings
- **AI upgrade modal** — graceful paywall with upgrade CTA when limit hit
- **In-app AI chat assistant** — "Replanish Helper" for app guidance, recipe import, and planning (Claude-powered)

### Notifications
- **In-app notification center** — bell icon in header; activity reminders and chore nudges
- **Browser Notification API** — push notifications when app is open or installed as PWA

### Settings & Personalization
- **Dark / Light / System theme** — full dark mode support
- **Language switcher** — English, Hebrew (full RTL), Spanish
- **Profile management** — display name visible to circle members

### PWA
- **Installable** — add-to-home-screen on iOS and Android
- **Offline support** — shopping lists usable without internet

---

## 4. Core Value Props (Ranked by Unique × Compelling × Demonstrable)

Scoring: **Unique** (1–5), **Compelling** (1–5), **Demonstrable** (1–5), **Total** (max 15)

| # | Value Prop | Unique | Compelling | Demonstrable | Total |
|---|-----------|--------|------------|--------------|-------|
| 1 | **All-in-one family coordination hub** — replaces 5 separate apps (notes, calendar, chat, recipes, chores) with one shared Circle | 3 | 5 | 4 | **12** |
| 2 | **AI meal planning tailored to your family** — generate a full week of personalized meals in seconds, with recipes created automatically and added to your shopping list | 4 | 5 | 5 | **14** |
| 3 | **Potluck & event coordination no competitor touches** — guests claim dishes, supplies, and tasks from a shared list; no more group chat chaos | 5 | 5 | 5 | **15** |
| 4 | **Real-time collaborative shopping lists with store-route sorting** — shop together, offline-capable, sorted by your actual aisle order | 3 | 4 | 5 | **12** |
| 5 | **Full Hebrew/RTL support — first-class, not an afterthought** — the only family management app built natively for the Israeli market | 5 | 4 | 4 | **13** |

**Winner: #3 — Potluck & Event Coordination (score: 15).** No competitor has a dedicated feature set for collaborative gather planning. This is the clearest blue ocean.

**Second: #2 — AI Meal Planning (score: 14).** Claude-powered, preference-aware, connected directly to shopping list. The end-to-end automation is the story.

---

## 5. Target Personas

### Persona 1: "The Overwhelmed Parent" — Maya, 34–45
**Situation:** Two kids in activities (soccer, piano), works full time, manages the household grocery run solo. Uses WhatsApp to coordinate with spouse. Has 3 reminder apps that don't talk to each other.

**Top 3 pain points:**
1. The mental load of remembering who needs what, when, and where — every week
2. Shopping without a real list — ends up buying duplicates or forgetting the one critical thing
3. Kids' activity schedule is in her head; the rest of the family is always asking "what's happening today?"

**Trigger moment:** On a Sunday evening, she's trying to figure out dinner for the week, update the grocery list, and remember if Emma has soccer Tuesday or Thursday. She Googles "family planner app everything in one place".

**Jobs to be done:**
- Plan meals for the week without starting from scratch every time
- Share a live shopping list the spouse can check off in real time at the store
- Have one place where soccer, piano, dentist, and Shabbat dinner all live

**Where she hangs out online:** Instagram, Pinterest (meal inspiration), Facebook family groups, WhatsApp groups

**What she would Google:**
- "family meal planner and shopping list app"
- "shared shopping list app family"
- "app to manage kids activities and meals"
- "family organization app all in one"

**Emotional outcome she wants:** Feeling in control. Not dropping balls. The quiet satisfaction of a planned week.

---

### Persona 2: "The Meal Prep Planner" — Daniel, 28–40
**Situation:** Health-conscious, cooks 5 nights a week, saves recipes from Instagram and blogs. Wants to stop re-entering ingredients into a shopping list every week. May have dietary restrictions (vegan, gluten-free, or Kosher).

**Top 3 pain points:**
1. Copying recipe ingredients into a notes app every week is tedious and error-prone
2. Recipe apps don't connect to shopping lists — two separate workflows
3. Planning for dietary restrictions is manual — no app understands "Kosher" out of the box

**Trigger moment:** He's on his third recipe site this week saving links in his browser bookmarks. He thinks "there has to be an app that just imports this." Googles "recipe import app shopping list".

**Jobs to be done:**
- Import any recipe from any website with one tap
- Build a weekly meal plan from his recipe library and get an auto-generated shopping list
- Store his favorite meals and re-use them without re-entering data

**Where he hangs out online:** Instagram (recipe creators), Reddit (r/MealPrepSunday, r/Cooking), TikTok cooking accounts, YouTube

**What he would Google:**
- "recipe import from URL app"
- "meal planning app with shopping list"
- "AI meal planner app"
- "kosher meal planning app"

**Emotional outcome he wants:** Effortless execution of a healthy, planned week. No mental overhead — just cook.

---

### Persona 3: "The Social Host / Potluck Organizer" — Noa, 30–50
**Situation:** Hosts Friday night dinners, holiday gatherings, birthday parties, or casual potlucks regularly. Currently coordinates via WhatsApp group: "who's bringing what?" threads that get buried, people forget, duplicates show up.

**Top 3 pain points:**
1. No one knows who claimed what — three people show up with hummus
2. The host ends up buying everything that wasn't claimed, last minute
3. Tracking RSVPs, menu, supplies, AND tasks in a single group chat is chaos

**Trigger moment:** She just finished a potluck where two people brought the same dessert and nobody brought napkins. Searches "potluck planning app" or "event coordination app who brings what."

**Jobs to be done:**
- Create a shared event where guests can see the menu and claim items
- Track who confirmed, who's bringing what, and what's still unclaimed
- Reuse the same setup for the next gathering without starting over

**Where she hangs out online:** Facebook, WhatsApp, Instagram, Pinterest (entertaining/hosting boards)

**What she would Google:**
- "potluck planning app who brings what"
- "event coordination app guests claim items"
- "shared party planning app"
- "app for potluck dinner organization"

**Emotional outcome she wants:** A gathering where everything just works. The host gets to enjoy the party instead of managing logistics.

---

### Bonus Persona: "The Hebrew-Speaking Family in Israel" — Yossi & Michal, 35–50
**Situation:** Israeli family, not comfortable with English-only apps. Have tried western apps but the Hebrew support is broken (labels in English, RTL layout wrong). Shabbat and Jewish holidays are part of their weekly rhythm. Kosher kitchen matters.

**Top 3 pain points:**
1. Every app assumes English — menus misalign, text truncates, ingredients aren't in Hebrew
2. Kosher dietary filtering doesn't exist as a first-class option anywhere
3. Apps designed for American families don't map to Israeli weekly rhythms (Sunday–Saturday working week, Shabbat planning, holidays)

**Trigger moment:** A Facebook post from a friend in a family WhatsApp group: "מישהו מכיר אפליקציה לתכנון ארוחות בעברית?" (Anyone know a meal planning app in Hebrew?)

**Jobs to be done:**
- Plan the week's meals including Shabbat dinner
- Share a shopping list with spouse in Hebrew with proper RTL layout
- Manage kids' activities in a calendar that respects Israeli days of the week

**Where she hangs out online:** Facebook groups (Israeli parenting/cooking groups), WhatsApp, Instagram (Israeli food creators), Walla, Ynet

**What she would Google (in Hebrew):** אפליקציה לתכנון ארוחות, רשימת קניות משותפת למשפחה, אפליקציה לניהול בית משפחתי

**Emotional outcome she wants:** An app that finally feels built for them — not translated, not approximated. Home.

---

## 6. Differentiation Map

| Feature | Replanish | Mealime | Plan to Eat | AnyList | OurGroceries | Cozi | Paprika |
|---------|-----------|---------|-------------|---------|-------------|------|---------|
| Weekly meal planner | ✅ | ✅ | ✅ | ❌ | ❌ | 🔶 | ✅ |
| Recipe import from URL (AI) | ✅ | ❌ | 🔶 | ❌ | ❌ | ❌ | ✅ |
| Recipe import from photo (AI) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| AI meal plan generation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Shared family shopping lists | ✅ | ❌ | 🔶 | ✅ | ✅ | ✅ | ✅ |
| Real-time collaborative lists | ✅ | ❌ | ❌ | 🔶 | ✅ | ❌ | ❌ |
| Store route sorting | ✅ | ❌ | ❌ | ✅ | 🔶 | ❌ | ✅ |
| Ingredient deduplication | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Potluck / event coordination | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Claim/assign items to guests | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Family chores tracking | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Chores points system | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Recurring activities / schedule | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Carpool / participant roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Family circle / group concept | ✅ | ❌ | ❌ | 🔶 | 🔶 | ✅ | ❌ |
| Calendar drill-down (M/W/D) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| In-app AI assistant (chat) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Hebrew / RTL support | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Kosher dietary filter | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PWA (installable, offline) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Free core tier | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Recipe sharing via public link | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Where Replanish clearly wins:**
1. **Event / potluck coordination** — no competitor exists here
2. **AI-powered features** (recipe import from photo, AI meal plan generation) — only Paprika has URL import, no AI
3. **Hebrew/RTL and Kosher support** — completely uncontested
4. **Circle-scoped social architecture** — rivals are siloed; Replanish is social-first
5. **Chores with points gamification** — Cozi has basic chores but no points
6. **All-domain integration** — meals + lists + events + chores + activities in one app

---

## 7. Viral Hooks Analysis

| Feature | Mechanism | Viral Potential (1–10) |
|---------|-----------|----------------------|
| **Circle invite links** | Sends a link (WhatsApp/SMS) to join the family group. Every new member then uses the app actively. Classic product-led growth: one user recruits N users from their household. | **8/10** |
| **Event invite links** (`/join-event/:code`) | Shared before any gathering — potluck/party guests join without an account needed to view and claim items. Guests who find it useful become new users. | **9/10** |
| **Recipe share links** (`/r/:code`) | Public, no-login-required recipe page. Shared via cooking groups, WhatsApp, or social media. Viewer sees the recipe + an "import this" CTA that leads to sign-up. | **7/10** |
| **Shopping list sharing** | Share a list with a circle member who joins to check off items. Creates a daily-habit loop for multiple household members, not just the creator. | **6/10** |

**Analysis:**

**Event invite links are the highest-value viral hook.** The flow is: 1) Noa creates a potluck event in Replanish. 2) She shares the link in the WhatsApp group. 3) Six guests open it on their phones and see a beautiful, interactive "who's bringing what" page. 4) They claim items and think "this is way better than the group chat." 5) Some of them sign up. This is the most compelling acquisition story in the product.

**Recipe links are the social media play.** A food influencer or passionate home cook shares a recipe they built in Replanish on Instagram or a Facebook cooking group. The `/r/:code` URL is public. Viewers tap it, see the recipe with a "Save this recipe to Replanish" CTA, and sign up. This is a direct analog to how Canva grew via shared designs.

**Circle invites are the retention multiplier.** Once two or more household members are in a shared Circle, churn becomes very difficult — you'd need everyone to agree to leave.

---

## 8. Marketing Liabilities

These features should **not be advertised** or should be flagged with caveats until resolved:

| Feature | Status | Risk if Advertised |
|---------|--------|-------------------|
| **Stripe payments / subscriptions** | Edge Functions built but Stripe secrets not configured. Upgrade flow is mock/test-only. | Users who tap "Upgrade" see a fake payment flow. Extremely damaging to trust if organic users find this. **Do not advertise paid AI plans until Stripe is live.** |
| **NLP quick-action input** ("Add soccer practice every Monday...") | UI built, Edge Function (`nlp-action`) not deployed | The feature appears on the Home screen but does nothing for users without the backend. Creates confusion and disappointment. |
| **AI meal plan generation** | Edge Function (`generate-meal-plan`) not deployed | Advertised in the app UI but blocked by "coming soon" in i18n strings for some entry points. Verify end-to-end before promoting. |
| **Family AI plan member sharing** | AI access only checks the subscribing user, not shared across circle members | Advertising "up to 5 members share AI" is technically false right now. |
| **Server-side push notifications** | Browser Notification API only — no VAPID/background push | Advertising "notifications" implies push to locked phones. Currently only works if the app is open/installed. |
| **Calendar import** (external calendars) | Deferred — needs Google OAuth | Do not mention importing from Google Calendar; only export (iCal) works. |
| **App store listing** | Not started (no TWA/Capacitor) | Cannot be listed as "Available on App Store / Google Play" — PWA only. |
| **"Replanish" brand name** | New rebrand from OurTable; product domain still shows `whats4dinner-gamma.vercel.app` | A marketing-ready domain and production URL should be confirmed before any public launch push. |

---

## 9. App Store Optimization Recommendations

### Current Name Assessment
**"Replanish"** — the name is creative (plan + replenish) and unique, which aids recall and makes it searchable. However, it is opaque: a new user doesn't know what it is from the name alone. This is a liability on app store browse, where names that include a category keyword ("Family Planner," "Meal Planner") rank higher and convert faster.

**Verdict:** The name is brand-safe and memorable for word-of-mouth, but should always be paired with a keyword-rich subtitle on app stores.

### Recommended App Store Title (30 chars max)
`Replanish: Family Meal Planner`
(30 chars exactly — includes the top search keyword)

**Alternative (Israeli market focus):**
`Replanish – Family Organizer`

### Recommended Subtitle (30 chars max)
`Meals, Lists & Home Together`
(29 chars — covers the three highest-retention features)

**Alternative:**
`Plan, Shop & Gather as a Family`

### Recommended Keywords String (100 chars, comma-separated)
`meal planner,family organizer,shopping list,potluck,chores,recipe import,ai meal plan,kosher`
(93 chars)

**Rationale:** "meal planner" and "shopping list" are the highest-volume anchors. "Potluck" is a long-tail keyword with zero competition from apps. "AI meal plan" captures early-adopter searchers. "Kosher" is niche but completely uncontested.

### Screenshot Sequence Story (5 screenshots)

**Screenshot 1 — The Hook:**
*"Your family's week, all in one place"*
Show the Home dashboard with today's activities, tonight's dinner, and an active shopping list visible simultaneously. This answers "what is this app?" in one glance.

**Screenshot 2 — The Daily Driver:**
*"Plan dinner. Generate the shopping list. Done."*
Show the Meal Plan week view filled with meals, then swipe/arrow to the resulting shopping list sorted by aisle. This demonstrates the end-to-end automation that saves time every week.

**Screenshot 3 — The WOW Feature:**
*"AI builds your meal plan in seconds"*
Show the AI preferences dialog (Kosher + Mediterranean + Quick & Easy selected) → then the generated week plan review screen. Include the "Accept Plan" button. This is the premium value demonstration.

**Screenshot 4 — The Unique Feature:**
*"Potlucks where everyone knows their job"*
Show an Event detail page with the Menu tab: 4 dishes claimed, 2 still open, colorful claim status. Include the "I'll bring it" button. This shows something no competitor has.

**Screenshot 5 — The Social Proof / Trust:**
*"Your family's everything, private and shared"*
Show the Circle member view + Hebrew/RTL interface side-by-side or language toggle (for Israeli market version). Emphasizes privacy, family ownership, and Hebrew support.

---

## 10. Recommended Positioning Statement

**Primary (English-speaking markets):**
> "For busy parents who manage five apps to run their household, Replanish is the family coordination platform that connects meal planning, shopping, events, chores, and kids' activities in one shared space — unlike Cozi which focuses on calendars, or Mealime which stops at dinner, Replanish is the only app where your whole family actually runs together."

**Israeli market:**
> "For Israeli families who've given up on English-only apps, Replanish is the family management platform built natively in Hebrew — with Kosher meal planning, Shabbat-aware scheduling, and real-time shopping lists — unlike anything else on the market, because nothing else was built for you."

---

## 11. Top 3 Marketing Priorities

### Priority 1: Fix the Paywall Before Any Paid Acquisition
**What:** Deploy Stripe integration end-to-end before running a single paid ad or Product Hunt launch. The mock payment flow is a critical trust-killer.
**Why:** Any user who sees "Upgrade to AI Plan" and encounters a fake Stripe form will never return. Organic users will leave negative reviews. All marketing spend is wasted until this is live.
**How:** Deploy `create-checkout` and `stripe-webhook` edge functions. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` in Supabase secrets.

### Priority 2: Lead with the Event Invite Link — Your Best Viral Mechanism
**What:** The `/join-event/:code` flow is the single best viral acquisition tool in the product. A non-user can open an event link, see a beautiful potluck coordination page, and convert without friction.
**How:**
- Ensure the event invite landing page is visually polished and has a clear "Join Replanish to claim your item" CTA
- Create a TikTok/Reel showing the "potluck chaos → Replanish solution" story — this is the most emotionally resonant narrative
- Target Facebook groups for party planning, holiday hosting, Shabbat dinner groups
- Add a "Powered by Replanish" footer to the public event page (opt-out available for paid users) — passive brand awareness at every shared event

### Priority 3: Own the Hebrew/Israeli Market First
**What:** The app has full Hebrew and RTL support, Kosher meal planning, and Israeli cuisine preferences — a combination that makes it completely uncontested in Israel's family app market.
**Why:** No Western competitor serves this market well. This is a defensible beachhead. A dominant position in Israel (a highly tech-savvy, mobile-first market) creates a strong revenue base and a credibility story for English-market expansion.
**How:**
- Publish on Israeli Facebook parenting and cooking groups (opt for organic/community-driven, not ads)
- Submit to Israeli tech blogs (Geektime, Techtime, CTech) with the "first Hebrew-first family app" angle
- Translate the landing page to Hebrew and set up SEO for Hebrew keywords
- Consider a Product Hunt launch specifically timed with a Jewish holiday (Passover Seder planning is a natural use case that writes itself)

---

*End of Marketing Audit*
*This audit reflects the state of the codebase as of April 2026. Re-audit recommended after Stripe integration is live and NLP/meal-plan edge functions are deployed.*

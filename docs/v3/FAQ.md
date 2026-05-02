# Replanish — FAQ (`/faq`)

The 20 questions users actually ask, organized by topic. Designed for the website FAQ page **and** the in-app help drawer — same source of truth.

---

## About the weekly drop

### What is the weekly drop?
Every Sunday at 6 AM ET, Replanish releases a curated menu of **126 recipes**: 10 dinner options + 5 lunches + 3 breakfasts per day for 7 days. It's free for everyone, no login required to browse.

### Where do the recipes come from?
Real food blogs, recipe sites, and verified user submissions. We store the ingredient list (factual data) and link out to the original source for the full instructions, so the chef who wrote the recipe gets the credit and the click. Our full source list lives at [`/sources`](/sources).

### Does the same drop go to everyone?
Yes — one curated drop per week, shared across all users. We didn't go with per-user AI generation because the curated approach is more reliable, more diverse, and free for everyone.

### Why Sunday?
Sunday morning is when most people in the US sit down to plan the week. The drop lands at 6 AM ET so it's ready when you are.

### Do I have to use the drop?
No. The drop is an option, not a requirement. You can plan your week from your own saved recipes, from templates, or by importing from any URL.

---

## About planning your week

### How do I add a recipe to my week?
Drag a card from the drop strip onto a meal slot. Or open a meal slot and tap "Add from my recipes" / "Add from a template" / "Suggest a meal" (paid).

### What's "Quick fill"?
One tap fills your whole week from this week's drop using a deterministic round-robin across diets. Good for "I just want dinners on the calendar without thinking about it."

### Can I plan more than a week ahead?
Yes. Use the week-navigation arrows on the planner. The drop only updates weekly, but your saved recipes and templates work for any week.

### Can multiple people in my household edit the plan?
Yes. Everyone in the same circle sees the same plan in real time. Edits sync across devices.

---

## About shopping lists

### How does the shopping list build?
As you add recipes to your week, their ingredients roll up into your shared shopping list. Items are automatically deduplicated (if two recipes both call for onion, you get one onion entry).

### Can I send the list to Walmart?
Walmart cart export is shipping in v3.1. You'll be able to send your week's groceries to Walmart pickup or delivery in one tap.

### Does the list work offline?
Yes. Shopping lists are offline-first — you can check items off without a signal. They sync when you're back online.

### Is the list shared with my household automatically?
Yes. Everyone in the circle sees the same list in real time. Anyone can add items, check items off, or reorder by store.

---

## About Replanish AI

### What does Replanish AI actually do?
Four things: swap a single meal ("make this dinner vegan"), reroll based on what you already have ("I've got chicken and broccoli"), import any recipe URL with no monthly cap, and consolidate your shopping list into the cheapest cart.

### Does AI plan my whole week?
No. We deliberately don't do that. The weekly drop covers the "what should I eat this week" question for free. AI is for the "this dinner isn't quite right tonight" moment.

### How much does AI cost?
$6/month or $60/year (14-day trial on the annual plan). 4 seats included on annual — share with up to 3 household members.

### Will my AI usage hit a cap?
There's a soft monthly fair-use threshold (~$4 of provider cost). 99% of users never approach it. If you ever hit it, we'll show a meter in your profile and let you know.

---

## About data and privacy

### Where is my data stored?
On Supabase (Postgres + Auth) hosted on AWS US-East. Encrypted at rest and in transit.

### Do you sell my data?
No. We never sell user data. We share aggregated, anonymous metrics with retailer partners (e.g., "30% of US households are planning roast chicken this week") — but never personal account data.

### Can I delete my account?
Yes. Profile → Settings → Delete account. We hard-delete your circles, recipes, plans, lists, and events within 30 days.

### Can I export my data?
Yes — recipes export as JSON, plans export as ICS calendar files. Profile → Settings → Export.

---

## About the company / product

### Is this a startup?
Yes — small team, US-based, family-owned. Started as a Sunday-morning frustration and became the app.

### Is there a mobile app?
The web app is a Progressive Web App — install it from your browser to your home screen and it behaves like a native app. Native iOS and Android wrappers are on the roadmap but not the immediate priority.

### How do I report a bug or ask for a feature?
Email *(insert)* or use the in-app feedback button. We read every message.

### How often does Replanish release updates?
Roughly weekly. The version is shown in your AI chat welcome screen and in Profile → Settings.

### Where can I see what's coming next?
We post the roadmap on [the blog](*/blog*) — coming v3.1 is Walmart cart export; v3.2 adds Instacart and Amazon Fresh; v3.3+ focuses on retailer-partnered features (price comparison, deals).

---

## For content owners

### I run a food blog. How do I get my recipes added?
The cron refresher discovers reputable sources automatically. To explicitly opt in, email *(insert)* with your domain and your sitemap URL. We'll prioritize the next refresher run.

### I run a food blog. How do I get my recipes removed?
Email *(insert)* with the domain and a verifiable point of contact (an email at the domain, or a social account linked from the site). We process opt-outs within 7 days. We respect `robots.txt` and `noindex` automatically — if your site is set to disallow scraping, we never pull from it.

### Do you reproduce my recipe text?
No. We store the ingredient list (factual data) and link to your page for the full instructions. Your traffic, your ad impressions, your credit.

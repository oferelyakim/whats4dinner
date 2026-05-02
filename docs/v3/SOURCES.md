# Replanish — Recipe Sources & Attribution (`/sources`)

## What this page is

Replanish surfaces recipes — we don't author them. The recipes you see in the weekly drop and the recipe bank come from real food blogs and recipe sites whose authors put real work into them. This page exists to be transparent about where the recipes come from, what we store, and how content owners can opt out.

---

## What we store, what we don't

### What we store per recipe
- **Source URL** — a link back to the original page on the author's site.
- **Title** — the recipe's name.
- **Image URL** — the photo from the source page (we hot-link or cache thumbnail size only).
- **Ingredient list** — the list of ingredients, in plain text. Ingredient lists are factual data and are not copyrightable in the United States (per *Feist Publications, Inc. v. Rural Telephone Service Co.*, 499 U.S. 340 (1991)).
- **Tags** — diet (vegan / vegetarian / etc.), cuisine, meal type, prep/cook times, servings.
- **Source domain** — for attribution.

### What we don't store
- **Full instructions** — we either link out to the original page or, on user open, summarize steps in our own words at request time. The original author's prose is not stored in our database.
- **Ad copy, intro stories, personal anecdotes** — these belong to the author and we don't reproduce them.
- **Author bylines or photos** — except as plain attribution text linking back to the source.

---

## How we discover recipes

Three sources, in order of volume:

1. **Curated discovery (cron)** — a periodic background job probes coverage gaps in the bank (e.g., "we need more vegan breakfast options") and uses web search to find reputable recipe pages that fill those gaps. We respect `robots.txt` and `noindex` directives — if your site is set to disallow indexing, we never pull from it.

2. **User imports** — paid Replanish AI users can import recipes from any URL. The auditor strips personal information and tags before promoting the import to the shared bank. Users can't import recipes from sites whose `robots.txt` disallows it.

3. **Manual editorial seed** — at launch and at major version releases, we manually verify a baseline set of recipes for coverage and quality.

---

## How to remove your recipes from the bank

If you're a content owner and you want your domain removed from our recipe bank, email **opt-out@replanish.app** with:

1. **The domain** you control (e.g., `yourblog.com`).
2. **Verification of ownership** — one of the following:
   - An email sent from the domain itself (e.g., from `editor@yourblog.com`).
   - A social media account that's linked from a verified position on your site (e.g., your Twitter handle in your site's footer).
   - An update to your site's `robots.txt` adding `User-agent: ReplanishBot / Disallow: /`.

We process opt-outs within **7 calendar days**. After processing:
- All recipes from your domain are removed from the recipe bank.
- All weekly drops referencing your domain are regenerated.
- Your domain is added to a permanent block list — no future imports from your site, ever.

If you change your mind later, email us again to opt back in.

---

## Source list

> **This list is auto-generated weekly.** Below is a placeholder showing the format. The live page should pull from `SELECT DISTINCT source_domain FROM recipe_bank WHERE retired_at IS NULL ORDER BY source_domain` and render alphabetically with the recipe count.

### Currently active sources

*(auto-generated from the bank)*

| Domain | Recipes in bank | First added | Last updated |
|---|---:|---|---|
| allrecipes.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| bonappetit.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| budgetbytes.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| cooking.nytimes.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| food52.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| foodnetwork.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| seriouseats.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| simplyrecipes.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| smittenkitchen.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| thekitchn.com | XX | YYYY-MM-DD | YYYY-MM-DD |
| ... | ... | ... | ... |

### Sources that have opted out

| Domain | Opted out | Effective date |
|---|---|---|
| *(none)* | | |

---

## Our crawler

If you want to recognize Replanish in your server logs:

```
User-Agent: ReplanishBot/1.0 (+https://replanish.app/sources)
```

We:
- Respect `robots.txt`.
- Respect `noindex` and `nosnippet` meta tags.
- Don't crawl pages with `Disallow` rules in `robots.txt` for our user agent or `*`.
- Send no more than 1 request every 5 seconds to a single domain.
- Cache pages for 7 days; we don't re-fetch unless the cache is stale or invalidated.

---

## Legal posture

Replanish operates on a **link-first** model:
- Ingredient lists (factual data) are stored and used to build shopping lists. *Feist v. Rural* establishes that factual data is not copyrightable.
- Full recipe instructions, prose, and creative content remain with the original author. We don't reproduce them in our database.
- When a user opens a recipe in Replanish, the instructions are either (a) loaded from the source URL on demand, or (b) summarized in our own words by AI at request time. Either way, we don't redistribute the author's text.
- We're not in the business of replacing the original site — we want to send users *to* the source, with full attribution.

If you're a content owner with concerns beyond the opt-out process, email **legal@replanish.app**.

---

## Contact

- **Opt out / opt in**: opt-out@replanish.app
- **Legal**: legal@replanish.app
- **General**: hello@replanish.app

*(Replace email addresses with the actual ones before publishing.)*

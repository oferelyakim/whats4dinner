# Recipe Site Patterns — Research Findings

Based on analysis of 20 major recipe websites (15 English, 5 Hebrew/Israeli).

## JSON-LD Coverage

- **English major sites: 100% have JSON-LD** with `@type: "Recipe"`
- **Hebrew/Israeli sites: ~20-30%** have proper Recipe JSON-LD. Most only have Article/WebPage schema from Yoast SEO.

### Always try JSON-LD first — it's free, instant, and ~99% accurate for English sites.

## Site-by-Site Reference

### English Sites

| Site | Platform | JSON-LD | Recipe Plugin | Key Selectors |
|------|----------|---------|---------------|---------------|
| allrecipes.com | Dotdash Meredith (Mntl) | Yes (@graph) | Custom | `.mntl-structured-ingredients__list-item`, `span[data-ingredient-*]` |
| simplyrecipes.com | Dotdash Meredith | Yes (@graph) | Custom | Same Mntl selectors as allrecipes |
| seriouseats.com | Dotdash Meredith | Yes (@graph) | Custom | Same Mntl selectors |
| foodnetwork.com | Discovery CDN | Yes | Custom | `.o-Ingredients__a-Ingredient`, `.o-Method__m-Step` |
| bbcgoodfood.com | Custom | Yes | Custom | `.recipe-ingredients__list-item`, `.recipe-method__list-item` |
| bonappetit.com | Conde Nast | Yes | Custom | `[data-testid="IngredientList"]`, `[data-testid="InstructionList"]` |
| epicurious.com | Conde Nast | Yes | Custom | Same as Bon Appetit |
| delish.com | Hearst | Yes | Custom | `.ingredient-lists`, `.direction-lists` |
| tasty.co | BuzzFeed (React SPA) | Yes | Custom | JS-rendered, JSON-LD in initial HTML |
| food52.com | Custom | Yes | Custom | `.recipe__list--ingredients`, `.recipe__list--steps` |
| minimalistbaker.com | WordPress | Yes | **WPRM** | `.wprm-recipe-*` classes |
| budgetbytes.com | WordPress | Yes | **WPRM** | `.wprm-recipe-*` classes |
| pinchofyum.com | WordPress | Yes | **Tasty Recipes** | `.tasty-recipes-*` classes |
| cookieandkate.com | WordPress | Yes | **WPRM** | `.wprm-recipe-*` classes |
| skinnytaste.com | WordPress | Yes | **WPRM** | `.wprm-recipe-*` classes |

### Hebrew/Israeli Sites

| Site | Platform | JSON-LD | Notes |
|------|----------|---------|-------|
| foodish.co.il | WordPress | Partial (Article only) | Yoast SEO generates Article schema, not Recipe. Ingredients in plain `<ul>` |
| saloona.co.il | WordPress | No | Blog format. Ingredients after "מצרכים" heading, instructions after "אופן הכנה" |
| 10dakot.co.il | WordPress | Partial | Inconsistent — some pages have recipe cards, others blog-style |
| al-hashulchan.co.il | Custom CMS | Partial | Most professional. Sometimes has Recipe schema. Light CDN protection |
| labriyut.co.il | WordPress | Partial (Article only) | Health-focused. Blog-style with Hebrew headings |

## WordPress Recipe Plugins (Most Common HTML Patterns)

### WP Recipe Maker (WPRM) — ~40% of food blogs
```
Container:     .wprm-recipe-container
Ingredients:   .wprm-recipe-ingredients .wprm-recipe-ingredient
  Quantity:    .wprm-recipe-ingredient-amount
  Unit:        .wprm-recipe-ingredient-unit
  Name:        .wprm-recipe-ingredient-name
  Notes:       .wprm-recipe-ingredient-notes
Instructions:  .wprm-recipe-instructions .wprm-recipe-instruction-text
Servings:      .wprm-recipe-servings
Times:         .wprm-recipe-prep-time-container, .wprm-recipe-cook-time-container
```

### Tasty Recipes — ~15% of food blogs
```
Container:     .tasty-recipes
Ingredients:   .tasty-recipes-ingredients li
Instructions:  .tasty-recipes-instructions li
```

### Mediavine Create — ~15%
```
Container:     .mv-create-card
Ingredients:   .mv-create-ingredients li
Instructions:  .mv-create-instructions li
```

## JSON-LD Quirks to Handle

1. **@graph arrays**: Dotdash Meredith sites wrap everything in `{ "@graph": [...] }` — must iterate to find `@type: "Recipe"`
2. **Multiple JSON-LD blocks**: Some pages have 2-4 `<script type="application/ld+json">` blocks — scan all
3. **Nested in WebPage**: `{ "@type": "WebPage", "mainEntity": { "@type": "Recipe", ... } }`
4. **HowToSection grouping**: Instructions grouped: `{ "@type": "HowToSection", "name": "For the dough", "itemListElement": [...] }`
5. **HTML in text fields**: Some sites include `<b>`, `<a>` tags in instruction text — always strip
6. **Unicode fractions**: `½ ⅓ ¼ ¾ ⅔` instead of 1/2, 1/3, etc. — normalize these
7. **Image format varies**: Can be string URL, array of URLs, or `{ "@type": "ImageObject", "url": "..." }`
8. **recipeYield format varies**: "4 servings", "4", "Makes 6", "6-8 servings"

## Consistently Present JSON-LD Fields (English)
- `name` — always
- `image` — always
- `recipeIngredient` — always (array of strings)
- `recipeInstructions` — always (HowToStep objects or strings)
- `author` — ~95%
- `description` — ~90%
- `prepTime`/`cookTime`/`totalTime` — ~80% (ISO 8601 duration)
- `recipeYield` — ~85%
- `recipeCategory` — ~70%
- `nutrition` — ~60%
- `aggregateRating` — ~75%

## Hebrew Section Headings (for heuristic extraction)

| Section | Hebrew Headings |
|---------|----------------|
| Ingredients | מצרכים, חומרים, רכיבים |
| Instructions | אופן הכנה, הוראות הכנה, הכנה, שלבי ההכנה |
| Notes | הערות, טיפים |
| Servings | מנות, כמות, מספר מנות |
| Prep time | זמן הכנה |
| Cook time | זמן בישול, זמן אפייה |

## Bot Protection Summary

| Level | Sites | Strategy |
|-------|-------|----------|
| None | WordPress blogs, Israeli sites | Standard fetch works |
| Light | bbcgoodfood, delish, foodnetwork | Proper User-Agent header |
| Moderate | allrecipes, bonappetit, epicurious | Chrome User-Agent + Accept headers |
| High (JS required) | tasty.co | JSON-LD still in initial HTML; HTML fallback won't work |

### Recommended Headers
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.5,he;q=0.3
```

## Hebrew Ingredient Patterns

### Unit Words (Singular/Plural)
| English | Singular | Plural |
|---------|----------|--------|
| cup | כוס | כוסות |
| tbsp | כף | כפות |
| tsp | כפית | כפיות |
| gram | גרם | גרם |
| kg | קילו, ק"ג | קילו |
| liter | ליטר | ליטר |
| ml | מ"ל | מ"ל |
| piece | יחידה | יחידות |
| package | חבילה | חבילות |
| can | פחית | פחיות |
| bunch | צרור, אגודה | צרורות |
| clove | שן | שיני |
| slice | פרוסה | פרוסות |
| pinch | קורט, קמצוץ | — |
| a little | מעט | — |
| to taste | לפי הטעם | — |

### Fraction Words
| Value | Hebrew | Notes |
|-------|--------|-------|
| 0.5 | חצי | Most common |
| 0.333 | שליש | |
| 0.25 | רבע | |
| 0.75 | שלושה רבעי | |
| 0.667 | שני שלישים | |
| 1.5 | כוס וחצי | Often merged with unit: "a cup and a half" |

### Common Compound Pattern
"כוס וחצי" (cup and a half = 1.5 cups) — the fraction merges with the unit word. This is more natural in Hebrew than "1.5 כוסות".

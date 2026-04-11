---
name: recipe-extraction
description: "Recipe extraction from URLs and images for OurTable. Covers HTML preprocessing, JSON-LD parsing, prompt engineering for Claude API, ingredient parsing, Hebrew recipe sites, and Edge Function patterns. Use when working on: 'recipe import', 'scrape-recipe', 'recipe extraction', 'ingredient parsing', 'recipe URL', 'recipe photo', 'meal planning AI'."
---

# Recipe Extraction Patterns

AI-powered recipe import from URLs and photos for OurTable.

## Architecture Overview

Two extraction paths, both in `supabase/functions/scrape-recipe/index.ts`:

1. **URL import**: Fetch HTML → try JSON-LD first (free, instant) → fallback to AI extraction
2. **Photo import**: Send image to Claude Haiku → structured JSON output

Client-side service: `src/services/recipeImport.ts` (handles both paths + CORS proxy fallback)

## Extraction Priority (URL Import)

Always follow this order — stop at the first success:

1. **JSON-LD extraction** (schema.org `@type: Recipe`) — ~70% of major recipe sites have this. Parse it directly, no AI needed. Free and 100% reliable.
2. **Microdata extraction** (`itemtype="http://schema.org/Recipe"`) — older format, same structured data.
3. **AI extraction with cleaned HTML** — strip noise, send only recipe-relevant content to Claude.
4. **AI extraction with raw HTML** — last resort if cleaning fails.

## HTML Preprocessing (Critical for AI Quality)

Before sending HTML to Claude, ALWAYS preprocess:

```
1. Extract <main>, <article>, or [role="main"] content — skip nav/header/footer/sidebar
2. Remove: <script>, <style>, <nav>, <footer>, <header>, <aside>, <iframe>, ads divs
3. Remove: social share buttons, comment sections, "you might also like" blocks
4. Remove: inline styles, data-* attributes, class attributes (reduce noise)
5. Keep: headings, paragraphs, lists, images (src only), tables, time elements
6. Result should be ~3-8K chars for a typical recipe (vs 30K+ raw HTML)
```

Common noise selectors to remove:
- `.ad`, `.advertisement`, `.social-share`, `.comments`, `.related-posts`
- `#sidebar`, `#footer`, `#header`, `#nav`
- `[class*="share"]`, `[class*="social"]`, `[class*="comment"]`, `[class*="ad-"]`

## JSON-LD Recipe Schema

The schema.org Recipe type includes these key fields:

```json
{
  "@type": "Recipe",
  "name": "Recipe Title",
  "description": "Brief description",
  "image": "https://...",
  "recipeIngredient": ["1 cup flour", "2 eggs", ...],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Preheat oven..." },
    { "@type": "HowToStep", "text": "Mix ingredients..." }
  ],
  "prepTime": "PT15M",
  "cookTime": "PT30M",
  "totalTime": "PT45M",
  "recipeYield": "4 servings",
  "recipeCategory": "Dinner",
  "recipeCuisine": "Italian",
  "nutrition": { "@type": "NutritionInformation", "calories": "350 calories" }
}
```

### JSON-LD Variations to Handle
- `@graph` wrapper: `{ "@graph": [{ "@type": "Recipe", ... }] }`
- Array of types: `"@type": ["Recipe", "Article"]`
- Nested in WebPage: `{ "@type": "WebPage", "mainEntity": { "@type": "Recipe", ... } }`
- `HowToSection` grouping: instructions grouped by section (e.g., "For the dough", "For the filling")
- String instructions: `recipeInstructions` as a single string instead of array

## Prompt Engineering for Claude API

### System Prompt (use for all recipe extraction)

```
You are a recipe extraction expert. Extract structured recipe data from the provided content.
Rules:
- Extract ALL ingredients with precise quantities and units
- Preserve original language (Hebrew or English)
- Parse fraction quantities (1/2, 3/4) into decimal numbers
- Normalize units to standard forms (tablespoon→tbsp, cup, tsp, g, kg, ml, l, oz, lb)
- For Hebrew: recognize כוס (cup), כף (tbsp), כפית (tsp), גרם (g), קילו (kg), ליטר (l)
- If ingredient has no quantity (e.g., "salt to taste"), set quantity to null
- Instructions should be numbered steps, each on a new line
- If content is unclear or not a recipe, return {"error": "Not a recipe"}
```

### Use Structured Output (Tool Use)

Instead of asking for JSON in a user message and regex-parsing, use Claude's tool_use:

```json
{
  "tools": [{
    "name": "extract_recipe",
    "description": "Extract structured recipe data",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "instructions": { "type": "string", "description": "Step-by-step, each step on new line" },
        "image_url": { "type": ["string", "null"] },
        "prep_time_min": { "type": ["integer", "null"] },
        "cook_time_min": { "type": ["integer", "null"] },
        "servings": { "type": ["integer", "null"] },
        "ingredients": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "quantity": { "type": ["number", "null"] },
              "unit": { "type": "string" }
            },
            "required": ["name"]
          }
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Auto-detected tags: cuisine, diet, meal type"
        }
      },
      "required": ["title", "ingredients"]
    }
  }],
  "tool_choice": { "type": "tool", "name": "extract_recipe" }
}
```

This guarantees valid JSON output — no regex parsing needed.

## Ingredient Parsing

### English Patterns
```
"2 cups all-purpose flour"     → { name: "all-purpose flour", quantity: 2, unit: "cup" }
"1/2 tsp salt"                 → { name: "salt", quantity: 0.5, unit: "tsp" }
"3 large eggs"                 → { name: "large eggs", quantity: 3, unit: "" }
"salt and pepper to taste"     → { name: "salt and pepper", quantity: null, unit: "" }
"1 (14 oz) can diced tomatoes" → { name: "diced tomatoes", quantity: 1, unit: "can" }
```

### Hebrew Patterns
```
"2 כוסות קמח"                  → { name: "קמח", quantity: 2, unit: "cup" }
"כף שמן זית"                   → { name: "שמן זית", quantity: 1, unit: "tbsp" }
"חצי כפית מלח"                  → { name: "מלח", quantity: 0.5, unit: "tsp" }
"200 גרם חזה עוף"              → { name: "חזה עוף", quantity: 200, unit: "g" }
"מלח ופלפל לפי הטעם"            → { name: "מלח ופלפל", quantity: null, unit: "" }
```

### Hebrew Unit Mapping
| Hebrew | Normalized | Notes |
|--------|-----------|-------|
| כוס/כוסות | cup | |
| כף/כפות | tbsp | |
| כפית/כפיות | tsp | |
| גרם | g | |
| קילו/ק"ג | kg | |
| ליטר | l | |
| מ"ל | ml | |
| יחידה/יחידות | piece | |
| חבילה/חבילות | pack | |
| פחית/פחיות | can | |
| חצי | 0.5 | Fraction word |
| שליש | 0.333 | Fraction word |
| רבע | 0.25 | Fraction word |

## Common Ingredients Database

Migration 012 seeds 129 common ingredients with Hebrew names. When importing recipes, match extracted ingredients against this database for autocomplete consistency. See `supabase/migrations/012_fixes_and_ingredients.sql`.

## Image Import Specifics

For photo-based recipe extraction:
- Detect media type from base64 prefix (`/9j/` = JPEG, `iVBOR` = PNG)
- Photos of printed recipes, handwritten recipes, and screenshots all work
- Hebrew text in images requires explicit instruction to preserve Hebrew
- Low-quality or angled photos benefit from telling Claude to "read carefully, the image may be at an angle or partially obscured"
- Cookbook page photos may have two recipes — instruct to extract only the primary/larger one

## Error Handling

- **Not a recipe page**: Return structured error, don't guess
- **Partial extraction**: Return what was found with null fields, let user complete
- **Blocked by CDN/bot protection**: Return specific error so client can try CORS proxy fallback
- **Rate limited by Claude**: Return 429 with retry-after
- **Hebrew encoding issues**: Ensure UTF-8 throughout the chain

## Cost Optimization

- JSON-LD extraction = $0 (no AI call)
- Cleaned HTML (~5K tokens) vs raw HTML (~15K tokens) = ~3x cost reduction
- Photo import is unavoidable AI cost — optimize prompt to minimize output tokens
- Track costs via `_ai_usage` metadata in response → logged to `ai_usage` table

## Reference Files

- `references/site-patterns.md` — Site-by-site JSON-LD presence, WordPress plugin selectors, Hebrew site patterns, bot protection levels
- `references/html-preprocessing.md` — HTML cleaning pipeline, recipe area extraction, WordPress plugin containers, token budget comparison
- `references/prompt-templates.md` — System prompts, tool definitions for structured output, few-shot examples for tricky ingredients (English + Hebrew)

## Testing Recipe Extraction

Test against these categories:
1. Major English sites with JSON-LD (AllRecipes, BBC Good Food)
2. WordPress blogs with WPRM/Tasty Recipes plugins
3. Hebrew recipe sites (Foodish, Saloona, 10Dakot)
4. Photo imports (printed recipes, handwritten, screenshots)
5. Edge cases (multi-recipe pages, very long ingredient lists, unusual units, Unicode fractions)

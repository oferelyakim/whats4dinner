# Prompt Templates for Recipe AI Features

## Recipe Extraction — System Prompt

```
You are a recipe extraction expert for a bilingual (English/Hebrew) cooking application.

Your job is to extract structured recipe data from the provided content (HTML or image).

Rules:
- Extract ALL ingredients with precise quantities and units
- Preserve the original language — do not translate Hebrew to English or vice versa
- Parse fraction quantities: 1/2→0.5, 1/3→0.333, 1/4→0.25, 3/4→0.75, 2/3→0.667
- Parse range quantities: "2-3 cups" → use the lower number (2)
- Parse compound fractions: "1 1/2 cups" → 1.5
- Normalize units to standard abbreviations (see unit list below)
- Separate prep instructions from ingredient name: "1 onion, finely diced" → name: "onion", not "onion, finely diced"
- For ingredients with no quantity (e.g., "salt to taste"), set quantity to null, unit to ""
- Instructions: numbered steps, one per line, no numbering prefix (the app adds numbers)
- If the content is not a recipe, respond with the error tool
- If multiple recipes are present, extract the primary/largest one only

Standard units: cup, tbsp, tsp, oz, lb, g, kg, ml, l, piece, can, pack, bunch, clove
Hebrew units: כוס→cup, כף→tbsp, כפית→tsp, גרם→g, קילו/ק"ג→kg, ליטר→l, מ"ל→ml
Hebrew fractions: חצי→0.5, שליש→0.333, רבע→0.25
```

## Tool Definition for Structured Output

```json
{
  "name": "extract_recipe",
  "description": "Extract structured recipe data from content",
  "input_schema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Recipe name in its original language"
      },
      "description": {
        "type": "string",
        "description": "Brief 1-2 sentence description"
      },
      "instructions": {
        "type": "string",
        "description": "Step-by-step cooking instructions, each step on a new line"
      },
      "image_url": {
        "type": ["string", "null"],
        "description": "URL of the recipe's main image, or null"
      },
      "prep_time_min": {
        "type": ["integer", "null"],
        "description": "Preparation time in minutes"
      },
      "cook_time_min": {
        "type": ["integer", "null"],
        "description": "Cooking time in minutes"
      },
      "servings": {
        "type": ["integer", "null"],
        "description": "Number of servings"
      },
      "ingredients": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Ingredient name without quantity/unit/prep instructions"
            },
            "quantity": {
              "type": ["number", "null"],
              "description": "Numeric quantity, null if unspecified (e.g. 'to taste')"
            },
            "unit": {
              "type": "string",
              "description": "Normalized unit abbreviation, empty string if unitless"
            }
          },
          "required": ["name", "quantity", "unit"]
        }
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Auto-detected: cuisine type, dietary info, meal type (e.g. 'italian', 'vegetarian', 'dinner', 'quick')"
      },
      "source_language": {
        "type": "string",
        "enum": ["en", "he", "other"],
        "description": "Detected language of the recipe"
      }
    },
    "required": ["title", "ingredients"]
  }
}
```

## Error Tool Definition

```json
{
  "name": "report_error",
  "description": "Report that recipe extraction failed",
  "input_schema": {
    "type": "object",
    "properties": {
      "error": {
        "type": "string",
        "description": "What went wrong"
      },
      "reason": {
        "type": "string",
        "enum": ["not_a_recipe", "content_too_unclear", "multiple_recipes_ambiguous", "language_unsupported", "image_unreadable"]
      }
    },
    "required": ["error", "reason"]
  }
}
```

## Meal Plan Generation — System Prompt

```
You are a family meal planning assistant for OurTable, a household coordination app.

Context:
- You're planning meals for a family/household circle
- You have access to their saved recipe collection
- Consider Israeli/Middle Eastern cuisine preferences (this is an Israeli-focused app)
- Balance nutrition, variety, and practicality across the week

Rules:
- Prefer recipes from the family's saved collection (use exact recipe_id when available)
- For new suggestions, set recipe_id to null — the family can add them later
- Vary cuisines across the week
- Weekday dinners should be quick (under 45 min total time)
- Weekend meals can be more elaborate
- Don't repeat the same protein source on consecutive days
- Consider seasonal availability (provide current month for context)
- Account for stated dietary restrictions or preferences
- If the family has very few saved recipes, supplement with popular family-friendly suggestions
```

## Meal Plan Tool Definition

```json
{
  "name": "generate_meal_plan",
  "description": "Generate a weekly meal plan for a family",
  "input_schema": {
    "type": "object",
    "properties": {
      "meals": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "date": { "type": "string", "description": "YYYY-MM-DD" },
            "meal_type": { "type": "string", "enum": ["breakfast", "lunch", "dinner"] },
            "recipe_title": { "type": "string" },
            "recipe_id": { "type": ["string", "null"], "description": "UUID if from saved recipes, null if suggested" },
            "quick_description": { "type": "string", "description": "One line: why this meal for this slot" },
            "estimated_time_min": { "type": "integer" }
          },
          "required": ["date", "meal_type", "recipe_title"]
        }
      },
      "shopping_suggestions": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Key ingredients to buy for the week's plan"
      },
      "notes": {
        "type": "string",
        "description": "Tips like meal prep suggestions, batch cooking opportunities"
      }
    },
    "required": ["meals"]
  }
}
```

## Few-Shot Examples for Tricky Ingredients

Include these in the system prompt or as examples when extraction quality is poor:

### English
```
Input: "1 (14.5 oz) can diced tomatoes, drained"
Output: { "name": "diced tomatoes", "quantity": 1, "unit": "can" }

Input: "2-3 tablespoons olive oil"
Output: { "name": "olive oil", "quantity": 2, "unit": "tbsp" }

Input: "1 1/2 cups all-purpose flour, sifted"
Output: { "name": "all-purpose flour", "quantity": 1.5, "unit": "cup" }

Input: "Kosher salt and freshly ground black pepper"
Output: { "name": "kosher salt and black pepper", "quantity": null, "unit": "" }

Input: "4 boneless, skinless chicken breasts (about 1.5 lbs)"
Output: { "name": "chicken breasts", "quantity": 4, "unit": "piece" }
```

### Hebrew
```
Input: "2 כוסות קמח לבן"
Output: { "name": "קמח לבן", "quantity": 2, "unit": "cup" }

Input: "כף וחצי שמן זית"
Output: { "name": "שמן זית", "quantity": 1.5, "unit": "tbsp" }

Input: "חצי כפית כורכום"
Output: { "name": "כורכום", "quantity": 0.5, "unit": "tsp" }

Input: "200 גרם גבינה צהובה מגורדת"
Output: { "name": "גבינה צהובה", "quantity": 200, "unit": "g" }

Input: "מלח ופלפל לפי הטעם"
Output: { "name": "מלח ופלפל", "quantity": null, "unit": "" }

Input: "3 שיני שום כתושות"
Output: { "name": "שום", "quantity": 3, "unit": "clove" }

Input: "חבילת פטרוזיליה קצוצה"
Output: { "name": "פטרוזיליה", "quantity": 1, "unit": "bunch" }
```

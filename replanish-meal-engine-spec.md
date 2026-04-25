# Replanish — Meal Planning Engine Rewrite

## Goal

Replace the current monolithic AI meal-planning flow with a structured, slot-based engine. Code owns all state and operations; AI is used only for narrow, structured decisions with strict JSON schemas.

## Bugs this rewrite fixes

- "Replace dish" returns to same screen with no change + spurious "rephrase or close and start again" error
- "Use my template for N nights" silently doesn't apply
- Saved recipe pages fail to load when reopened

**Root cause:** the plan is treated as one AI-generated blob; everything is "regenerate-and-pray." AI is asked to interpret structured operations (like applying a template) that should be deterministic data copies. AI responses are parsed as free text, so silent JSON failures fall through as no-ops.

## Tech stack

- Vite + React + TypeScript (existing project)
- Anthropic SDK (`@anthropic-ai/sdk`) — Claude with tool use / structured JSON output
- Dexie.js over IndexedDB for local-first storage
- zod for runtime schema validation
- vite-plugin-pwa for service worker / offline
- Tailwind (adapt to existing styling system if different)

### Backend / proxy requirements (important)

Anthropic API and arbitrary recipe-site fetches both have CORS/auth constraints that prevent direct browser calls in production. Build a thin serverless layer (Vercel/Netlify/Cloudflare functions, or whatever the project already uses) exposing:

- `POST /api/ai` — proxies to Anthropic with the API key server-side
- `POST /api/web-search` — runs a web search (Brave Search API, SerpAPI, or similar) and returns URLs
- `POST /api/fetch-recipe` — fetches a URL server-side, returns HTML

The client never holds the Anthropic key and never directly fetches third-party recipe sites. Engine code calls these endpoints.

## Hierarchy

```
Plan → Day → Meal → Slot → Recipe
```

A meal's slot list is fully generic. No fixed structure. Tapas night = 5 tapas slots. Mixed-mains dinner = 3 main slots with protein constraints + 3 starch + 5 veg. Standard dinner = main + veg_side + starch_side. All the same primitive.

## Data model

```ts
// All IDs use crypto.randomUUID()

export interface MealPlan {
  id: string;
  weekStart: string;        // ISO date
  days: Day[];
  createdAt: number;
  updatedAt: number;
}

export interface Day {
  id: string;
  planId: string;
  date: string;             // ISO date
  theme?: string;           // e.g. "Mexican", "comfort food"
  meals: Meal[];
}

export interface Meal {
  id: string;
  dayId: string;
  type: string;             // free-form: "breakfast" | "lunch" | "dinner" | "snack" | user-defined
  presetId?: string;        // which preset seeded this meal, if any
  slots: Slot[];
}

export type SlotStatus =
  | 'empty'
  | 'generating_ingredient'
  | 'ingredient_chosen'
  | 'generating_dish'
  | 'dish_named'
  | 'fetching_recipe'
  | 'recipe_fetched'
  | 'ready'
  | 'error';

export interface Slot {
  id: string;
  mealId: string;
  role: string;             // free-form: "main" | "veg_side" | "starch_side" | "tapas" | etc.
  status: SlotStatus;
  ingredient?: string;
  dishName?: string;
  searchKeywords?: string[];
  recipeId?: string;
  locked: boolean;
  notes?: string;           // user constraints: "gluten-free", "use leftover rice", "chicken protein"
  errorMessage?: string;
  errorStage?: 'ingredient' | 'dish' | 'recipe';
  updatedAt: number;
}

export interface Recipe {
  id: string;
  source: 'web' | 'ai-fallback';
  url?: string;
  sourceDomain?: string;
  title: string;
  ingredients: { item: string; quantity?: string }[];
  steps: string[];
  prepTimeMin?: number;
  cookTimeMin?: number;
  servings?: number;
  imageUrl?: string;
  fetchedAt: number;
}

export interface Preset {
  id: string;
  name: string;
  scope: 'meal' | 'day';
  source: 'system' | 'user';
  // For scope='meal': slots defines the meal shape
  slots?: PresetSlot[];
  // For scope='day': mealShapes defines a list of meals each with their slots
  mealShapes?: { type: string; slots: PresetSlot[] }[];
  createdAt: number;
}

export interface PresetSlot {
  role: string;
  dishName?: string;        // if filled, applying preset locks in this dish
  recipeId?: string;        // if filled, recipe is reused as-is
  notes?: string;
}

export interface MealType {
  id: string;
  name: string;             // "breakfast", "tapas night", etc.
  defaultPresetId?: string;
  isUserCreated: boolean;
}

export interface UserPreferences {
  dietaryConstraints: string[];   // e.g. ["gluten-free", "no pork"]
  pantryItems: string[];
  dislikedIngredients: string[];
  recentDishesWindow: number;     // days to consider for "don't repeat" — default 14
}
```

## Slot state machine

Each slot moves through states **independently**:

```
empty
  ↓ Stage A: pick ingredient (AI)
ingredient_chosen
  ↓ Stage B: name dish + keywords (AI)
dish_named
  ↓ Stage C: search + parse + rank recipe (code + AI)
recipe_fetched
  ↓ validation
ready
```

Any stage can fail → `status='error'` with `errorMessage` and `errorStage`. User retries from the failed stage; earlier completed work is preserved.

`generateSlot()` is **idempotent**: it inspects current status and runs only the remaining stages. Calling it on a `dish_named` slot runs only Stage C. Calling it on `ready` is a no-op.

Locked slots are never regenerated by bulk operations. Replacing a locked slot unlocks it, resets to empty, and re-runs the full pipeline.

## Architecture: code vs AI

### Code (deterministic, no AI calls)

- All CRUD on Plan/Day/Meal/Slot/Preset/Recipe
- `applyPreset(presetId, targets)` — **pure data copy**, no AI. This is the explicit fix for the template bug.
- `replaceSlot(slotId, hint?)` — resets the slot, optionally records hint into notes, runs pipeline for that slot only
- Web search request, HTTP fetching, retry/timeout logic
- JSON-LD Recipe schema parsing (most major recipe sites publish `<script type="application/ld+json">` with `@type: Recipe`)
- Recipe persistence in Dexie. Reopening a meal reads from Dexie — **never re-fetches**. This is the explicit fix for "menus failed to load."
- Schema validation (zod) of every AI tool-use response. Validation failure → slot `error`, not silent fall-through.
- Per-slot loading/error state. A failure in slot X never affects slot Y.

### AI (only via tool_use with strict input_schema)

Use Anthropic's tool_use feature. Define each stage as a tool with a JSON schema; the model fills the schema. Validate with zod on receipt. **Never** parse free-form text.

**Stage A — Pick ingredient**

```ts
input: {
  mealType: string;
  slotRole: string;
  theme?: string;
  dietaryConstraints: string[];
  pantryItems: string[];
  dislikedIngredients: string[];
  recentDishes: string[];      // dish names from last N days, to avoid repetition
  notes?: string;              // slot-level constraint, e.g. "chicken", "gluten-free"
  siblingSlots: { role: string; ingredient?: string }[];  // so picks complement each other
}
output_schema: {
  ingredient: string;
  rationale: string;
}
```

**Stage B — Name dish + search keywords**

```ts
input: {
  mealType: string;
  slotRole: string;
  ingredient: string;
  theme?: string;
  dietaryConstraints: string[];
  notes?: string;
}
output_schema: {
  dishName: string;
  searchKeywords: string[];    // 2-5 items, ordered most-specific first
}
```

**Stage C-rank — Pick best recipe candidate**

```ts
input: {
  dishName: string;
  candidates: {
    title: string;
    url: string;
    domain: string;
    snippet: string;
    hasJsonLd: boolean;
  }[];
}
output_schema: {
  bestIndex: number;
  reason: string;
}
```

**Stage D — Fallback recipe extraction (only if no JSON-LD found anywhere)**

```ts
input: {
  url: string;
  htmlContent: string;         // truncated to ~30k chars, main-content extracted
}
output_schema: Recipe shape (without id, source, fetchedAt)
```

## Recipe fetching pipeline (Stage C)

For a slot in `dish_named` state:

1. Build search query from `searchKeywords[0]`. If results are weak, broaden with subsequent keywords.
2. Call `/api/web-search` → top 8 results.
3. Filter to recipe-likely domains (heuristic: domain contains "recipe"/"food"/"cook"/"kitchen", or is on a known whitelist that grows over time). Cap at 5 candidates.
4. For each candidate (parallel): call `/api/fetch-recipe`, parse `<script type="application/ld+json">` for `@type: Recipe` (handle `@graph` arrays).
5. **If 2+ candidates have valid JSON-LD:** Stage C-rank picks best.
6. **If 1 candidate has JSON-LD:** use it directly, skip Stage C-rank.
7. **If 0 candidates have JSON-LD:** pick highest-quality candidate by domain reputation, send full HTML to Stage D.
8. Persist `Recipe` in Dexie with `source: 'web'` (or `'ai-fallback'`), `sourceDomain`, `url`, `fetchedAt`.
9. Any unrecoverable failure → slot status `error`, `errorStage: 'recipe'`, with retry button in UI.

## Engine API

```ts
class MealPlanEngine {
  // ---- Plan operations ----
  createPlan(weekStart: string): Promise<MealPlan>;
  getPlan(id: string): Promise<MealPlan>;
  deletePlan(id: string): Promise<void>;

  // ---- Day operations ----
  addDay(planId: string, date: string): Promise<Day>;
  setDayTheme(dayId: string, theme: string): Promise<void>;
  removeDay(dayId: string): Promise<void>;

  // ---- Meal operations ----
  addMeal(dayId: string, type: string, presetId?: string): Promise<Meal>;
  removeMeal(mealId: string): Promise<void>;
  setMealType(mealId: string, type: string): Promise<void>;

  // ---- Slot operations ----
  addSlot(mealId: string, role: string, notes?: string): Promise<Slot>;
  removeSlot(slotId: string): Promise<void>;
  updateSlotNotes(slotId: string, notes: string): Promise<void>;
  lockSlot(slotId: string): Promise<void>;
  unlockSlot(slotId: string): Promise<void>;
  reorderSlots(mealId: string, slotIds: string[]): Promise<void>;

  // ---- Generation (runs the pipeline) ----
  generateSlot(slotId: string): Promise<Slot>;                // idempotent, resumes from current status
  replaceSlot(slotId: string, hint?: string): Promise<Slot>;  // resets slot; if locked, also unlocks
  generateMeal(mealId: string): Promise<Meal>;                // generateSlot in parallel for all empty/error/non-locked slots
  generateDay(dayId: string): Promise<Day>;
  generatePlan(planId: string): Promise<MealPlan>;

  // ---- Presets / templates (PURE DATA COPY, NO AI) ----
  applyPreset(
    presetId: string,
    target:
      | { mealId: string }
      | { mealIds: string[] }
      | { dayId: string }
      | { dayIds: string[] }
  ): Promise<void>;
  saveMealAsPreset(mealId: string, name: string): Promise<Preset>;
  saveDayAsPreset(dayId: string, name: string): Promise<Preset>;
  listPresets(scope?: 'meal' | 'day'): Promise<Preset[]>;
  deletePreset(id: string): Promise<void>;

  // ---- Events ----
  on(event: 'slot:updated', handler: (slot: Slot) => void): () => void;
  on(event: 'meal:updated', handler: (meal: Meal) => void): () => void;
  on(event: 'plan:updated', handler: (plan: MealPlan) => void): () => void;
}
```

The engine emits events as state changes. React components subscribe at the granularity they care about (slot card → `slot:updated` for its own slot only). This is what makes per-slot loading/error states actually work.

## Seeded presets

Ship on first launch as `source: 'system'`. Read-only but duplicable.

**Meal-scoped:**
- "Standard dinner" → `[main, veg_side, starch_side]`
- "Simple breakfast" → `[main]`
- "Big breakfast" → `[main, side, drink]`
- "Snack" → `[main]`
- "Tapas night" → `[tapas, tapas, tapas, tapas, tapas]`
- "Mixed mains dinner" → `[main(notes:"chicken"), main(notes:"beef"), main(notes:"vegetarian"), starch_side, starch_side, starch_side, veg_side, veg_side, veg_side, veg_side, veg_side]`
- "Soup & salad" → `[soup, salad, bread]`
- "Pasta night" → `[main, salad, bread]`

**Day-scoped:**
- "Standard day" → simple breakfast + lunch (main+side) + standard dinner
- "Light day" → simple breakfast + snack + soup & salad

## UI requirements (the part that fixes the broken UX)

1. **Slot cards are autonomous.** Each renders its own status: empty placeholder, ingredient picked, dish named with thumbnail, full recipe with image, or error with retry button + plain-language error. Subscribes only to its own `slot:updated` event. Other slots' work doesn't affect rendering.

2. **Replace flow.** Replace button → small input ("anything to change? optional, e.g. 'less spicy', 'use chicken instead'") → calls `replaceSlot(slotId, hint)`. The slot card immediately shows generating state inline. **No modal blocking the rest of the meal.** If it errors, the slot shows the error inline with retry — never a "close this and start over" message.

3. **Apply preset flow.** Picker shows meal- or day-scoped presets (filtered by what target makes sense). User selects targets — one meal, multiple meals, one day, multiple days, all checkbox-selectable. Code calls `applyPreset` once with the array. Slots populate **instantly** (data copy is sync). Generation for unfilled slots kicks off in parallel. **No AI call is needed for preset application itself.**

4. **Recipe persistence.** Tapping a `ready` slot opens recipe view, read from Dexie. **NEVER re-fetched.** Show "saved from {domain}" or "AI-generated" badge. If the recipeId points at a missing recipe, show explicit error state with option to regenerate — never silently fail.

5. **Per-slot retry resumes from failed stage.** If Stage A failed → retry runs A. If Stage C failed → retry runs C without re-picking ingredient or dish.

6. **Optimistic / progressive rendering.** When generating a meal, render all slots immediately as skeletons. Each fills in as its pipeline completes. User sees motion, not a frozen modal.

7. **Lock indicator + behavior.** Locked slots show a lock icon. `generateMeal/Day/Plan` skips them automatically. `replaceSlot` on a locked slot unlocks it first.

## File structure

```
src/
  db/
    schema.ts              // Dexie tables + version
    queries.ts             // typed query helpers
  engine/
    MealPlanEngine.ts
    events.ts              // typed event bus
    pipeline/
      generateIngredient.ts  // Stage A
      generateDish.ts        // Stage B
      fetchRecipe.ts         // Stage C orchestrator
      extractJsonLd.ts       // JSON-LD Recipe parser
      extractWithAi.ts       // Stage D fallback
  ai/
    client.ts              // wrapper around /api/ai
    schemas.ts             // zod schemas for all stages
    tools.ts               // Anthropic tool definitions
  recipes/
    search.ts              // wrapper around /api/web-search
    fetch.ts               // wrapper around /api/fetch-recipe
    domainHeuristics.ts    // recipe-site filtering
  presets/
    seeded.ts              // ship-with presets array
    seedOnFirstRun.ts
  components/
    SlotCard.tsx           // all slot states in one component
    MealCard.tsx
    DayView.tsx
    PlanView.tsx
    PresetPicker.tsx
    ReplaceSlotDialog.tsx
    RecipeView.tsx
  hooks/
    useEngine.ts           // singleton accessor
    useSlot.ts             // subscribes to slot events for one slot
    useMeal.ts
    usePlan.ts
  types.ts
api/
  ai.ts                    // Anthropic proxy
  web-search.ts            // search proxy
  fetch-recipe.ts          // recipe URL fetcher
```

## Build order

1. Types + Dexie schema + seeded presets data + first-run seeding
2. Engine skeleton with all CRUD methods (no AI yet) + event bus
3. Verify `applyPreset` works as pure data copy with Vitest tests
4. AI client (server proxy first, then client wrapper) + zod schemas + Stages A and B
5. Web search proxy + recipe fetch proxy + JSON-LD parser + Stage C
6. Stage D fallback extraction
7. `generateSlot` wiring stages together with idempotent state machine
8. React components: SlotCard with all states first, then up the hierarchy
9. Replace flow + apply-preset flow
10. PWA service worker + offline recipe view
11. Migration from existing data structures (if any)

## Acceptance tests (Vitest)

Write these alongside each step:

- `applyPreset` to 2 meals copies slots into both, idempotently, with **zero AI calls** (mock and assert)
- `replaceSlot` resets only that slot's state, runs the pipeline, doesn't touch siblings
- `generateSlot` is idempotent: calling on `dish_named` slot only invokes Stage C
- Stage C with 0 JSON-LD candidates falls through to Stage D
- Recipe persistence: simulate page reload, re-read meal, recipes load from Dexie with no network calls
- A failing Stage A on slot X does not change status of slot Y in same meal
- Locked slots are skipped by `generateMeal`/`generateDay`/`generatePlan`
- AI tool response failing zod validation → slot status becomes `error` with descriptive message, no silent fall-through

## Non-goals (explicitly out of scope for this rewrite)

- Backend sync / multi-device
- Shopping list generation
- Nutrition data
- Sharing plans publicly
- Calendar export
- Cost estimation

Get the engine and slot-level UX rock-solid first.

## Notes for the implementer

- The single most important invariant: **AI is never on the critical path for deterministic operations.** Applying a template is data copy. Locking a slot is a flag flip. Reordering is array manipulation. If you find yourself wanting to ask the model to "interpret" a user action, stop — that's the bug being rewritten.
- The second most important invariant: **slots are isolated.** Every loading state, every error, every retry is scoped to one slot. The frozen-modal-with-spurious-error UX exists because the current code couples them.
- When in doubt about whether something is code or AI work: if the same input must always produce the same output, it's code.

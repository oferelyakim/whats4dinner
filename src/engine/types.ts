// Meal-planning engine types. See replanish-meal-engine-spec.md.

export interface MealPlan {
  id: string
  weekStart: string
  createdAt: number
  updatedAt: number
}

export interface Day {
  id: string
  planId: string
  date: string
  theme?: string
  position: number
}

export interface Meal {
  id: string
  dayId: string
  type: string
  presetId?: string
  position: number
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
  | 'error'
  /**
   * v1.16.0: a stage hit a true Anthropic 429 after retries.
   * Slot keeps its prior outputs (ingredient/dish if those stages succeeded)
   * and the watchdog auto-resumes after the retry-after delay.
   */
  | 'error_rate_limited'
  /**
   * v2.0.0: link-first bank hit. Slot carries metadata only (dishName,
   * sourceUrl, mainIngredient, secondaryIngredients, dietaryTags, cuisineId,
   * prepTimeMin, calories?) in `linkData`. The full recipe (ingredients +
   * steps) is fetched lazily on first user-open and cached in Dexie, then
   * the slot flips to `ready`. Composed legacy bank rows hydrate from
   * `composed_payload` instead of the network — same `link_ready → ready`
   * flow, no fetch.
   */
  | 'link_ready'

export type ErrorStage = 'ingredient' | 'dish' | 'recipe'

export interface Slot {
  id: string
  mealId: string
  role: string
  status: SlotStatus
  ingredient?: string
  dishName?: string
  searchKeywords?: string[]
  recipeId?: string
  locked: boolean
  notes?: string
  /** One-shot user hint applied to the next generation cycle, then cleared on `ready`. */
  replaceHint?: string
  /** Snapshot of the variety envelope used for this slot's last generation. */
  envelope?: SlotEnvelopeSnapshot
  errorMessage?: string
  errorStage?: ErrorStage
  position: number
  updatedAt: number
  /** When the current generating_* state began — used by the watchdog. */
  generatingStartedAt?: number
  /**
   * v2.0.0: present when status is `link_ready`. The slot has a bank-source
   * link + sparse metadata; the full Recipe (ingredients + steps) is fetched
   * lazily on first user-open. Cleared when the slot flips to `ready` and
   * `recipeId` becomes the canonical pointer.
   */
  linkData?: SlotLinkData
}

/**
 * v2.0.0 — link-first slot payload. Stored on the Slot row directly so the
 * planner is offline-readable (no Dexie Recipe row materialized yet). On
 * first user-open the engine fetches the URL via the existing `find-recipe`
 * / `extract` ops (or hydrates from `composedPayload` when source='composed'),
 * caches a Recipe row in Dexie, and flips the slot to `ready`.
 */
export interface SlotLinkData {
  /** The bank row id — used by `bump_recipe_bank_served` after first open. */
  bankId: string
  /** Source-of-truth for hydration: 'web' | 'user_import' fetch the URL,
   *  'composed' uses `composedPayload`, 'community' is forward-compat. */
  source: 'web' | 'user_import' | 'composed' | 'community'
  /** External recipe URL — present for web/user_import. */
  sourceUrl?: string
  sourceDomain?: string
  imageUrl?: string
  mainIngredient: string
  secondaryIngredients: string[]
  dietaryTags: string[]
  cuisineId: string
  proteinFamily?: string
  prepTimeMin?: number
  cookTimeMin?: number
  servings?: number
  /** Legacy composed-row archive — populated when source='composed'. The
   *  hydrator builds a Recipe from this jsonb without a network fetch. */
  composedPayload?: {
    ingredients: { item: string; quantity?: string }[]
    steps: string[]
    totalTimeMin?: number
  }
}

export interface SlotEnvelopeSnapshot {
  cuisineId: string
  cuisineLabel: string
  cuisineRegion: string
  proteinName?: string
  proteinFamily?: string
  styleId: string
  styleLabel: string
  flavorId: string
  flavorLabel: string
}

/** Cross-plan history of generated dishes — drives anti-repeat across the user's lifetime. */
export interface DishHistoryEntry {
  id: string
  slotId: string
  planId: string
  dishName: string
  ingredient?: string
  proteinName?: string
  proteinFamily?: string
  cuisineId: string
  styleId: string
  flavorId: string
  plannedAt: number
  eaten?: boolean
}

export interface RecipeIngredient {
  item: string
  quantity?: string
}

export interface Recipe {
  id: string
  /**
   * - `web`: extracted from a real recipe page (JSON-LD or AI extraction).
   * - `ai-fallback`: legacy v3 value — kept for backwards-compat with rows in Dexie.
   * - `composed`: v1.16.0 — Sonnet-composed fallback when web search yields nothing.
   *   UI surfaces a "Composed by AI" badge for this source.
   */
  source: 'web' | 'ai-fallback' | 'composed'
  url?: string
  sourceDomain?: string
  title: string
  ingredients: RecipeIngredient[]
  steps: string[]
  prepTimeMin?: number
  cookTimeMin?: number
  servings?: number
  imageUrl?: string
  fetchedAt: number
}

export interface PresetSlot {
  role: string
  dishName?: string
  recipeId?: string
  notes?: string
  /**
   * v2.1.0 — explicit cuisine constraint. When set, `tryFillSlotFromBank`
   * passes this directly to `sample-from-bank` instead of relying on
   * fragile `parseUserHint(notes)` token matching. Theme presets like
   * Pasta Wednesday set this to `'italian'` so the bank query never
   * returns a German dish.
   */
  cuisineId?: string
}

export interface Preset {
  id: string
  name: string
  scope: 'meal' | 'day'
  source: 'system' | 'user'
  slots?: PresetSlot[]
  mealShapes?: { type: string; slots: PresetSlot[] }[]
  createdAt: number
}

export interface MealType {
  id: string
  name: string
  defaultPresetId?: string
  isUserCreated: boolean
}

export interface UserPreferences {
  id: 'singleton'
  dietaryConstraints: string[]
  pantryItems: string[]
  dislikedIngredients: string[]
  recentDishesWindow: number
}

// Hydrated views (engine helpers return these)
export interface MealView extends Meal {
  slots: Slot[]
}
export interface DayView extends Day {
  meals: MealView[]
}
export interface PlanView extends MealPlan {
  days: DayView[]
}

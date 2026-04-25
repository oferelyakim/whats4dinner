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
  errorMessage?: string
  errorStage?: ErrorStage
  position: number
  updatedAt: number
}

export interface RecipeIngredient {
  item: string
  quantity?: string
}

export interface Recipe {
  id: string
  source: 'web' | 'ai-fallback'
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

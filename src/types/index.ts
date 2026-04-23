import type { CircleRole, Department, ListPermission, MealType, RequestStatus, Unit } from '@/lib/constants'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  email: string
  preferences: {
    theme: 'dark' | 'light' | 'system'
    default_store_id?: string
  }
  has_onboarded?: boolean
  created_at: string
  updated_at: string
}

export interface Circle {
  id: string
  name: string
  description: string | null
  icon: string
  created_by: string
  invite_code: string
  created_at: string
  updated_at: string
}

export interface CircleMember {
  circle_id: string
  user_id: string
  role: CircleRole
  joined_at: string
  profile?: Profile
}

export interface Item {
  id: string
  name: string
  category: Department
  default_unit: Unit
  created_by: string
  circle_id: string | null
  created_at: string
}

export interface Recipe {
  id: string
  type: 'recipe' | 'supply_kit'
  title: string
  description: string | null
  instructions: string | null
  source_url: string | null
  image_url: string | null
  prep_time_min: number | null
  cook_time_min: number | null
  servings: number | null
  tags: string[]
  kit_category: string | null
  created_by: string
  circle_id: string | null
  created_at: string
  updated_at: string
  ingredients?: RecipeIngredient[]
}

export interface RecipeIngredient {
  id: string
  recipe_id: string
  item_id: string | null
  name: string
  quantity: number | null
  unit: Unit
  sort_order: number
  notes: string | null
}

export interface MealMenu {
  id: string
  name: string
  description: string | null
  created_by: string
  circle_id: string | null
  created_at: string
  updated_at: string
  recipes?: Recipe[]
}

export interface MealPlan {
  id: string
  circle_id: string
  plan_date: string
  meal_type: MealType
  menu_id: string | null
  recipe_id: string | null
  notes: string | null
  created_by: string
  recipe?: Recipe
  menu?: MealMenu
}

export interface ShoppingList {
  id: string
  name: string
  circle_id: string
  store_id: string | null
  status: 'active' | 'completed' | 'archived'
  created_by: string
  created_at: string
  updated_at: string
  items?: ShoppingListItem[]
  item_count?: number
  checked_count?: number
}

export interface ShoppingListAccess {
  list_id: string
  user_id: string
  permission: ListPermission
}

export interface ShoppingListItem {
  id: string
  list_id: string
  item_id: string | null
  recipe_id: string | null
  menu_id: string | null
  name: string
  quantity: number | null
  unit: Unit
  category: Department
  is_checked: boolean
  checked_by: string | null
  sort_order: number
  notes: string | null
  added_by: string
  created_at: string
}

export interface Store {
  id: string
  name: string
  address: string | null
  created_by: string
  circle_id: string | null
  created_at: string
}

export interface StoreRoute {
  id: string
  store_id: string
  department: Department
  sort_order: number
  aisle_hint: string | null
}

export interface ItemRequest {
  id: string
  list_id: string
  requested_by: string
  item_name: string
  quantity: number | null
  unit: Unit
  recipe_id: string | null
  status: RequestStatus
  reviewed_by: string | null
  created_at: string
  profile?: Profile
}

export type SubscriptionPlan = 'free' | 'ai_individual' | 'ai_family'
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired'
export type AIActionType = 'recipe_import_url' | 'recipe_import_photo' | 'meal_plan' | 'meal_plan_edit' | 'nlp_action' | 'chat' | 'chat_recipe_import' | 'event_plan' | 'event_plan_refine'

export interface Subscription {
  id: string
  user_id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  current_period_start: string
  current_period_end: string
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
}

export interface AIUsage {
  id: string
  user_id: string
  action_type: AIActionType
  api_cost_usd: number
  model_used: string
  tokens_in: number
  tokens_out: number
  period_start: string
  created_at: string
  session_id?: string
  feature_context?: string
  scope?: string
}

// Grocer integrations
export type GrocerProviderName = 'kroger' | 'walmart' | 'instacart'

export interface GrocerConnectionRow {
  id: string
  user_id: string
  provider: GrocerProviderName
  /** Encrypted on server; not returned to client */
  expires_at: string
  store_id: string | null
  store_name: string | null
  store_zip: string | null
  created_at: string
  updated_at: string
}

export interface ListGrocerLink {
  list_id: string
  provider: GrocerProviderName
  store_id: string
  store_name: string | null
  updated_at: string
}

export interface GrocerProduct {
  id: string
  name: string
  brand?: string
  price_cents?: number
  unit_size?: string
  image_url?: string
  available: boolean
}

export interface CartResult {
  success: boolean
  items_added: number
  items_failed: string[]
  cart_url: string | null
}

export interface GrocerFlag {
  enabled: boolean
  enabled_for_user_ids: string[]
}

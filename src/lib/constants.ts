export const DEPARTMENTS = [
  'Produce',
  'Bakery',
  'Deli',
  'Meat & Seafood',
  'Dairy',
  'Eggs',
  'Frozen',
  'Canned Goods',
  'Pasta & Rice',
  'Snacks',
  'Beverages',
  'Condiments & Sauces',
  'Spices & Seasonings',
  'Baking',
  'Cereal & Breakfast',
  'Household',
  'Health & Beauty',
  'Other',
] as const

export type Department = (typeof DEPARTMENTS)[number]

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export const UNITS = [
  '',
  'pc',
  'g',
  'kg',
  'ml',
  'l',
  'cup',
  'tbsp',
  'tsp',
  'oz',
  'lb',
  'bunch',
  'can',
  'pack',
  'bag',
  'bottle',
  'box',
  'jar',
  'slice',
  'clove',
] as const
export type Unit = (typeof UNITS)[number]

export const CIRCLE_ROLES = ['owner', 'admin', 'member'] as const
export type CircleRole = (typeof CIRCLE_ROLES)[number]

export const LIST_PERMISSIONS = ['view', 'edit', 'admin'] as const
export type ListPermission = (typeof LIST_PERMISSIONS)[number]

export const REQUEST_STATUS = ['pending', 'approved', 'rejected'] as const
export type RequestStatus = (typeof REQUEST_STATUS)[number]

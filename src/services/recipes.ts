import { supabase } from './supabase'
import type { Recipe, RecipeIngredient } from '@/types'

// Get unique ingredient names for autocomplete (merges common + user ingredients)
export async function getIngredientSuggestions(locale: string = 'en'): Promise<string[]> {
  const [{ data: userIngredients }, { data: commonIngredients }] = await Promise.all([
    supabase.from('recipe_ingredients').select('name'),
    supabase.from('common_ingredients').select('name, name_he'),
  ])

  const seen = new Map<string, string>()

  // Add common ingredients first (canonical names)
  for (const row of commonIngredients ?? []) {
    const displayName = locale === 'he' && row.name_he ? row.name_he : row.name
    const key = row.name.toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, displayName)
  }

  // Add user ingredients (may override or add new)
  for (const row of userIngredients ?? []) {
    const key = row.name.toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, row.name.trim())
  }

  return [...seen.values()].sort()
}

// Normalize an ingredient name against common ingredients
export async function normalizeIngredientName(name: string): Promise<string> {
  const { data } = await supabase
    .from('common_ingredients')
    .select('name')
    .ilike('name', name.trim())
    .limit(1)

  return data?.[0]?.name ?? name.trim()
}

export async function getRecipes(circleId?: string): Promise<Recipe[]> {
  let query = supabase
    .from('recipes')
    .select('*, ingredients:recipe_ingredients(*)')
    .order('created_at', { ascending: false })

  if (circleId) {
    query = query.eq('circle_id', circleId)
  }

  const { data, error } = await query
  if (error) throw error
  return data as Recipe[]
}

export async function getRecipe(id: string): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, ingredients:recipe_ingredients(*)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Recipe
}

export async function getSharedRecipe(shareCode: string): Promise<Recipe | null> {
  const { data: share } = await supabase
    .from('recipe_shares')
    .select('recipe_id')
    .eq('share_code', shareCode)
    .single()

  if (!share) return null

  return getRecipe(share.recipe_id)
}

interface CreateRecipeInput {
  title: string
  description?: string
  instructions?: string
  source_url?: string
  prep_time_min?: number
  cook_time_min?: number
  servings?: number
  tags?: string[]
  circle_id?: string
  ingredients?: Omit<RecipeIngredient, 'id' | 'recipe_id'>[]
}

export async function createRecipe(input: CreateRecipeInput): Promise<Recipe> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { ingredients, ...recipeData } = input

  // Auto-generate tags from ingredients and title if none provided
  if (!recipeData.tags?.length && ingredients?.length) {
    recipeData.tags = generateAutoTags(recipeData.title ?? '', ingredients.map((i) => i.name))
  }

  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({ ...recipeData, created_by: user.id })
    .select()
    .single()

  if (error) throw error

  if (ingredients?.length) {
    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(
        ingredients.map((ing, i) => ({
          ...ing,
          recipe_id: recipe.id,
          sort_order: i,
        }))
      )
    if (ingError) throw ingError
  }

  return recipe as Recipe
}

export async function updateRecipe(id: string, input: Partial<CreateRecipeInput>): Promise<Recipe> {
  const { ingredients, ...recipeData } = input

  const { data: recipe, error } = await supabase
    .from('recipes')
    .update(recipeData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  if (ingredients !== undefined) {
    // Replace all ingredients
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
    if (ingredients.length) {
      await supabase
        .from('recipe_ingredients')
        .insert(ingredients.map((ing, i) => ({ ...ing, recipe_id: id, sort_order: i })))
    }
  }

  return recipe as Recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
}

export async function createRecipeShare(recipeId: string): Promise<string> {
  // Try RPC first
  try {
    const { data, error } = await supabase
      .rpc('create_recipe_share', { p_recipe_id: recipeId })
    if (!error && data) return data as string
  } catch { /* fall through to direct approach */ }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Check existing share
  const { data: existing } = await supabase
    .from('recipe_shares')
    .select('share_code')
    .eq('recipe_id', recipeId)
    .eq('created_by', user.id)
    .maybeSingle()

  if (existing?.share_code) return existing.share_code

  // Create new share
  const { data: newShare, error: insertErr } = await supabase
    .from('recipe_shares')
    .insert({ recipe_id: recipeId, created_by: user.id })
    .select('share_code')
    .single()

  if (insertErr) throw new Error('Could not create share link')
  return newShare.share_code
}

const CUISINE_KEYWORDS: Record<string, string[]> = {
  italian: ['pasta', 'parmesan', 'mozzarella', 'basil', 'oregano', 'marinara', 'risotto', 'lasagna'],
  mexican: ['tortilla', 'salsa', 'cilantro', 'jalapeño', 'jalapeno', 'cumin', 'taco', 'burrito', 'enchilada'],
  indian: ['curry', 'turmeric', 'garam masala', 'naan', 'tikka', 'masala', 'paneer', 'cardamom', 'cumin'],
  asian: ['soy sauce', 'ginger', 'sesame', 'rice vinegar', 'tofu', 'wok', 'noodle'],
  chinese: ['soy sauce', 'wok', 'hoisin', 'five spice', 'bok choy', 'szechuan'],
  thai: ['coconut milk', 'lemongrass', 'fish sauce', 'thai basil', 'pad thai'],
  japanese: ['miso', 'sake', 'wasabi', 'sushi', 'teriyaki', 'dashi', 'mirin'],
  mediterranean: ['olive oil', 'feta', 'hummus', 'tahini', 'za\'atar', 'pita'],
}

const PROTEIN_KEYWORDS: Record<string, string[]> = {
  chicken: ['chicken'],
  beef: ['beef', 'steak', 'ground beef'],
  fish: ['salmon', 'tuna', 'cod', 'fish', 'shrimp', 'prawn'],
  pork: ['pork', 'bacon', 'ham'],
  vegetarian: ['tofu', 'tempeh', 'lentil', 'chickpea', 'bean'],
}

const MEAL_KEYWORDS: Record<string, string[]> = {
  breakfast: ['pancake', 'waffle', 'egg', 'omelette', 'granola', 'french toast', 'breakfast'],
  dessert: ['cake', 'cookie', 'brownie', 'pie', 'ice cream', 'chocolate', 'dessert', 'sweet'],
  soup: ['soup', 'stew', 'chili', 'broth', 'bisque', 'chowder'],
  salad: ['salad', 'vinaigrette', 'dressing'],
  quick: ['5 min', '10 min', '15 min', 'quick', 'easy'],
}

function generateAutoTags(title: string, ingredientNames: string[]): string[] {
  const tags: Set<string> = new Set()
  const searchText = [title, ...ingredientNames].join(' ').toLowerCase()

  for (const [tag, keywords] of Object.entries(CUISINE_KEYWORDS)) {
    if (keywords.some((kw) => searchText.includes(kw))) tags.add(tag)
  }
  for (const [tag, keywords] of Object.entries(PROTEIN_KEYWORDS)) {
    if (keywords.some((kw) => searchText.includes(kw))) tags.add(tag)
  }
  for (const [tag, keywords] of Object.entries(MEAL_KEYWORDS)) {
    if (keywords.some((kw) => searchText.includes(kw))) tags.add(tag)
  }

  return [...tags].slice(0, 5)
}

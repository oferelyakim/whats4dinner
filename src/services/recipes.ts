import { supabase } from './supabase'
import type { Recipe, RecipeIngredient } from '@/types'

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Check if share already exists
  const { data: existing } = await supabase
    .from('recipe_shares')
    .select('share_code')
    .eq('recipe_id', recipeId)
    .eq('created_by', user.id)
    .single()

  if (existing) return existing.share_code

  const { data, error } = await supabase
    .from('recipe_shares')
    .insert({ recipe_id: recipeId, created_by: user.id })
    .select('share_code')
    .single()

  if (error) throw error
  return data.share_code
}

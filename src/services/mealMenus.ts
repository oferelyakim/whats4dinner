import { supabase } from './supabase'
import type { MealMenu, Recipe } from '@/types'

export async function getMealMenus(circleId?: string): Promise<(MealMenu & { recipes: Recipe[] })[]> {
  let query = supabase
    .from('meal_menus')
    .select('*, recipes:meal_menu_recipes(recipe:recipes(*, ingredients:recipe_ingredients(*)))')
    .order('created_at', { ascending: false })

  if (circleId) {
    query = query.eq('circle_id', circleId)
  }

  const { data, error } = await query
  if (error) throw error

  // Flatten the nested join
  return (data ?? []).map((menu) => ({
    ...menu,
    recipes: (menu.recipes as { recipe: Recipe }[])?.map((r) => r.recipe).filter(Boolean) ?? [],
  })) as (MealMenu & { recipes: Recipe[] })[]
}

export async function createMealMenu(
  name: string,
  description?: string,
  circleId?: string,
  recipeIds?: string[]
): Promise<MealMenu> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('meal_menus')
    .insert({ name, description: description || null, created_by: user.id, circle_id: circleId || null })
    .select()
    .single()

  if (error) throw error

  if (recipeIds?.length) {
    await supabase.from('meal_menu_recipes').insert(
      recipeIds.map((rid, i) => ({ menu_id: data.id, recipe_id: rid, sort_order: i }))
    )
  }

  return data as MealMenu
}

export async function addRecipeToMenu(menuId: string, recipeId: string): Promise<void> {
  const { error } = await supabase
    .from('meal_menu_recipes')
    .insert({ menu_id: menuId, recipe_id: recipeId, sort_order: 0 })

  if (error && error.code !== '23505') throw error // Ignore duplicate
}

export async function removeRecipeFromMenu(menuId: string, recipeId: string): Promise<void> {
  const { error } = await supabase
    .from('meal_menu_recipes')
    .delete()
    .eq('menu_id', menuId)
    .eq('recipe_id', recipeId)

  if (error) throw error
}

export async function deleteMealMenu(menuId: string): Promise<void> {
  const { error } = await supabase.from('meal_menus').delete().eq('id', menuId)
  if (error) throw error
}

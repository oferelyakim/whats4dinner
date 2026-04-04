import { supabase } from './supabase'
import type { ShoppingList, ShoppingListItem } from '@/types'

export async function getShoppingLists(): Promise<ShoppingList[]> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*, items:shopping_list_items(count)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((list) => ({
    ...list,
    item_count: (list.items as unknown as { count: number }[])?.[0]?.count ?? 0,
  })) as ShoppingList[]
}

export async function getShoppingList(id: string): Promise<ShoppingList & { items: ShoppingListItem[] }> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*, items:shopping_list_items(*)')
    .eq('id', id)
    .order('sort_order', { referencedTable: 'shopping_list_items' })
    .single()

  if (error) throw error
  return data as ShoppingList & { items: ShoppingListItem[] }
}

export async function createShoppingList(name: string, circleId: string): Promise<ShoppingList> {
  const { data, error } = await supabase
    .rpc('create_shopping_list', { p_name: name, p_circle_id: circleId })

  if (error) throw error
  return data as ShoppingList
}

export async function addListItem(
  listId: string,
  item: { name: string; quantity?: number; unit?: string; category?: string; recipe_id?: string; menu_id?: string }
): Promise<ShoppingListItem> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('shopping_list_items')
    .insert({
      list_id: listId,
      name: item.name,
      quantity: item.quantity ?? null,
      unit: item.unit ?? '',
      category: item.category ?? 'Other',
      recipe_id: item.recipe_id ?? null,
      menu_id: item.menu_id ?? null,
      added_by: user.id,
    })
    .select()
    .single()

  if (error) throw error
  return data as ShoppingListItem
}

export async function toggleListItem(itemId: string, isChecked: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('shopping_list_items')
    .update({
      is_checked: isChecked,
      checked_by: isChecked ? user?.id ?? null : null,
    })
    .eq('id', itemId)

  if (error) throw error
}

export async function removeListItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('id', itemId)

  if (error) throw error
}

export async function addRecipeToList(listId: string, recipeId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Fetch recipe ingredients
  const { data: ingredients } = await supabase
    .from('recipe_ingredients')
    .select('*')
    .eq('recipe_id', recipeId)

  if (!ingredients?.length) return

  const items = ingredients.map((ing) => ({
    list_id: listId,
    name: ing.name,
    quantity: ing.quantity,
    unit: ing.unit || '',
    category: 'Other',
    recipe_id: recipeId,
    added_by: user.id,
  }))

  const { error } = await supabase.from('shopping_list_items').insert(items)
  if (error) throw error
}

export async function shareListWithUser(listId: string, userId: string, permission: string = 'edit'): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_access')
    .upsert({ list_id: listId, user_id: userId, permission })

  if (error) throw error
}

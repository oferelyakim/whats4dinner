import { supabase } from './supabase'
import type { ShoppingList, ShoppingListItem } from '@/types'
import type { Unit } from '@/lib/constants'
import { normalizeIngredient } from '@/lib/ingredientNormalize'

export interface AggregatedIngredient {
  key: string
  name: string
  quantity: number | null
  unit: Unit
  sourceRecipeIds: string[]
  sourceRecipeTitles: string[]
}

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
  const [listResult, itemsResult] = await Promise.all([
    supabase
      .from('shopping_lists')
      .select('*')
      .eq('id', id)
      .single(),
    supabase
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', id)
      .order('sort_order'),
  ])

  if (listResult.error) throw listResult.error

  return {
    ...listResult.data,
    items: itemsResult.data ?? [],
  } as ShoppingList & { items: ShoppingListItem[] }
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

export async function updateListItem(
  itemId: string,
  patch: { name?: string; quantity?: number | null; unit?: string; category?: string }
): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .update(patch)
    .eq('id', itemId)

  if (error) throw error
}

export async function deleteShoppingList(listId: string): Promise<void> {
  const { error } = await supabase.from('shopping_lists').delete().eq('id', listId)
  if (error) throw error
}

export async function removeListItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('id', itemId)

  if (error) throw error
}

export async function addRecipeToList(listId: string, recipeId: string, ingredientIds?: Set<string>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Fetch recipe name and ingredients
  const [{ data: recipe }, { data: ingredients }] = await Promise.all([
    supabase.from('recipes').select('title').eq('id', recipeId).single(),
    supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipeId),
  ])

  if (!ingredients?.length) return

  // Filter by selected ingredient IDs if provided
  const filteredIngredients = ingredientIds
    ? ingredients.filter((ing) => ingredientIds.has(ing.id))
    : ingredients

  if (!filteredIngredients.length) return
  const recipeName = recipe?.title || ''

  // Fetch existing items on the list to deduplicate
  const { data: existingItems } = await supabase
    .from('shopping_list_items')
    .select('*')
    .eq('list_id', listId)

  interface ExistingItem { id: string; name: string; quantity: number | null; notes: string | null }
  const existingMap = new Map<string, ExistingItem>()
  for (const item of (existingItems ?? []) as ExistingItem[]) {
    existingMap.set(item.name.toLowerCase().trim(), item)
  }

  const toInsert: { list_id: string; name: string; quantity: number | null; unit: string; category: string; recipe_id: string; notes: string | null; added_by: string }[] = []
  const toUpdate: { id: string; quantity: number | null; notes: string | null }[] = []

  for (const ing of filteredIngredients) {
    const key = ing.name.toLowerCase().trim()
    const existing = existingMap.get(key)

    if (existing) {
      const newQty = (existing.quantity || 0) + (ing.quantity || 0)
      const sources = existing.notes?.startsWith('From: ') ? existing.notes : existing.notes ? `From: ${existing.notes}` : ''
      const newNotes = sources
        ? (sources.includes(recipeName) ? sources : `${sources}, ${recipeName}`)
        : `From: ${recipeName}`
      toUpdate.push({ id: existing.id, quantity: newQty || null, notes: newNotes })
    } else {
      toInsert.push({
        list_id: listId,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit || '',
        category: 'Other',
        recipe_id: recipeId,
        notes: `From: ${recipeName}`,
        added_by: user.id,
      })
      existingMap.set(key, { id: 'new', name: ing.name, quantity: ing.quantity, notes: null })
    }
  }

  // Execute updates and inserts
  for (const upd of toUpdate) {
    await supabase.from('shopping_list_items').update({ quantity: upd.quantity, notes: upd.notes }).eq('id', upd.id)
  }
  if (toInsert.length) {
    await supabase.from('shopping_list_items').insert(toInsert)
  }
}

export async function addMealPlansToList(listId: string, planIds: string[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Get all recipe IDs from the meal plans
  const { data: plans } = await supabase
    .from('meal_plans')
    .select('recipe_id')
    .in('id', planIds)

  const recipeIds = [...new Set((plans ?? []).map((p) => p.recipe_id).filter(Boolean))] as string[]
  if (!recipeIds.length) return

  // Get all ingredients from those recipes
  const { data: ingredients } = await supabase
    .from('recipe_ingredients')
    .select('*')
    .in('recipe_id', recipeIds)

  if (!ingredients?.length) return

  // Deduplicate by name+unit (combine quantities)
  const merged = new Map<string, { name: string; quantity: number; unit: string; recipe_id: string }>()
  for (const ing of ingredients) {
    const key = `${ing.name.toLowerCase()}|${(ing.unit || '').toLowerCase()}`
    const existing = merged.get(key)
    if (existing) {
      existing.quantity = (existing.quantity || 0) + (ing.quantity || 0)
    } else {
      merged.set(key, {
        name: ing.name,
        quantity: ing.quantity || 0,
        unit: ing.unit || '',
        recipe_id: ing.recipe_id,
      })
    }
  }

  const items = [...merged.values()].map((ing) => ({
    list_id: listId,
    name: ing.name,
    quantity: ing.quantity || null,
    unit: ing.unit,
    category: 'Other',
    recipe_id: ing.recipe_id,
    added_by: user.id,
  }))

  const { error } = await supabase.from('shopping_list_items').insert(items)
  if (error) throw error
}

export async function computePlanIngredients(planIds: string[]): Promise<AggregatedIngredient[]> {
  if (!planIds.length) return []

  // Fetch meal plan rows to get their recipe_ids (and recipe titles via join)
  const { data: plans, error: plansError } = await supabase
    .from('meal_plans')
    .select('id, recipe_id, recipe:recipes(id, title)')
    .in('id', planIds)

  if (plansError) throw plansError
  if (!plans?.length) return []

  // Build a map from recipe_id to recipe title, only for plans with a recipe
  const recipeIdToTitle = new Map<string, string>()
  for (const plan of plans) {
    if (plan.recipe_id && plan.recipe) {
      const recipeRecord = plan.recipe as unknown as { id: string; title: string } | null
      if (recipeRecord?.title) {
        recipeIdToTitle.set(plan.recipe_id, recipeRecord.title)
      }
    }
  }

  const recipeIds = [...recipeIdToTitle.keys()]
  if (!recipeIds.length) return []

  // Fetch all ingredients for those recipes
  const { data: ingredients, error: ingError } = await supabase
    .from('recipe_ingredients')
    .select('id, recipe_id, name, quantity, unit')
    .in('recipe_id', recipeIds)

  if (ingError) throw ingError
  if (!ingredients?.length) return []

  // Aggregate by normalized base|form key
  const aggregated = new Map<string, AggregatedIngredient>()

  for (const ing of ingredients) {
    const { base, form } = normalizeIngredient(ing.name)
    const key = `${base}|${form ?? ''}`
    const displayName = form ? `${form} ${base}` : base
    const title = recipeIdToTitle.get(ing.recipe_id) ?? ''
    const incomingUnit = ((ing.unit as string) || '').toLowerCase().trim() as Unit

    const existing = aggregated.get(key)
    if (existing) {
      // Sum quantity; null out if either side is null or units differ
      if (
        existing.quantity !== null &&
        ing.quantity != null &&
        existing.unit === incomingUnit
      ) {
        existing.quantity = existing.quantity + ing.quantity
      } else {
        existing.quantity = null
        existing.unit = '' as Unit
      }
      if (!existing.sourceRecipeIds.includes(ing.recipe_id)) {
        existing.sourceRecipeIds.push(ing.recipe_id)
        existing.sourceRecipeTitles.push(title)
      }
    } else {
      aggregated.set(key, {
        key,
        name: displayName,
        quantity: ing.quantity ?? null,
        unit: incomingUnit,
        sourceRecipeIds: [ing.recipe_id],
        sourceRecipeTitles: [title],
      })
    }
  }

  return [...aggregated.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function addIngredientsBulk(
  listId: string,
  items: { name: string; quantity: number | null; unit: Unit; notes?: string | null }[]
): Promise<void> {
  if (!items.length) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const rows = items.map((item) => ({
    list_id: listId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: 'Other',
    notes: item.notes ?? null,
    added_by: user.id,
  }))

  const { error } = await supabase.from('shopping_list_items').insert(rows)
  if (error) throw error
}

export async function shareListWithUser(listId: string, userId: string, permission: string = 'edit'): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_access')
    .upsert({ list_id: listId, user_id: userId, permission })

  if (error) throw error
}

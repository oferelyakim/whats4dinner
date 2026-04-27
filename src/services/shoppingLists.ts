import { supabase } from './supabase'
import type { ShoppingList, ShoppingListItem } from '@/types'
import type { Unit } from '@/lib/constants'
import { normalizeIngredient } from '@/lib/ingredientNormalize'
import type { Slot } from '@/engine/types'
import { db } from '@/engine/db'

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

// ── Spice/seasoning set — these are listed once, no qty summing ──────────────

const SPICE_NAMES = new Set([
  'salt', 'pepper', 'paprika', 'cumin', 'oregano', 'thyme', 'basil', 'rosemary',
  'turmeric', 'cinnamon', 'nutmeg', 'cardamom', 'coriander', 'fennel', 'dill',
  'sage', 'tarragon', 'marjoram', 'bay', 'cloves', 'allspice', 'chili', 'cayenne',
  'saffron', 'sumac', 'zaatar', 'za\'atar', 'harissa', 'garam masala', 'curry',
  'chili powder', 'garlic powder', 'onion powder', 'smoked paprika',
  'black pepper', 'white pepper', 'red pepper', 'pepper flakes',
  'sesame seeds', 'poppy seeds', 'caraway', 'fenugreek', 'mustard seed',
  'vanilla', 'extract',
])

// Simple fraction parser: "1/2" → 0.5, "2 1/2" → 2.5
function parseFraction(s: string): number {
  const mixed = s.trim().match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
  const simple = s.trim().match(/^(\d+)\/(\d+)$/)
  if (simple) return parseInt(simple[1]) / parseInt(simple[2])
  const num = parseFloat(s)
  return isNaN(num) ? 0 : num
}

// UNIT_WORDS mirrors the set in ingredientNormalize.ts but as an Array for iteration
const PARSEABLE_UNITS = [
  'tablespoons', 'tablespoon', 'tbsp',
  'teaspoons', 'teaspoon', 'tsp',
  'cups', 'cup',
  'ounces', 'ounce', 'oz',
  'pounds', 'pound', 'lb', 'lbs',
  'grams', 'gram', 'gr', 'g',
  'kilograms', 'kilogram', 'kg',
  'milliters', 'milliliter', 'ml',
  'liters', 'liter', 'l',
  'cloves', 'clove',
  'slices', 'slice',
  'pieces', 'piece',
  'cans', 'can',
  'bunches', 'bunch',
  'heads', 'head',
  'packages', 'package', 'packs', 'pack',
  'pinches', 'pinch',
  'dashes', 'dash',
]

// Parse a freeform ingredient string like "2 cups all-purpose flour" or "salt to taste"
// into { quantityNum, unit, baseName }.
function parseIngredientString(raw: string): {
  quantityNum: number | null
  unit: string
  baseName: string
} {
  const text = raw.toLowerCase().trim()

  // Match leading number (int, decimal, fraction, unicode fraction)
  const numMatch = text.match(/^([\d./\u00BC-\u00BE\u2150-\u215E]+(?:\s+\d+\/\d+)?)\s*/)
  if (!numMatch) {
    return { quantityNum: null, unit: '', baseName: text }
  }

  const quantityNum = parseFraction(numMatch[1])
  let rest = text.slice(numMatch[0].length).trim()

  // Match unit
  let matchedUnit = ''
  for (const u of PARSEABLE_UNITS) {
    if (rest.startsWith(u + ' ') || rest === u) {
      matchedUnit = u
      rest = rest.slice(u.length).trim()
      // strip leading "of"
      if (rest.startsWith('of ')) rest = rest.slice(3).trim()
      break
    }
  }

  return { quantityNum, unit: matchedUnit, baseName: rest }
}

/**
 * v2.4.0 — compute an aggregated ingredient list from a set of v2 engine Slot
 * objects.  Reads Recipe rows from the local Dexie database (no Supabase call).
 * Only `ready` and `link_ready` slots with a `recipeId` are included; slots in
 * any other state (empty, generating, error, queued_server) are skipped.
 *
 * Rules per user spec:
 *  - Spice / seasoning ingredients → appear once, no quantity.
 *  - Same-unit numerics → sum them.
 *  - Mixed units (count vs volumetric) → no summed qty; recipe names listed.
 *  - No quantity on either side → no qty; recipe names listed.
 */
export async function computeIngredientsFromSlots(
  slots: Slot[],
): Promise<AggregatedIngredient[]> {
  // Only slots that have a fully-hydrated recipe
  const readySlots = slots.filter(
    (s) => (s.status === 'ready') && s.recipeId,
  )
  if (!readySlots.length) return []

  // Load recipes from Dexie
  const recipeIds = [...new Set(readySlots.map((s) => s.recipeId!))]
  const recipes = await db.recipes.bulkGet(recipeIds)
  const recipeMap = new Map(
    recipes
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .map((r) => [r.id, r])
  )

  // Build slot → recipe title map
  const slotToTitle = new Map<string, string>()
  const slotToRecipeId = new Map<string, string>()
  for (const slot of readySlots) {
    if (slot.recipeId) {
      const recipe = recipeMap.get(slot.recipeId)
      if (recipe) {
        slotToTitle.set(slot.id, recipe.title)
        slotToRecipeId.set(slot.id, slot.recipeId)
      }
    }
  }

  // Aggregate
  const aggregated = new Map<string, AggregatedIngredient>()

  for (const slot of readySlots) {
    const recipeId = slotToRecipeId.get(slot.id)
    if (!recipeId) continue
    const recipe = recipeMap.get(recipeId)
    if (!recipe) continue
    const recipeTitle = slotToTitle.get(slot.id) ?? recipe.title

    for (const ing of recipe.ingredients) {
      // ing.item is the full freeform string e.g. "2 cups flour"
      const rawText = ing.item.trim()
      const { base, form } = normalizeIngredient(rawText)

      // Spice check — name-only row, no qty
      const isSpice = SPICE_NAMES.has(base) || SPICE_NAMES.has(base.split(' ')[0])

      const key = `${base}|${form ?? ''}`
      const displayName = form ? `${form} ${base}` : base

      const existing = aggregated.get(key)

      if (isSpice) {
        if (!existing) {
          aggregated.set(key, {
            key,
            name: displayName,
            quantity: null,
            unit: '' as Unit,
            sourceRecipeIds: [recipeId],
            sourceRecipeTitles: [recipeTitle],
          })
        } else {
          if (!existing.sourceRecipeIds.includes(recipeId)) {
            existing.sourceRecipeIds.push(recipeId)
            existing.sourceRecipeTitles.push(recipeTitle)
          }
        }
        continue
      }

      // Parse quantity from the freeform ingredient string
      const { quantityNum, unit: parsedUnit } = parseIngredientString(rawText)

      if (!existing) {
        aggregated.set(key, {
          key,
          name: displayName,
          quantity: quantityNum,
          unit: parsedUnit as Unit,
          sourceRecipeIds: [recipeId],
          sourceRecipeTitles: [recipeTitle],
        })
      } else {
        // Sum if units match and both have numeric quantities
        if (
          existing.quantity !== null &&
          quantityNum !== null &&
          existing.unit === parsedUnit &&
          parsedUnit !== ''
        ) {
          existing.quantity = existing.quantity + quantityNum
        } else if (quantityNum !== null && existing.quantity === null && existing.unit === '') {
          // Upgrade from no-qty to a qty (first time we get a measurement)
          existing.quantity = quantityNum
          existing.unit = parsedUnit as Unit
        } else {
          // Mixed units or one side missing — drop qty
          existing.quantity = null
          existing.unit = '' as Unit
        }

        if (!existing.sourceRecipeIds.includes(recipeId)) {
          existing.sourceRecipeIds.push(recipeId)
          existing.sourceRecipeTitles.push(recipeTitle)
        }
      }
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

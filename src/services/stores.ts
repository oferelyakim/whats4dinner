import { supabase } from './supabase'
import type { Store, StoreRoute } from '@/types'
import { DEPARTMENTS } from '@/lib/constants'

export async function getStores(): Promise<Store[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Store[]
}

export async function getStoreRoutes(storeId: string): Promise<StoreRoute[]> {
  const { data, error } = await supabase
    .from('store_routes')
    .select('*')
    .eq('store_id', storeId)
    .order('sort_order')

  if (error) throw error
  return data as StoreRoute[]
}

export async function createStore(name: string, address?: string, circleId?: string): Promise<Store> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('stores')
    .insert({ name, address: address || null, created_by: user.id, circle_id: circleId || null })
    .select()
    .single()

  if (error) throw error

  // Seed default department routes
  const routes = DEPARTMENTS.map((dept, i) => ({
    store_id: data.id,
    department: dept,
    sort_order: i,
  }))

  await supabase.from('store_routes').insert(routes)

  return data as Store
}

export async function updateRouteOrder(storeId: string, departments: string[]): Promise<void> {
  // Update sort_order for each department
  const updates = departments.map((dept, i) =>
    supabase
      .from('store_routes')
      .update({ sort_order: i })
      .eq('store_id', storeId)
      .eq('department', dept)
  )

  await Promise.all(updates)
}

export async function deleteStore(storeId: string): Promise<void> {
  const { error } = await supabase.from('stores').delete().eq('id', storeId)
  if (error) throw error
}

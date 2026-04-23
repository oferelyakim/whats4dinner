import { supabase } from '@/services/supabase'
import type { GrocerProvider, GrocerStore } from './types'
import type { GrocerProduct, CartResult } from '@/types'

export const krogerProvider: GrocerProvider = {
  name: 'kroger',
  displayName: 'Kroger',
  available: true,

  async startOAuth() {
    const { data, error } = await supabase.functions.invoke('kroger-oauth-start', {
      body: {},
    })
    if (error) throw new Error(error.message)
    return data as { auth_url: string; state: string }
  },

  async handleCallback(code: string, state: string) {
    const { data, error } = await supabase.functions.invoke('kroger-oauth-callback', {
      body: { code, state },
    })
    if (error) throw new Error(error.message)
    return data as { connected: boolean; store_id: string | null; store_name: string | null }
  },

  async findStores(zip: string) {
    const { data, error } = await supabase.functions.invoke('kroger-stores', {
      body: { zip },
    })
    if (error) throw new Error(error.message)
    return (data as { stores: GrocerStore[] }).stores
  },

  async searchItems(queries: string[], storeId: string) {
    const { data, error } = await supabase.functions.invoke('kroger-search', {
      body: { queries, store_id: storeId },
    })
    if (error) throw new Error(error.message)
    return (data as { results: Record<string, GrocerProduct[]> }).results
  },

  async addToCart(listId: string, storeId: string) {
    const { data, error } = await supabase.functions.invoke('kroger-add-to-cart', {
      body: { list_id: listId, store_id: storeId },
    })
    if (error) throw new Error(error.message)
    return data as CartResult
  },
}

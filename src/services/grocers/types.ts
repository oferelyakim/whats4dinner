import type { GrocerProviderName, GrocerProduct, CartResult } from '@/types'

export type { GrocerProviderName, GrocerProduct, CartResult }

export interface GrocerStore {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  distance_miles?: number
}

export interface CartItem {
  product_id: string
  quantity: number
  item_name: string
}

/** Client-facing provider interface. OAuth methods are server-side; the client only invokes edge functions. */
export interface GrocerProvider {
  name: GrocerProviderName
  displayName: string
  available: boolean

  startOAuth(): Promise<{ auth_url: string; state: string }>
  handleCallback(code: string, state: string): Promise<{ connected: boolean; store_id: string | null; store_name: string | null }>
  findStores(zip: string): Promise<GrocerStore[]>
  searchItems(queries: string[], storeId: string): Promise<Record<string, GrocerProduct[]>>
  addToCart(listId: string, storeId: string): Promise<CartResult>
}

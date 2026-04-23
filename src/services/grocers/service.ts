import { supabase } from '@/services/supabase'
import { getProvider } from './index'
import type { GrocerConnectionRow, GrocerFlag, GrocerProduct, CartResult, GrocerProviderName, ListGrocerLink } from '@/types'
import type { GrocerStore } from './types'

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export async function getGrocerFlag(): Promise<GrocerFlag> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'grocer_integrations')
    .single()

  if (error || !data) {
    return { enabled: false, enabled_for_user_ids: [] }
  }

  const value = data.value as GrocerFlag
  return {
    enabled: value.enabled ?? false,
    enabled_for_user_ids: value.enabled_for_user_ids ?? [],
  }
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export async function startKrogerOAuth(): Promise<{ auth_url: string; state: string }> {
  return getProvider('kroger').startOAuth()
}

export async function handleKrogerCallback(
  code: string,
  state: string
): Promise<{ connected: boolean; store_id: string | null; store_name: string | null }> {
  return getProvider('kroger').handleCallback(code, state)
}

// ---------------------------------------------------------------------------
// Connection management (direct Supabase RLS-protected queries)
// ---------------------------------------------------------------------------

export async function getMyGrocerConnections(): Promise<GrocerConnectionRow[]> {
  const { data, error } = await supabase
    .from('grocer_connections')
    .select('id, user_id, provider, expires_at, store_id, store_name, store_zip, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as GrocerConnectionRow[]
}

export async function disconnectGrocer(provider: GrocerProviderName): Promise<void> {
  const { error } = await supabase
    .from('grocer_connections')
    .delete()
    .eq('provider', provider)

  if (error) throw new Error(error.message)
}

export async function updateGrocerStore(
  provider: GrocerProviderName,
  store: Pick<GrocerConnectionRow, 'store_id' | 'store_name' | 'store_zip'>
): Promise<void> {
  const { error } = await supabase
    .from('grocer_connections')
    .update({
      store_id: store.store_id,
      store_name: store.store_name,
      store_zip: store.store_zip,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', provider)

  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Store search
// ---------------------------------------------------------------------------

export async function getKrogerStores(zip: string): Promise<GrocerStore[]> {
  return getProvider('kroger').findStores(zip)
}

// ---------------------------------------------------------------------------
// Product search
// ---------------------------------------------------------------------------

export async function searchListItems(
  queries: string[],
  storeId: string
): Promise<Record<string, GrocerProduct[]>> {
  return getProvider('kroger').searchItems(queries, storeId)
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export async function addListToCart(listId: string, storeId: string): Promise<CartResult> {
  return getProvider('kroger').addToCart(listId, storeId)
}

// ---------------------------------------------------------------------------
// List grocer links (direct Supabase RLS-protected queries)
// ---------------------------------------------------------------------------

export async function getLinkForList(listId: string): Promise<ListGrocerLink | null> {
  const { data, error } = await supabase
    .from('list_grocer_links')
    .select('*')
    .eq('list_id', listId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ListGrocerLink | null
}

export async function linkListToStore(
  listId: string,
  provider: GrocerProviderName,
  storeId: string,
  storeName: string | null
): Promise<void> {
  const { error } = await supabase
    .from('list_grocer_links')
    .upsert(
      {
        list_id: listId,
        provider,
        store_id: storeId,
        store_name: storeName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'list_id' }
    )

  if (error) throw new Error(error.message)
}

export async function unlinkList(listId: string): Promise<void> {
  const { error } = await supabase
    .from('list_grocer_links')
    .delete()
    .eq('list_id', listId)

  if (error) throw new Error(error.message)
}

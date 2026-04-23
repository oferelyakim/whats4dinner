import type { GrocerProvider } from './types'

/** Instacart provider stub — not yet implemented (v2). */
export const instacartProvider: GrocerProvider = {
  name: 'instacart',
  displayName: 'Instacart',
  available: false,

  startOAuth() {
    return Promise.reject(new Error('not implemented'))
  },
  handleCallback(_code, _state) {
    return Promise.reject(new Error('not implemented'))
  },
  findStores(_zip) {
    return Promise.reject(new Error('not implemented'))
  },
  searchItems(_queries, _storeId) {
    return Promise.reject(new Error('not implemented'))
  },
  addToCart(_listId, _storeId) {
    return Promise.reject(new Error('not implemented'))
  },
}

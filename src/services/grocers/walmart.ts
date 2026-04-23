import type { GrocerProvider } from './types'

/** Walmart provider stub — not yet implemented (v2). */
export const walmartProvider: GrocerProvider = {
  name: 'walmart',
  displayName: 'Walmart',
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

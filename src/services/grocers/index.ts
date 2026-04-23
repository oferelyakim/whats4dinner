import { krogerProvider } from './kroger'
import { walmartProvider } from './walmart'
import { instacartProvider } from './instacart'
import type { GrocerProvider } from './types'
import type { GrocerProviderName } from '@/types'

export type { GrocerProvider }
export type { GrocerProviderName }

export const AVAILABLE_PROVIDERS: GrocerProviderName[] = ['kroger']

const REGISTRY: Record<GrocerProviderName, GrocerProvider> = {
  kroger: krogerProvider,
  walmart: walmartProvider,
  instacart: instacartProvider,
}

export function getProvider(name: GrocerProviderName): GrocerProvider {
  return REGISTRY[name]
}

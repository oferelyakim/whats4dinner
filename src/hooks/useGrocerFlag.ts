// v3.4.0 — grocer integrations (Walmart/Kroger/Instacart cart export) are
// HARD-DISABLED for the soft launch. Per app_config the flag may say
// otherwise, but until the cart-export UX is shipped end-to-end we don't
// surface ANY grocer affordances in the app — better to under-promise.
//
// Backend code (services/grocers/, kroger-* edge fns, mig 023) is preserved
// for the v3.5+ unlock — flip this single function to re-enable consultation
// with `app_config.grocer_v2_enabled`.

export interface GrocerFlagResult {
  enabled: boolean
  isLoading: boolean
}

export function useGrocerFlag(): GrocerFlagResult {
  return { enabled: false, isLoading: false }
}

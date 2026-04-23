# Grocer Integrations — Implementation Spec (v1)

## Scope

**v1 (build now, behind feature flag, off by default):**
- Kroger end-to-end: OAuth from Profile, store selection, product price lookup, add-to-cart from a shopping list
- Walmart + Instacart as **invisible placeholder stubs** — provider interface + files exist, NOT shown in UI
- Single grocer per shopping list
- Default: list has no grocer, everything works as today

**v2 (architect for, do not implement):** Multi-grocer comparison, splitting a list across grocers, cost-optimized meal plans.

---

## 1. Migration: `supabase/migrations/023_grocer_integrations.sql`

```sql
-- TABLE 1: grocer_connections
CREATE TABLE IF NOT EXISTS public.grocer_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('kroger', 'walmart', 'instacart')),
  access_token_enc  text NOT NULL,
  refresh_token_enc text NOT NULL,
  token_iv        text NOT NULL,
  expires_at      timestamptz NOT NULL,
  store_id        text,
  store_name      text,
  store_zip       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);
CREATE INDEX IF NOT EXISTS grocer_connections_user_idx ON public.grocer_connections(user_id);
ALTER TABLE public.grocer_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their grocer connections" ON public.grocer_connections;
CREATE POLICY "Users own their grocer connections"
  ON public.grocer_connections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- TABLE 2: grocer_product_cache (server-only via service role)
CREATE TABLE IF NOT EXISTS public.grocer_product_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL,
  store_id        text NOT NULL,
  query_normalized text NOT NULL,
  results         jsonb NOT NULL,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS grocer_cache_lookup_idx
  ON public.grocer_product_cache(provider, store_id, query_normalized);
CREATE INDEX IF NOT EXISTS grocer_cache_expiry_idx ON public.grocer_product_cache(expires_at);
-- Do NOT enable RLS — service role only.

-- TABLE 3: list_grocer_links
CREATE TABLE IF NOT EXISTS public.list_grocer_links (
  list_id    uuid PRIMARY KEY REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  provider   text NOT NULL CHECK (provider IN ('kroger', 'walmart', 'instacart')),
  store_id   text NOT NULL,
  store_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.list_grocer_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "List members can view grocer links" ON public.list_grocer_links;
CREATE POLICY "List members can view grocer links" ON public.list_grocer_links
  FOR SELECT USING (list_id IN (SELECT public.get_my_accessible_list_ids()));
DROP POLICY IF EXISTS "List members can insert grocer links" ON public.list_grocer_links;
CREATE POLICY "List members can insert grocer links" ON public.list_grocer_links
  FOR INSERT WITH CHECK (list_id IN (SELECT public.get_my_accessible_list_ids()));
DROP POLICY IF EXISTS "List members can update grocer links" ON public.list_grocer_links;
CREATE POLICY "List members can update grocer links" ON public.list_grocer_links
  FOR UPDATE USING (list_id IN (SELECT public.get_my_accessible_list_ids()));
DROP POLICY IF EXISTS "List members can delete grocer links" ON public.list_grocer_links;
CREATE POLICY "List members can delete grocer links" ON public.list_grocer_links
  FOR DELETE USING (list_id IN (SELECT public.get_my_accessible_list_ids()));

-- TABLE 4: app_config (single-row-per-key)
CREATE TABLE IF NOT EXISTS public.app_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read app_config" ON public.app_config;
CREATE POLICY "Anyone can read app_config" ON public.app_config FOR SELECT USING (true);
-- No write policies for client. Service role manages.

INSERT INTO public.app_config (key, value)
VALUES ('grocer_integrations', '{"enabled": false, "enabled_for_user_ids": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Edge function flag check helper
CREATE OR REPLACE FUNCTION public.grocer_flag_enabled_for(p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (value->>'enabled')::boolean
    OR (value->'enabled_for_user_ids' @> to_jsonb(p_user_id::text)),
    false
  )
  FROM public.app_config
  WHERE key = 'grocer_integrations';
$$;

NOTIFY pgrst, 'reload schema';
```

**Note:** `get_my_accessible_list_ids()` is documented in CLAUDE.md as already applied. Verify before deploying; if missing, add its definition to the migration.

---

## 2. Provider Interface — `src/services/grocers/types.ts`

```typescript
export type GrocerProviderName = 'kroger' | 'walmart' | 'instacart'

export interface GrocerStore {
  id: string; name: string; address: string; city: string; state: string; zip: string;
  distance_miles?: number
}

export interface GrocerProduct {
  id: string; name: string; brand?: string;
  price_cents?: number; unit_size?: string; image_url?: string; available: boolean
}

export interface CartItem { product_id: string; quantity: number; item_name: string }

export interface CartResult {
  success: boolean; items_added: number; items_failed: string[]; cart_url: string | null
}
```

Files to create:
- `src/services/grocers/types.ts` — interface + types above
- `src/services/grocers/kroger.ts` — thin client wrapper that invokes edge functions
- `src/services/grocers/walmart.ts` — stub: `available = false`, methods throw "not implemented"
- `src/services/grocers/instacart.ts` — same stub pattern
- `src/services/grocers/index.ts` — `getProvider(name)` + `AVAILABLE_PROVIDERS = ['kroger']`
- `src/services/grocers/service.ts` — public client API used by hooks/components

---

## 3. Edge Functions

All under `supabase/functions/`, all use the same CORS + auth boilerplate as `ai-chat/index.ts`. After auth, every function checks the feature flag (call `grocer_flag_enabled_for(user.id)` via RPC, return 403 if false).

**Kroger API base:**
- Certification: `https://api-ce.kroger.com`
- Production: `https://api.kroger.com`

Driven by `KROGER_API_BASE_URL` env var (start with certification).

### Shared encryption helper

`supabase/functions/_shared/encrypt.ts` (new file) — AES-GCM via Web Crypto. Key = base64-decoded `TOKEN_ENCRYPTION_KEY`. Exposes `encrypt(plaintext) -> {ciphertext, iv}` and `decrypt(ciphertext, iv) -> plaintext`. Both base64.

### `kroger-oauth-start`
- Request: `POST {}` (no body needed)
- Response: `{ auth_url, state }`
- Generates 16-byte hex state. Builds Kroger OAuth URL with scope `product.compact cart.basic:write profile.compact`.

### `kroger-oauth-callback`
- Request: `POST { code, state }`
- Response: `{ provider: 'kroger', connected: true, store_id: null, store_name: null }`
- Exchanges code for tokens via `POST {KROGER_API_BASE_URL}/v1/connect/oauth2/token` with HTTP Basic auth (clientId:clientSecret).
- Encrypts tokens, upserts into `grocer_connections`.

### `kroger-stores`
- Request: `POST { zip }`
- Response: `{ stores: GrocerStore[] }`
- Loads + decrypts user's token (refresh if `expires_at < now() + 5min`).
- Calls `GET /v1/locations?filter.zipCode={zip}&filter.radiusInMiles=10&filter.limit=10`.

### `kroger-search`
- Request: `POST { queries: string[], store_id }`
- Response: `{ results: Record<string, GrocerProduct[]> }`
- For each query: normalize (lowercase, trim), check `grocer_product_cache`, on miss call Kroger Products API, cache for 4h.
- Endpoint: `GET /v1/products?filter.term={query}&filter.locationId={store_id}&filter.limit=10`

### `kroger-add-to-cart`
- Request: `POST { list_id, store_id }`
- Response: `CartResult`
- Verifies user has list access. Loads unchecked items. Looks up product UPCs from cache (no extra Kroger calls; cache must be warm from prior search).
- Calls `PUT /v1/cart/add` with `{ items: [{ upc, quantity: { requested } }] }`.

---

## 4. Secrets (Supabase Edge Function Secrets)

```
KROGER_CLIENT_ID=replanish-bbcd2dpd
KROGER_CLIENT_SECRET=<set by user>
KROGER_API_BASE_URL=https://api-ce.kroger.com
KROGER_REDIRECT_URI=https://app.replanish.app/grocer/callback/kroger
TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>
```

Set via: `npx supabase secrets set KEY=value`

For local dev, also register `http://localhost:5173/grocer/callback/kroger` with Kroger if testing OAuth locally.

---

## 5. Frontend

### Types — add to `src/types/index.ts`

`GrocerProviderName`, `GrocerConnectionRow` (without encrypted fields), `ListGrocerLink`, `GrocerProduct`, `CartResult`, `GrocerFlag`.

### Service — `src/services/grocers/service.ts`

Exports:
- `getGrocerFlag()` — direct query of `app_config`
- `startKrogerOAuth()` / `handleKrogerCallback(code, state)` — invoke edge functions
- `getMyGrocerConnections()` / `disconnectGrocer(provider)` / `updateGrocerStore(provider, store)` — direct Supabase queries (RLS-protected)
- `getKrogerStores(zip)` — invoke `kroger-stores`
- `searchListItems(listId, storeId, itemNames)` — invoke `kroger-search`
- `addListToCart(listId, storeId)` — invoke `kroger-add-to-cart`
- `getLinkForList(listId)` / `linkListToStore(...)` / `unlinkList(listId)` — direct queries on `list_grocer_links`

### Hook — `src/hooks/useGrocerFlag.ts`

TanStack Query, key `['grocer-flag']`, staleTime 60s. Combines server flag with current user UUID. Returns `{ enabled, isLoading }`.

### Components (all new, under `src/components/grocers/`)

- `ConnectedStoresSection.tsx` — wrapper rendered in MorePage, only when flag on
- `KrogerConnectCard.tsx` — "Connect Kroger" CTA when no connection exists
- `KrogerConnectionCard.tsx` — connected state: store badge, change/disconnect actions
- `StorePickerModal.tsx` — Radix Dialog, ZIP input, store list, select handler
- `ListStoreLinkerModal.tsx` — link/unlink current list to a connected store
- `CartPreviewModal.tsx` — preview matched products + prices, "Add all to cart" action

### Pages

- `src/pages/GrocerCallbackPage.tsx` — handles `/grocer/callback/:provider` route
  - Reads `code`, `state` from query params
  - Verifies state matches `sessionStorage['grocer_oauth_state']`
  - Calls `handleKrogerCallback`, navigates to `/profile` with toast

### Page edits

- `src/pages/MorePage.tsx` — add `<ConnectedStoresSection />` between AI subscription card and theme toggle, gated by `useGrocerFlag().enabled`
- `src/pages/ShoppingListPage.tsx`:
  - Add grocer chip in header (when flag on): "Link store" or store name → opens `ListStoreLinkerModal`
  - Add "Shop at Kroger" button (when flag on + list linked + connection has store) → opens `CartPreviewModal`
  - Hide button when `!navigator.onLine`

### Routing — `src/App.tsx`

Add lazy route inside AuthGuard + AppShell:
```typescript
const GrocerCallbackPage = lazy(() => import('@/pages/GrocerCallbackPage').then(m => ({ default: m.GrocerCallbackPage })))
<Route path="/grocer/callback/:provider" element={<GrocerCallbackPage />} />
```

### i18n — `src/lib/i18n.ts`

Add the keys listed in the planner spec section 11. All keys need `en`, `he`, `es` (use English text as placeholder for he/es when translation not available). Key prefix: `grocer.*`.

---

## 6. Implementation Order

### Backend tasks (sequential within column)
1. **B1** — Write + apply migration `023_grocer_integrations.sql`. Verify `get_my_accessible_list_ids()` exists.
2. **B2** — Build `_shared/encrypt.ts`, verify roundtrip.
3. **B3** — `kroger-oauth-start` + `kroger-oauth-callback`.
4. **B4** — `kroger-stores`.
5. **B5** — `kroger-search` (with caching).
6. **B6** — `kroger-add-to-cart`.
7. **B7** — Deploy all 5 functions: `npx supabase functions deploy <name> --no-verify-jwt`.

### Frontend tasks (some parallel with backend)
1. **F1** (parallel with B1) — Types + i18n keys + route registration with placeholder page.
2. **F2** (parallel with B2) — `src/services/grocers/*` (types, stubs, registry, service.ts).
3. **F3** — `useGrocerFlag` hook + `ConnectedStoresSection` wired into MorePage (empty state).
4. **F4** (after B3 deployed) — `GrocerCallbackPage` + `KrogerConnectCard` + OAuth redirect flow.
5. **F5** (after B4 deployed) — `StorePickerModal` + `KrogerConnectionCard`.
6. **F6** (after B5 deployed) — `ListStoreLinkerModal` + grocer chip on list + `CartPreviewModal` skeleton.
7. **F7** (after B6 deployed) — Wire `addListToCart` in `CartPreviewModal`.

---

## 7. Test Plan (when flag is flipped on for Ofer)

Enable for ofer only:
```sql
UPDATE public.app_config
SET value = jsonb_build_object('enabled', false, 'enabled_for_user_ids',
  jsonb_build_array((SELECT id::text FROM auth.users WHERE email = 'oelyakim@gmail.com')))
WHERE key = 'grocer_integrations';
```

1. **Flag gate** — Other accounts: section hidden, `kroger-oauth-start` returns 403, list chip hidden.
2. **Flag on for Ofer** — section appears with `KrogerConnectCard`.
3. **OAuth** — Connect button → Kroger login → callback → toast → DB row exists with encrypted tokens.
4. **Store selection** — Enter ZIP → list of stores → select → DB updated → name shown in Profile.
5. **List linking** — Open list → "Link store" chip → modal → confirm → `list_grocer_links` row exists.
6. **Price preview** — "Shop at Kroger" → `CartPreviewModal` opens with prices, unmatched items show "Not found".
7. **Add to cart** — "Add all" → Kroger account cart shows items → success toast.
8. **Token refresh** — Manually expire `expires_at` → next call refreshes → still works.
9. **Disconnect** — Disconnect → row removed → `KrogerConnectCard` returns.
10. **Offline** — DevTools offline → "Shop at Kroger" hidden → list itself still works.

---

## 8. Open implementer-time decisions (no escalation needed)

- Token refresh window: refresh when `expires_at < now() + 5 minutes`.
- Persist last-used ZIP in `grocer_connections.store_zip` so picker pre-populates.
- If Kroger doesn't return a cart deep link, fallback to `https://www.kroger.com/cart`.

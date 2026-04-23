-- Grocer Integrations
-- Adds tables for storing encrypted grocer OAuth tokens, a product price cache,
-- list-to-store links, and a feature-flag config table. Behind a flag (off by default).
--
-- NOTE: get_my_accessible_list_ids() was applied directly (not in a prior migration file).
-- We define it here with CREATE OR REPLACE so this migration is safe to run regardless.

-- ── Security-definer helper: accessible shopping list IDs ───────────────────
-- A list is accessible if the current user created it OR has an explicit access
-- grant in shopping_list_access. This matches the RLS pattern in migration 005.
CREATE OR REPLACE FUNCTION public.get_my_accessible_list_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.shopping_lists WHERE created_by = auth.uid()
  UNION
  SELECT list_id FROM public.shopping_list_access WHERE user_id = auth.uid()
$$;

-- ── TABLE 1: grocer_connections ─────────────────────────────────────────────
-- One row per user per provider. Stores encrypted OAuth tokens and the
-- user's preferred store for that provider.
CREATE TABLE IF NOT EXISTS public.grocer_connections (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider          text        NOT NULL CHECK (provider IN ('kroger', 'walmart', 'instacart')),
  access_token_enc  text        NOT NULL,
  refresh_token_enc text        NOT NULL,
  token_iv          text        NOT NULL,
  expires_at        timestamptz NOT NULL,
  store_id          text,
  store_name        text,
  store_zip         text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS grocer_connections_user_idx
  ON public.grocer_connections (user_id);

ALTER TABLE public.grocer_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their grocer connections" ON public.grocer_connections;
CREATE POLICY "Users own their grocer connections"
  ON public.grocer_connections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── TABLE 2: grocer_product_cache ────────────────────────────────────────────
-- Server-side cache for Kroger product search results. Populated by the
-- kroger-search edge function (service role only). No RLS — client never
-- queries this table directly.
CREATE TABLE IF NOT EXISTS public.grocer_product_cache (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text        NOT NULL,
  store_id         text        NOT NULL,
  query_normalized text        NOT NULL,
  results          jsonb       NOT NULL,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS grocer_cache_lookup_idx
  ON public.grocer_product_cache (provider, store_id, query_normalized);

CREATE INDEX IF NOT EXISTS grocer_cache_expiry_idx
  ON public.grocer_product_cache (expires_at);

-- Do NOT enable RLS — service role only access.

-- ── TABLE 3: list_grocer_links ───────────────────────────────────────────────
-- Links a shopping list to a specific grocer + store. One row per list.
-- Circle members who can access the list can view/manage the link.
CREATE TABLE IF NOT EXISTS public.list_grocer_links (
  list_id    uuid        PRIMARY KEY REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  provider   text        NOT NULL CHECK (provider IN ('kroger', 'walmart', 'instacart')),
  store_id   text        NOT NULL,
  store_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.list_grocer_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "List members can view grocer links" ON public.list_grocer_links;
CREATE POLICY "List members can view grocer links"
  ON public.list_grocer_links FOR SELECT
  USING (list_id IN (SELECT public.get_my_accessible_list_ids()));

DROP POLICY IF EXISTS "List members can insert grocer links" ON public.list_grocer_links;
CREATE POLICY "List members can insert grocer links"
  ON public.list_grocer_links FOR INSERT
  WITH CHECK (list_id IN (SELECT public.get_my_accessible_list_ids()));

DROP POLICY IF EXISTS "List members can update grocer links" ON public.list_grocer_links;
CREATE POLICY "List members can update grocer links"
  ON public.list_grocer_links FOR UPDATE
  USING (list_id IN (SELECT public.get_my_accessible_list_ids()));

DROP POLICY IF EXISTS "List members can delete grocer links" ON public.list_grocer_links;
CREATE POLICY "List members can delete grocer links"
  ON public.list_grocer_links FOR DELETE
  USING (list_id IN (SELECT public.get_my_accessible_list_ids()));

-- ── TABLE 3b: grocer_oauth_states ────────────────────────────────────────────
-- Short-lived CSRF state tokens for OAuth handshakes. Created by
-- kroger-oauth-start, verified + deleted by kroger-oauth-callback. No client
-- access — service role only.
CREATE TABLE IF NOT EXISTS public.grocer_oauth_states (
  state      text        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider   text        NOT NULL CHECK (provider IN ('kroger', 'walmart', 'instacart')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocer_oauth_states_expiry_idx
  ON public.grocer_oauth_states (expires_at);

ALTER TABLE public.grocer_oauth_states ENABLE ROW LEVEL SECURITY;
-- No client policies — service role only.
REVOKE ALL ON public.grocer_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.grocer_product_cache  FROM anon, authenticated;

-- ── TABLE 4: app_config ──────────────────────────────────────────────────────
-- Single-row-per-key configuration store. Service role writes; any
-- authenticated user can read (for feature flags).
CREATE TABLE IF NOT EXISTS public.app_config (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app_config" ON public.app_config;
CREATE POLICY "Anyone can read app_config"
  ON public.app_config FOR SELECT
  USING (true);

-- No INSERT / UPDATE / DELETE client policies — service role manages this table.

-- Seed the grocer integrations flag (off by default, enabled_for_user_ids is empty).
INSERT INTO public.app_config (key, value)
VALUES ('grocer_integrations', '{"enabled": false, "enabled_for_user_ids": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Feature-flag helper for edge functions ──────────────────────────────────
-- Returns true when the grocer integrations flag is globally on OR the
-- given user UUID appears in the enabled_for_user_ids allowlist.
CREATE OR REPLACE FUNCTION public.grocer_flag_enabled_for(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
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

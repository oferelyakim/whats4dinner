-- Migration 041 (v3.2.1): track when an item was checked off so the UI can
-- show "most recently checked" first. Lets users spot a misclick (the last
-- thing they tapped lands on top) and powers the "Delete checked" CTA.
--
-- Idempotent: safe to re-run.

alter table public.shopping_list_items
  add column if not exists checked_at timestamptz;

-- Backfill existing already-checked rows with their created_at so the order
-- isn't all-NULL on day one. New checks land at now() via the client.
update public.shopping_list_items
   set checked_at = created_at
 where is_checked = true
   and checked_at is null;

create index if not exists shopping_list_items_checked_at_idx
  on public.shopping_list_items (list_id, checked_at desc nulls last)
  where is_checked = true;

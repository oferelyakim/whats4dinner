-- Circle skin system
-- Adds two columns on `circles` so the Hearth redesign can ship per-circle
-- appearance (one of the 9 built-in skins, or a custom JSON token bundle
-- for AI Family tier). Idempotent.
--
-- Default skin is 'hearth' — every existing row is backfilled via the column
-- default.

ALTER TABLE public.circles
  ADD COLUMN IF NOT EXISTS skin_id    text  DEFAULT 'hearth',
  ADD COLUMN IF NOT EXISTS custom_skin jsonb;

-- Backfill any pre-existing NULLs (ADD COLUMN with DEFAULT handles new rows,
-- but this is cheap insurance for rows that pre-date the default).
UPDATE public.circles
   SET skin_id = 'hearth'
 WHERE skin_id IS NULL;

NOTIFY pgrst, 'reload schema';

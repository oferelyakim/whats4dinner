-- Add type field to recipes table to support supply kits
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'recipe'
  CHECK (type IN ('recipe', 'supply_kit'));

-- Add category for supply kits (Bathroom, Kitchen, Office, etc.)
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS kit_category text;

CREATE INDEX IF NOT EXISTS recipes_type_idx ON public.recipes(type);

NOTIFY pgrst, 'reload schema';

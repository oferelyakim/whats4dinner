-- Add missing columns to activities table
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS participants jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS bring_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Create chores table
CREATE TABLE IF NOT EXISTS public.chores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT '🧹',
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'once')),
  recurrence_days integer[] DEFAULT '{}',
  due_time time,
  points integer NOT NULL DEFAULT 1,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_name text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chores_circle_idx ON public.chores(circle_id);

DO $$ BEGIN
  CREATE TRIGGER chores_updated_at
    BEFORE UPDATE ON public.chores
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.chores ENABLE ROW LEVEL SECURITY;

-- RLS for chores
DO $$ BEGIN
  CREATE POLICY "Circle members can view chores"
    ON public.chores FOR SELECT
    USING (circle_id IN (SELECT public.get_my_circle_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Circle members can create chores"
    ON public.chores FOR INSERT
    WITH CHECK (circle_id IN (SELECT public.get_my_circle_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Creator can update chores"
    ON public.chores FOR UPDATE
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Creator can delete chores"
    ON public.chores FOR DELETE
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Chore completions tracking
CREATE TABLE IF NOT EXISTS public.chore_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_id uuid NOT NULL REFERENCES public.chores(id) ON DELETE CASCADE,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_name text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  due_date date,
  notes text,
  points_earned integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS chore_completions_chore_idx ON public.chore_completions(chore_id);
CREATE INDEX IF NOT EXISTS chore_completions_date_idx ON public.chore_completions(completed_at);

ALTER TABLE public.chore_completions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Circle members can view completions"
    ON public.chore_completions FOR SELECT
    USING (chore_id IN (SELECT id FROM public.chores));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can mark chores done"
    ON public.chore_completions FOR INSERT
    WITH CHECK (chore_id IN (SELECT id FROM public.chores));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';

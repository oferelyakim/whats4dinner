-- Add pending_approval status to event_items
ALTER TABLE public.event_items DROP CONSTRAINT IF EXISTS event_items_status_check;
ALTER TABLE public.event_items ADD CONSTRAINT event_items_status_check
  CHECK (status IN ('unclaimed', 'claimed', 'pending_approval', 'in_progress', 'done'));

NOTIFY pgrst, 'reload schema';

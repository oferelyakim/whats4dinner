-- Migration 019: Activity Reminders + Yearly Recurrence
-- Adds reminders jsonb column to activities
-- Expands recurrence_type check constraint to include 'yearly'

-- 1. Add reminders column
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS reminders jsonb DEFAULT '[]'::jsonb;

-- 2. Drop existing check constraint and re-create with 'yearly'
ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_recurrence_type_check;

ALTER TABLE activities
  ADD CONSTRAINT activities_recurrence_type_check
  CHECK (recurrence_type IN ('once', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom'));

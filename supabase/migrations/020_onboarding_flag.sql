-- Migration 020: Add has_onboarded flag to profiles
-- Tracks whether user has completed the onboarding flow

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_onboarded boolean DEFAULT false;

-- Migration: Add start_period to tasks table
-- Chooses whether a half-day task sits in the morning or the afternoon when it
-- is exported as a calendar appointment. NULL means "derive from the schedule",
-- which is what every existing row does today.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_period TEXT
  CHECK (start_period IS NULL OR start_period IN ('AM', 'PM'));

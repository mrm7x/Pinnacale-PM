-- Migration: drop billing, add due_date + task_owner
-- Billing is no longer a stored concept; task completion now implies billing.

ALTER TABLE tasks DROP COLUMN IF EXISTS billed;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_owner TEXT NOT NULL DEFAULT 'Pinnacle';

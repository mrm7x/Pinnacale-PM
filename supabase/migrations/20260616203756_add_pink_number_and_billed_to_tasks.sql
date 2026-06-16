-- Migration: Add pink_number, billed, and sort_order to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pink_number TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

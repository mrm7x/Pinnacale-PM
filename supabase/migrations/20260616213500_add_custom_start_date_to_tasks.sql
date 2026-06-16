-- Migration: Add custom_start_date to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_start_date TEXT;

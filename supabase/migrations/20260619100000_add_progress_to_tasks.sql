-- Migration: Add progress to tasks table (0-100, stored on leaf tasks)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;

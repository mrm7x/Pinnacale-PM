-- Pinnacle Projects Supabase Database Schema
-- Run this script in your Supabase SQL Editor to configure your database tables.

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--------------------------------------------------------------------------------
-- 1. CONSULTANTS TABLE
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'Consultant',
    avatar_color TEXT NOT NULL DEFAULT '#0d9488',
    tier TEXT NOT NULL DEFAULT 'consultant', -- 'admin' | 'project_manager' | 'consultant' | 'read_only'
    password_hash TEXT, -- Fallback plaintext hash when Supabase Auth is inactive
    must_reset_password BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;

-- Create policies (Simplest: Allow all authenticated operations, or full public read/write if anon key used)
CREATE POLICY "Allow read access for anyone" ON consultants FOR SELECT USING (true);
CREATE POLICY "Allow write access for authenticated users" ON consultants FOR ALL USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 2. PROJECTS TABLE
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    description TEXT,
    budget_days NUMERIC NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL, -- Format YYYY-MM-DD
    target_go_live_date TEXT NOT NULL, -- Format YYYY-MM-DD
    consultant_ids TEXT[] NOT NULL DEFAULT '{}', -- Array of consultant IDs
    is_template BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for anyone" ON projects FOR SELECT USING (true);
CREATE POLICY "Allow write access for authenticated users" ON projects FOR ALL USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 3. TASKS TABLE
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    duration_days NUMERIC NOT NULL DEFAULT 1.0,
    assigned_consultant_id TEXT REFERENCES consultants(id) ON DELETE SET NULL,
    predecessor_ids TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'not_started', -- 'not_started' | 'in_progress' | 'completed' | 'blocked'
    o365_task_id TEXT,
    o365_calendar_event_id TEXT,
    planned_start_date TEXT,
    planned_end_date TEXT,
    start_half_day INTEGER NOT NULL DEFAULT 0,
    end_half_day INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for anyone" ON tasks FOR SELECT USING (true);
CREATE POLICY "Allow write access for authenticated users" ON tasks FOR ALL USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 4. INITIAL SEED DATA
--------------------------------------------------------------------------------

-- Seed default consultants (Note: admin email is customized to mohammad.jenabi@gmail.com)
INSERT INTO consultants (id, name, email, role, avatar_color, tier, password_hash, must_reset_password)
VALUES 
  ('admin', 'System Administrator', 'mohammad.jenabi@gmail.com', 'Administrator', '#2d4a65', 'admin', '6ee4a469cd4e91053847f5d3fcb61dbcc91e8f0ef10be7748da4c4a1ba382d17', false),
  ('c1', 'Sarah Jenkins', 'sarah.jenkins@pinnacle.com', 'Lead Consultant', '#0d9488', 'consultant', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', true),
  ('c2', 'Alex Rivera', 'alex.rivera@pinnacle.com', 'Technical Architect', '#6366f1', 'consultant', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', true),
  ('c3', 'Marcus Brody', 'marcus.brody@pinnacle.com', 'Project Manager', '#f59e0b', 'project_manager', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', true),
  ('c4', 'David Vance', 'david.vance@pinnacle.com', 'Executive Sponsor (Read Only)', '#ef4444', 'read_only', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', true)
ON CONFLICT (email) DO UPDATE 
SET name = EXCLUDED.name, role = EXCLUDED.role, tier = EXCLUDED.tier, password_hash = EXCLUDED.password_hash;

-- Seed default project (Horizon Logistics implementation)
INSERT INTO projects (id, name, client_name, description, budget_days, start_date, target_go_live_date, consultant_ids, is_template)
VALUES (
    'p1',
    'Sage Intacct Financials Implementation',
    'Horizon Logistics Corp',
    'Core financial ledger setups, Accounts Payable, Accounts Receivable, Cash Management, and custom dimensional configurations.',
    25,
    CURRENT_DATE::TEXT,
    (CURRENT_DATE + INTERVAL '90 days')::DATE::TEXT,
    ARRAY['c1', 'c2']::TEXT[],
    false
) ON CONFLICT (id) DO NOTHING;

-- Seed template project
INSERT INTO projects (id, name, client_name, description, budget_days, start_date, target_go_live_date, consultant_ids, is_template)
VALUES (
    'tmpl_sage_intacct',
    'Sage Intacct Implementation',
    'Template Reference',
    'Generate a standardized, multi-stage project management structure for enterprise accounting software deployment.',
    25,
    CURRENT_DATE::TEXT,
    (CURRENT_DATE + INTERVAL '90 days')::DATE::TEXT,
    ARRAY[]::TEXT[],
    true
) ON CONFLICT (id) DO NOTHING;

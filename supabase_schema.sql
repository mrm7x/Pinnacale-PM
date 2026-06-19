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
    tier TEXT NOT NULL DEFAULT 'normal', -- 'superuser' | 'admin' | 'normal' (must match client-side Consultant.tier union)
    password_hash TEXT, -- Fallback plaintext hash when Supabase Auth is inactive
    must_reset_password BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;

-- Create policies. NOTE: WITH USING(true)/CHECK(true) these are intentionally
-- permissive (full public read AND write). Tighten to auth.role() = 'authenticated'
-- if you need to restrict writes to signed-in users.
CREATE POLICY "Allow read access for anyone" ON consultants FOR SELECT USING (true);
CREATE POLICY "Allow full write access" ON consultants FOR ALL USING (true) WITH CHECK (true);

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
    project_manager_id TEXT REFERENCES consultants(id),
    lead_consultant_id TEXT REFERENCES consultants(id),
    customer_id TEXT REFERENCES consultants(id),
    project_resource_ids TEXT[] NOT NULL DEFAULT '{}',
    trello_link TEXT,
    sharepoint_link TEXT,
    rag_scope TEXT DEFAULT 'green',
    rag_schedule TEXT DEFAULT 'green',
    rag_costs TEXT DEFAULT 'green',
    rag_benefits TEXT DEFAULT 'green',
    rag_overall TEXT DEFAULT 'green',
    status TEXT NOT NULL DEFAULT 'new', -- 'new', 'in progress', 'on hold', 'completed', 'cancelled'
    phase TEXT, -- Human-readable delivery phase (e.g. 'Discovery', 'Implementation', 'Hypercare')
    is_template BOOLEAN NOT NULL DEFAULT false,
    icon TEXT,
    color_theme TEXT,
    created_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for anyone" ON projects FOR SELECT USING (true);
CREATE POLICY "Allow full write access" ON projects FOR ALL USING (true) WITH CHECK (true);

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
    pink_number TEXT,
    billed BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    custom_start_date TEXT,
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for anyone" ON tasks FOR SELECT USING (true);
CREATE POLICY "Allow full write access" ON tasks FOR ALL USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 4. COMMUNICATIONS TABLE
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS communications (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    type TEXT NOT NULL, -- 'Teams call', 'email', 'in person meeting'
    description TEXT,
    creator_id TEXT REFERENCES consultants(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for anyone" ON communications FOR SELECT USING (true);
CREATE POLICY "Allow full write access" ON communications FOR ALL USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 5. INITIAL SEED DATA
--------------------------------------------------------------------------------

-- Seed default consultants (Note: admin email is customized to mohammad.jenabi@gmail.com)
INSERT INTO consultants (id, name, email, role, avatar_color, tier, password_hash, must_reset_password)
VALUES
  ('admin', 'System Administrator', 'mohammad.jenabi@gmail.com', 'Manager', '#2d4a65', 'superuser', '6ee4a469cd4e91053847f5d3fcb61dbcc91e8f0ef10be7748da4c4a1ba382d17', false),
  ('c1', 'Sarah Jenkins', 'sarah.jenkins@pinnacle.com', 'Lead Consultant', '#0d9488', 'normal', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', true),
  ('c2', 'Alex Rivera', 'alex.rivera@pinnacle.com', 'Consultant', '#6366f1', 'normal', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', true),
  ('c3', 'Marcus Brody', 'marcus.brody@pinnacle.com', 'Project Manager', '#f59e0b', 'normal', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', true),
  ('c4', 'David Vance', 'david.vance@pinnacle.com', 'Read only', '#ef4444', 'normal', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', true)
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

-- ============================================================================
-- Pinnacle Projects Supabase Database Schema (reference)
-- ----------------------------------------------------------------------------
-- This file documents the intended schema + RLS posture. The source of truth
-- for the live database is the ordered migrations under /supabase/migrations,
-- which are applied automatically via the GitHub "Deploy Migrations" workflow.
--
-- SECURITY: RLS is ENABLED on every table and locked to the `authenticated`
-- role. The `anon` role is revoked. Do NOT weaken these policies, and do NOT
-- seed default credentials in SQL. Users are created exclusively via Supabase
-- Auth (email/password) by an administrator.
-- ============================================================================

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
    tier TEXT NOT NULL DEFAULT 'normal',            -- 'superuser' | 'admin' | 'normal'
    password_hash TEXT,                             -- legacy local-mode hash; unused in Supabase Auth mode
    must_reset_password BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultants_select_authenticated" ON consultants FOR SELECT TO authenticated USING (true);
CREATE POLICY "consultants_insert_authenticated" ON consultants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "consultants_update_authenticated" ON consultants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "consultants_delete_authenticated" ON consultants FOR DELETE TO authenticated USING (true);
REVOKE ALL ON consultants FROM anon;

--------------------------------------------------------------------------------
-- 2. PROJECTS TABLE
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    description TEXT,
    budget_days NUMERIC NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,                       -- YYYY-MM-DD
    target_go_live_date TEXT NOT NULL,              -- YYYY-MM-DD
    consultant_ids TEXT[] NOT NULL DEFAULT '{}',
    project_manager_id TEXT REFERENCES consultants(id),
    lead_consultant_id TEXT REFERENCES consultants(id),
    customer_id TEXT REFERENCES consultants(id),
    project_resource_ids TEXT[] NOT NULL DEFAULT '{}',
    trello_link TEXT,
    sharepoint_link TEXT,
    sage_crm_link TEXT,
    rag_scope TEXT DEFAULT 'green',
    rag_schedule TEXT DEFAULT 'green',
    rag_costs TEXT DEFAULT 'green',
    rag_benefits TEXT DEFAULT 'green',
    rag_overall TEXT DEFAULT 'green',
    status TEXT NOT NULL DEFAULT 'new',
    phase TEXT,
    is_template BOOLEAN NOT NULL DEFAULT false,
    icon TEXT,
    color_theme TEXT,
    created_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select_authenticated" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_insert_authenticated" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "projects_update_authenticated" ON projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "projects_delete_authenticated" ON projects FOR DELETE TO authenticated USING (true);
REVOKE ALL ON projects FROM anon;

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
    status TEXT NOT NULL DEFAULT 'not_started',
    o365_task_id TEXT,
    o365_calendar_event_id TEXT,
    planned_start_date TEXT,
    planned_end_date TEXT,
    start_half_day INTEGER NOT NULL DEFAULT 0,
    end_half_day INTEGER NOT NULL DEFAULT 0,
    pink_number TEXT,
    sort_order INTEGER DEFAULT 0,
    custom_start_date TEXT,
    progress INTEGER DEFAULT 0,
    due_date TEXT,
    task_owner TEXT NOT NULL DEFAULT 'Pinnacle',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_authenticated" ON tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert_authenticated" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tasks_update_authenticated" ON tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tasks_delete_authenticated" ON tasks FOR DELETE TO authenticated USING (true);
REVOKE ALL ON tasks FROM anon;

--------------------------------------------------------------------------------
-- 4. COMMUNICATIONS TABLE
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS communications (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    creator_id TEXT REFERENCES consultants(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "communications_select_authenticated" ON communications FOR SELECT TO authenticated USING (true);
CREATE POLICY "communications_insert_authenticated" ON communications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "communications_update_authenticated" ON communications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "communications_delete_authenticated" ON communications FOR DELETE TO authenticated USING (true);
REVOKE ALL ON communications FROM anon;

--------------------------------------------------------------------------------
-- 5. SEED DATA — none.
-- Project/template seed rows belong in the migration that creates them, not
-- here. Do NOT seed users or credentials in SQL. Create the first admin via
-- Supabase Dashboard → Authentication → Users → "Add user", then insert the
-- matching consultants row with the Supabase Auth user id as `id`.
--------------------------------------------------------------------------------

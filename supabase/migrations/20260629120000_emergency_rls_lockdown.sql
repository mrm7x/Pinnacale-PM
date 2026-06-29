-- ============================================================================
-- EMERGENCY RLS LOCKDOWN (Phase 1 security fix)
-- ----------------------------------------------------------------------------
-- Problem: every table currently ships WITH `USING (true)` / `WITH CHECK (true)`
-- policies with NO auth check, and the live project exposes
-- `Access-Control-Allow-Origin: *`. Combined, this lets ANY party on the
-- internet read and write every row (including the `consultants.password_hash`
-- column and the `tier` field that grants superuser privileges).
--
-- This migration closes the open hole as a stop-gap:
--   * Drops all permissive policies.
--   * Requires every read AND write to come from an authenticated session.
--   * Revokes all direct table privileges from the `anon` role.
--
-- This is intentionally minimal and role-agnostic. Phase 2 will replace these
-- with proper role-aware policies once Supabase Auth + the role model land.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- consultants
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow read access for anyone" ON consultants;
DROP POLICY IF EXISTS "Allow full write access"     ON consultants;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON consultants;

CREATE POLICY "consultants_select_authenticated"
  ON consultants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "consultants_insert_authenticated"
  ON consultants FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "consultants_update_authenticated"
  ON consultants FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "consultants_delete_authenticated"
  ON consultants FOR DELETE TO authenticated
  USING (true);

REVOKE ALL ON consultants FROM anon;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow read access for anyone" ON projects;
DROP POLICY IF EXISTS "Allow full write access"     ON projects;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON projects;

CREATE POLICY "projects_select_authenticated"
  ON projects FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "projects_insert_authenticated"
  ON projects FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "projects_update_authenticated"
  ON projects FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "projects_delete_authenticated"
  ON projects FOR DELETE TO authenticated
  USING (true);

REVOKE ALL ON projects FROM anon;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow read access for anyone" ON tasks;
DROP POLICY IF EXISTS "Allow full write access"     ON tasks;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON tasks;

CREATE POLICY "tasks_select_authenticated"
  ON tasks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tasks_insert_authenticated"
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tasks_update_authenticated"
  ON tasks FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "tasks_delete_authenticated"
  ON tasks FOR DELETE TO authenticated
  USING (true);

REVOKE ALL ON tasks FROM anon;

-- ---------------------------------------------------------------------------
-- communications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow read access for anyone" ON communications;
DROP POLICY IF EXISTS "Allow full write access"     ON communications;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON communications;

CREATE POLICY "communications_select_authenticated"
  ON communications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "communications_insert_authenticated"
  ON communications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "communications_update_authenticated"
  ON communications FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "communications_delete_authenticated"
  ON communications FOR DELETE TO authenticated
  USING (true);

REVOKE ALL ON communications FROM anon;

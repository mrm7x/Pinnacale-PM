-- ============================================================================
-- ROLE-AWARE RLS POLICIES (Phase 2)
-- ----------------------------------------------------------------------------
-- Replaces the Phase 1 "authenticated blanket" policies with role-aware rules
-- that enforce the capability matrix at the database. The UI applies the same
-- rules for UX; this is the security backstop that prevents direct API access
-- from bypassing the UI.
--
-- Actor model:
--   - Internal users are rows in `consultants`, id = auth.uid().
--   - External users are rows in `customers`,    id = auth.uid().
--   - `consultants.role` drives project/task powers.
--   - `consultants.tier` / `customers.tier` drives admin powers (customers
--     are forced to 'normal' by the customers table CHECK constraint).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper predicates (STABLE functions usable inside USING / WITH CHECK)
-- ---------------------------------------------------------------------------

-- Is the current user a superuser or admin (internal)?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultants c
    WHERE c.id = auth.uid() AND c.tier IN ('superuser', 'admin')
  );
$$;

-- Is the current user an internal Manager or Project Manager?
CREATE OR REPLACE FUNCTION public.is_internal_manager()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultants c
    WHERE c.id = auth.uid() AND c.role IN ('Manager', 'Project Manager')
  );
$$;

-- Is the current user the lead consultant or PM of project p_id?
CREATE OR REPLACE FUNCTION public.is_project_lead(p_id TEXT)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_id
      AND (p.lead_consultant_id = auth.uid() OR p.project_manager_id = auth.uid())
  );
$$;

-- Is the current user a member (resource) of project p_id? Includes lead/PM.
CREATE OR REPLACE FUNCTION public.is_project_member(p_id TEXT)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_id AND (
      p.lead_consultant_id    = auth.uid() OR
      p.project_manager_id    = auth.uid() OR
      auth.uid() = ANY(p.project_resource_ids) OR
      auth.uid() = ANY(p.consultant_ids)
    )
  );
$$;

-- Is the current user the assigned customer of project p_id?
CREATE OR REPLACE FUNCTION public.is_project_customer(p_id TEXT)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_id AND p.customer_id = auth.uid()
  );
$$;

-- Does the current user have any access to project p_id? (read predicate)
CREATE OR REPLACE FUNCTION public.can_see_project(p_id TEXT)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT is_admin()
      OR is_internal_manager()
      OR is_project_lead(p_id)
      OR is_project_member(p_id)
      OR is_project_customer(p_id)
      -- Internal read-only users can see all projects (read-only role).
      OR EXISTS (
        SELECT 1 FROM consultants c
        WHERE c.id = auth.uid() AND c.role = 'Read only'
      );
$$;

-- ===========================================================================
-- consultants
-- ===========================================================================
DROP POLICY IF EXISTS "consultants_select_authenticated" ON consultants;
DROP POLICY IF EXISTS "consultants_insert_authenticated" ON consultants;
DROP POLICY IF EXISTS "consultants_update_authenticated" ON consultants;
DROP POLICY IF EXISTS "consultants_delete_authenticated" ON consultants;
DROP POLICY IF EXISTS "Allow read access for anyone"   ON consultants;
DROP POLICY IF EXISTS "Allow full write access"        ON consultants;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON consultants;

-- Everyone who is signed in can read the internal directory (needed to render
-- assignee dropdowns, team lists, etc.).
CREATE POLICY "consultants_select"
  ON consultants FOR SELECT TO authenticated USING (true);

-- Only admins can create/modify internal users.
CREATE POLICY "consultants_insert"
  ON consultants FOR INSERT TO authenticated
  WITH CHECK (is_admin());
CREATE POLICY "consultants_update"
  ON consultants FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "consultants_delete"
  ON consultants FOR DELETE TO authenticated
  USING (is_admin());

-- ===========================================================================
-- customers
-- ===========================================================================
DROP POLICY IF EXISTS "customers_select_authenticated" ON customers;
DROP POLICY IF EXISTS "customers_insert_authenticated" ON customers;
DROP POLICY IF EXISTS "customers_update_authenticated" ON customers;
DROP POLICY IF EXISTS "customers_delete_authenticated" ON customers;

-- A customer can read their own row; admins/managers can read all (to populate
-- the project-creation customer selector).
CREATE POLICY "customers_select"
  ON customers FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin() OR is_internal_manager());

-- Only admins can manage customers. A customer may never edit their own row
-- (tier is forced by constraint; even self-edit is denied to prevent name/email
-- shenanigans — manage via admin).
CREATE POLICY "customers_insert"
  ON customers FOR INSERT TO authenticated
  WITH CHECK (is_admin());
CREATE POLICY "customers_update"
  ON customers FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "customers_delete"
  ON customers FOR DELETE TO authenticated
  USING (is_admin());

-- ===========================================================================
-- projects
-- ===========================================================================
DROP POLICY IF EXISTS "projects_select_authenticated" ON projects;
DROP POLICY IF EXISTS "projects_insert_authenticated" ON projects;
DROP POLICY IF EXISTS "projects_update_authenticated" ON projects;
DROP POLICY IF EXISTS "projects_delete_authenticated" ON projects;
DROP POLICY IF EXISTS "Allow read access for anyone"   ON projects;
DROP POLICY IF EXISTS "Allow full write access"        ON projects;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON projects;

CREATE POLICY "projects_select"
  ON projects FOR SELECT TO authenticated
  USING (can_see_project(id));

-- Only managers/PMs create projects.
CREATE POLICY "projects_insert"
  ON projects FOR INSERT TO authenticated
  WITH CHECK (is_internal_manager());

-- Managers/PMs edit any project; the project lead/PM edits their own.
CREATE POLICY "projects_update"
  ON projects FOR UPDATE TO authenticated
  USING (is_internal_manager() OR is_project_lead(id))
  WITH CHECK (is_internal_manager() OR is_project_lead(id));

-- Only managers/PMs delete projects.
CREATE POLICY "projects_delete"
  ON projects FOR DELETE TO authenticated
  USING (is_internal_manager());

-- ===========================================================================
-- tasks
-- ===========================================================================
DROP POLICY IF EXISTS "tasks_select_authenticated" ON tasks;
DROP POLICY IF EXISTS "tasks_insert_authenticated" ON tasks;
DROP POLICY IF EXISTS "tasks_update_authenticated" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_authenticated" ON tasks;
DROP POLICY IF EXISTS "Allow read access for anyone"   ON tasks;
DROP POLICY IF EXISTS "Allow full write access"        ON tasks;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON tasks;

-- Read: anyone who can see the parent project can read its tasks.
CREATE POLICY "tasks_select"
  ON tasks FOR SELECT TO authenticated
  USING (can_see_project(project_id));

-- Create: managers/PMs and the project lead.
CREATE POLICY "tasks_insert"
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (is_internal_manager() OR is_project_lead(project_id));

-- Update: the nuanced rule.
--   managers/PMs           -> any task
--   project lead           -> any task on their project
--   resource consultant    -> only tasks assigned to them
--   customer on project    -> only customer-owned tasks
--     (task_owner IN ('Customer', 'Pinnacle/Customer'))
CREATE POLICY "tasks_update"
  ON tasks FOR UPDATE TO authenticated
  USING (
    is_internal_manager()
    OR is_project_lead(project_id)
    OR (assigned_consultant_id = auth.uid() AND is_project_member(project_id))
    OR (
      is_project_customer(project_id)
      AND COALESCE(task_owner, 'Pinnacle') IN ('Customer', 'Pinnacle/Customer')
    )
  )
  WITH CHECK (
    is_internal_manager()
    OR is_project_lead(project_id)
    OR (assigned_consultant_id = auth.uid() AND is_project_member(project_id))
    OR (
      is_project_customer(project_id)
      AND COALESCE(task_owner, 'Pinnacle') IN ('Customer', 'Pinnacle/Customer')
    )
  );

-- Delete: managers/PMs and the project lead.
CREATE POLICY "tasks_delete"
  ON tasks FOR DELETE TO authenticated
  USING (is_internal_manager() OR is_project_lead(project_id));

-- ===========================================================================
-- communications
-- ===========================================================================
DROP POLICY IF EXISTS "communications_select_authenticated" ON communications;
DROP POLICY IF EXISTS "communications_insert_authenticated" ON communications;
DROP POLICY IF EXISTS "communications_update_authenticated" ON communications;
DROP POLICY IF EXISTS "communications_delete_authenticated" ON communications;
DROP POLICY IF EXISTS "Allow read access for anyone"   ON communications;
DROP POLICY IF EXISTS "Allow full write access"        ON communications;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON communications;

-- Read: anyone who can see the parent project can read its communications.
CREATE POLICY "communications_select"
  ON communications FOR SELECT TO authenticated
  USING (can_see_project(project_id));

-- Create/update: managers/PMs, project lead, or any project member (internal).
CREATE POLICY "communications_insert"
  ON communications FOR INSERT TO authenticated
  WITH CHECK (
    is_internal_manager()
    OR is_project_lead(project_id)
    OR (is_project_member(project_id) AND NOT is_project_customer(project_id))
  );
CREATE POLICY "communications_update"
  ON communications FOR UPDATE TO authenticated
  USING (
    is_internal_manager()
    OR is_project_lead(project_id)
    OR (is_project_member(project_id) AND NOT is_project_customer(project_id))
  )
  WITH CHECK (
    is_internal_manager()
    OR is_project_lead(project_id)
    OR (is_project_member(project_id) AND NOT is_project_customer(project_id))
  );

-- Delete: managers/PMs or project lead.
CREATE POLICY "communications_delete"
  ON communications FOR DELETE TO authenticated
  USING (is_internal_manager() OR is_project_lead(project_id));

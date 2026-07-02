-- ============================================================================
-- FULL EDIT POWERS + TIER HIERARCHY (Phase 3)
-- ----------------------------------------------------------------------------
-- Brings the database RLS backstop in line with the spec:
--   1. Tier grants edit powers (most-permissive-wins). A superuser/admin can
--      edit ALL data regardless of role. (Previously only role=Manager/PM or
--      project lead could write.)
--   2. A resource Consultant edits the ENTIRE project they're a member of
--      (all tasks, not just their own).
--   3. Tier hierarchy on user management: a non-superuser admin may only
--      write tier='normal' rows. Only superusers can create admins/superusers.
--   4. Loosens the task privileged-field trigger (from 20260701150000) so that
--      any project member (resource consultant) can edit billing/ownership/
--      assignment fields on tasks in their project — full amend-in-entirety
--      powers for members. The trigger now only pins those fields for
--      customers editing customer-owned tasks.
--
-- Helper predicates is_admin(), is_internal_manager(), is_project_lead(),
-- is_project_member(), is_project_customer(), can_see_project() are inherited
-- from 20260701130000_rls_helpers_security_definer.sql (SECURITY DEFINER) /
-- 20260701120200_rls_role_aware.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New helper: is the current user a superuser?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_superuser()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultants c
    WHERE c.id = auth_uid_text() AND c.tier = 'superuser'
  );
$$;

-- ===========================================================================
-- consultants — tier hierarchy on create/update
-- ===========================================================================
DROP POLICY IF EXISTS "consultants_insert" ON consultants;
DROP POLICY IF EXISTS "consultants_update" ON consultants;

-- Only admins may create internal users; a non-superuser admin may only
-- create tier='normal' users.
CREATE POLICY "consultants_insert"
  ON consultants FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    AND (is_superuser() OR tier = 'normal')
  );

-- Same hierarchy on update: a non-superuser admin cannot elevate anyone to
-- admin/superuser, and cannot demote a superuser.
CREATE POLICY "consultants_update"
  ON consultants FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (
    is_admin()
    AND (is_superuser() OR tier = 'normal')
  );

-- ===========================================================================
-- projects — broaden write predicates
-- ===========================================================================
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

-- Create: managers/PMs or any admin/superuser.
CREATE POLICY "projects_insert"
  ON projects FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_internal_manager());

-- Update: tier/manager/lead/member each independently grant (most-permissive).
CREATE POLICY "projects_update"
  ON projects FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(id)
    OR is_project_member(id)
  )
  WITH CHECK (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(id)
    OR is_project_member(id)
  );

-- Delete: managers/PMs or any admin/superuser.
CREATE POLICY "projects_delete"
  ON projects FOR DELETE TO authenticated
  USING (is_admin() OR is_internal_manager());

-- ===========================================================================
-- tasks — broaden write predicates
-- ===========================================================================
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

-- Create: managers/PMs, admins, lead, or any member of the project.
CREATE POLICY "tasks_insert"
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR is_project_member(project_id)
  );

-- Update (most-permissive-wins):
--   managers/PMs           -> any task
--   admin/superuser        -> any task
--   project lead           -> any task on their project
--   resource consultant    -> any task on the project they're a member of
--   customer on project    -> only customer-owned tasks
--     (task_owner IN ('Customer', 'Pinnacle/Customer'))
CREATE POLICY "tasks_update"
  ON tasks FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR is_project_member(project_id)
    OR (
      is_project_customer(project_id)
      AND COALESCE(task_owner, 'Pinnacle') IN ('Customer', 'Pinnacle/Customer')
    )
  )
  WITH CHECK (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR is_project_member(project_id)
    OR (
      is_project_customer(project_id)
      AND COALESCE(task_owner, 'Pinnacle') IN ('Customer', 'Pinnacle/Customer')
    )
  );

-- Delete: managers/PMs, admins, lead, or any member of the project.
CREATE POLICY "tasks_delete"
  ON tasks FOR DELETE TO authenticated
  USING (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR is_project_member(project_id)
  );

-- ===========================================================================
-- communications — broaden write predicates (members already could write;
-- add admin/manager powers explicitly for consistency).
-- ===========================================================================
DROP POLICY IF EXISTS "communications_insert" ON communications;
DROP POLICY IF EXISTS "communications_update" ON communications;
DROP POLICY IF EXISTS "communications_delete" ON communications;

CREATE POLICY "communications_insert"
  ON communications FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR (is_project_member(project_id) AND NOT is_project_customer(project_id))
  );
CREATE POLICY "communications_update"
  ON communications FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR (is_project_member(project_id) AND NOT is_project_customer(project_id))
  )
  WITH CHECK (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR (is_project_member(project_id) AND NOT is_project_customer(project_id))
  );

-- Delete: managers/PMs, admins, or project lead.
CREATE POLICY "communications_delete"
  ON communications FOR DELETE TO authenticated
  USING (is_admin() OR is_internal_manager() OR is_project_lead(project_id));

-- ===========================================================================
-- Loosen the task privileged-field trigger
-- ===========================================================================
-- The original trigger (20260701150000_security_hardening.sql) pinned
-- project_id / pink_number / task_owner / assigned_consultant_id for anyone
-- who was NOT a manager/PM or the project lead. That prevented resource
-- consultants from reassigning tasks or altering ownership/billing on the
-- projects they're assigned to.
--
-- Per spec, project members (resource consultants) now get full amend powers
-- on their assigned project. The trigger is redefined to only pin those
-- fields for customers editing customer-owned tasks — the only remaining
-- case where ownership/assignment must not be changed by the editor.
CREATE OR REPLACE FUNCTION public.prevent_task_privileged_field_tampering()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Pin privileged fields only when a customer edits a customer-owned task.
  IF is_project_customer(OLD.project_id) THEN
    NEW.project_id             := OLD.project_id;
    NEW.pink_number            := OLD.pink_number;
    NEW.task_owner             := OLD.task_owner;
    NEW.assigned_consultant_id := OLD.assigned_consultant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_no_field_tampering ON tasks;
CREATE TRIGGER trg_tasks_no_field_tampering
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_task_privileged_field_tampering();

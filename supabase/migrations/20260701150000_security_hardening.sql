-- ============================================================================
-- SECURITY HARDENING (audit follow-up)
-- ----------------------------------------------------------------------------
-- Addresses two findings from the security audit:
--
--   #1  consultants directory was world-readable to any authenticated session
--       (USING (true)). Combined with self-service Auth signup this let any
--       registered user enumerate every staff member's name/email/role/tier.
--       Fixed here by scoping SELECT to internal users, plus customers limited
--       to the consultants who actually work on their own project(s).
--       (Self-service signup is additionally disabled in supabase/config.toml
--        and must be disabled in the Supabase dashboard.)
--
--   #2  RLS is row-level, not column-level: a customer editing a customer-owned
--       task (or a resource consultant editing their assigned task) could write
--       ANY column via the API, including billing/ownership/assignment fields.
--       Fixed here with a BEFORE UPDATE trigger that pins the privileged columns
--       for anyone who is not a manager/PM or the project lead — mirroring the
--       prevent_consultant_privilege_escalation() pattern.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is the current user an internal user (a consultants row)?
-- SECURITY DEFINER so the inner lookup bypasses RLS (no recursion / no timeout),
-- consistent with the other role-aware helpers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_internal()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultants c WHERE c.id = auth_uid_text()
  );
$$;

-- Helper: does the calling customer share a project with consultant c_id?
-- True when the current user is the customer on a project that c_id leads,
-- manages, or is a resource on. Lets a customer resolve the names of the
-- consultants on THEIR project without exposing the whole directory.
CREATE OR REPLACE FUNCTION public.customer_shares_project_with_consultant(c_id TEXT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.customer_id = auth_uid_text()
      AND (
        c_id = p.lead_consultant_id OR
        c_id = p.project_manager_id OR
        c_id = ANY(p.project_resource_ids) OR
        c_id = ANY(p.consultant_ids)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Tighten consultants SELECT (finding #1)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "consultants_select" ON consultants;
CREATE POLICY "consultants_select"
  ON consultants FOR SELECT TO authenticated
  USING (
    -- Any internal user can read the internal directory (assignee pickers, team
    -- lists, etc.). Admins/managers are internal users, so they are covered.
    is_internal()
    -- A customer may read only the consultants working on their own project(s).
    OR customer_shares_project_with_consultant(id)
  );

-- ---------------------------------------------------------------------------
-- Column-level protection on tasks (finding #2)
-- ---------------------------------------------------------------------------
-- Non-managers/non-leads (resource consultants editing their own task, or a
-- customer editing a customer-owned task) may update task progress/status/dates
-- but MUST NOT rewrite billing, ownership, assignment or the parent project.
-- Those fields are pinned to their previous values. Managers/PMs and the
-- project lead retain full control. Runs only on UPDATE, so the manager/lead
-- INSERT path is unaffected.
CREATE OR REPLACE FUNCTION public.prevent_task_privileged_field_tampering()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_internal_manager() OR is_project_lead(OLD.project_id)) THEN
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

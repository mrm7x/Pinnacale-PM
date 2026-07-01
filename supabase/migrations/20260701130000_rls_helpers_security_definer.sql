-- ============================================================================
-- Fix RLS performance: make role-aware helper functions SECURITY DEFINER.
-- ----------------------------------------------------------------------------
-- The helpers in 20260701120200_rls_role_aware.sql query `projects` and
-- `consultants` while being used *inside* those tables' RLS policies. As
-- SECURITY INVOKER functions, those internal queries re-trigger the same RLS
-- policies, causing nested / exponential policy evaluation. For non-admin users
-- (who don't short-circuit on is_admin()) this blows the statement timeout:
--   projects/tasks SELECT -> 500, SQLSTATE 57014 (statement timeout).
--
-- Making the helpers SECURITY DEFINER runs their internal lookups as the owner,
-- bypassing RLS on those inner reads and eliminating the recursion. The
-- functions only return booleans about the current user (auth.uid()), so they
-- expose no row data. search_path is pinned for SECURITY DEFINER safety.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auth_uid_text()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid()::text;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultants c
    WHERE c.id = auth_uid_text() AND c.tier IN ('superuser', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_internal_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultants c
    WHERE c.id = auth_uid_text() AND c.role IN ('Manager', 'Project Manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_lead(p_id TEXT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_id
      AND (p.lead_consultant_id = auth_uid_text() OR p.project_manager_id = auth_uid_text())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(p_id TEXT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_id AND (
      p.lead_consultant_id    = auth_uid_text() OR
      p.project_manager_id    = auth_uid_text() OR
      auth_uid_text() = ANY(p.project_resource_ids) OR
      auth_uid_text() = ANY(p.consultant_ids)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_customer(p_id TEXT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_id AND p.customer_id = auth_uid_text()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_see_project(p_id TEXT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_admin()
      OR is_internal_manager()
      OR is_project_lead(p_id)
      OR is_project_member(p_id)
      OR is_project_customer(p_id)
      OR EXISTS (
        SELECT 1 FROM consultants c
        WHERE c.id = auth_uid_text() AND c.role = 'Read only'
      );
$$;

-- ============================================================================
-- Allow consultants to update their OWN profile row (self-service).
-- ----------------------------------------------------------------------------
-- Previously consultants_update required is_admin(), so a normal user editing
-- their own profile (e.g. avatar colour) was blocked by RLS -> the app showed
-- "We could not save your team changes." This permits self-updates while a
-- BEFORE UPDATE trigger prevents non-admins from escalating privileged fields
-- (tier/role) or changing their login identity (email).
-- ============================================================================

DROP POLICY IF EXISTS "consultants_update" ON consultants;
CREATE POLICY "consultants_update"
  ON consultants FOR UPDATE TO authenticated
  USING (is_admin() OR id = auth_uid_text())
  WITH CHECK (is_admin() OR id = auth_uid_text());

-- Guard: non-admins may edit their own name/avatar, but tier, role and email
-- are pinned to their previous values to prevent privilege escalation and
-- login-identity drift. Admins retain full control.
CREATE OR REPLACE FUNCTION public.prevent_consultant_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    NEW.tier  := OLD.tier;
    NEW.role  := OLD.role;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultants_no_escalation ON consultants;
CREATE TRIGGER trg_consultants_no_escalation
  BEFORE UPDATE ON consultants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_consultant_privilege_escalation();

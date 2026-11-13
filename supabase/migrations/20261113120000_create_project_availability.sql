-- ============================================================================
-- Holiday / availability tracker
-- ----------------------------------------------------------------------------
-- One row per person per project. `days` maps a working day (YYYY-MM-DD) to a
-- code: A available · U unavailable/holiday · H half day · T training/other ·
-- P public holiday. The same codes are used by the "Availability" sheet of the
-- Excel export, so a block copied from Excel pastes straight into the app.
--
-- People are free-text names (they may be customer staff, not app users).
-- RLS mirrors project notes: anyone who can see the project reads it; internal
-- managers/PMs, admins, the project lead and internal members write.
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_availability (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    person_name TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    days        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT project_availability_days_is_object CHECK (jsonb_typeof(days) = 'object'),
    CONSTRAINT project_availability_name_len CHECK (char_length(person_name) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS project_availability_project_idx
  ON project_availability (project_id, sort_order);

ALTER TABLE project_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON project_availability FROM anon;

DROP POLICY IF EXISTS "project_availability_select" ON project_availability;
DROP POLICY IF EXISTS "project_availability_insert" ON project_availability;
DROP POLICY IF EXISTS "project_availability_update" ON project_availability;
DROP POLICY IF EXISTS "project_availability_delete" ON project_availability;

CREATE POLICY "project_availability_select"
  ON project_availability FOR SELECT TO authenticated
  USING (can_see_project(project_id));

CREATE POLICY "project_availability_insert"
  ON project_availability FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR (is_project_member(project_id) AND NOT is_project_customer(project_id))
  );

CREATE POLICY "project_availability_update"
  ON project_availability FOR UPDATE TO authenticated
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

CREATE POLICY "project_availability_delete"
  ON project_availability FOR DELETE TO authenticated
  USING (
    is_admin()
    OR is_internal_manager()
    OR is_project_lead(project_id)
    OR (is_project_member(project_id) AND NOT is_project_customer(project_id))
  );

-- Keep updated_at current.
CREATE OR REPLACE FUNCTION public.touch_project_availability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_availability_touch ON project_availability;
CREATE TRIGGER project_availability_touch
  BEFORE UPDATE ON project_availability
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_availability();

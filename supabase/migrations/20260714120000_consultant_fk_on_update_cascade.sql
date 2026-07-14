-- ============================================================================
-- Add ON UPDATE CASCADE to every FK referencing consultants(id).
-- ----------------------------------------------------------------------------
-- consultants.id must equal the Supabase Auth UUID, because RLS resolves the
-- current user via auth_uid_text() = consultants.id. Legacy/seed rows were
-- created before their auth user existed, so their id never matched — sign-in
-- succeeded but every RLS lookup found no consultant row and the app came up
-- empty ("couldn't find your account").
--
-- Repairing such a row means re-pointing its id, which without ON UPDATE
-- CASCADE requires copying the row, re-pointing each child by hand, then
-- deleting the original — a multi-step dance that trips over the unique email
-- constraint. With CASCADE it is a single UPDATE and the children follow.
--
-- ON DELETE rules are preserved exactly as originally declared:
--   tasks.assigned_consultant_id  SET NULL   (20260616095035_init_schema)
--   communications.creator_id     SET NULL   (supabase_schema.sql)
--   projects.project_manager_id   NO ACTION  (20260701120000_add_rbac_project_columns)
--   projects.lead_consultant_id   NO ACTION  (20260701120000_add_rbac_project_columns)
--
-- NOTE: projects.consultant_ids and projects.project_resource_ids are TEXT[],
-- not FKs, so CASCADE does not reach them. An id re-point must also run:
--   UPDATE projects SET
--     consultant_ids       = array_replace(consultant_ids,       '<old>', '<new>'),
--     project_resource_ids = array_replace(project_resource_ids, '<old>', '<new>');
-- ============================================================================

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_assigned_consultant_id_fkey;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_assigned_consultant_id_fkey
  FOREIGN KEY (assigned_consultant_id) REFERENCES consultants(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE communications
  DROP CONSTRAINT IF EXISTS communications_creator_id_fkey;
ALTER TABLE communications
  ADD CONSTRAINT communications_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES consultants(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_project_manager_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_project_manager_id_fkey
  FOREIGN KEY (project_manager_id) REFERENCES consultants(id)
  ON UPDATE CASCADE;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_lead_consultant_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_lead_consultant_id_fkey
  FOREIGN KEY (lead_consultant_id) REFERENCES consultants(id)
  ON UPDATE CASCADE;

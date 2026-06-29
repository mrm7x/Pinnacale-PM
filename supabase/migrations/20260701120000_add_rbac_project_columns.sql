-- ============================================================================
-- RBAC SCHEMA: projects role columns + consultants tier normalization
-- ----------------------------------------------------------------------------
-- Prerequisite for role-based RLS policies. The live `projects` table is
-- missing the role/assignment columns (customer_id, lead_consultant_id,
-- project_manager_id, project_resource_ids) and the RAG columns. They exist in
-- the TS types and are written by mapProjectToDb, but no migration ever
-- created them — so writes silently lost that data. This adds them.
--
-- Also normalizes consultants.tier to the 3-value union used by the frontend
-- (superuser | admin | normal) before adding a CHECK constraint, so legacy
-- values like 'consultant'/'project_manager'/'read_only' don't block it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. consultants.tier normalization + constraint
-- ---------------------------------------------------------------------------
-- Map any legacy tier value to the canonical union. The app only ever reads
-- tier for the canManageUsers/canEditUsers/canManageDatabase checks and the
-- SU/AD badge; 'normal' is the safe least-privilege default.
UPDATE consultants SET tier = 'normal'
  WHERE tier NOT IN ('superuser', 'admin', 'normal');

ALTER TABLE consultants
  ALTER COLUMN tier SET DEFAULT 'normal';

-- Drop the CHECK if this migration is ever re-run (idempotent), then add it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'consultants_tier_check'
      AND table_name = 'consultants'
  ) THEN
    ALTER TABLE consultants DROP CONSTRAINT consultants_tier_check;
  END IF;
END $$;

ALTER TABLE consultants
  ADD CONSTRAINT consultants_tier_check
  CHECK (tier IN ('superuser', 'admin', 'normal'));

-- ---------------------------------------------------------------------------
-- 2. projects role/assignment columns (customer_id added in next migration
--    after the customers table exists, to satisfy the FK)
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_manager_id TEXT REFERENCES consultants(id),
  ADD COLUMN IF NOT EXISTS lead_consultant_id TEXT REFERENCES consultants(id),
  ADD COLUMN IF NOT EXISTS project_resource_ids TEXT[] NOT NULL DEFAULT '{}';

-- Backfill project_resource_ids from the legacy consultant_ids where empty,
-- so existing project membership is preserved for RBAC.
UPDATE projects
  SET project_resource_ids = consultant_ids
  WHERE array_length(project_resource_ids, 1) IS NULL
    AND array_length(consultant_ids, 1) IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. projects RAG columns (currently client-only; make them persistent)
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS rag_scope    TEXT NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS rag_schedule TEXT NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS rag_costs    TEXT NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS rag_benefits TEXT NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS rag_overall  TEXT NOT NULL DEFAULT 'green';

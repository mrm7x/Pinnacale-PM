-- ============================================================================
-- FIX: projects.customer_id was referencing consultants(id) instead of
--      customers(id).
-- ----------------------------------------------------------------------------
-- On live databases where projects.customer_id already existed before the
-- customers migration ran, the `ADD COLUMN IF NOT EXISTS ... REFERENCES
-- customers(id)` statement was a no-op (it does not rewrite the FK of an
-- existing column). The wrong FK survived, so:
--   - the customers table had no inbound FK (appeared unlinked)
--   - saving a customer_id on a project failed because the value had to exist
--     in consultants, not customers
--
-- This migration drops the incorrect constraint and re-adds it pointing at
-- customers(id), matching the original intent.
-- ============================================================================

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_customer_id_fkey;

ALTER TABLE projects
  ADD CONSTRAINT projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id);

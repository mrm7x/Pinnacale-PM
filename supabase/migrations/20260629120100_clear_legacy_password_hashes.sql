-- ============================================================================
-- CLEAR LEGACY password_hash VALUES (Phase 1 security fix)
-- ----------------------------------------------------------------------------
-- The initial migration (20260616095035_init_schema.sql) seeded the
-- consultants table with hardcoded, publicly-visible SHA-256 hashes:
--   - admin: 6ee4a469...382d17  == 'manager'
--   - c1..c4: 5e884898...1542d8 == 'password'
--
-- These digests are trivially reversible and were world-readable while the old
-- open RLS policies were in place (closed by 20260629120000_emergency_rls_lockdown).
--
-- The init migration file is NOT edited here, because:
--   1. It has already been applied to the production database; editing it would
--      not change live data and would break Supabase's migration checksum
--      history (supabase_migrations.schema_migrations).
--   2. The historical record should remain intact for auditability.
--
-- Instead, this migration nulls the password_hash column for every row and
-- forces a password reset, so any residual leaked hash is wiped from the live
-- database. Going forward, user authentication is handled exclusively by
-- Supabase Auth (bcrypt-hashed in auth.users); the consultants.password_hash
-- column is legacy local-mode only and should remain NULL in production.
-- ============================================================================

UPDATE consultants
SET password_hash = NULL,
    must_reset_password = true
WHERE password_hash IS NOT NULL;

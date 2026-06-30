-- ============================================================================
-- DROP LEGACY LOCAL-AUTH COLUMNS
-- ----------------------------------------------------------------------------
-- Authentication is now handled exclusively by Supabase Auth (bcrypt-hashed in
-- auth.users). The consultants.password_hash and must_reset_password columns
-- were only used by the legacy local-mode fallback, which has been removed
-- from the application (production builds now require a configured backend).
--
-- The password_hash values were already nulled by 20260629120100; this drops
-- the columns entirely so the weak-auth path cannot be reintroduced by
-- accidentally seeding a digest.
-- ============================================================================

ALTER TABLE consultants DROP COLUMN IF EXISTS password_hash;
ALTER TABLE consultants DROP COLUMN IF EXISTS must_reset_password;

-- ============================================================================
-- RBAC SCHEMA: customers table + projects.customer_id FK
-- ----------------------------------------------------------------------------
-- External parties (customers) live in their own table, distinct from internal
-- consultants. Both authenticate via Supabase Auth; the consultants.id /
-- customers.id PKs equal the auth.users.id (matching the existing pattern in
-- App.tsx:handleAddConsultant which sets id = authData.user.id).
--
-- Customers are FORCED to tier='normal' via a CHECK constraint — they can never
-- be admin/superuser regardless of how they are created.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
    id          TEXT PRIMARY KEY,                          -- = auth.users.id
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    company     TEXT,
    avatar_color TEXT NOT NULL DEFAULT '#0d9488',
    tier        TEXT NOT NULL DEFAULT 'normal'
                CHECK (tier = 'normal'),                   -- force-normal
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- RLS enabled; policies are defined in the role-aware migration that follows.
-- Until then, inherit the authenticated-only posture from the Phase 1 lockdown
-- pattern so the table isn't accidentally world-readable.
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_authenticated"
  ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_insert_authenticated"
  ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "customers_update_authenticated"
  ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customers_delete_authenticated"
  ON customers FOR DELETE TO authenticated USING (true);
REVOKE ALL ON customers FROM anon;

-- ---------------------------------------------------------------------------
-- projects.customer_id FK now that the customers table exists
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id);

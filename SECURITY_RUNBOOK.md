# Pinnacle Projects — Security Remediation Runbook

This document tracks the security work on Pinnacle Projects. It is split into
**automated fixes** (applied via code in this repo) and **manual actions**
(actions that must be performed by an administrator in the Supabase / hosting
dashboards and cannot be done from code).

> Generated after a full security audit. See the audit report for the complete
> findings list. Phases are ordered by urgency.

---

## Phase 1 — Stop the bleeding (URGENT)

These close the actively-exploitable holes. They ship in the current changeset
and must be deployed immediately.

### ✅ Automated (in this changeset)

| Fix | File | What changed |
|-----|------|--------------|
| Lock down RLS | `supabase/migrations/20260629120000_emergency_rls_lockdown.sql` | Drops every `USING(true)` policy; all reads/writes now require the `authenticated` role; `anon` privileges revoked on all tables. |
| Wipe leaked hashes | `supabase/migrations/20260629120100_clear_legacy_password_hashes.sql` | Nulls `password_hash` and forces reset for every consultant row, removing the reversible `manager`/`password` digests from the live DB. |
| Remove admin backdoor | `src/components/Login.tsx` | Deleted the `admin`/`manager` guaranteed-login fallback. Authentication now requires a matching consultant record + valid hash. |
| Remove hardcoded hashes | `src/App.tsx` | Seed data no longer embeds SHA-256 digests; hashes are computed at runtime for local-mode demo only; admin email changed to a placeholder. |
| Require strong passwords | `src/App.tsx` | `handleAddConsultant` no longer defaults new users to `password`; enforces ≥8 chars. |
| Gate data loading on auth | `src/App.tsx` | `loadData()` is a no-op for unauthenticated Supabase sessions, preventing the empty-DB re-seed path from writing default credentials to a real database. |
| Secure session hydration | `src/App.tsx` | Auth restore now trusts the Supabase session, not a bare localStorage flag (fixes P0-3 client-side bypass). |
| Safe schema export | `src/components/Settings.tsx` | "Download SQL schema" no longer emits open RLS policies or leaked credentials. |
| Locked-down reference schema | `supabase_schema.sql` | Matches the migration posture; no credential seed. |

### ⚠️ Manual actions (MUST be done by an admin — cannot be done from code)

Perform these in the Supabase Dashboard immediately after deploying the
migrations. Until steps **M1** and **M2** are done the data is still exposed.

- **M1 — Rotate the Supabase service role key.**
  Dashboard → Project Settings → API → "Rotate service_role key".
  The old key was committed-readable while RLS was open. *Do not* put the new
  key in the frontend — it must never leave the server. The frontend should
  only ever use the **anon** key.

- **M2 — Rotate the anon key** (if you suspect it was abused; lower urgency now
  that `anon` is revoked from all tables).
  Dashboard → Project Settings → API → "Rotate anon key".
  Update `VITE_SUPABASE_ANON_KEY` in your hosting/CI secrets afterwards.

- **M3 — Lock CORS to your production origin.**
  Dashboard → Project Settings → Authentication → "Site URL" + "Redirect URLs".
  Set Site URL to your exact production origin (e.g. `https://app.pinnacle.com`)
  and do **not** leave a wildcard. Combined with M1/M2 this closes the
  `Access-Control-Allow-Origin: *` hole that let any website read/write data.

- **M4 — Force password reset for every existing user.**
  The migration already sets `must_reset_password = true`, but you should also
  reset passwords in **Supabase Auth** (Dashboard → Authentication → Users).
  Delete any seed users you do not recognize.

- **M5 — Re-create the production admin via Supabase Auth, not SQL.**
  Dashboard → Authentication → Users → "Add user" with a strong password, then
  insert the matching `consultants` row using that user's `id`. Never seed an
  admin in SQL again.

- **M6 — Verify the migrations deployed.**
  After the GitHub "Deploy Migrations" workflow runs, open the SQL Editor and
  run:
  ```sql
  SELECT tablename, policyname, cmd, roles
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
  ```
  Confirm every policy lists `authenticated` (not `anon`/`public`), and:
  ```sql
  SELECT id, email, (password_hash IS NULL) AS hash_cleared, must_reset_password
  FROM consultants;
  ```

---

## Phase 2 — Real authentication + role-based authorization (next)

Scope agreed with the maintainer: **keep two axes** (`role` for job function,
`tier` for admin power) and back them with real server-side enforcement.

- Replace client-only SHA-256 auth with Supabase Auth end-to-end (email +
  password, email confirmation, strong-password policy).
- Introduce a `profiles` table keyed by `auth.uid()` holding `role` + `tier`,
  written only by superusers.
- Rewrite RLS policies to be role-aware, e.g.:
  ```sql
  CREATE POLICY "mgr delete project" ON projects FOR DELETE TO authenticated
    USING (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tier IN ('superuser','admin')
    ));
  ```
- Only a superuser may write to `profiles.tier`.
- Remove the local-mode fallback entirely once backend auth is the default.

## Phase 3 — Hardening

- Add `public/_headers` (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy).
- `npm audit fix` to resolve the `uuid` CVE via an `exceljs` bump.
- Strip `console.*` in production builds (`vite.config.ts` → `esbuild.drop`).
- Add login rate-limiting (client throttle + Supabase Auth limits).
- Add `rel="noopener noreferrer"` to every `target="_blank"`.

---

## Verification after deploying Phase 1

1. **Unauthenticated read should now fail.**
   ```bash
   curl -s "https://<project-ref>.supabase.co/rest/v1/consultants?select=id" \
     -H "apikey: <ANON_KEY>" | head
   ```
   Expect an empty array or a `permission denied` / 401 — NOT the user list.

2. **Authenticated read should succeed** (use a real logged-in user's access
   token in the `Authorization: Bearer …` header).

3. **The login backdoor is gone.** `admin` / `manager` on a Supabase-configured
   instance should be rejected unless that account exists in Supabase Auth.

4. **Build is green:** `npm run build` (TypeScript strict) passes.

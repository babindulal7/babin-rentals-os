# Issue #223 — pending migration 0241, client-isolation hardening

**Reviewed:** 18 November 2026 (NPT). **Status:** Source fix proposed; **no hosted migration applied**.
**Scope:** `supabase/migrations/0241_extension_clash_manager_decision_and_at_risk.sql`, full local migration chain, and read-only connected Supabase catalog metadata.

## Verified deployed-environment observations

Read-only queries against both connected Supabase projects confirmed `public.extension_clash_decisions` and `public.booking_at_risk` **do not exist** in either production or the existing Free staging project. Therefore an active cross-client data read from these two tables is **not present in the two checked environments**. This finding is **not** a guarantee about other unconnected environments.

A separate read-only `pg_default_acl` inspection confirmed that **both projects grant broad default public-table privileges to `authenticated`**; the Free staging project also showed broad `anon` defaults. When `0241` creates these tables, a role-free RLS `USING (true)` permits an authenticated Client session to read other clients' rows, subject to table/Data API exposure. This is a source security defect before deployment, not evidence of a current live breach.

## Source fix on the draft security PR

- Replace `extension_clash_decisions_select`'s unrestricted predicate with an Owner/Admin/Manager/Coordinator role check.
- Replace `booking_at_risk_select`'s unrestricted predicate with Owner/Admin/Manager/Coordinator/Warehouse/Technician. The floor team sees operational risk without giving access to Client or Driver. This does not extend access to money columns.
- Preserve `client_account_credits_select` finance-role predicate.
- **Revoke all default grants from `PUBLIC`, `anon`, and `authenticated` on all three new tables**, then grant `SELECT` to `authenticated`. RLS controls which logged-in roles can actually see rows. All mutations must go through the existing audited `SECURITY DEFINER` RPCs with explicit actor-role checks; browser sessions no longer have direct INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges.
- Revoking TRUNCATE is important: PostgreSQL row-level security **does not restrict TRUNCATE**.
- This PR edits the source migration because **neither of the two connected environments has installed it**. If another environment has already applied `0241`, **do not replay the source migration** there: create a reviewed forward-only corrective migration via the Supabase CLI and test it independently.

## Verification and limitations

- `scripts/check-pglite.mjs` now requires all three tables to have RLS enabled, no anon SELECT, authenticated SELECT but no other direct browser privileges, and SELECT predicates limited to staff roles. It fails the migration-chain check on any violation.
- `src/lib/__tests__/extensionClashTableIsolation.test.ts` checks source policy boundaries and grants.
- **Exact-head CI result must be recorded separately**. Static checks and PGlite do not substitute for a real hosted JWT/PostgREST permission matrix.
- A Client A/Client B, Owner, Coordinator, Warehouse, Technician, Driver and Accounts negative/positive query matrix is still needed **after owner-approved synthetic staging installation**, including queries via exposed Data API and via RPCs.
- Confirm the project Data API grants and inspect any privileged view or `SECURITY DEFINER` RPC that could bypass the policy. Do not weaken RLS to make a test pass.
- Source fingerprints in draft PR #179 must be refreshed after this fix merges; its current 240-file inventory refers to the earlier `0241` blob.

## Release boundary

Keep this fix **draft** until exact-head tests and independent security review. Do not deploy staging or production migrations, copy client data, create new paid projects, enable payments or change website settings. The final safe rollout is a reviewed, complete migration order with explicit environment ref, backups, and negative authorization tests.

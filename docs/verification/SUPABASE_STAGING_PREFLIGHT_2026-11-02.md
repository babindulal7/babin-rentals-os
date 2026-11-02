# Babin Rentals OS — Supabase staging preflight (2 November 2026)

**Status: READ-ONLY audit completed; production migration HOLD.**
**Database:** connected Supabase project `sxguwvgoserhdolewibb` (live, PostgreSQL 17.6).
**Repository:** `babindulal7/babin-rentals-os`, `main`.
**Repeatable check:** `scripts/verification/supabase_schema_preflight.sql`.

## Observed live baseline

The single-statement SQL preflight was executed against the connected project using read-only SQL. Its JSON output reported:

| Check | Observed result |
| --- | --- |
| Migration history entries | 156 |
| Entries named `0170`–`0199` | **0** |
| Entries named `0200+` | **0** |
| `0164_booking_discount_vat_payment_integrity` | Yes |
| `0189_delivery_zones` | No |
| `0204_rider_link_v2_contract_fix` | No |
| `0205_delivery_zone_money_boundary` | No |
| `public.delivery_zones`, `delivery_jobs`, `delivery_job_links`, `shift_handovers`, `temporary_holds` | Not present |
| `public.notifications` | Present |
| All five delivery-zone RPCs | Not present |
| `public.staff_directory_v` | Present; `authenticated` has SELECT; `anon` does not; `security_invoker=false` |
| Delivery-zone DELETE/TRUNCATE permissions | Not applicable: table absent |

**Interpretation:** the database is not ready for stand-alone `0205`. The repo's migration numbers are not necessarily the Supabase migration history `version`; this check uses migration *names* and does not prove that every earlier migration was applied or that no manual schema drift occurred. Never mark the whole migration chain synchronized based on counts alone.

## Security issues to preserve

- Draft <https://github.com/babindulal7/babin-rentals-os/pull/58> supplies a forward-only `0205` fix and adds TRUNCATE denial; it stays unmerged and unapplied until all gates pass.
- Release HOLD: <https://github.com/babindulal7/babin-rentals-os/issues/56>.
- Live `staff_directory_v` advisor investigation: <https://github.com/babindulal7/babin-rentals-os/issues/66>. Do not change it to `security_invoker=true` without testing the joins against `auth.users`; downstream queries may break, and exposing base table grants would be unsafe.
- The Supabase security advisor currently reports `auth_users_exposed`, `security_definer_view`, and mutable function search paths. Review independently; do **not** mass-alter functions or views as a side effect of delivering zones.
- Official advisor references: <https://supabase.com/docs/guides/database/database-linter?lint=0002_auth_users_exposed> and <https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view>.

## No-cost local verification first

1. In a fresh checkout from the intended SHA, record `git rev-parse HEAD`, `npm --version`, `node --version` and the current migration ledger. Confirm no connection strings or production credentials are in test environment.
2. Execute `npm run gates` to run the repository's full ordered checks. Specifically inspect `check:pglite`, `check:security`, `check:lifecycle` and coverage; do not call partial checks a release pass. The `npm test` runner defaults to mock after PR #64.
3. Run the L46 delivery-zone role matrix in isolated PGlite: Owner/Admin/Manager can manage; Coordinator is read-only on commercial amounts and cannot mutate; Warehouse/Technician/Driver see only masked zones; Client/anon denied; DELETE/TRUNCATE forbidden for every non-privileged database role.
4. Check `has_table_privilege('authenticated','public.delivery_zones','TRUNCATE') = false` and the equivalent anon test **on the isolated database after applying 0189 then 0205**, and verify the table's data remain intact after the denied probe.
5. Inspect the previously failed #58 workflow. A failed job with no steps/logs does not certify pass or imply an application code failure. Record either green CI or equivalent local verification evidence.

## Staging/production release gates

- **STOP: no standalone staging exists.** Do not create a Supabase branch/project before obtaining its actual quoted cost and the owner's explicit agreement to any nonzero charge.
- If an isolated local Supabase instance can reproduce the schema, prefer that route before any paid branch. Never point CLI commands at the live project by accident.
- Once staging is authorized, capture a backup/restore test and a complete, ordered **migration-name + schema-diff inventory** against live. Rehearse every missing migration and dependency in its proper order, beginning with those prerequisite to 0189 (not by blindly applying all repository files). Reject conflicts, destructive DDL, and failed health checks.
- Stage the entire relevant backend contract, not just `delivery_zones`: booking holds, delivery jobs/rider links, finance and staff role masking, staff view, security definer function grants, RPC search paths, idempotency, and timezone.
- Validate role matrix with real authenticated claims (not only a simulated UI role). Test web/app surfaces at 375, 820, 1440px and the iPad layout.
- Production rollout requires migration history reconciliation, tested rollback/restore, reviewed SQL plan, successful staging verification, explicit deployment approval, and post-deploy smoke tests. Never deploy by directly pasting partial migrations into the live SQL editor.

## Current outcome

**Read-only SQL preflight: PASS as a repeatable diagnostic.** The production release gates remain **BLOCKED** because missing migrations, missing tables/RPCs, no staging, and unverified CI/staging are unresolved.

No schema/data changes, staging charges, or app deployments were made in this audit.

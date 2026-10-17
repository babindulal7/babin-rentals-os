# Live Supabase security and release audit — 14 October 2026

**Repository:** `babindulal7/babin-rentals-os`
**GitHub baseline:** `e0c7fc17aef439fa7adf03610255e78b46545053`
**Live project observed:** `sxguwvgoserhdolewibb` (ACTIVE_HEALTHY at inspection)
**Change scope:** source control only; no SQL writes, migrations, backup, or deployments performed on live Supabase.
**Release decision:** **HOLD** until migration cutover and authenticated JWT smoke tests.
**Governing rule:** `DEPLOYMENT.md` N-5 and `BACKUP_PROTOCOL.md`.

## Evidence gathered directly (read-only)

- All 133 `public` tables had Row Level Security enabled at inspection (133/133); this is **not** proof that every policy is correct.
- All 30 `public` SQL views denied `anon` SELECT at inspection (0/30 readable by anon).
- `public.staff_directory_v` **references `auth.users`**, but `anon` cannot SELECT it; its definition contains both `auth_is_staff()` and masking based on `auth_user_role()`. A Supabase advisor still flags it because the view is available to authenticated users and runs with definer privileges. Whether its per-role masking leaks fields still requires real authenticated-role API tests.
- The Supabase security advisor reported 37 anonymously executable SECURITY DEFINER functions. Many are authorization helpers or trigger-returning functions; blanket revocation would be unsafe without classification. The following six are business RPCs with confirmed anonymous EXECUTE grants and signed-in EXECUTE grants:
  - `adjust_stock(uuid, integer, text, uuid, uuid)`
  - `portal_claim_by_verified_email()`
  - `read_quote_editor(text)`
  - `set_staff_active(uuid, boolean)`
  - `set_staff_role(uuid, system_role)`
  - `update_rental_quote(uuid, text, uuid, jsonb)`
- Source migration `0163_close_six_anon_business_rpcs.sql` revokes PUBLIC/anon EXECUTE on these six, asserts no anonymous overload remains, and verifies authenticated EXECUTE is retained. **Written for review, not applied live.** An EXECUTE grant alone is not proof of successful exploitation; function body guards must be tested.
- Advisor also reported 30 SECURITY DEFINER views and 14 functions with mutable `search_path`. These need per-object review; do not indiscriminately mark all as exploitable.
- GitHub had 160 migration SQL files, numbered through `0162`. Live recorded 155 migration ledger entries. **14 repository names were absent from the live ledger**, including `0157`–`0162`, and **9 live ledger names were absent from the source**. Many earlier name differences are consistent with historical renames, but names are not enough to prove that: compare SQL fingerprints, live object definitions and the authoritative migration receipts. Do not simply run all 14 missing names.

## Evidence limitations

- GitHub CI passed on initial commit `e0c7fc1`; it builds PGlite, which does **not** replicate all real Supabase, PostgREST or JWT authorization semantics. Any security patch must have new CI evidence from its own head SHA.
- No production host, live browser session, or Owner/Coordinator/Warehouse/Client JWT end-to-end smoke test was established.
- Current `docs/CURRENT_STATE.md` is a dated October 4 report; `docs/release/2026-10-13/BLOCKERS.md` records additional mobile-header P1 items and unresolved live integration testing. Neither proves current production readiness.
- Local source `README.md` still includes an August snapshot. Retain it as historical, not release evidence.

## Steps already done on GitHub

1. Created branch `fix/2026-10-14-live-security-preflight` from the clean October baseline; old repositories remain untouched.
2. Added migration `0163_close_six_anon_business_rpcs.sql` to close six explicit grants and assert its intended privilege effects on a rebuilt database.
3. Documented the read-only live audit and non-negotiable pre-production checks here.

## Release gate — before any production database writes

1. Confirm the exact target Supabase project and obtain a fresh live migration ledger, grants, view definitions, auth/storage policies and schema fingerprint.
2. Reconcile the 14 repository-only names and nine live-only names, including renamed historical migrations, the one-shot seed `0047`, and all pending `0157`–`0163`. **Do not use blind `db push`**.
3. Review the specific effect of each proposed migration, especially changes to booking and money permissions, and create a reproducible rollback/forward-fix plan.
4. Take a fresh restorable production backup **and test restoring into a separate database**, including relevant auth/storage dependencies. Preserve an independent backup of existing business records. No reset or destructive migration against live.
5. Rehearse all reviewed pending migrations on staging that matches the current live schema and representative data, then rerun tests and an independent Supabase security advisor scan.
6. Exercise real authenticated JWTs for Owner, Admin, Manager, Coordinator, Warehouse, and Client. Test anonymous access, row isolation, sensitive view columns, invocation of business RPCs, booking conflict, item-level pack/handover/return, discounts, payment/deposit, late fees, and 06:00 Kathmandu rental-day boundaries.
7. Verify real production deployment build has correct non-secret browser-side `VITE_*` values, HTTPS, Auth redirects, deep-link navigation, document and image storage, and role-appropriate UI.
8. Obtain Owner authorization for the exact final migration list and production maintenance window under N-5, then apply and verify one-by-one. Do not mark a migration APPLIED until live ledger and postconditions confirm it. Do not mark app PRODUCTION-VERIFIED until live smoke tests pass.

## Follow-up security classification

- **P0 before production:** six anonymous business RPC grants; authenticated `staff_directory_v` exposure warning requiring role-based penetration checks; any unintended Auth/RLS privilege path; migration and production/schema drift.
- **P1:** review remaining adviser findings with classification of helper versus trigger functions, and test function `search_path` pinning fixes individually; minimize unnecessary `SECURITY DEFINER` where architecture permits.
- **P1 UI:** outstanding phone-header crowding in Finance, Operations and Settings from `docs/release/2026-10-13/BLOCKERS.md`.

**No production security issue is marked fixed merely because a migration exists in GitHub.**
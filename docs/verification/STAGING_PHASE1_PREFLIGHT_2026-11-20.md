# Babin Rentals OS — Phase 1 Staging Safe-Readiness Receipt

**Verified:** 20 November 2026 (Nepal time)  
**Scope:** Existing Free staging project only, read-only catalog inspection and current GitHub source reconciliation  
**Target project ID:** `klhmsrunqrdxjudyhnkm` (`babin-staging`, Singapore, PostgreSQL 17.11)  
**Source baseline on verification:** `main` at `2ebc6290ef2d43e8c626de45e7bf664f9929c980`  
**State:** HOLD — no schema, fixture, email, payment, or production write authorized by this receipt.

## Current hosted evidence (read-only)

Checked through the connected Supabase project tool and `pg_catalog`/information_schema using SELECT only:

| Metric | Verified result |
| --- | ---: |
| Supabase project status | ACTIVE_HEALTHY |
| Public application tables | **0** |
| Public views | **0** |
| Public RLS policies | **0** |
| Public application functions | **0** |
| supabase_migrations.schema_migrations table | **absent** |

Zero findings reflect an **empty application schema**, not success of any live JWT, RLS, backup, storage, or operational acceptance tests.

## Current GitHub evidence

- PR #241 merged: the owner moved **physical iPad, Bluetooth/barcode/camera scanner, shop/label printer and native hardware share tests to Phase 2 after live**.
- PR #225 merged: booking-clash table RLS and ACL restrictions are in **source only**. The pending migration has **not been shown to be deployed** to staging or production.
- PR #242 is a draft source-only P0 follow-up to deny Coordinator credit/refund resolutions through `resolve_booking_at_risk`; its exact-head CI was **queued at this inspection**. **Do not merge it or apply migration `0241` without CI, behavioral negative-role tests and review.**
- PR #179 remains **draft** and contains `scripts/staging-schema-preflight.mjs`, `scripts/create-synthetic-staging-0012.mjs`, inventory snapshot tests and historical migration-source evidence. Its 240-file/241-file historical inventories are **not** a current apply manifest; refresh from latest main.
- A previous CI on PR #239 applied **242/242** SQL files in local PGlite and passed **86/86** lifecycle steps, but this is **not** a hosted Supabase installation/role acceptance.

## Next executable work — READ-ONLY / offline

1. On Mac lane A, fetch latest main and pin the **exact full commit SHA**. Check clean worktree, Node version, locked dependencies and existing `AGENTS.md` instructions.
2. Inspect PR #179's already-built preflight scripts before reusing them; do **not** duplicate inventiveness or assume the draft branch equals current main. Run those scripts offline **without `--write`** only after reviewing their read-only side effects.
3. Generate an ordered manifest for **every current SQL migration**: exact path, SHA-256, dependency/transaction handling, security-definer audit, expected schema changes, ownership, RLS/grant review, whether optional seed, and rollback/recovery evidence. Stop if duplicate prefixes are unresolved (`0188`), if `0012`/`0047`/`0082` include real/default user data or non-idempotent seeds, or if filenames conflict.
4. Obtain exact SQL/behavioral proof for PR #242's Coordinator credit/refund guard. Run negative Coordinator and positive Owner/Manager tests. Verify Client/anon/Driver isolation under actual hosted identities **after approved staging installation**.
5. Record the source/manifest fingerprints, script output/exit codes, current snapshot and a no-write verification receipt. Open a new PR for code-only fixes, never edit production branch or live database.
6. Confirm staging secrets are not in Git; restrict portal access and **disable outbound email/SMS/payment execution/webhooks** before any fixtures are added. Never import real staff or client records automatically.
7. Submit the exact staging install manifest, target ID and rollback/recovery plan for **explicit owner review**. Only then carry out staged writes; stop at the first failure.

## Phase 1 hosted acceptance after explicit owner approval

- **Nine roles:** Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver and Client, plus two isolated test clients.
- **Security:** independent JWT/RLS role denial tests, no public-sensitive data access, money-blind floor payload/DOM, safe staff PIN switching and no privilege escalation.
- **Inventory:** manual product lookup/ticks, authoritative availability, no overlapping booking, correctly applied stock movements, partial return and damage gate checks.
- **Rental loop:** Book → Pack → Handover → Return → Reset using hosted staging, preserving required photos/signatures or their approved desktop capture workflows, audit evidence and booking stage consistency.
- **Accounting:** received payments, deposit liability separation, daily closing, accountant export, actual pre-printed paper VAT invoice number reference with duplicate rejection; OS supporting PDFs are not an extra tax invoice series. Accountant/legal tax confirmation and owner's final activation approval remain separate.
- **Recovery:** backup artifact integrity, restoration drill to an approved isolated target, P0 regressions green and exact-head CI.

**Deferred until Phase 2 after live:** physical iPad/camera/Bluetooth scanner, label/shop printer hardware, and native device-share hardware tests. Their roadmap cards remain pending/todo; do not misreport them as completed.

## Explicit prohibitions

Do not create a second Supabase project, import live PII, restore a `--clean` production backup into this staging project without a separately reviewed privacy/recovery plan, apply `0047` blindly, run `supabase db push` or remote resets, apply migration `0241` before approved source security correction, modify live billing settings, auto-send messages, enable payment execution, or mark staging/production accepted from PGlite success.

**Tracking:** T1-01/T1-02/T1-03/T1-05/T1-06, PR #179, PR #242, Issue #56 (release HOLD).

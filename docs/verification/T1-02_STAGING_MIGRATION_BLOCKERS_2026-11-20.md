# T1-02 — Exact-source migration blocker classification, 20 November 2026

**Base main SHA at audit:** `72620bd076721e17db666852b9d89b6e25125641`  
**Existing staging project:** `klhmsrunqrdxjudyhnkm` (empty application schema at last read-only check)  
**Production project:** `sxguwvgoserhdolewibb` (READ ONLY; do not alter)  
**Status:** SOURCE AUDIT COMPLETE FOR THESE CLASSES; **STAGING INSTALLATION NOT APPROVED**.

## What the current source does and does not prove

The `main` source has **242 SQL migration files**, including **two distinct files beginning with 0188** and **three special seed/corpus files (0012, 0047, 0082)**. Green local PGlite migration builds are helpful compatibility evidence, **not** proof of safe hosted Supabase installation, JWT authorization, or a verified recovery/rollback.

This change extends the **existing** `scripts/verify-staging-source-hashes.mjs` rather than creating a second manifest generator. The script still reads only local SQL files, computes SHA-256 checksums and returns **no SQL text, personal records, access credentials, or installation permissions**. It additionally classifies each SQL file for manual review, shows the mandatory special treatments below, marks the filename-sorted order as **unreviewed**, and exposes a `--gate` mode that intentionally exits nonzero until a separate approved migration plan exists.

## Explicit seed treatments, not generic replay

| Source | Facts verified from the GitHub source | Staging decision pending |
| --- | --- | --- |
| `0012_seed_data.sql` | Fixed branches, user identifiers, contact/financial identifiers and startup reference data | **Do not apply original source.** Review the existing `create-synthetic-staging-0012.mjs` offline; independently inspect its output and replace with approved non-deliverable synthetic identities/references. Check dependents first |
| `0047_seed_reference_corpus.sql` | ~1.87 MB generated SQL corpus (read-only Git metadata); its underlying records/side effects have **not** been exhaustively audited | **Quarantine original**. Inventory affected tables and dependencies and specify the smallest synthetic fixture substitute, proving schema compatibility. No automatic replay |
| `0082_seed_operational_stage_corpus.sql` | Header states an older form was applied to live as `0076_seed_operational_stage_corpus`; date-relative inserts for bookings/booking lines | **Quarantine original**. Do not copy or regenerate dated bookings. Create controlled synthetic booking lifecycle fixtures after schema gates |
| `0188_smart_reservation_holds.sql` | Adds inventory hold state, double-booking exclusion and atomic reservation RPCs | Separate dependency/transaction review; preserve constraints and ensure no overlap bugs |
| `0188_staff_renting_gear.sql` | Adds staff-client fields, staff discount enum and client views/record editor fields | Independent dependency, enum transaction and role-visibility review; do not rename/delete either file to hide collision |

**0013→0014 transaction barrier:** `0013_business_8_roles.sql` adds new `system_role` enum values, and `0014_business_8_policies.sql` uses them. The 17 Nov rollback-only hosted rehearsal confirmed only `0001`–`0013`; it did **not** test 0014. PostgreSQL requires the enum additions to be **committed before their use in a separate transaction**. A single enclosing transaction for the entire migration chain would be an invalid substitute for a reviewed staging install. Record this prerequisite in the manual dependency plan.

**0188 ordering:** The local PGlite runner applies filenames in lexical order and has passed both files. This only establishes **that offline sequence's compatibility** on its fixture; it is **not** a reviewed hosted application order. No rename, migration-history repair, or re-numbering authorized.

**P0 security:** PR #242 was merged into `main` and guards `resolve_booking_at_risk` from Coordinator credit/refund attempts in source `0241`. Real hosted authentication, JWT, RLS/ACL and security-definer checks remain required.

## Preconditions for a future, separately authorized staging-only install

1. Pin the exact commit, run `node scripts/verify-staging-source-hashes.mjs --json`, retain SHA-256 manifest in protected release evidence (never mark source files approved by default). `--gate` must fail-closed.
2. Produce a **separate manually reviewed per-file dependency/transaction manifest**, including excluded/replaced seeds and SQL definitions they affect. Account for nontransactional DDL, extension dependencies, RLS and default grants, `SECURITY DEFINER` paths and migration-history renames.
3. Review the production migration ledger only for compatibility/reference; don't equate matching names with equivalent contents.
4. Verify staging-only credentials/project ID and closed outbound email/SMS/WhatsApp/payment/webhook integrations, proper backup/restoration procedure and non-deliverable fixtures. Don't import production user/client/payment data.
5. Obtain **explicit owner approval for the exact staging project, SQL SHA-256 values, order and rollback plan**. No generic remote `db push`, destructive reset, or blanket approval.
6. Run hosted role-level and Client A/B isolation, no-double-booking, manual desktop floor loop, money blinders, paper VAT invoice-reference checks, daily closing, deposits, and recovery evidence. Physical iPad/scanner/printer tests are Phase 2 after live and not required for Phase 1.

## Verification

- Source-only `node scripts/verify-staging-source-hashes.mjs --json` must produce 242 file metadata entries with identical content SHA-256, no SQL bodies, mandatory blockers and `authorized_staging_writes=false`.
- `node scripts/verify-staging-source-hashes.mjs --gate` intentionally returns status **2**, even when source hashes match; a future approval must use a **distinct, independently reviewed mechanism**.
- The existing Vitest `stagingSourceHashManifest.test.ts` and the new classification test must pass in exact-head CI.
- No hosted staging/production schema, seed, user, payment or setting changes were made.

**Security note:** Existing `docs/verification/STAGING_PHASE1_PREFLIGHT_2026-11-20.md` is a historical receipt. Its references to PR #179/#242 as draft and older source SHA must not be treated as live status; #179 and #242 are already merged.

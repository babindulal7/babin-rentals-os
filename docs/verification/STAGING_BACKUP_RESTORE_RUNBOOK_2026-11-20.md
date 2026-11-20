# Babin Rentals OS — Staging Backup & Recovery Review Runbook

**Document state:** DRAFT / REVIEW-ONLY. **No owner installation approval is recorded.**  
**Permitted staging project:** `klhmsrunqrdxjudyhnkm` only, once separately authorized.  
**Protected production project:** `sxguwvgoserhdolewibb`; no reads requiring secrets, writes, resets, or data copies as part of this workflow.  
**Baseline:** The original planning snapshot was `b555f7d63b6300e3466e6419bddce312357c7a78`. Reconcile the exact current `main` SHA and migration inventory before any later execution plan.

## 1. Hard stop

This document is a review checklist, **not an executable restore script**. Do not apply migrations, run SQL, change Auth/Storage settings, reset a linked Supabase environment, or execute any remote database write solely because this document or PR is merged. Obtain independent reviewer sign-off **and a new explicit owner approval covering the exact staging target, immutable source SHA, verified migration order, test fixtures, recovery approach, and maintenance window**.

## 2. Preflight evidence (read-only first)

1. Verify the staging project reference from an authenticated read-only project listing and compare exact characters; fail closed if it does not match.
2. Verify the active connection, role, and project identity from trusted metadata without printing credentials. Explicitly prohibit production identifiers in write tooling.
3. Recompute the migration filename order and hashes from the latest source tree. Confirm exclusions for original `0012_seed_data.sql`, `0047_seed_reference_corpus.sql`, `0082_seed_operational_stage_corpus.sql`; verify synthetic substitutions and dependency order.
4. Confirm that all outbound email, SMS, WhatsApp, payment, webhooks, and Booqable synchronization are disabled or redirected to verified non-delivering test sinks.
5. Capture read-only schema/migration-history inventory and a scoped baseline artifact using a supported, version-verified backup method. The correct command/options must be established from the installed Supabase CLI `--help` or approved database tooling; **do not assume `supabase db dump --project-ref` is supported**.
6. Store evidence in an access-controlled location, outside git, with encrypted backups and retention restrictions. Never store credentials/JWTs/PII in logs or PRs.

## 3. Recovery decision tree

- **Transaction fails before commit:** preserve the exact error and inspect the resulting catalog state. Rollback is guaranteed only for statements actually enclosed in that transaction; do not assume an entire multi-phase replay is atomic.
- **A phase was committed:** stop. Assess drift; compare the before/after snapshot and migration ledger. Plan a forward correction or an approved restore from a verified snapshot, never an improvised SQL cleanup.
- **Synthetic fixture operation fails:** stop and isolate the fixture; do not retry indefinitely or inject original real-world seed data.
- **Unexpected security/RLS behavior or external dispatch:** stop subsequent batches, preserve sanitized logs, and escalate for security review.
- **Recovery requires destructive schema deletion:** **NOT PREAPPROVED**. Require a separate, independently reviewed restore plan with exact target verification, backup integrity test, impact assessment, and explicit owner authorization. Do not run `DROP SCHEMA public CASCADE`, delete `supabase_migrations`, or grant blanket schema privileges as a routine fallback.

## 4. Required proof before declaring staging ready

- Baseline backup and **restore rehearsal to a separate disposable isolated target** are documented and verified.
- Synthetic fixtures can be regenerated reproducibly and cannot reach real recipients or live payments.
- Migration ordering, dependency barriers and duplicate prefix `0188` are validated against the actual migration runner.
- Hosted RLS, SECURITY DEFINER, JWT role separation, Auth, Storage, anonymous access and tenant isolation tests are recorded as positive **and negative** assertions on the approved staging target.
- Results reference exact Git SHA, migration hashes, staging project ID, reviewer, observed outputs, and accepted exceptions.
- The owner gives a second, separate release/cutover authorization; acceptance of a document alone never authorizes production.

## 5. Approval record

See [STAGING_OWNER_APPROVAL_GATE_2026-11-20.md](STAGING_OWNER_APPROVAL_GATE_2026-11-20.md). Current authorization: **UNAPPROVED / HARD STOP**.

# T0 Hosted Staging Security Acceptance Register

**Document Date:** 21 November 2026 (Nepal Standard Time)  
**Task ID:** T0 Security Acceptance Audit (T0-SAA)  
**Repository:** `babindulal7/babin-rentals-os`  
**Current Head SHA:** `04746df2ef225057ec25f36c19e9eb9f389b3f26`  
**Target Environment:** `babin-staging` (Free Supabase Project, Singapore region)  
**Production Target:** `sxguwvgoserhdolewibb` — **NEVER TOUCHED, ZERO CHANGES**  
**Status:** **STAGE 0 VERIFIED · STAGE 1 READY FOR OPERATOR EXECUTION · STAGES 2–3 BLOCKED PENDING STAGE 1**  

---

## 1. Staging Target Architecture & Identity

| Property | Value / Specification | Provenance & Constraints |
|---|---|---|
| Project Name | `babin-staging` | Pre-existing staging project; do not create duplicates (T1-02) |
| Project Ref | `klhmsrunqrdxjudyhnkm` | Recorded in `docs/plans/T1_RELEASE.md` |
| Region | Singapore (`ap-southeast-1`) | Same region as production |
| Network Isolation | Local/VPN/Protected access | Outbound email, SMS, payments, and external webhooks disabled |
| Storage Buckets | `documents`, `evidence` | Configured with private visibility; no public bucket regression |
| Secrets Policy | Rule N-8 enforced | Anon key only in frontend `.env.staging.local`; zero service keys or JWT secrets in code |

---

## 2. Migration and Schema Provenance

| Scope | Count | Details |
|---|---|---|
| Local Repository Migrations | **258 migrations** | Canonical chain `0001_enums.sql` through `0259_counter_sale_receipt_print.sql` |
| Staging Recorded Ledger | **242 entries** | Reconciled in `docs/verification/STAGING_SQL_INVENTORY_2026-11-21.json` ending at `0244_counter_sale.sql` |
| Pending Staging Delta | **15 migrations** | `0245`–`0259` sequenced in `docs/verification/STAGING_INSTALLATION_MANIFEST_2026-11-21.md` |
| Seed Quarantines | `0047`, `0082` | Historical seeds quarantined; must never be applied to live or staging |
| Replacement Seed | Synthetic `0012` | Fingerprint `3fd285f4...` verified with zero PII and synthetic accounts only |
| DB Build Gate | `check:pglite` | 258/258 migrations apply cleanly from scratch with 0 errors |

---

## 3. Synthetic Test Identities Readiness

Before hosted staging execution (Stage 2) can begin, Stage 1 provisioning must create the following synthetic accounts using synthetic credentials only:

| Role | Synthetic Username / Email | Role Type | Financial Visibility | Boundary Under Test |
|---|---|---|---|---|
| Owner | `owner@babinrentals.test` | Internal Staff | Full Access | Full administrative authority, audit trail immutability |
| Admin | `admin@babinrentals.test` | Internal Staff | Full Access | Administrative functions; cannot modify Owner account |
| Manager | `manager@babinrentals.test` | Internal Staff | Full Access | Daily operational & financial management; no grant issuance |
| Coordinator | `coordinator@babinrentals.test` | Internal Staff | Operational + Advance | Takes advance payment; denied credit/refund resolution |
| Accounts | `accounts@babinrentals.test` | Internal Staff | Financial Only | Invoice creation, payment reconciliation, deposit release |
| Warehouse | `warehouse@babinrentals.test` | Internal Staff | **ZERO MONEY** (Law 6) | Pack/Handover/Return operations; 0 financial figures visible |
| Technician | `technician@babinrentals.test` | Internal Staff | **ZERO MONEY** (Law 6) | Inspection/repair workflows; 0 financial figures visible |
| Driver | `driver@babinrentals.test` | Internal Staff | **ZERO MONEY** (Law 6) | Assigned trip viewing only; no unassigned bookings/routes |
| Client A | `client-a@babinrentals.test` | External Customer | External Portal | Reads only own bookings, lines, invoices; isolated from B |
| Client B | `client-b@babinrentals.test` | External Customer | External Portal | Reads only own bookings, lines, invoices; isolated from A |

---

## 4. Staging Stage Gate Progression & Owner Approval Status

```
[STAGE 0: Read-Only Preflight]  ==>  PASS (Catalog, inventory, and migration hashes verified read-only)
          │
          ▼
[STAGE 1: Schema & Synthetic Seed] ==> READY FOR OPERATOR EXECUTION (SQL bundles and runbook prepared)
          │
          ▼
[STAGE 2: Hosted PostgREST & Storage] ==> BLOCKED (Depends on Stage 1 completion)
          │
          ▼
[STAGE 3: Owner Launch Review] ==> HOLD (No production changes authorized)
```

### Stage Status Breakdown:

- **Stage 0 (Catalog & Configuration Read-Only): `PASS`**  
  - Verified staging inventory from `docs/verification/STAGING_SQL_INVENTORY_2026-11-21.json` and `docs/plans/T1_RELEASE.md`.
  - Proven that local scripts fail closed and reject hosted staging URLs unless explicitly configured.
  - Zero staging mutations executed by Antigravity per Rule N-5.

- **Stage 1 (Staging Schema Alignment & Synthetic Seeding): `READY FOR OPERATOR EXECUTION`**  
  - Stage 1 execution bundles packaged and independently verified in local PGlite:
    - [`01_APPLY_PENDING_MIGRATIONS_0245_TO_0259.sql`](./staging_bundles/01_APPLY_PENDING_MIGRATIONS_0245_TO_0259.sql) (applies 15 pending migrations `0245`–`0259`).
    - [`02_SEED_SYNTHETIC_STAGE1_USERS.sql`](./staging_bundles/02_SEED_SYNTHETIC_STAGE1_USERS.sql) (provisions 10 synthetic identities across 9 canonical roles + Client B).
  - Operator execution runbook authored in [`STAGE_1_STAGING_EXECUTION_RUNBOOK.md`](./STAGE_1_STAGING_EXECUTION_RUNBOOK.md).
  - **Action Required:** Operator (Babin) executes the two SQL bundles in the `babin-staging` (`klhmsrunqrdxjudyhnkm`) SQL Editor.

- **Stage 2 (Real Hosted JWT / PostgREST / Storage Acceptance): `BLOCKED`**  
  - Requires authenticating as the 10 real GoTrue users in the staging environment.
  - Direct REST calls to PostgREST to verify that `Warehouse`, `Technician`, `Driver`, and `Client` receive 0 monetary values over the wire.
  - Real Supabase Storage API uploads and downloads to verify Client A/B isolation with real signed URLs and token expiry.
  - **Action Required:** Awaits completion of Stage 1.

- **Stage 3 (Owner Launch Sign-off): `HOLD`**  
  - Phase 1 release gate requires owner review of all evidence receipts.
  - Production database and production migrations remain strictly locked.

---

## 5. Deferred Checks and Phase 2 Hardware Boundary

| Check / Requirement | Status | Governing Decision | Deferred Action / Rationale |
|---|---|---|---|
| Money-Role AAL2 MFA (T1-17) | `BLOCKED` | Babin Ruling B21, B40; `docs/security/ADR_T1_17_MONEY_ROLE_MFA.md` | Awaits hosted Supabase MFA enablement and TOTP enrolment verification on staging. |
| Physical M4 iPad & Biometric lock | `DEFERRED (Phase 2)` | Babin Owner Ruling (20 Nov 2026) | Phase 1 is validated on Counter-PC/desktop browser. Physical iPad acceptance moves to Phase 2. |
| Bluetooth / HID Barcode Scanner | `DEFERRED (Phase 2)` | Babin Owner Ruling (20 Nov 2026) | Manual item search/selection/ticking is the certified Phase 1 operational path. |
| Shop Label & Receipt Printer | `DEFERRED (Phase 2)` | Babin Owner Ruling (20 Nov 2026) | Preprinted paper VAT invoices remain operational tax method; physical print-server check in Phase 2. |
| Live Production Deployment | `PROHIBITED` | Rule N-5, Rule N-8, CLAUDE.md | Out of scope. Babin executes production migrations after verified pg_dump backup. |

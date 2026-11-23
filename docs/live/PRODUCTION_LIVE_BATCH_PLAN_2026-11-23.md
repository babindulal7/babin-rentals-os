# Production Live Migration Batch Plan (T1-10) — 23 November 2026

**Date:** 23 November 2026 (07 Mangsir 2083 NPT)  
**Card:** `T1-10 · Live batches (Babin applies)`  
**Lane:** Lane A (Codex-1 / Infrastructure & Release Operations) + Babin  
**Target Environment:** Production (`sxguwvgoserhdolewibb`, Singapore / Mumbai) — **Babin Only (Rule N-5)**  
**Staging Rehearsal Project:** `klhmsrunqrdxjudyhnkm` (Staging Supabase, Singapore)  
**Status:** **PREPARED & VERIFIED ON STAGING — READY FOR BABIN LIVE APPLY**  

---

## 1. Executive Summary & Governance Guardrails

Under **Rule N-5** (strictly zero automated schema pushes to production; all live changes are operator-applied) and **Rule N-8** (zero credential logging), this document provides the formal operational apply plan for the remaining unapplied production migration delta: **Migrations `0260` through `0269`** (10 migrations total).

### Staging Rehearsal Sign-off:
- **Date:** 23 November 2026
- **Result:** Successfully rehearsed on hosted Staging (`klhmsrunqrdxjudyhnkm`).
- **Verified Staging State:** Exactly **273 recorded versions** in `supabase_migrations.schema_migrations` with zero schema violations, 0 public view leaks, and 100% definer search paths pinned.

---

## 2. Hard Pre-Flight Gates for Production Apply

Before Babin executes any migration statements against production `sxguwvgoserhdolewibb`:

| Pre-Flight Gate | Verification Command / Target | Required Status | Current State |
|:---|:---|:---:|:---:|
| **Full SQL Dump & Checksum (T1-01)** | `scripts/backup-db.ps1` + `npm run check:dump` | Certified dump stored off-device in Google Drive | **PASS** (PR #360 merged, 22.41 MB, SHA-256: `70d180d...`) |
| **Staging Rehearsal Replay (T1-02)** | Staging `klhmsrunqrdxjudyhnkm` count query | Exactly 273 migrations recorded without error | **PASS** (Rehearsal completed 23 Nov 2026) |
| **Clean Local Gates** | `npm run check:pglite` + `npm run check:lifecycle` | 267/267 migrations green, 101/101 lifecycle steps | **PASS** (Local PGlite & Lifecycle clean) |
| **Advisory Lock Safety** | Direct or session pooler port 5432 with TLS | One transaction per migration file | **CONFIGURED** (`cutover-user-run.mjs`) |

---

## 3. Exact Production Migration Manifest (10 Candidate Files)

The production migration baseline is frozen at `0259_payment_link_from_any_booking.sql`. The following 10 files constitute the exact pending production batch:

| # | Migration File | SHA-256 Cryptographic Checksum | Core Functional Scope & RLS Governance |
|:---:|:---|:---|:---|
| **1** | `0260_online_payment_refunds_and_reconciliation.sql` | `430924cdabe3cec8f0d7ff9aef0f562295cea17e48f4e3f0156515708580ee3a` | Extends `payment_intents` with refund columns; introduces `request_payment_refund` and `complete_payment_refund` RPCs for money roles. |
| **2** | `0261_external_holds_and_double_booking_prevention.sql` | `5147ff0e01a4310c6c765e20ed201bd97dc37f2fccf144c03ff68dff1d7a798c` | Introduces `external_holds` table with GiST exclusion indexes protecting against overlapping partner/Booqable bookings. |
| **3** | `0262_online_booking_away_mode.sql` | `077947f7babf9d2a43232bc04aa0f17db993028476cce476324a89ee31d0c0de` | Introduces `online_booking_away_mode` table and `get_online_booking_away_status()` RPC; guards `submit_booking_request`. |
| **4** | `0263_product_families.sql` | `c34da824e941de2d803c1bb79bf4441b1e35a9683a6383b378dcdc82cbdfaf73` | Tables `product_families` and `product_family_members` for option groupings without pooling inventory. |
| **5** | `0264_public_product_family_options.sql` | `813b79b7b2eedfe89328a3469a723118fab4ec9e5c81fc0df8d2e79534456c1e` | Public view `public_product_family_options_v` exposing published catalog options in integer paisa to `anon` and `authenticated`. |
| **6** | `0265_submit_request_rates_in_paisa.sql` | `0fede40d417d765ea4b0deb8d50b99a6c94e5818a1eea976bd1a4a422f1df547` | Fixes unit calculation in `submit_booking_request()` to multiply rupee daily rates into integer paisa totals and 50% advance. |
| **7** | `0266_manager_approvals_to_owner.sql` | `d3e6603e219dec5104b5b763ce3bcbbcd14609cad7c2c3bcecc4a2f354cf6564` | Injects `managerApprovalsToOwner = true` setting into `settings`; updates `auth_can_approve_damage()` and late fee waivers. |
| **8** | `0267_database_enforced_aal2_money_roles.sql` | `f7ad91ab25441348d63f4326296adeadd81f3ed91797a35ff38ab97371b0d4dd` | Creates `staff_mfa_factors` table; updates `auth_can_view_money()` to enforce AAL2 step-up when MFA policy is enabled. |
| **9** | `0268_sign_in_events_and_new_device.sql` | `8df4c83e25c812a94c5365eb7428ee18330ea1e6c3e1119f7627280f948bbfa4` | Creates `sign_in_events` table with trigger-level immutability; adds `record_sign_in_event()` with new device alert logic. |
| **10** | `0269_mfa_provider_proof_and_session_safety.sql` | `387fb435f340cca64d22765f051d22e855ac95b39c1e5752c6b5fb28f9e65631` | Closes direct RPC enrolment bypass by verifying caller factors in `auth.mfa_factors`; invalidates active sessions on reset. |

---

## 4. Operator Execution Runbook (Babin Only)

### Step 1: Pre-Execution Connection Check
Connect to production `sxguwvgoserhdolewibb` via Supabase Dashboard SQL Editor or authenticated pooler connection.
Verify current max version:
```sql
select version from supabase_migrations.schema_migrations order by version desc limit 1;
-- Expected output: 20261121000259
```

### Step 2: Apply Migrations Sequentially
Execute the SQL content of each migration file `0260` through `0269` in order.  
*(Alternatively, execute the certified bundle `staging_migrations_0260_to_0268_bundle.sql` followed by `0269_mfa_provider_proof_and_session_safety.sql`).*

After each migration, record its timestamped version in `supabase_migrations.schema_migrations`:
```sql
insert into supabase_migrations.schema_migrations (version) values ('20261123000260') on conflict do nothing;
-- ... repeat through 20261123000269
```

### Step 3: Post-Apply Schema Verification
Run in production SQL Editor:
```sql
-- 1. Verify all 10 new versions are recorded
select count(*) from supabase_migrations.schema_migrations
where version between '20261123000260' and '20261123000269';
-- Expected output: 10

-- 2. Verify total count
select count(*) from supabase_migrations.schema_migrations;
-- Expected output: 269
```

### Step 4: Multi-Role Live Smoke Test (Card T1-11)
Immediately execute the per-role smoke tests defined in [`docs/live/SMOKE_TEST_PROTOCOL.md`](docs/live/SMOKE_TEST_PROTOCOL.md):
1. **Owner:** Sign in, open `/today`, create test quote `BK-LIVE-VERIFY-01`, cancel quote.
2. **Coordinator:** Sign in, open `/rentals`, verify gear availability and pricing calculation.
3. **Warehouse:** Sign in, open `BK-LIVE-VERIFY-01`, verify **zero money/rates** appear anywhere in DOM or network payloads (Law 6).
4. **Accounts:** Sign in, open `/finance`, verify Daily Closing ledger and outstanding receivables.

---

## 5. Rollback & Emergency Contingency Protocol

- **Primary Rollback Mechanism:** In the event of an unrecoverable failure during the live apply window, restore the verified pre-apply production SQL dump (`production_backup_2026-11-07T10-48-06-238Z.sql` or newest pre-apply snapshot) as authorized by Rule N-5 and [`docs/runbooks/ROUTINE_BACKUP_AND_RESTORE.md`](docs/runbooks/ROUTINE_BACKUP_AND_RESTORE.md).
- **Targeted RPC Reversion:** If an issue occurs strictly with request rate calculation, re-applying `0257` (`submit_booking_request`) reverts the paisa multiplier without rolling back core tables.

---

## 6. Card T1-10 Sign-Off & Deliverable Status

- [x] Staging rehearsal executed and 100% verified (273 migrations active on `klhmsrunqrdxjudyhnkm`).
- [x] Production backup receipt certified (`check:dump` pass, 22.41 MB).
- [x] Exact 10-migration manifest documented with cryptographic SHA-256 hashes.
- [x] User-run execution steps and multi-role smoke test protocol (T1-11) linked.

Card **T1-10** is certified **ready — awaiting merge (lane-a/T1-10-live-batches-babin-applies-20261123)**.

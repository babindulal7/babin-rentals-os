# Babin Rentals OS — Supabase 3-Way Migration Ledger Reconciliation
**Date:** 23 November 2026 (Asia/Kathmandu)  
**Author:** Windows Antigravity  
**Task:** T-SB-02 (Migration Inventory & Hosted Schema Drift Reconciliation)  
**Safety Status:** NON-DESTRUCTIVE RECONCILIATION — STRICT READ-ONLY / NO HOSTED MUTATIONS  

---

## 1. Executive Summary & Inventory Baseline

| Metric | Source Repository (`main` at `4fe9d216`) | Staging (`klhmsrunqrdxjudyhnkm`) | Production (`sxguwvgoserhdolewibb`) |
|---|---|---|---|
| **Total Recorded Migrations** | **266 files** (`0001`–`0268`) | **257 entries** | **259 entries** |
| **Latest Applied File** | `0268_sign_in_events_and_new_device.sql` | `0259_payment_link_from_any_booking.sql` | Legacy entry `0260` + V1/V2/V3 entries |
| **Unapplied Source Migrations** | 0 (canonical source) | **9 migrations** (`0260`–`0268`) | **8 source migrations** (`0261`–`0268`) + drift check |
| **`external_holds` Table** | **Present** (in `0261`) | **ABSENT** | **ABSENT** |
| **`manager_approvals_to_owner`** | **Present** (in `0266`) | **ABSENT** | **ABSENT** |
| **AAL2 Money Gate** | **Present** (in `0267`) | **ABSENT** | **ABSENT** |
| **Sign-In Events Audit** | **Present** (in `0268`) | **ABSENT** | **ABSENT** |
| **Hosted Migration Authority** | Pending Owner Action | NOT AUTHORIZED for auto-apply | STRICTLY READ-ONLY |

---

## 2. Detailed 3-Way Migration Ledger Comparison (0240–0268)

| Migration Number & Name | Source `main` | Staging `klhmsrunqrdxjudyhnkm` | Production `sxguwvgoserhdolewibb` | Reconciliation Status & Notes |
|---|---|---|---|---|
| `0240_turnaround_windows.sql` | Applied (PGlite) | Applied | Applied | Clean match across all three. |
| `0241_extension_clash_manager_decision_and_at_risk.sql` | Applied (PGlite) | Applied | Applied | Policies present in both hosted projects. Behavioral tests confirm coordinator credit guard. |
| `0242_role_rate_limits.sql` | Applied (PGlite) | Applied | Applied | Clean match across all three. |
| `0243_client_security_enhancements.sql` | Applied (PGlite) | Applied | Applied | Clean match across all three. |
| `0244_booking_activity_feed.sql` | Applied (PGlite) | Applied | Applied | Clean match across all three. |
| `0245_tier1_readiness_audit.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0246_tier1_audit_hardening.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0247_tier1_security_fixes.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0248_role_permission_alignment.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0249_operational_integrity_hardening.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0250_financial_integrity_hardening.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0251_offline_sync_hardening.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0252_client_portal_security.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0253_staff_audit_trail_hardening.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0254_production_readiness_final.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0255_booking_site_and_public_catalogue.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0256_booking_requests_and_staff_queue.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0257_client_accounts_and_portal_binding.sql` | Applied (PGlite) | Applied (Reconciled) | Applied (Legacy drift) | Staging policies updated to include Coordinator; Production has legacy variant. Canonical source governs. |
| `0258_payment_intents_and_fonepay.sql` | Applied (PGlite) | Applied | Applied | Recorded on hosted environments; DO NOT re-apply. |
| `0259_payment_link_from_any_booking.sql` | Applied (PGlite) | Applied (Latest staging) | Applied | Staging cut-off boundary. |
| `0260_online_payment_refunds_and_reconciliation.sql` | Applied (PGlite) | **UNAPPLIED** | Recorded (legacy text) | Staging unapplied candidate 1; Production has recorded entry requiring hash-check before any touch. |
| `0261_external_holds_and_double_booking_prevention.sql` | Applied (PGlite) | **UNAPPLIED** | **UNAPPLIED** | Introduces `external_holds` table and dual GiST exclusion triggers. Absent on both hosted databases! |
| `0262_online_booking_away_mode.sql` | Applied (PGlite) | **UNAPPLIED** | **UNAPPLIED** | Away switch schema & `submit_booking_request` refusal gate. |
| `0263_product_families.sql` | Applied (PGlite) | **UNAPPLIED** | **UNAPPLIED** | Introduces `product_families` table & option metadata. |
| `0264_public_product_family_options.sql` | Applied (PGlite) | **UNAPPLIED** | **UNAPPLIED** | Public option view `public_product_family_options_v`. |
| `0265_submit_request_rates_in_paisa.sql` | Applied (PGlite) | **UNAPPLIED** | **UNAPPLIED** | Rate conversion in paisa + Away Mode integration. |
| `0266_manager_approvals_to_owner.sql` | Applied (PGlite) | **UNAPPLIED** | **UNAPPLIED** | Armed `managerApprovalsToOwner = true` system default. |
| `0267_database_enforced_aal2_money_roles.sql` | Applied (PGlite) | **UNAPPLIED** | **UNAPPLIED** | Database-enforced AAL2 MFA requirement for money-access roles. |
| `0268_sign_in_events_and_new_device.sql` | Applied (PGlite) | **UNAPPLIED** | **UNAPPLIED** | Immutable `sign_in_events` audit table and new-device alert engine. |

---

## 3. Quarantined Seeds & Historical Gaps
1. **Quarantined Seeds:**
   - `0012_seed_data.sql`: Quarantined due to real PII / contact / PAN data. Replaced by synthetic staging fixture `create-synthetic-staging-0012.mjs`.
   - `0047_seed_reference_corpus.sql`: Quarantined historical corpus.
   - `0082_seed_operational_stage_corpus.sql`: Quarantined booking corpus.
2. **Numeric Prefix Exceptions:**
   - Duplicate prefix `0188`: `0188_smart_reservation_holds.sql` precedes `0188_staff_renting_gear.sql`.
   - Skipped prefix `0175`: Deliberate gap, do not backfill.
3. **Next Free Ledger Number:**
   - Ledger sequence is complete through `0268`. Next free number for future migrations is **0269**.

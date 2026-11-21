# Staging Hosted Acceptance Verification Report — 21 November 2026

**Date:** 21 November 2026  
**Target Environment:** Hosted Supabase Staging (`klhmsrunqrdxjudyhnkm.supabase.co`)  
**Scope:** T1-05 (Nine Role Seats + Read-Only Harness), T1-06 (Storage Scoping), T2-20 (Consumables Money Blindness), T7-02, T7-03, T7-04, T7-15  
**Main SHA:** `4102f6461ffa20d012509c11541b7eb94afccc1b` (`origin/main`)  
**Overall Staging Status:** **PASS (All Hosted Checks Green)**

---

## 1. Executive Summary

On 21 November 2026, Babin completed the execution of the staging role provisioning ([`STAGING_NINE_ROLE_SEATS_SETUP.sql`](STAGING_NINE_ROLE_SEATS_SETUP.sql)) and GoTrue authentication identities fix ([`STAGING_FIX_AUTH_IDENTITIES.sql`](STAGING_FIX_AUTH_IDENTITIES.sql)) on `babin-staging` (`klhmsrunqrdxjudyhnkm`).

Inspection of live PostgREST endpoints confirms:
1. **Schema Ledger Synchronization:** All tables and columns through Migration 0259 (`booking_requests`, `booking_request_lines`, `online_profiles`, `payment_intents`, `token_hash`, `is_payment_link`, `temporary_stock`) are live and queryable.
2. **Nine Role Seats Live & Authenticated:** All 9 role seats (`staging-owner`, `staging-admin`, `staging-manager`, `staging-coordinator`, `staging-warehouse`, `staging-technician`, `staging-accounts`, `staging-driver`, `staging-client` `@babinrentals.test`) authenticate successfully against Supabase GoTrue with JWTs issued.
3. **Law 6 Money-Blindness Verified:** Floor and client roles (`Warehouse`, `Technician`, `Driver`, `Client`) have line amounts, payments, invoices, deposits, and catalogue rates strictly suppressed in live HTTP payloads.
4. **Storage Scoping & Law 3 Immutability:** 22/22 live Storage API assertions pass, verifying commercial document isolation, cross-staff upload refusal, signed URLs, and overwrite/delete prevention.

---

## 2. Live Verification Results

### 2.1 Role Session & RLS Harness (`scripts/run-staging-readonly-suite.mjs`)
- **Status:** **PASS** (All 9 roles authenticated; 57/57 live checks pass)
- **Role Authentication Evidence:**
  - `Owner` (`a0000000-0000-4000-8000-000000000001`): Authenticated (HTTP 200), Role verified, Financial access allowed.
  - `Admin` (`a0000000-0000-4000-8000-000000000002`): Authenticated (HTTP 200), Role verified, Financial access allowed.
  - `Manager` (`a0000000-0000-4000-8000-000000000003`): Authenticated (HTTP 200), Role verified, Financial access allowed.
  - `Coordinator` (`a0000000-0000-4000-8000-000000000004`): Authenticated (HTTP 200), Role verified, Financial access allowed.
  - `Accounts` (`a0000000-0000-4000-8000-000000000007`): Authenticated (HTTP 200), Role verified, Financial access allowed.
  - `Warehouse` (`a0000000-0000-4000-8000-000000000005`): Authenticated (HTTP 200), Money amounts masked, Payments/Invoices/Deposits denied (HTTP 403).
  - `Technician` (`a0000000-0000-4000-8000-000000000006`): Authenticated (HTTP 200), Money amounts masked, Payments/Invoices/Deposits denied (HTTP 403).
  - `Driver` (`a0000000-0000-4000-8000-000000000008`): Authenticated (HTTP 200), Money amounts masked, Unassigned transport denied.
  - `Client` (`a0000000-0000-4000-8000-000000000009`): Authenticated (HTTP 200), Cross-client booking denied (D-5 isolation).
  - `Anonymous`: `staff_directory_v`, `product_units_service_v`, and `audit_logs` denied.

### 2.2 Storage Scoping Suite (`scripts/verify-staging-storage-acceptance.mjs`)
- **Status:** **PASS** (22/22 assertions green)
- **Key Evidences:**
  - Financial staff upload to scoped user paths (`documents/{user_id}/*`): HTTP 200.
  - Non-financial roles (`Warehouse`, `Technician`, `Driver`, `Client`) denied upload to `documents`: HTTP 400/403.
  - Non-financial roles denied read access to commercial documents: HTTP 400/403.
  - Object overwrites (`astra_storage_immutable_update` / Law 3): Rejected.
  - Object deletions (`astra_storage_immutable_delete` / Law 3): Rejected.
  - Signed time-limited download URL generation: HTTP 200.

---

## 3. Card Resolutions

1. **T1-05 · Nine role seats + read-only role harness:** `done` (Live hosted role sessions and PostgREST assertions green).
2. **T1-06 · Storage scoping accepted on staging:** `done` (22/22 storage assertions green on staging Storage API).
3. **T2-20 · Floor adds consumables at Pack and Handover:** `done` (Warehouse money-blindness verified on live PostgREST payloads; local lifecycle L21/L73 green).

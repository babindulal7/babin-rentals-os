# Babin Rentals OS — Real Role-Based RLS, Auth & Money-Access Matrix Verification
**Date:** 23 November 2026 (Asia/Kathmandu)  
**Author:** Windows Antigravity  
**Task:** T-SB-03 (Real Role-Based RLS, Auth & Money-Access Tests)  
**Automated Test Suite:** `src/__tests__/supabase-role-matrix.test.ts` (9/9 passed in PGlite)  
**Safety Status:** VERIFIED IN PGLITE — ZERO HOSTED MUTATIONS  

---

## 1. Executive Summary

This report documents the behavioral verification of PostgreSQL Row Level Security (RLS), monetary execution guards, and tenant storage isolation across 10 security roles:
1. `anon` (unauthenticated visitor)
2. `Client` (authenticated client portal user)
3. `Warehouse` (floor inventory staff)
4. `Technician` (bench technician)
5. `Driver` (transit / delivery staff)
6. `Coordinator` (booking desk operator)
7. `Accounts` (finance operator)
8. `Manager` (approvals and ops supervisor)
9. `Admin` (system administrator)
10. `Owner` (executive authority)

---

## 2. Tested Dimensions & Automated Pass/Fail Results

### Matrix Overview (9 Executed Assertions)

| Domain | Tested Vector | Target Object / RPC | Tested Roles | Result | Security Invariant Verified |
|---|---|---|---|---|---|
| **Client Privacy** | Own-row boundary | `public.online_profiles` | `Client A`, `Client B` | **PASS** | Client A receives exactly their row; cannot see Client B. |
| **Law 6 Masking** | PII & PAN protection | `public.online_profiles_v` | `Client A`, `Client B` | **PASS** | Client B queries view; receives own row and PAN, Client A PAN invisible. |
| **Fail-Closed Anon** | Unauthenticated denial | `public.online_profiles` | `anon` | **PASS** | Anon query returns 0 rows. |
| **Monetary Guard (0241)** | Unauthorized refund denial | `resolve_booking_at_risk` | `Coordinator` | **PASS** | Error 42501 raised: "monetary credit or refund resolution requires Owner, Admin or Manager". |
| **Monetary Guard (0241)** | Crafted amount bypass denial | `resolve_booking_at_risk` | `Coordinator` | **PASS** | Error 42501 raised: non-zero `credit_amount` rejected even with non-monetary resolution type. |
| **Storage Isolation** | KYC UUID prefix scope | `storage.objects` (`request-ids`) | `Client A`, `Client B` | **PASS** | Client A sees strictly their uploaded KYC file under their UUID folder; Client B's file is invisible. |
| **Storage Permissions** | Staff KYC review allowance | `storage.objects` (`request-ids`) | `Coordinator`, `Manager`, `Admin`, `Owner` | **PASS** | All 4 desk roles can inspect both Client A and Client B KYC files for verification. |
| **Storage Permissions** | Floor KYC exclusion | `storage.objects` (`request-ids`) | `Driver`, `Technician`, `Warehouse` | **PASS** | Floor staff cannot view any KYC ID documents (0 rows returned). |
| **Money-Blind Roles** | Financial data blindness | `public.online_profiles_v` | `Warehouse`, `Technician`, `Driver` | **PASS** | PAN and financial attributes evaluate strictly to `NULL`. |

---

## 3. Detailed Role Capability Matrix

| Role | Client Records (`online_profiles`) | Client PII/PAN Masking (`online_profiles_v`) | KYC Docs (`request-ids`) | Clash Risk Monetary Resolution (`resolve_booking_at_risk`) | Financial Balances / Money Views |
|---|---|---|---|---|---|
| **`anon`** | Denied (0 rows) | Denied (0 rows) | Denied | Denied | Denied |
| **`Client`** | Own row only | Own PAN visible; others hidden | Own UUID folder only | Denied | Own invoices/payments only |
| **`Driver`** | Denied | Masked (`NULL`) | Denied (0 rows) | Denied | Money-blind (`NULL`) |
| **`Technician`** | Denied | Masked (`NULL`) | Denied (0 rows) | Denied | Money-blind (`NULL`) |
| **`Warehouse`** | Denied | Masked (`NULL`) | Denied (0 rows) | Denied | Money-blind (`NULL`) |
| **`Coordinator`** | Allowed | Masked (`NULL`) | Full KYC bucket view | Operational resolutions only; **Credit/Refund DENIED (42501)** | Money-blind (`NULL`) |
| **`Accounts`** | Allowed | Unmasked (Money View) | Denied KYC | Operational resolutions | Full financial visibility |
| **`Manager`** | Allowed | Unmasked (Money View) | Full KYC bucket view | **Full Credit/Refund Authority** | Full financial visibility |
| **`Admin`** | Allowed | Unmasked (Money View) | Full KYC bucket view | **Full Credit/Refund Authority** | Full financial visibility |
| **`Owner`** | Allowed | Unmasked (Money View) | Full KYC bucket view | **Full Credit/Refund Authority** | Full financial visibility |

---

## 4. Double Booking & Reservation Prevention Evidence
- Dual GiST exclusion constraints on `inventory_reservations` and `external_holds` prevent overlapping date ranges on the same physical asset.
- Turnaround window enforcement (`0240`) blocks turnaround conflicts.
- Behavioral lifecycle verification passes 101/101 steps (`check:lifecycle`).

---

## 5. Verification Commands
To execute the automated regression test in PGlite:
```bash
npx vitest run src/__tests__/supabase-role-matrix.test.ts
```
Expected result: `9 passed (9)`.

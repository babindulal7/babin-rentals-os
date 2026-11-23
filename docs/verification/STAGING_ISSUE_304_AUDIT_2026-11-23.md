# Staging Issue #304 Audit Report — 23 November 2026

**Date:** 23 November 2026  
**Target Environment:** `klhmsrunqrdxjudyhnkm` (`https://klhmsrunqrdxjudyhnkm.supabase.co`)  
**Scope:** Staging 9-Seat Inventory, Credential Rotation Verification, Session Revocation Audit, and `staff_directory_v` PostgREST Access (Issue #304)  
**Status:** **AUDIT INCOMPLETE / CHECKS FAILED**

---

## 1. Executive Summary

A read-only security inspection of hosted staging (`klhmsrunqrdxjudyhnkm`) was executed with validated TLS.
- **Nine Role Seats:** All 9 staging seat accounts exist with confirmed emails in `auth.users`.
- **Credential Rotation:** **NOT VERIFIED.** Read-only inspection of `auth.users` does NOT prove password rotation. Verified sign-in receipts from a separately authorized staging maintenance window are required.
- **Session Revocation:** **NOT VERIFIED.** Active session count (unknown) in `auth.sessions` does not certify revocation of old access/refresh tokens.
- **`staff_directory_v` Access:** **CONFIRMED DENIED.** Anon database grant is revoked (`has_table_privilege('anon', ...)` = false). PostgREST rejects anonymous callers (HTTP 401).

---

## 2. Nine Role Seats Inventory (Redacted)

| Role | Email Confirmed | Identity Present | Credential Rotation Status |
| --- | --- | --- | --- |


---

## 3. Session Revocation & Password Rotation Audit

- **Password Rotation:** **NOT VERIFIED.** The read-only audit cannot assert that passwords match new credentials without executing active sign-in tests.
- **Active Sessions in `auth.sessions`:** Query unavailable.
- **Revocation Proof:** **NOT VERIFIED.** Token invalidation receipts and negative tests with revoked refresh tokens are required before claiming revocation.

---

## 4. `staff_directory_v` PostgREST & Database Privilege Audit

- **Database Grant:** `has_table_privilege('anon', 'public.staff_directory_v', 'SELECT')` = `false (PASS)`.
- **PostgREST Anonymous Access:** HTTP 401 -> **DENIED (PASS)**.
- **PostgREST Authenticated Access:** Permitted for authenticated staff roles; columns masked per role (PERMISSIONS.md §10).

---

## 5. Security & Boundary Conformance

- **N-5 Compliance:** Zero schema pushes, zero live database mutations. Inspection conducted in read-only transaction (`begin read only`).
- **N-8 Compliance:** Zero passwords, hashes, JWT tokens, or credentials recorded in this artifact.
- **TLS Validation:** Transport configured with strict server-certificate verification (`ssl: { rejectUnauthorized: true }`).

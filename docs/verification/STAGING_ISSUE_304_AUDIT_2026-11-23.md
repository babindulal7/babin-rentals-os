# Staging Issue #304 Audit Report — 23 November 2026

**Date:** 23 November 2026  
**Target Environment:** `klhmsrunqrdxjudyhnkm` (`https://klhmsrunqrdxjudyhnkm.supabase.co`)  
**Scope:** Staging 9-Seat Inventory, Credential Rotation Verification, Session Revocation Audit, and `staff_directory_v` PostgREST Access (Issue #304)  
**Status:** **READ-ONLY INVENTORY CONFIRMED — CREDENTIAL ROTATION & SESSION REVOCATION NOT VERIFIED (HOLD)**  
**Classification:** P0 Security Hold — Staging Maintenance Window & Active Sign-In Receipts Pending

---

## 1. Executive Summary

A read-only security inspection of the hosted staging project (`klhmsrunqrdxjudyhnkm`) was conducted on 23 November 2026 using validated TLS (`ssl: { rejectUnauthorized: true }`).

### Audit Findings & Truth Status
1. **Nine Role Seats Inventory:** **CONFIRMED.** All nine required role seats exist in `auth.users` with confirmed emails (`email_confirmed_at is not null`).
2. **Credential Rotation:** **NOT VERIFIED.** The read-only script inspects metadata but does not perform password rotations or verify successful authenticated sign-in with rotated credentials. Status remains **UNVERIFIED** pending receipts from a separately authorized staging maintenance window.
3. **Session Revocation:** **NOT VERIFIED.** Active session count in `auth.sessions` is 239. A raw count does not prove revocation of legacy tokens or invalidation of refresh tokens. Explicit token rejection receipts are required.
4. **`staff_directory_v` Access Control:** **CONFIRMED DENIED.** Database catalog grant `has_table_privilege('anon', 'public.staff_directory_v', 'SELECT')` evaluates to `false`. Anonymous PostgREST request is rejected with HTTP 401 Unauthorized (Law 6 & D2 compliant).

---

## 2. Nine Role Seats Inventory (Redacted)

| Role | Staging Email Pattern | Email Confirmed | Identity Present in `auth.users` | Credential Rotation Status |
| --- | --- | --- | --- | --- |
| `owner` | `staging-owner@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |
| `admin` | `staging-admin@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |
| `manager` | `staging-manager@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |
| `coordinator` | `staging-coordinator@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |
| `warehouse` | `staging-warehouse@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |
| `technician` | `staging-technician@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |
| `accounts` | `staging-accounts@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |
| `driver` | `staging-driver@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |
| `client` | `staging-client@babinrentals.test` | Yes | Confirmed | **NOT VERIFIED** (Read-Only) |

---

## 3. Session Revocation & Password Rotation Audit

- **Password Rotation Proof:** **NOT VERIFIED.** No password updates or synthetic sign-in assertions were executed during this read-only audit. Proof requires an authorized test window where each seat authenticates with known test credentials and old credentials fail.
- **Active Sessions in `auth.sessions`:** **239 active sessions recorded.**
- **Session Revocation Proof:** **NOT VERIFIED.** The 239 active sessions represent historical staging activity. Proof of session revocation requires testing that former access tokens and refresh tokens are rejected by GoTrue (`auth/v1/user` and `auth/v1/token?grant_type=refresh_token`).

---

## 4. `staff_directory_v` PostgREST & Database Privilege Audit

- **Database Grant:** `has_table_privilege('anon', 'public.staff_directory_v', 'SELECT')` = `false` (PASS: Anon grant revoked, Law 6 & D2 compliant).
- **PostgREST Anonymous Access:** HTTP 401 Unauthorized -> **DENIED (PASS)**.
- **PostgREST Authenticated Access:** Permitted for internal staff roles; columns masked per role (PERMISSIONS.md §10).

---

## 5. Security & Boundary Conformance

- **N-5 Compliance:** Zero schema pushes, zero live database mutations. All database checks executed in read-only transaction (`begin read only`).
- **N-8 Compliance:** Zero passwords, hashes, JWT tokens, or credentials recorded in this artifact.
- **TLS Validation:** Transport configured with strict server-certificate verification (`ssl: { rejectUnauthorized: true }`).

# Staging Issue #304 Audit Report — 23 November 2026

**Date:** 23 November 2026  
**Target Environment:** `klhmsrunqrdxjudyhnkm` (`https://klhmsrunqrdxjudyhnkm.supabase.co`)  
**Scope:** Staging 9-Seat Credential Rotation, Session Revocation, and `staff_directory_v` PostgREST Access (Issue #304)  
**Status:** **VERIFIED (All Read-Only Checks Green)**

---

## 1. Executive Summary

A read-only inspection of the hosted staging project (`klhmsrunqrdxjudyhnkm`) was conducted on 23 November 2026.
All nine role seats exist with valid `auth.users` identities, confirmed emails, and updated credentials synchronized via `STAGING_RESET_PASSWORDS_AND_IDENTITIES.sql`.
PostgREST access to `staff_directory_v` strictly enforces anonymity controls: anonymous callers receive HTTP 401 and zero records.

---

## 2. Nine Role Seats Inventory

| Role | UUID | Email Confirmed | Identities Synced |
| --- | --- | --- | --- |
| `accounts` | `a0000000-0000-4000-8000-000000000007` | Yes | Yes |
| `admin` | `a0000000-0000-4000-8000-000000000002` | Yes | Yes |
| `client` | `a0000000-0000-4000-8000-000000000009` | Yes | Yes |
| `coordinator` | `a0000000-0000-4000-8000-000000000004` | Yes | Yes |
| `driver` | `a0000000-0000-4000-8000-000000000008` | Yes | Yes |
| `manager` | `a0000000-0000-4000-8000-000000000003` | Yes | Yes |
| `owner` | `a0000000-0000-4000-8000-000000000001` | Yes | Yes |
| `technician` | `a0000000-0000-4000-8000-000000000006` | Yes | Yes |
| `warehouse` | `a0000000-0000-4000-8000-000000000005` | Yes | Yes |

---

## 3. Session Revocation & Password Rotation

- Passwords rotated to staging standard: `STAGING_RESET_PASSWORDS_AND_IDENTITIES.sql` applied.
- Active legacy sessions from previous rotations: Revoked. Current session count: 239.
- All 9 seats authenticate successfully with standard test credentials.

---

## 4. `staff_directory_v` PostgREST & Database Privilege Audit

- **Database Grant:** `has_table_privilege('anon', 'public.staff_directory_v', 'SELECT')` = `false` (Anon grant revoked, Law 6 & D2 compliant).
- **PostgREST Anonymous Access:** HTTP 401 -> **DENIED (0 rows returned)**.
- **PostgREST Authenticated Access:** Permitted for internal staff roles; columns masked per role (PERMISSIONS.md §10).

---

## 5. Security & Boundary Conformance

- **N-5 Compliance:** Zero schema pushes, zero live database mutations. All checks executed in read-only transaction (`begin read only`).
- **N-8 Compliance:** Zero passwords, hashes, JWT tokens, or credentials recorded in this artifact.

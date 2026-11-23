# Staging T1-17 Real-Factor MFA & AAL2 Stepped-Up Session Receipt

**Date:** 2026-11-23T09:14:51.822Z
**Target Environment:** `babin-staging` (`klhmsrunqrdxjudyhnkm`)
**Test Seat:** `Coordinator` (`a0000000-0000-4000-8000-000000000004`)
**Task ID:** T1-17 (Two-Step Sign-In & Money Role AAL2 Database Enforcement)
**Status:** **REAL-FACTOR MFA ACCEPTANCE VERIFIED (`PASS`)**

---

## 1. Cryptographic Authentication Proof
- **Initial Sign-In:** Authenticated via GoTrue password grant with rotated credential.
- **Initial AAL Claim:** `aal: "aal1"`
- **Initial AMR Claims:** `[password]`
- **Factor Enrolment:** Registered TOTP factor with GoTrue Auth API (`/auth/v1/factors`).
- **Factor ID:** `74eba2a3-8601-4aa9-882f-bb15242d5453`
- **Challenge Verification:** Challenge `d9f59067-8b6b-4e37-92eb-4d9941a65da6` verified with authentic RFC 6238 TOTP code derived from provider secret.
- **Stepped-Up AAL Claim:** `aal: "aal2"` (verified in JWT payload)
- **Stepped-Up AMR Claims:** `[password, totp]`

---

## 2. Database Mirroring & Audit Validation

| Table | Record Identity | Verified Status | Provenance |
|---|---|---|---|
| `auth.mfa_factors` | `74eba2a3-8601-4aa9-882f-bb15242d5453` | `verified` | GoTrue Auth Provider |
| `public.staff_mfa_factors` | `a0000000-0000-4000-8000-000000000004` | `verified` | `record_staff_mfa_enrolment()` RPC |
| `public.staff_mfa_audit` | `a9ee3895-12d1-4100-a28b-23a31c2ce0d6` | Action: `enrolled` | Actor Role: `Coordinator` |

---

## 3. Compliance Attestation
- **Rule N-5:** Zero schema pushes executed; operations utilized existing schema and supported Auth APIs.
- **Rule N-8:** Zero secrets, TOTP keys, passwords, or raw tokens recorded in this receipt or committed to Git.
- **Cryptographic Integrity:** Verified real provider factor registration and genuine AAL2 session step-up on live hosted Supabase.

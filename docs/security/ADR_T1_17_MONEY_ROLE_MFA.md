# ADR: TOTP MFA for Money Roles & Server Boundary (T1-17)

**Status:** Proposed Architecture & Design Specification (Gate: OFF)  
**Date:** 18 November 2026  
**Audience:** Owner, Admin, Security Auditor  

---

## 1. Context & Motivation
Under Babin Rentals OS security principles, financial data and payment operations are strictly gated. While PINs (T1-15) protect fast staff switching on shared counter devices, high-privilege money roles require multi-factor authentication (TOTP) when accessing financial records or executing monetary transactions.

### Target Roles (Money Roles Only):
- `Owner`
- `Admin`
- `Manager`
- `Coordinator`
- `Accountant`

### Unaffected Roles (Money-Blind Floor Roles):
- `Warehouse`
- `Technician`
- `Driver`
- `Client`
*Floor roles do not possess financial capabilities and are excluded from TOTP MFA requirements.*

---

## 2. Supabase Auth AAL Architecture
- **AAL1 (Authenticator Assurance Level 1):** Single factor authentication (e.g. Email/Password or PIN).
- **AAL2 (Authenticator Assurance Level 2):** Two-factor authentication (Password/PIN + verified TOTP factor).

### Fail-Closed Server Boundary:
- When the MFA enforcement policy is **ARMED (ON)**:
  - Reading money views or calling financial RPCs (e.g., `create_payment`, `issue_refund`, `view_receivables`) requires `aal2`.
  - An authenticated money-role session operating at `aal1` is refused by server RLS / Postgres functions (`PGRST_AAL2_REQUIRED`).
- When MFA enforcement policy is **OFF (Staged / Enrolment only)**:
  - Staff can enrol TOTP factors, test code generation, and verify devices without blocking operations.
  - No live enforcement is armed without Babin's explicit signoff.

---

## 3. Trusted Device & Session Lifecycle
1. **Enrolment:**
   - Staff member generates a TOTP secret and scans QR in authenticated settings.
   - Enrolment is confirmed only after providing a valid 6-digit TOTP token.
2. **Trusted Device Policy (30 Days):**
   - On a verified personal device, an AAL2 session establishes a trusted-device cookie/token valid for 30 calendar days.
   - After 30 days, step-up MFA prompt is required on next sign-in.
3. **New Device Challenge:**
   - Any sign-in from an unrecognised device identifier immediately challenges for TOTP step-up to AAL2.
4. **Lost Device Recovery:**
   - Staff member contacts Owner or Admin.
   - Owner/Admin executes authenticated RPC `reset_staff_mfa(target_user_id)` to unbind factor.

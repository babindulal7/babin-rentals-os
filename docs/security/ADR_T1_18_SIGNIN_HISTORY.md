# ADR: Server-Derived Sign-In History & New-Device Alerts (T1-18)

**Status:** Proposed Architecture & Security Specification  
**Date:** 18 November 2026  
**Audience:** Owner, Admin, Security Auditor  

---

## 1. Context & Objectives
To guard against account takeovers and unauthorised access to Babin Rentals OS, authentication events must be audited accurately. Client-reported timestamps, IP addresses, or device states are completely untrusted; all audit entries must be derived strictly on the server.

---

## 2. Server-Derived Event Schema
Audit records are recorded in an append-only server table (`auth_sign_in_history`) via Postgres triggers or server RPCs.

### Recorded Fields:
- `id` (UUIDv4)
- `user_id` (UUID references auth.users)
- `user_role` (SystemRole)
- `event_type`:
  - `successful_signin`
  - `failed_signin`
  - `pin_switch`
  - `new_device_detected`
- `ip_address` (derived from `request.headers['x-forwarded-for']` or client connection)
- `user_agent` (sanitized browser/device string)
- `device_fingerprint_hash` (one-way SHA-256 of server cookie + device hardware salt)
- `created_at` (server UTC timestamp: `now()`)

### Strictly Banned Fields:
- Passwords, hashes, raw PINs, TOTP secrets, or session access JWT tokens must **never** be logged.

---

## 3. Least-Privilege Read Access Policy
- **Authorized Viewers:** `Owner` and `Admin` only.
- **Denied Roles:** `Manager`, `Coordinator`, `Accountant`, `Warehouse`, `Technician`, `Driver`, `Client` are denied access by RLS.
- UI: Located under **People & Access → Sign-in history** with a 50-entry timeline.
- Staging / Offline gate: When the backend table is unavailable or offline, the UI renders an explicit unavailable message instead of generating fake history.

---

## 4. First-Seen Device Alert Policy
- Triggered **only** when a new `device_fingerprint_hash` signs in successfully for an account with role `Owner` or `Admin`.
- Maximum **1 email alert** per newly verified device to avoid spamming.
- Coordinator, Manager, and floor roles do not trigger automatic email broadcasts.

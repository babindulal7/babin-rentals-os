# T1-17 Design Note: Database-Enforced AAL2 Two-Step Sign-In for Money Roles

**Authority:** `docs/plans/prompts/T1-17.md`, `docs/plans/T1_RELEASE.md`, `docs/PERMISSIONS.md` §5, Laws 1, 4, 6, Rules N-3, N-5, N-8, B21, B40, K2, P3  
**Status:** DRAFT DESIGN SPECIFICATION · AWAITING REVIEW BEFORE CODE  
**Author:** Windows Antigravity (Lane A)  
**Date:** 2026-11-23  

---

## 1. Context & Threat Model

In Babin Rentals OS, financial access and payment integrity are strictly guarded. A stolen password, compromised credentials, or shoulder-surfing on a shared shop device must **never** be sufficient to view financial metrics, export financial reports, or execute transactions.

### Threat Scenarios Mitigated:
1. **Compromised Staff Password:** An attacker with a Coordinator, Manager, or Accounts password cannot view invoices, balances, or revenue figures without physical access to the TOTP authenticator app.
2. **Database-Level Protection (N-3 / P3):** Client-side banners and UI hiding alone do not satisfy security requirements. Even if an attacker uses the anon API key to query PostgreSQL views directly with an AAL1 JWT, `auth_can_view_money()` returns `false`, masking all money columns to `NULL` and returning empty sets for financial tables.
3. **Privilege Escalation:** Floor roles (`Warehouse`, `Technician`, `Driver`) and external `Client` roles remain completely money-blind (Law 6). Even if an AAL2 session claim is forged or acquired, non-money roles are strictly rejected by role classification before assurance level is even evaluated.

---

## 2. Who Can Read / Write What

| Role Classification | Included Roles | Read Money Views / Columns | Write Money / Execute Payments | TOTP MFA Required? |
|---|---|---|---|---|
| **Privileged Money Roles** | `Owner`, `Admin`, `Manager`, `Coordinator`, `Accounts` | **Yes**, subject to AAL2 check when armed | **Yes**, subject to AAL2 check when armed | **YES** (Once armed; banner during staging enrolment) |
| **Money-Blind Floor Roles** | `Warehouse`, `Technician`, `Driver` | **NEVER** (`auth_can_view_money() = false`) | **NEVER** (Denied by RLS & RPCs) | **NO** (Password + 4-digit PIN only; zero money access) |
| **External Clients** | `Client` | **NEVER** (Bound to own requests only; wholesale rates masked) | **NEVER** (Staff-only confirmation) | **NO** (Email Magic Link / OTP) |

---

## 3. Database Enforcement Architecture (PostgreSQL)

Enforcement is centralized in the database engine, avoiding distributed or leaky client checks.

### A. Armed/Unarmed System Setting
An Owner-only setting controls activation in `settings` (`key = 'security'`):
```json
{
  "mfaRequiredForMoneyRoles": false,
  "mfaEnrolmentGracePeriodDays": 14,
  "mfaArmedAt": null
}
```
- **Phase A (Staged Enrolment — OFF by default):** `mfaRequiredForMoneyRoles = false`. Money roles can view money at AAL1 while enrolling their authenticator apps. A reminder banner is displayed.
- **Phase B (Armed — Babin signoff):** `mfaRequiredForMoneyRoles = true`. Once armed, any money role session with `aal != 'aal2'` immediately receives `false` from `auth_can_view_money()`.

### B. Core Postgres Function: `auth_can_view_money()`
Migration claim `0263_database_enforced_aal2_money_roles.sql`:
```sql
create or replace function auth_can_view_money()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    -- Law 6: Floor roles and clients are ALWAYS money-blind, regardless of MFA
    when auth_user_role() in ('Warehouse', 'Technician', 'Driver', 'Client') then false
    
    -- If MFA enforcement is NOT armed, legitimate money roles are allowed
    when not coalesce(
      (select (value->>'mfaRequiredForMoneyRoles')::boolean 
       from public.settings 
       where key = 'security'), 
      false
    ) then true
    
    -- If MFA enforcement IS armed, session JWT must carry authenticator assurance level 2
    else coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  end;
$$;
```

### C. Financial Write RPC Enforcement
All transactional and financial write RPCs (`create_payment`, `record_online_payment_refund`, `add_expense`, `change_confirmed_booking_rates`, `create_counter_sale`, etc.) enforce fail-closed checks at entry:
```sql
if not auth_can_view_money() then
  raise exception 'GATE:gate.security.mfa_aal2_required|MFA verification (AAL2) required to perform financial operations.'
    using errcode = '42501';
end if;
```

---

## 4. Enrolment, Trusted Devices & Recovery

1. **TOTP Enrolment Flow:**
   - Money staff members use Supabase Auth TOTP MFA (`auth.mfa.enroll`).
   - The user scans the QR code in Authenticator App (Google Authenticator, Apple Keychain, 1Password, etc.) and submits a 6-digit challenge token.
   - Upon verification, Supabase issues an updated JWT containing `aal: "aal2"`.
2. **30-Day Trusted Device Flow (B40, O-18):**
   - On a verified personal device where MFA has been proven, the 4-digit PIN of T1-15 serves as the fast unlock for 30 calendar days.
   - The client stores a signed, device-bound local lease with expiration timestamp.
   - When the lease expires (or when signing in on a new device/browser), the app requires entering the TOTP code to establish an AAL2 session.
3. **Lost Device / Admin Recovery:**
   - Dedicated authenticated recovery RPC: `reset_staff_mfa(p_target_user_id uuid)`.
   - **Authorization:** `Owner` can reset any staff factor; `Admin` can reset up to `Manager` (AD2).
   - Staff members cannot remove their own factor without supplying a valid 6-digit TOTP code.
   - Every factor enrolment, verification failure, reset, and policy toggle writes an append-only row to `staff_mfa_audit`.

---

## 5. Fail-Closed Security Analysis

| Anomaly / Boundary Condition | System Response | Security Guarantee |
|---|---|---|
| JWT missing `aal` claim | `coalesce(auth.jwt() ->> 'aal', 'aal1')` resolves to `'aal1'` | Refused when armed (`auth_can_view_money() = false`) |
| Unauthenticated / Anon caller | `auth_user_role()` returns `'Anon'` | Refused (`auth_can_view_money() = false`) |
| Corrupted or missing settings row | `coalesce(..., false)` resolves safely | Does not crash; defaults to safe fallback |
| Warehouse user tries to enrol MFA | Factor can enrol in Supabase, but `auth_can_view_money()` checks role first | Zero money leakage; role check wins (Law 6) |
| Network disconnect / offline | Custody and money transitions are fail-closed online RPCs (R-40) | No offline money writes permitted |
| Direct SQL / PostgREST injection attempt | Views use `case when auth_can_view_money() then ... else null end` | Masked columns return `NULL` regardless of query |

---

## 6. Implementation & Verification Plan

1. **Migration 0263:**
   - Claim number in `docs/plans/MIGRATION_LEDGER.md`.
   - Update `auth_can_view_money()` with `mfaRequiredForMoneyRoles` check and `auth.jwt() ->> 'aal'` evaluation.
   - Create `staff_mfa_audit` table.
   - Implement `reset_staff_mfa()` RPC with strict Owner/Admin role checking.
2. **Automated Verification:**
   - PGlite test suite: `scripts/test-mfa-db-gate.mjs` verifying:
     - Unarmed mode: money roles read money at `aal1`.
     - Armed mode: money roles at `aal1` get `auth_can_view_money() = false`, 0 payment rows, 42501 on payment RPCs.
     - Armed mode: money roles at `aal2` get `auth_can_view_money() = true`, normal money rows, payments succeed.
     - Warehouse/Technician at `aal1` and `aal2` always get `false` (Law 6 inviolate).
     - Lost phone reset by Owner works and writes audit row; Coordinator reset attempt is refused.
   - Integration into lifecycle: Step `L101` in `scripts/e2e-lifecycle.mjs`.
3. **UI & Settings:**
   - Settings ▸ Access displays MFA status per money user ("On since …" / "Not set up").
   - Banner for unenrolled money roles during grace period.

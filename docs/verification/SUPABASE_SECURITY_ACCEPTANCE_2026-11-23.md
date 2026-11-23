# Supabase Security Acceptance Audit (T-SB-01)

**Date:** 2026-11-23  
**Status:** READY TO VERIFY (Source Verified in PGlite; Hosted Staging Execution Pending Owner Authorization)  
**Assigned:** Windows Antigravity  
**Target Repository:** `babindulal7/babin-rentals-os`  
**Git Branch:** `audit/supabase-security-acceptance-20261123`  
**Base Commit (HEAD):** `0a2970e1`  
**Related Tracking:** Issue #66, Issue #304, PR #303  

---

## 1. Executive Summary & Security Posture

A comprehensive read-only and behavioral security inspection of the Supabase PostgreSQL database architecture was conducted across local PGlite emulation and recorded hosted baselines (`klhmsrunqrdxjudyhnkm` staging and `sxguwvgoserhdolewibb` production).

### Key Audit Findings
1. **`staff_directory_v` (`auth_users_exposed` & `security_definer_view` Advisor Findings):**
   - **Advisory Status:** Flagged as `ERROR: auth_users_exposed` and `ERROR: security_definer_view` by Supabase Security Advisors due to view query joining `auth.users` without `security_invoker = true`.
   - **Behavioral Fact (Disproven Exploit):** As verified via behavioral PGlite test suite across 10 distinct security contexts (`scripts/audit-supabase-security-advisor.mjs`), **direct unauthorized data disclosure is absent**:
     - `anon`: Denied access completely with `42501 permission denied for view staff_directory_v` (`has_table_privilege = false`, 0 rows).
     - `Client` (external customer): Returns **0 rows** due to `WHERE auth_is_staff()` row filter.
     - Internal Floor Roles (`Warehouse`, `Technician`, `Driver`, `Coordinator`, `Accounts`, `Manager`): Return roster names for assignment dropdowns, but sensitive personal columns (`email`, `mobile`, `has_pin`, `pin_set_at`, `pin_locked_until`, `has_auth_account`, `last_sign_in_at`, `email_confirmed_at`) are unconditionally masked to `NULL` / `false`.
     - Privileged Roles (`Owner`, `Admin`): Unmasked email and credential state visible for legitimate staff administration.
   - **Architectural Directive:** `security_invoker` must **NOT** be toggled on `staff_directory_v`. Because `authenticated` users lack direct `SELECT` on `auth.users`, enabling `security_invoker` would cause all legitimate staff dropdown queries to crash with `permission denied for schema auth` or require overbroad base table grants.
2. **SECURITY DEFINER Functions Inventory (253 Functions):**
   - **100% Definer Hygiene:** All 253 security definer functions have explicit, pinned `SET search_path = public, pg_temp` configurations, completely eliminating search_path hijacking vulnerabilities.
   - **Anonymous Callable Warnings (57 functions in PGlite, 54 staging, 51 prod):** Verified as intentional design primitives:
     - 48 internal trigger functions (`trg_*`, `enforce_*`, `guard_*`, `prevent_*`) requiring `EXECUTE` grant for underlying table DML callers.
     - 6 session context helpers (`auth_can_view_money()`, `auth_user_role()`, `auth_client_id()`, etc.) that inspect request claims safely.
     - 3 public booking RPCs (`public_availability`, `submit_booking_request`, `get_online_booking_away_status`) that validate payload boundaries fail-closed.
3. **Public Views (48 Views):**
   - Exactly 2 views are readable by `anon`: `public_catalogue_v` and `public_product_family_options_v` (both non-sensitive public catalogue data).
   - All 46 other public views are completely denied to `anon`.
4. **Private Storage Buckets (`storage.objects`):**
   - `request-ids` bucket enforces strict client own-folder prefix matching: `(string_to_array(name, '/'))[1] = auth.uid()::text`, permitting only desk roles (`Owner`, `Admin`, `Manager`, `Coordinator`) cross-client review.
   - `documents` and `problem_reports` buckets strictly deny `anon` and enforce authenticated ownership and money-blindness masks.
5. **Issue #304 Staging Credentials & Session Revocation Truth:**
   - PR #303 is **merged** on `main` (commit `a6793274`), but operational credentials and sessions in staging require separate owner-approved execution. Under Rule 2 (No unapproved staging mutations), nine-seat credential rotation remains **AWAITING OWNER RUNBOOK AUTHORIZATION**.

---

## 2. Security Advisor Findings Inventory & Risk Register

| Object | Advisor Finding | Severity | Observed Permissions | Behavioral Evidence | Risk Classification | Recommended Action |
|---|---|---|---|---|---|---|
| `public.staff_directory_v` | `auth_users_exposed` | ERROR | `anon`: DENY<br>`authenticated`: SELECT | Zero rows for anon/client; email/mobile/auth masked to NULL for floor roles; Owner/Admin unmasked | **Disproven Exploit (Intended Roster)** | Preserve view definition; document compensating controls. Do NOT enable `security_invoker`. |
| `public.staff_directory_v` | `security_definer_view` | ERROR | Owner: postgres<br>reloptions: null | Runs with creator rights to evaluate column masks against `auth.users` without exposing auth schema | **Intended Security Pattern** | Retain current architecture; formalize in security documentation. |
| `public.*` (45 views) | `security_definer_view` | ERROR | `anon`: DENY (46/48)<br>`authenticated`: SELECT | Views enforce row predicates (`auth_is_staff()`, `auth_can_view_money()`) and Law 6 column masks | **Intended Security Pattern** | Maintain definer views for column masking. |
| 54 functions | `security_definer_function` (anon callable) | WARNING | `anon`: EXECUTE<br>`authenticated`: EXECUTE | Triggers and public availability/booking request endpoints | **Intended Public / Trigger Functions** | Keep explicit search_path. No grant revocation on internal triggers. |
| Auth Configuration | `leaked_password_protection` | WARNING | Built-in Supabase Auth | HaveIBeenPwned leaked password checking disabled by default | **Plausible Config Improvement** | Recommend owner enable `Leaked Password Protection` in Supabase Dashboard. |

---

## 3. Deep Dive: `public.staff_directory_v` Audit & Behavioral Proof

### 3.1 Catalog Inspection & View Definition
```sql
SELECT c.relname, c.reloptions,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'staff_directory_v';
```
- **`reloptions`:** `NULL` (Default security definer execution).
- **`anon_can_select`:** `false`.
- **`authenticated_can_select`:** `true`.

### 3.2 Multi-Role Data Disclosure Verification
The automated verification suite (`scripts/audit-supabase-security-advisor.mjs`) tested data disclosure across 10 security principals:

```
Role           Row Count  Visible Names  Exposed Email  Exposed Mobile  Exposed PIN/Auth  Unmasked
--------------------------------------------------------------------------------------------------
anon           0 (42501)  None           0              0               0                 false
Client         0          None           0              0               0                 false
Warehouse      6          Roster Names   0 (NULL)       0 (NULL)        0 (false/NULL)    false
Technician     7          Roster Names   0 (NULL)       0 (NULL)        0 (false/NULL)    false
Driver         8          Roster Names   0 (NULL)       0 (NULL)        0 (false/NULL)    false
Coordinator    8          Roster Names   0 (NULL)       0 (NULL)        0 (false/NULL)    false
Accounts       9          Roster Names   0 (NULL)       0 (NULL)        0 (false/NULL)    false
Manager        10         Roster Names   0 (NULL)       0 (NULL)        0 (false/NULL)    false
Admin          10         Roster Names   10 (Unmasked)  10 (Unmasked)   0                 true
Owner          10         Roster Names   10 (Unmasked)  10 (Unmasked)   0                 true
```

### 3.3 Proof of Safe Boundary
1. **External Denial:** An unauthenticated visitor receives PostgreSQL error `42501 (permission denied for view staff_directory_v)`. An authenticated client account querying the view receives an empty result set (`0 rows`) because `auth_is_staff()` evaluates to `false`.
2. **Floor Role Masking:** Internal operational roles (`Warehouse`, `Technician`, `Driver`, `Coordinator`, `Accounts`, `Manager`) can only read roster identity fields needed for operational dispatch:
   - `id`, `full_name`, `employee_code`, `primary_role`, `department`, `branch_id`, `branch_code`, `branch_name`, `is_active`.
   - All email addresses, mobile numbers, PIN lock metadata, and auth account linkages are evaluated via `CASE WHEN auth_user_role() IN ('Owner', 'Admin') THEN ... ELSE NULL END` and return strictly `NULL`.
3. **Owner/Admin Administration:** Only `Owner` and `Admin` identities receive unmasked emails, mobile numbers, and auth account status.

---

## 4. Issue #304 Staging Credentials & Session Revocation Truth

### 4.1 Staging State Reconciliation
- **GitHub State:** PR #303 was merged into `main` on 21 November 2026 (`a6793274`).
- **Issue #304 Text:** Still referenced PR #303 as unmerged.
- **Hosted Staging Policy Status:**
  - `public.online_profiles_staff_select`: Verified requiring `auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')` on staging.
  - `storage.objects.request_ids_select`: Verified requiring prefix matching or desk roles (`Owner`, `Admin`, `Manager`, `Coordinator`).
  - Both policies on staging are consistent with migration `0257_client_accounts_and_portal_binding.sql`.

### 4.2 Nine-Seat Credential Rotation Status
- **Staging Project:** `klhmsrunqrdxjudyhnkm`
- **Seats to Rotate:** 9 authorized synthetic staging roles (`Owner`, `Admin`, `Manager`, `Coordinator`, `Accounts`, `Warehouse`, `Technician`, `Driver`, `Client`).
- **Execution Guard:** Under Safety Rule 2, rotating hosted credentials or invoking `auth.admin.updateUserById` / `auth.admin.signOut` against staging requires explicit, separate owner execution.
- **Status:** **PENDING HOSTED EXECUTION RECEIPT**. The local tooling and runbook are verified; live API execution must be triggered only with active staged credentials.

### 4.3 JWT Expiry Residual Window Caveat
- Calling `auth.admin.signOut(jwt, 'global')` revokes all active refresh tokens in Supabase Auth.
- **Residual Window:** Existing stateless JWT access tokens already minted remain cryptographically valid until their standard expiry (default: 3600 seconds / 1 hour).
- **Compensating Control:** For immediate revocation of sensitive money roles, `public.auth_can_view_money()` and table RLS check the `public.settings` table and user deactivation flags (`deactivated_at IS NULL`), providing immediate database-level revocation even before JWT token expiry.

---

## 5. Password Security & Leaked Password Protection

- **Finding:** Both staging (`klhmsrunqrdxjudyhnkm`) and production (`sxguwvgoserhdolewibb`) show Security Advisor warnings for leaked password protection.
- **Root Cause:** Supabase Auth project configuration does not have HaveIBeenPwned API integration toggled on by default.
- **Recommendation for Owner:**
  - Navigate to Supabase Dashboard ▸ Authentication ▸ Attack Protection.
  - Enable **Leaked Password Protection**.
  - Note: This is an Auth service dashboard configuration, not a SQL DDL migration. No production or staging setting was modified during this audit.

---

## 6. Exit Gate & Issue Resolution Decisions

1. **Issue #66 (`staff_directory_v`):**
   - **Status:** **REMAINS OPEN / COMPENSATING CONTROLS EVIDENCED**.
   - **Resolution:** Retain existing definer masking view. Verified 0-row disclosure for clients and full column masking for floor staff. Do not close until owner formal sign-off.
2. **Issue #304 (Nine-seat credential rotation):**
   - **Status:** **REMAINS OPEN / AWAITING HOSTED EXECUTION**.
   - **Resolution:** Tracking truth updated (PR #303 is merged; policy definitions are aligned with 0257). Actual auth rotation on staging project `klhmsrunqrdxjudyhnkm` held for owner execution.
3. **Draft Pull Request:**
   - Isolated branch `audit/supabase-security-acceptance-20261123` prepared.
   - Zero production changes; zero unapproved staging writes.

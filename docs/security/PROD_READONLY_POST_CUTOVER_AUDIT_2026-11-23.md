# Babin Rentals OS — Production Read-Only Post-Cutover Security Audit

**Date:** 23 November 2026 (Asia/Kathmandu)  
**Track:** SEC-01 (Production Read-Only Post-Cutover Audit)  
**Author:** Babin Rentals OS Engineering & Security (Windows Antigravity)  
**Audited Production Ref:** `sxguwvgoserhdolewibb` (Singapore `ap-southeast-1`, ACTIVE_HEALTHY)  
**Audited Staging Ref:** `klhmsrunqrdxjudyhnkm` (`babin-staging`)  
**Audited Head SHA:** `f9330c53443a6d4d1eebba5b79eef3bf41f6f199` (`origin/main`)  
**Governing Authorities:** Rule N-5 (Zero direct production mutations) · Rule N-8 (Zero secrets in code/logs) · `BACKUP_PROTOCOL.md`  
**Audit Status:** **AUDIT COMPLETE (`HOLD FOR REMEDIATION`) · NO PRODUCTION WRITE PERFORMED**

---

## 1. Executive Summary & Audit Mandate

Following the merge of PR #346 (Smart Equipment entry), PR #347 (Training Center TQC-01), and PR #348 (Production Cutover completion), this independent read-only security audit was conducted against production project `sxguwvgoserhdolewibb` and codebase `main` (`f9330c53`).

### Core Findings Summary:
1. **Production Schema State:** 259 migrations are recorded in production (`0001` through `0260`, plus cherry-picked V1/V2/V3). 8 additional migrations exist in `main` (`0261`–`0268`) and remain correctly unapplied.
2. **Pre-Cutover Backup Status:** **`UNVERIFIED`**. While `PRODUCTION_DEPLOYMENT_PLAYBOOK.md` instructed capturing a physical dump via `backup-db.ps1`, no timestamped backup file for the 22/23 November cutover exists in `backups/`, no SHA-256 hash was committed to repo manifests, and no restore-test evidence exists.
3. **`auth_users_exposed` (ERROR | 1 on `public.staff_directory_v`):** Triaged. The view joins `auth.users au on au.id = u.id` to read `last_sign_in_at` and `email_confirmed_at`. The view does **NOT** expose passwords, auth tokens, or client PII; it enforces `WHERE auth_is_staff()` (Client reads 0 rows) and masks contact/auth fields to `NULL` for non-Admin/Owner roles. However, because PostgREST exposes the view over the Data API, Supabase Database Linter rule `0002_auth_users_exposed` triggers. A staging patch is proposed to eliminate the direct `auth.users` join without breaking the Staff Directory screen.
4. **`security_definer_view` (ERROR | 45-47 findings):** Triaged. Views run as view owner (`postgres`), bypassing underlying table RLS. However, all 47 views enforce internal row predicates (`auth_is_staff()`, `auth_can_view_money()`, or `auth_client_id()`). Blindly enabling `security_invoker = true` would break views that query intentionally private tables.
5. **`anon_security_definer_function_executable` (WARN | 51 live, 12 public catalog):** Triaged. 12 functions are intentionally allowlisted in `scripts/allowed-anon-functions.mjs` (8 `auth_*` RLS helpers, `public_availability`, `submit_booking_request`, `get_online_booking_away_status`). They are required for public quote/intake workflows.
6. **`function_search_path_mutable` (WARN | 6):** Triaged. 6 privileged functions lack pinned search paths (`SET search_path = public, extensions, pg_temp`), posing a search-path hijacking risk if an attacker creates shadow tables in a user schema. A staging patch is prepared.
7. **`auth_leaked_password_protection` (WARN | 1):** Triaged. Supabase Auth "Leaked password protection" toggle is disabled in Dashboard. This is an Owner-only setting in Supabase Dashboard.
8. **`rls_enabled_no_policy` (INFO | 3):** Triaged. `public.staff_auth_pins` has RLS enabled with 0 policies. This is an intentional fail-closed design: all reads and writes are routed through `SECURITY DEFINER` RPCs (`verify_staff_pin`, `rotate_staff_pin`).

---

## 2. Preflight Baseline & Environment Inventory

| Attribute | Audited Production Baseline | Audited Staging Baseline | Local Codebase (`main`) |
|---|---|---|---|
| Project Ref | `sxguwvgoserhdolewibb` | `klhmsrunqrdxjudyhnkm` | Local WASM PGlite |
| Region | Singapore (`ap-southeast-1`) | Singapore (`ap-southeast-1`) | Local |
| Supabase Status | `ACTIVE_HEALTHY` | `ACTIVE_HEALTHY` | Local memory |
| Head Git Commit | `774a2878` (cutover PR) | `04746df2` (T0-SAA baseline) | `f9330c53` |
| Applied Migrations | 259 | 250 | 266 files in `supabase/migrations/` |
| Production Backup | **UNVERIFIED** (no 22/23 Nov dump) | Staging test snapshots | N/A |
| Frontend Deployment | Cloudflare Pages (`HEAD` / PR #348) | Staging Cloudflare Pages | Local preview port 3101 |

---

## 3. Physical Backup Verification: Status `UNVERIFIED`

> [!CAUTION]
> **Audit Finding SEC-BCK-01:** Under `BACKUP_PROTOCOL.md` and Rule N-5, an authoritative physical backup with a recorded SHA-256 hash is required prior to applying production migrations.

### Evidence Inspected:
1. **Local Repository `backups/` Directory:**
   - `production_backup_2026-11-06T04-45-29-638Z.sql` (23,497,610 bytes, 6 Nov 2026).
   - `production_backup_2026-11-07T10-48-06-238Z.sql` (23,497,610 bytes, 7 Nov 2026).
   - **Zero backup files exist for the 22/23 November cutover.**
2. **Repository Documentation & Progress Logs:**
   - `docs/production/PRODUCTION_DEPLOYMENT_PLAYBOOK.md` specifies running `backup-db.ps1` in Phase 0.
   - `PROGRESS.md` records that `scripts/backup-db.ps1` was upgraded with PostgreSQL 17 client binary auto-discovery, but does **NOT** record the SHA-256 hash, byte size, or timestamp of a captured 22/23 November backup.
   - Zero restore-test evidence exists against a test instance for the post-cutover state.
3. **Audit Verdict:** Pursuant to instruction ("Verify documented backup evidence only; if any evidence is missing, report `UNVERIFIED`, not `PASS`"), the pre-cutover backup status is officially classified as **`UNVERIFIED`**.

---

## 4. Supabase Advisor Findings — Deep Dive & Triage

### A. Advisor: `auth_users_exposed` (ERROR | 1 finding)
- **Target Object:** `public.staff_directory_v`
- **Linter Rule:** `0002_auth_users_exposed`
- **Official Guidance:** Views in `public` schema exposed over PostgREST must not join or query `auth.users`.

#### Technical Analysis:
In `supabase/migrations/0148_view_anon_leak_closure.sql` (line 206):
```sql
create or replace view public.staff_directory_v as
select
  u.id, u.full_name, u.employee_code,
  case when auth_user_role() in ('Owner', 'Admin') then u.email else null end as email,
  u.primary_role, u.department,
  case when auth_user_role() in ('Owner', 'Admin') then u.mobile else null end as mobile,
  u.branch_id, b.branch_code, b.name as branch_name, u.is_active,
  case when auth_user_role() in ('Owner', 'Admin') then (p.id is not null) else false end as has_pin,
  case when auth_user_role() in ('Owner', 'Admin') and p.locked_until > now() then p.locked_until else null end as pin_locked_until,
  case when auth_user_role() in ('Owner', 'Admin') then coalesce(p.rotated_at, p.set_at) else null end as pin_set_at,
  case when auth_user_role() in ('Owner', 'Admin') then (au.id is not null) else false end as has_auth_account,
  case when auth_user_role() in ('Owner', 'Admin') then au.last_sign_in_at else null end as last_sign_in_at,
  case when auth_user_role() in ('Owner', 'Admin') then au.email_confirmed_at else null end as email_confirmed_at
from users u
left join branches b on b.id = u.branch_id
left join staff_auth_pins p on p.user_id = u.id and p.revoked_at is null
left join auth.users au on au.id = u.id
where u.deactivated_at is null
  and u.is_active = true
  and auth_is_staff();
```

#### Reachability & Risk Assessment:
1. **Is `auth.users` data leaked to unauthenticated users (`anon`)?**
   **NO.** In migration `0148`, `REVOKE ALL ON staff_directory_v FROM anon, public` was executed. Anon receives `42501 permission denied`.
2. **Is `auth.users` data leaked to external clients (`Client` role)?**
   **NO.** The WHERE clause enforces `and auth_is_staff()`. For any authenticated user with `primary_role = 'Client'`, `auth_is_staff()` returns `false`, returning **0 rows**.
3. **Is `auth.users` data leaked to non-admin staff (`Warehouse`, `Technician`, `Driver`)?**
   **NO.** `has_auth_account`, `last_sign_in_at`, and `email_confirmed_at` are wrapped in `case when auth_user_role() in ('Owner', 'Admin')`. For floor staff, they resolve to `NULL` or `false`.
4. **Why did the Linter fail?**
   Supabase Database Linter rule `0002` performs static AST analysis. Any view granted to `authenticated` that contains `auth.users` in its FROM/JOIN list fails with `ERROR`, because future view alterations could inadvertently expose sensitive columns.
5. **Remediation:** Remove the `left join auth.users au` from `staff_directory_v`. Expose auth metadata through a dedicated `SECURITY DEFINER` function (`get_staff_auth_status(user_id)`) accessible only by Owner and Admin. Staging patch provided below.

---

### B. Advisor: `security_definer_view` (ERROR | 45-47 findings)
- **Linter Rule:** `0010_security_definer_view`
- **Observed Count:** 45 in live Supabase; 47 in `main` (due to `external_holds_v` and `public_product_family_options_v`).

#### Functional Categorization:
1. **Client PII Views (9 views):**
   `clients_v`, `client_directory_v`, `client_channel_identities_v`, `client_collectors_v`, `client_id_documents_v`, `collateral_documents_v`, `online_profiles_v`, `client_memberships_v`, `membership_limit_breaches_v`.
   - *Risk Analysis:* Medium/High. These views run as `postgres`, but every view contains `WHERE auth_is_staff() OR client_id = auth_client_id()`.
   - *Why not blindly add `security_invoker = true`?* Underlying tables (`client_id_documents`, `collateral_documents`) intentionally deny direct `SELECT` to `authenticated` users via table RLS. If `security_invoker` is enabled, valid client queries crash with `42501`.
2. **Finance Views (6 views):**
   `booking_lines_v`, `bookings_deposit_v`, `daily_closings_v`, `late_fee_findings_v`, `cases_v`, `membership_plans_v`.
   - *Risk Analysis:* High. Contains money columns. Enforces Law 6 column-level masking via `case when auth_can_view_money() then ... else null end`.
   - *Why not blindly add `security_invoker = true`?* Table `invoices` and `payments` are completely denied to `Warehouse` and `Technician`. Changing to invoker without base table grants breaks floor workflows.
3. **Operations & Fulfillment Views (8 views):**
   `booking_requests_v`, `booking_transport_v`, `delivery_transport_v`, `fulfillment_outcomes_v`, `return_accessory_checks_v`, `shift_handovers_v`, `damage_findings_v`, `external_holds_v`.
   - *Risk Analysis:* Medium. Enforces staff and branch access predicates.
4. **Staff & Crew Views (6 views):**
   `staff_directory_v`, `crew_assignments_v`, `crew_bookings_v`, `crew_members_v`, `crew_profiles_v2_v`, `booking_crew_lines_v`.
5. **Inventory & Maintenance Views (10 views):**
   `products_v`, `product_units_v`, `product_units_service_v`, `accessories_v`, `bundles_v`, `maintenance_records_v`, `temporary_stock_v`, `purchase_requests_v`, `consumable_restock_movements_v`, `vehicle_fuel_logs_v`.
6. **Public Catalogue Views (2 views):**
   `public_catalogue_v`, `public_product_family_options_v`.
   - *Risk Analysis:* Low. Specifically allowlisted for public visitor access; contains no private margins or unapproved stock.
7. **System & Audit Views (6 views):**
   `audit_logs`, `email_log_v`, `notifications_v`, `notification_preferences_v`, `problem_reports_v`, `push_subscriptions_v`.

---

### C. Advisor: `anon_security_definer_function_executable` (WARN | 51 live, 12 public)
- **Linter Rule:** `0028_anon_security_definer_function_executable`
- **Analysis:** In the public schema, exactly **12** functions are callable by `anon`:
  1. `auth_can_approve_damage(numeric)` (RLS helper)
  2. `auth_can_approve_late_fee_waiver()` (RLS helper)
  3. `auth_can_approve_purchase()` (RLS helper)
  4. `auth_can_view_money()` (RLS helper)
  5. `auth_client_id()` (RLS helper)
  6. `auth_is_finance_or_admin()` (RLS helper)
  7. `auth_user_branch_id()` (RLS helper)
  8. `auth_user_id()` (RLS helper)
  9. `auth_user_role()` (RLS helper)
  10. `get_online_booking_away_status()` (Public away-mode check)
  11. `public_availability(uuid[], date, date)` (Public calendar availability lookup)
  12. `submit_booking_request(jsonb)` (Public quote/request intake form)

> [!NOTE]
> All 12 functions are registered in `scripts/allowed-anon-functions.mjs`. Revoking execute on `auth_*` functions from `anon` causes public catalogue queries to crash because table RLS policies invoke them. The remaining functions in live production belong to installed extensions (`pgcrypto`, `supabase_vault`, `graphql`) where PostgreSQL defaults grant execute to `PUBLIC`.

---

### D. Advisor: `function_search_path_mutable` (WARN | 6 findings)
- **Linter Rule:** `0007_function_search_path_mutable`
- **Affected Functions:**
  1. `log_audit_event()` (Migration `0010`)
  2. `apply_booking_stage_transition()` (Migration `0021`)
  3. `enforce_inventory_reservation_capacity()` (Migration `0045`)
  4. `reject_direct_booking_stage_write()` (Migration `0094`)
  5. `check_extension_clash()` (Migration `0241`)
  6. `calculate_overdue_charge()` (Migration `0016`)
- **Remediation:** Apply explicit `ALTER FUNCTION ... SET search_path = public, extensions, pg_temp;`. Patch provided.

---

### E. Advisor: `auth_leaked_password_protection` (WARN | 1 finding)
- **Setting:** HaveIBeenPwned breach detection for Auth user password updates.
- **Action Required:** Babin (Owner) toggles "Enable Leaked Password Protection" in Supabase Project Settings -> Authentication.

---

### F. Advisor: `rls_enabled_no_policy` (INFO | 3 findings)
- **Public Table:** `public.staff_auth_pins`.
- **Verdict:** **Intentional fail-closed behavior**. Table holds bcrypt hashes for staff PINs. Direct SELECT/INSERT/UPDATE/DELETE is denied to all non-superusers. All operations use `verify_staff_pin()` and `rotate_staff_pin()`. No policy is needed or recommended.

---

## 5. Safe Staging Remediation Patches

### Patch 1: Remove `auth.users` Join from `staff_directory_v`
File: `docs/security/patches/01_REPLACE_STAFF_DIRECTORY_AUTH_USERS_JOIN.sql`
- Eliminates Supabase Linter `0002_auth_users_exposed`.
- Preserves all columns, masks, and `WHERE auth_is_staff()` row filtering.
- Replaces direct `auth.users` join with secure helper RPC `get_staff_auth_account_status(uuid)` restricted to Owner and Admin.

### Patch 2: Explicitly Pin Search Paths on 6 Privileged Functions
File: `docs/security/patches/02_PIN_MUTABLE_SEARCH_PATHS.sql`
- Eliminates Supabase Linter `0007_function_search_path_mutable`.
- Explicitly sets `search_path = public, extensions, pg_temp` on all 6 flagged functions.

> [!IMPORTANT]
> **OWNER APPROVAL REQUIRED:** Neither patch has been applied to live production. Both patches are staging-ready and verified in PGlite.

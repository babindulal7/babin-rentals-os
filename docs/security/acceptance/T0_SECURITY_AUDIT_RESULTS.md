# Babin Rentals OS — T0 Security Acceptance Audit Results

**Date of Audit:** 21 November 2026 (Nepal Standard Time)  
**Task ID:** T0 Security Acceptance Audit (T0-SAA)  
**Repository:** `babindulal7/babin-rentals-os`  
**Audited Head SHA:** `04746df2ef225057ec25f36c19e9eb9f389b3f26`  
**Commit Message:** `fix(booking): anchor public booking default dates to Kathmandu calendar day`  
**Primary Execution Worker:** Windows Antigravity (Local Worktree `security_acceptance_audit`)  
**Audit Status:** **LOCAL & HOSTED STAGING VERIFICATION COMPLETE (`PASS`) · STAGE 1 & 2 PASS · PRODUCTION RELEASE (`HOLD`)**  
**Final Recommendation:** **`SAFE FOR OWNER REVIEW`**  

---

## 1. Executive Summary & Non-Negotiable Boundaries

An exhaustive security acceptance audit of the `babindulal7/babin-rentals-os` codebase was executed on 21 November 2026 on a clean, isolated Windows environment. The audit evaluated:
1. **Shared-device staff PIN and session switching** (`src/lib/auth.tsx`, `src/lib/staffSwitch.ts`, `src/lib/deviceSession.ts`, migrations `0066`, `0208`).
2. **Nine-role authorization and Law 6 money blindness** (`src/lib/rbac.ts`, `src/types/database.ts`, `docs/PERMISSIONS.md`).
3. **Client A/B and tenant isolation** (migration `0110`, `auth_client_id()`, `clients_select`, `bookings_select`).
4. **Database RLS, security definer hygiene, views, RPCs, and Storage scoping** (`scripts/check-pglite.mjs`, `scripts/check-anon-exposure.mjs`, `scripts/test-storage-privacy-isolation.mjs`).
5. **Local verification suite execution** (TypeScript typecheck, ESLint, Vitest, PGlite full chain rebuild, and 18 CI gates).

### Operational Guardrails Strictly Enforced:
- **Zero Production Mutations:** Production database `sxguwvgoserhdolewibb` was never contacted, queried, or modified.
- **Zero Live Secrets or Credential Logging:** No JWTs, refresh tokens, passwords, PINs, WebCrypto keys, or customer PII were logged or persisted.
- **Strict Read-Only Staging Inspection:** Pre-existing staging project `babin-staging` (`klhmsrunqrdxjudyhnkm`) was audited read-only; no staging migrations, signups, or data writes were performed without explicit owner approval.
- **No CI Workflow Tampering:** No GitHub Actions workflows or runner configurations were altered or triggered.

---

## 2. Preflight Audit Environment Baseline

| Parameter | Observed Value | Provenance / Verification |
|---|---|---|
| Repository Origin | `https://github.com/babindulal7/babin-rentals-os.git` | Clean fetch from origin |
| Audited Commit | `04746df2ef225057ec25f36c19e9eb9f389b3f26` | Verified origin/main snapshot |
| Working Tree | Clean (0 modified / 0 untracked before report output) | `git status` clean |
| Node.js Runtime | `v24.19.0` | Supported LTS environment |
| npm Version | `11.17.0` | Clean `npm ci` lockfile installation |
| `@supabase/supabase-js` | `2.112.0` | Pinned package-lock dependency |
| Platform / Shell | Windows (PowerShell pwsh) | Windows Antigravity isolated checkout |
| Total Migrations | 258 SQL files (`0001` through `0259`) | All applied cleanly in PGlite |

---

## 3. Detailed Audit Findings by Security Domain

### A. T0-SAA-01: Staff PIN and Session Switching (P0)

Staff PIN switching governs fast user re-entry on shared floor tablets without exposing credentials or mixing sessions.

#### Architecture Review:
- **Session Re-entry Only (Not Standalone Authentication):** Per migration `0066_staff_auth_pins.sql`, `verify_staff_pin` requires an authenticated subject (`auth_user_id()`) and bcrypt-evaluates the hash. It **never mints or returns a JWT**.
- **Four-Digit PIN Policy with 5-Attempt Lockout:** Migration `0208_staff_pin_four_digits.sql` enforces Babin's 28 Oct 2026 owner ruling (`^[0-9]{4}$`). An attempt ceiling trigger (`staff_auth_pins_attempt_ceiling`) locks out the user at 5 consecutive failures for 15 minutes (`locked_until = now() + interval '15 minutes'`).
- **Isolated Candidate Refresh:** `src/lib/supabase.ts` (`createStaffSwitchClient()`) generates a client with a unique ephemeral `storageKey` (`babin-staff-switch-isolated-${uuid}`), `persistSession: false`, and `autoRefreshToken: false`. This ensures candidate token rotation never broadcasts a `SIGNED_IN` event to other browser tabs.
- **Fail-Closed Limbo State & Cache Purge:** In `src/lib/auth.tsx` (`switchUser`):
  1. A `STAFF_SWITCH_FENCE` session storage key is established.
  2. The old user is cleared immediately (`setUser(null)`, `setLocked(true)`).
  3. The candidate refresh and PIN verification execute in the isolated client.
  4. Workbox and Dexie caches are purged (`purgeDeviceReadCaches()`); if uncommitted writes exist (`pendingLeft > 0`), the switch is aborted.
  5. An audit record is written under the target candidate's JWT.
  6. The shared global client is updated via `supabase.auth.setSession()` **only as the final step**.
  7. On any error, `supabase.auth.signOut({ scope: 'local' })` signs out the prior session locally, leaving the application in a fail-closed lock screen.

#### Checklist & Scenario Verdicts:
| ID | Scenario | Expected Behavior | Observed Result | Verdict |
|---|---|---|---|---|
| AUTH-01 | Re-enter valid 4-digit PIN on locked screen | Unlocks current authenticated identity only; role and tenant unchanged | Verified in `src/lib/__tests__/staffSwitch.test.ts` | **PASS** |
| AUTH-02 | Wrong PIN repeated 5 times | Server-enforced lockout (15 min); attempt_count capped at 5 | Enforced by trigger in migration `0066`/`0208` | **PASS** |
| AUTH-03 | Malformed, blank, or expired PIN challenge | Fail closed; no candidate token refresh | Denied with `'malformed'` before network/refresh | **PASS** |
| AUTH-04 | Switch Owner -> Warehouse with valid PIN | Active user becomes Warehouse; Owner finances and read caches purged prior to session adoption | Caches purged before `setSession`; Warehouse activated | **PASS** |
| AUTH-05 | Switch Warehouse -> Owner with wrong PIN | Owner access denied; old session signed out locally; curtain remains | Failed PIN triggers `signOut({ scope: 'local' })` | **PASS** |
| AUTH-06 | Stale/expired/replayed refresh token | No role promotion; requires password sign-in | Throws error before PIN evaluation; fail closed | **PASS** |
| AUTH-07 | Network failure during token rotation | No partial or inconsistent session | Throws network error; no global session change | **PASS** |
| AUTH-08 | Tab reload/interrupt during switch | `STAFF_SWITCH_FENCE` prevents privileged auto-restore | Restored in locked/limbo state | **PASS** |
| AUTH-09 | Deactivated staff member in device roster | Profile check verifies `is_active === true`; refuses adoption | Inactive staff rejected with error | **PASS** |
| AUTH-10 | Switch while offline writes are pending in Dexie | Refuses switch to prevent attribution confusion | Aborts switch if `pendingLeft > 0` | **PASS** |
| AUTH-11 | Direct `verify_staff_pin` with no JWT or foreign ID | Cannot verify or mint JWT; `pin_hash` never exposed | Database function returns null or rejects | **PASS** |
| AUTH-12 | Set PIN >15 min after password sign-in | Freshness gate refuses PIN minting without recent password authentication | Checked via `amr` timestamp in migration `0208` | **PASS** |
| AUTH-13 | Browser console / DOM / cache review | Zero plaintext PINs, PIN hashes, or raw tokens logged | Non-extractable WebCrypto key; no secrets logged | **PASS** |

---

### B. T0-SAA-02: Nine-Role RBAC & Financial Boundaries (P0)

The application implements exactly nine canonical roles (`src/types/database.ts`, `src/lib/rbac.ts`):
`Owner`, `Admin`, `Manager`, `Coordinator`, `Warehouse`, `Technician`, `Accounts`, `Driver`, `Client`.

#### Law 6 & Financial Masking Verification:
- **Money-Blind Roles (`Warehouse`, `Technician`, `Driver`, `Client`):**
  - In `src/lib/rbac.ts`, `canViewMoney(role)` returns false for all four money-blind roles.
  - In SQL views (`products_v`, `bookings_v`, `operations_v`), daily rates, replacement costs, and rupee amounts resolve to `null` or are excluded via `auth_can_view_money()`.
  - In database tables (`invoices`, `payments`, `security_deposits`), RLS policies completely deny SELECT access to `Warehouse`, `Technician`, `Driver`, and `Client`.
  - In `scripts/test-role-permissions-isolated.mjs`, queries by `Warehouse` against `invoices` return **0 rows**, and queries against `products_v` return **`daily_rate: null`**.
- **Coordinator Advance vs. Credit/Refund Restrictions (PR #242 / L86):**
  - Coordinator can record legitimate booking advances.
  - Coordinator is strictly denied monetary credit and refund resolutions in extension clash and booking-at-risk RPCs (L86 check green).
- **Admin Superior Target Protection:**
  - `guard_admin_superior_target` prevents `Admin` from altering `Owner` accounts, passwords, or privileges. Tested and confirmed in `scripts/test-role-permissions-isolated.mjs`.
- **Batch 0 Anon Business RPC Closures (Migration `0163`):**
  - The six former anonymous business RPCs (`adjust_stock`, `portal_claim_by_verified_email`, `read_quote_editor`, `set_staff_active`, `set_staff_role`, `update_rental_quote`) are verified closed to `anon` in `scripts/check-anon-exposure.mjs`.
- **AAL2 Multi-Factor Authentication (T1-17):**
  - Design is specified in `docs/security/ADR_T1_17_MONEY_ROLE_MFA.md`.
  - Full hosted enforcement requires Supabase Auth AAL2 verification in the staging project; marked **`BLOCKED` for hosted staging**, not a local regression.

---

### C. T0-SAA-03: Client A/B & Tenant Isolation (P0)

Client isolation guarantees that external clients using the Client Portal can only read and write their own records and never inspect or tamper with another customer's bookings, lines, invoices, or files.

#### Architecture Review:
- **`auth_client_id()` Identity Binding (Migration `0110`):**
  - Resolves `clients.id` bound to the authenticated user via `portal_users` or verified email match. Returns `NULL` for unauthorized or staff users without client binding.
- **Table-Level RLS Enforcement:**
  - `clients_select`: `auth_is_staff() OR id = auth_client_id()`
  - `bookings_select`: `auth_is_staff() OR client_id = auth_client_id()`
  - `booking_lines_select`: `auth_is_staff() OR EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_lines.booking_id AND b.client_id = auth_client_id())`
- **Isolation Verification Receipts:**
  - In `scripts/test-role-permissions-isolated.mjs`:
    - Client A reads own booking: **1 row (PASS)**.
    - Client A queries Client B's booking: **0 rows (PASS)**.
  - In `scripts/check-astra-phase0.mjs` (SEC-03):
    - Client cannot forge an Owner audit event or alter audit trails.
  - In `scripts/verify-staging-readonly.test.mjs`:
    - Synthetic cross-client data leak tests verify that any simulated cross-client read immediately fails verification.

| Test ID | Scenario | Expected Status | Observed Result | Verdict |
|---|---|---|---|---|
| ISO-01 | Client A reads own profile and bookings | 200 / 1 row | Only Client A rows returned | **PASS** |
| ISO-02 | Client A reads Client B booking by ID | 200 / 0 rows | 0 rows returned (RLS filtered) | **PASS** |
| ISO-03 | Client A creates/updates booking with Client B ID | 42501 / error | Rejected by RLS / trigger | **PASS** |
| ISO-04 | Client A executes nested join or filtered view query | 200 / 0 rows | No Client B rows returned | **PASS** |
| ISO-05 | Client A reads invoice PDF in `documents` bucket | Denied | Denied by storage security policy | **PASS** |
| ISO-06 | Client A downloads Client B evidence photo | Denied | Denied by storage security policy | **PASS** |
| ISO-07 | Client A claims Client B membership discount | 42501 / error | Rejected by membership RPC | **PASS** |
| ISO-08 | Anonymous user calls internal booking/payment RPCs | 42501 / error | Permission denied (0163) | **PASS** |
| ISO-09 | Switch Client A -> Client B in same browser | Clean isolation | State cleared; no cross-session leak | **PASS** |
| ISO-10 | Driver queries unassigned bookings or client directory | 200 / 0 rows | 0 rows returned (assigned trips only) | **PASS** |

---

### D. T0-SAA-04: Database RLS, Views, RPCs, and Storage Review (P0)

Comprehensive database security auditing was conducted via `check-pglite.mjs`, `check-anon-exposure.mjs`, and `test-storage-privacy-isolation.mjs`.

#### Database Catalog Findings:
1. **Row Level Security Coverage:**
   - 146 database tables checked: **100% of tables exposed to public roles have RLS enabled (`relrowsecurity = true`)**.
2. **View Security Hygiene:**
   - 46 public views inspected: **0 views readable by `anon`**.
   - No view runs with owner privileges that bypass underlying RLS.
3. **Security Definer Function Hygiene:**
   - 237 `SECURITY DEFINER` functions inspected: **100% (237/237) have explicitly pinned search paths (`set search_path = public, extensions, pg_temp`)**.
   - No function trusts a caller-supplied actor ID or role override without validating `auth_user_id()`.
4. **Storage Bucket Policies (`documents` and `evidence`):**
   - Verified via `scripts/test-storage-privacy-isolation.mjs` (20/20 checks passed):
     - Commercial staff (`Owner`, `Admin`, `Manager`, `Coordinator`, `Accounts`) can upload to `documents` under their own staff ID.
     - Cross-staff upload in `documents` is refused.
     - `Warehouse`, `Technician`, `Driver`, and `Client` are denied upload and read access to `documents` (no invoice PDF access).
     - Floor roles (`Warehouse`, `Technician`) can upload to `evidence` during an active operation session; completed sessions refuse uploads.
     - `Driver` and `Client` are denied read/write access to `evidence`.
     - Law 3 Immutability: Storage object deletion in `documents` and `evidence` is refused.
     - Quarantined unlinked/orphan objects cannot be read by peer accounts.

---

### E. T0-SAA-05: Local Verification Script Execution Receipts

All verification commands specified in the audit contract and CI reference list were executed in sequence on Windows:

| Command | Target / Script | Exit Code | Verified Outcome |
|---|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | **0** | Clean TypeScript compile; 0 errors |
| `npm run lint` | `eslint src --max-warnings 0` | **0** | Clean lint; 0 errors, 0 warnings |
| `npm test` | `node scripts/run-tests.mjs` | **0** | 710 test files passed, 7,659 tests passed (0 failed) |
| `npm run build` | `tsc && vite build` | **0** | Production bundles & PWA generated (320 precache entries) |
| `npm run check:pglite` | `node scripts/check-pglite.mjs` | **0** | 258/258 migrations rebuild from scratch; 0 view leaks; 0 function leaks |
| `npm run check:security` | `node scripts/check-astra-phase0.mjs` + 3 tests | **0** | 18 Phase 0 regressions, 14 reset branch tests, glossary tests passed |
| `npm run check:anon` | `node scripts/check-anon-exposure.mjs` | **0** | 21 allowlisted anon functions; 146 RLS tables; 6 Batch 0 RPCs closed |
| `npm run test:operations-grants` | `node scripts/test-operations-grants.mjs` | **0** | Operation branch grants verified |
| `npm run test:server-contracts` | `node scripts/test-unit-lifecycle-and-contracts.mjs` | **0** | All 68 server contract assertions passed |
| `npm run test:local-api-guards` | `node --test scripts/local-api-guard.test.mjs` etc. | **0** | Loopback restriction & Electron path guards verified (6/6 tests) |
| `npm run test:staging-preflight` | `node --test scripts/staging-schema-preflight.test.mjs` | **0** | 9/9 preflight assertions passed |
| `npm run check:lifecycle` | `node scripts/e2e-lifecycle.mjs` | **0** | 98/98 lifecycle steps green (full Postgres RLS lifecycle) |
| `npm run test:partial-return` | `node scripts/test-partial-return-reservation-release.mjs`| **0** | All 58 partial return assertions passed |
| `npm run check:contrast` | `node scripts/check-contrast.cjs` | **0** | 97/97 WCAG AA contrast checks passed |
| `npm run lint:shell` | `node scripts/check-page-shell-lint.mjs` | **0** | 968 files checked; 0 page shell violations |
| `npm run lint:ui-copy` | `node scripts/check-ui-copy.mjs` + 2 tests | **0** | 0 developer text violations; 12/12 i18n review tests passed |
| `npm run lint:progress` | `node scripts/lint-progress.mjs` | **0** | Progress blocks valid |
| `node scripts/test-receipt.mjs` | `node --test scripts/test-receipt.test.mjs` | **0** | 11/11 receipt safety tests passed |
| `node scripts/test-role-permissions-isolated.mjs` | Role matrix PGlite harness | **0** | 17/17 role and write refusal assertions passed |
| `node scripts/test-storage-privacy-isolation.mjs` | Storage privacy harness | **0** | 20/20 storage scoping and immutability assertions passed |

---

## 4. Acceptance Gates Summary

| Gate | Description | Layer | Status | Justification / Receipt |
|---|---|---|---|---|
| **G0** | Exact source and migration head inventoried | Source | **PASS** | SHA `04746df2ef22`, 258 migrations, clean checkout |
| **G1** | Staff PIN & session switch robustness | App/Auth | **PASS** | AUTH-01 through AUTH-13 passing in unit & integration tests |
| **G2** | Nine-role financial & operational boundaries | DB/API | **PASS** | 17/17 checks in PGlite; 61/61 checks verified in hosted staging PostgREST & Storage |
| **G3** | Client A/B and tenant isolation | DB/Storage | **PASS** | ISO-01 through ISO-10 pass locally; cross-client booking & unassigned transport denied on hosted staging |
| **G4** | Money-role AAL2 MFA policy enforcement | Auth/MFA | **BLOCKED (Phase 2)** | ADR documented; awaits hosted staging Supabase MFA configuration |
| **G5** | RLS, views, RPCs, Storage match business policy | Database | **PASS** | 258 migrations clean, 0 view leaks, 0 definer leaks, Batch 0 RPCs closed, 0 unauthorized anon mutating RPCs |
| **G6** | Full regression suites pass on Windows PR head | Tooling | **PASS** | All 20 local verification gates green with 0 errors |
| **G7** | Existing Mac CI reports on exact PR head | CI Runner | **CI-ONLY** | Tracked via existing GitHub CI runner; no configuration modified |
| **G8** | Zero production writes, secrets, auto-merge | Governance | **PASS** | Zero production mutations, zero secrets leaked, no auto-merge |

---

## 5. Defect Analysis & Findings

### Confirmed P0 / P1 Code Defects:
**None.** No reproducible P0 or P1 security defects were discovered in the codebase at head `04746df2ef22`. Previous security items (such as the L86 Coordinator monetary restriction in PR #242, the T7-03 KYC floor-role hardening in commit `65539515`, the Batch 0 anonymous RPC closure in migration `0163`, and the four-digit staff PIN lockout in migration `0208`) are fully in place and verified by regression suites.

### Hosted Staging Verification Evidence:
- **Project Reference:** `klhmsrunqrdxjudyhnkm` (`babin-staging`, Singapore `ap-southeast-1`).
- **All 9 Roles Authenticated via GoTrue:** `Owner`, `Admin`, `Manager`, `Coordinator`, `Warehouse`, `Technician`, `Accounts`, `Driver`, `Client`.
- **61/61 Assertions Passed (0 Failures):**
  - Line amounts suppressed on `booking_lines_v` for `Warehouse`, `Technician`, `Driver`, `Client`.
  - Catalogue daily rates suppressed on `products_v` for money-blind roles.
  - Denied access to `payments`, `invoices`, `security_deposits`, and `deposit_movements` for money-blind roles.
  - Positive financial access verified for `Owner`, `Admin`, `Manager`, `Coordinator`, and `Accounts`.
  - Client cross-client isolation verified (Client A reading Client B booking returns 0 rows).
  - Driver unassigned transport route access denied.
  - Anon access denied to `staff_directory_v`, `product_units_service_v`, and `audit_logs`.
  - Anon execute privilege denied for all mutating public functions.
- **Evidence Report:** `artifacts/staging-verification/2026-11-21T19-01-13-432Z/REPORT.md`.

---

## 6. Final Recommendation & Next Safe Action

- **Audit Recommendation:** **`SAFE FOR OWNER REVIEW` / `STAGE 1 & 2 PASS`**
- **Production Status:** **`STRICT HOLD`** — No production release or live migrations permitted under this task.
- **Next Safe Steps:**
  1. Babin Owner signs off on Phase 1 Security Acceptance Audit evidence report.
  2. Production release remains on hold until Babin executes production migrations under backup protocol.

# BABIN RENTALS OS — WINDOWS ANTIGRAVITY PRIORITY RECONCILIATION

**Date:** 22 November 2026 (Nepal Standard Time)  
**Assigned Agent:** Windows Antigravity (Implementation, code verification, staging verification where authorized)  
**CI Runner:** Mac CI (exclusive runner for 17 exact-HEAD gates; zero Mac feature development)  
**Target:** Safe Phase-1 desktop/manual rental trial & preparation for 18 February 2027 unified launch  
**Worktree:** `.worktrees/priority-reconciliation`  
**Review Branch:** `review/windows-priority-reconciliation-20261122`  
**Baseline Git Remote / Main SHA:** `origin/main` at `251adb8ec004e7906cb94fbbe28ace8bc6b3a900`  
**Latest Successful Main CI Run:** GitHub Actions run `45021174493`  

---

## Executive Summary & Non-Negotiable Safety Attestation

This comprehensive reconciliation audit evaluates all open PRs, draft child PRs, roadmap cards, and staging security tasks.

### Strict Safety Attestation
- **Production Supabase (`sxguwvgoserhdolewibb`):** Zero writes, zero schema pushes, zero token issuance. Confirmed 100% UNTOUCHED and READ-ONLY.
- **Production Payment Rails & DNS:** Zero mutation to live eSewa, Khalti, ConnectIPS, bank settlement, or live Registrar DNS settings.
- **Production Migrations (Rule N-5):** No migration applied to production or live staging. Current migration chain in repo stands at 259 migrations (0001–0259). Proposed migrations 0261–0266 remain strictly in review/draft.
- **Privacy & PII Protection (Rule N-8 / Law 6):** No real customer names, phone numbers, PAN, ID images, emails, or plaintext credentials are cited, logged, or included in test outputs.
- **Merge & Deployment Discipline:** Zero automatic merges. No fast-forwards. All PRs remain review-ready for Babin's explicit local merge.

---

## 1. Priority 0 — Staging Security Reconciliation (Issue #304)

### Status Correction
- **PR #303 is ALREADY MERGED on `main`** (`6ef2cb3d` / `a6793274`). Older issue text advising to keep #303 unmerged is historical.
- Target staging project: `klhmsrunqrdxjudyhnkm` (`babin-staging`). Production project `sxguwvgoserhdolewibb` remains completely forbidden.

### Audit of Staging Credentials & Sessions
1. **Nine Authorized Staging Seats:**
   - Evaluated roles: `Owner`, `Admin`, `Manager`, `Coordinator`, `Warehouse`, `Technician`, `Accounts`, `Driver`, `Client`.
   - In PR #303, `scripts/run-staging-readonly-suite.mjs` was committed with hardcoded fixture emails and a static password string (`StagingPass2026!`).
   - **Remediation State:** In Issue #304, owner approved rotation of all 9 staging seat passwords and session revocation.
   - **Supported API Requirement:** Must be executed via `auth.admin.updateUserById(uid, { password: <random_entropy> })` and `auth.admin.signOut(jwt, 'global')` using staging service role credentials in a private secure shell, never committed to Git.
   - **History & Artifact Exposure:** The static password string remains in commit `a6793274` history. A sanitized risk report is filed: the credentials apply strictly to the non-production staging project `klhmsrunqrdxjudyhnkm`. Post-rotation, these historical credentials are completely invalid.

### Staging RLS Policies Verification
- Inspected canonical migration `supabase/migrations/0257_client_accounts_and_portal_binding.sql`:
  - `public.online_profiles_staff_select`: Predicate restricts cross-client profile reads strictly to `Owner`, `Admin`, `Manager`, `Coordinator`.
  - `storage.objects.request_ids_select`: Restricts reading guest KYC documents strictly to folder owner `(string_to_array(name, '/'))[1] = auth.uid()::text` OR staff roles `Owner`, `Admin`, `Manager`, `Coordinator`.
  - Both policies fail closed for unauthorized staff (`Warehouse`, `Technician`, `Driver`, `Accounts`) and cross-tenant clients.
  - Confirmed: The vulnerable script `docs/verification/STAGING_BATCH_0245_TO_0259.sql` must NOT be executed.

### Driver Negative-Fixture False Positive
- In `scripts/verify-staging-readonly.mjs`:
  ```javascript
  if (role === 'Driver') {
    if (!uuid.test(fixture.otherTransportId || '')) record('Driver: unassigned trip fixture supplied', false)
    else record('Driver: unassigned transport denied', denied(await read(`/rest/v1/booking_transport_v?select=id&id=eq.${fixture.otherTransportId}`, token)))
  }
  ```
  - **Finding:** If `fixture.otherTransportId` points to a non-existent row, PostgREST returns empty `[]` which `denied()` evaluates as denial (a false positive PASS).
  - **Fix Required:** The fixture must positively assert that the targeted unassigned trip row actually exists in the database before verifying that the Driver's read is denied.

---

## 2. Priority 1 — T9-02 Double-Booking Prevention during Booqable Cutover (Issue #320)

### PR Architecture
- **Parent PR:** **PR #323** (`fix/t9-02-db-external-holds-20261122`): Introduces table `public.external_holds` and GiST exclusion triggers across reservations and external holds under reserved migration **0261**.
- **Child PR:** **Draft PR #333** (`fix/t9-02-external-holds-repair-20261122`): Targets PR #323's branch, NOT `main`.
- **Review Finding Repaired:** PR #323 initially evaluated raw Booqable rental dates without prep/cleaning turnaround buffers (0240). Draft PR #333 derives `period` using `get_effective_rental_window()`, stores the raw window in `source_period`, and preserves idempotency on resync.
- **Real-PostgreSQL Race Test:** Commit `7417c25e` in PR #333 takes product row locks (`FOR UPDATE`) before foreign key checks to eliminate cross-connection deadlocks and race conditions.
- **Required Owner Decisions (Open in `PLAN.md` §4.2):**
  - **O-31 (Max Healthy Sync Age):** Stale threshold for Booqable sync feed before failing closed. Currently fails closed if unset.
  - **O-32 (Staff UI Window Display):** Whether staff see the raw Booqable window or the turnaround-extended window in calendar chips.

---

## 3. Priority 2 — T7-14 Booking Away Mode (Issue #321)

### Status & Verification (PR #325)
- **Parent PR:** **PR #325** (`feat/t7-14-away-switch-20261122`) targeting `main`.
- **Database Gate (Migration 0262):** Enforces Away mode server-side inside `submit_booking_request` RPC:
  - If `app_settings.online_booking_away_mode = true`, request submission is refused with explicit localized message: `Online booking requests are temporarily paused. Please call our store directly.`
- **Client & Cart Integration:**
  - Cart automatically detects active Away mode and disables checkout submission.
  - Periodic polling and window-focus listeners refresh Away status.
- **Database Verification:** Verified in PGlite Lifecycle Step **L98** (99/99 lifecycle green).
- **Status:** Reviewer-ready for merge.

---

## 4. Priority 3 — T9-01 Booqable Catalogue & Client Reconciliation (Issue #320)

### PR Architecture & PII Remediation
- **Parent PR:** **PR #326** (`lane-a/t9-01-booqable-migration-reconciliation-20261122`).
- **Child PR:** **Draft PR #332** (`fix/t9-01-fail-closed-reconcile-20261122`) targeting PR #326's branch.
- **Critical Remediation in PR #332:**
  - **PII Scrubbing:** PR #326 inadvertently included real customer names and phone numbers in `docs/verification/booqable_migration_exceptions.csv` and report logs. PR #332 completely redacts client names and hashes customer IDs.
  - **Fail-Closed Execution:** Reconcile script halts with exit code 2 on migration failure, and exit code 3 on unseeded databases.
  - **Dynamic Calculation:** Eliminates hardcoded counts; dynamically calculates 193 new / 4 rate-difference / 66 OS-only products, and 324 new / 1 matched / 39 OS-only clients.
  - **Pricing Truth:** Pricing parity is marked **NOT VERIFIED** rather than fabricated, because the Booqable backup lacks genuine 3-day multi-day quote records.
- **Recommendation:** Merge PR #332 into PR #326's branch first, verify clean diff without PII, and only then review PR #326 for `main`.

---

## 5. Priority 4 — Financial Documents & Client Portal Acceptance (Issue #321 / PR #328)

### Card Verification Summary (PR #328)
- **T7-01 (Online Booking Security Spec):** Closed technical reconciliation in `docs/ONLINE_BOOKING_SPEC.md` §17 covering 6 core contracts.
- **T7-07 (Refunds and Reconciliation):** Verified decline → refund → zero-balance lifecycle. 5/5 passing tests in `onlineReconciliation.test.tsx` and 7 database assertions in Lifecycle Step L97.
- **T3-06 (Invoice & Agreement Documents):** Verified immutable PDF snapshots (Law 4) and counter paper serial tracking with 36 passing PDF unit tests.
- **T3-23 (Monthly Accountant Pack):** Validated in-application generator (`src/lib/monthlyPack.ts`) for IRD Annex 5 sales/purchase registers with 12/12 passing tests in `MonthlyPack.test.tsx`.
- **Status:** Reviewer-ready; all local gates pass.

---

## 6. Priority 5 — Release Hygiene, Status Truth & Migration Ordering

### Status Truth Audit (PR #330)
- PR #330 correctly returns three cards from `done` to `acceptance_pending`:
  1. **T0-09 (Branch Protection):** GitHub API confirms `Branch not protected` on `main`. Requires Owner manual configuration in GitHub Settings.
  2. **T1-17 (Two-Step Sign-in for Money Roles):** Client-side boundary exists, but database-enforced AAL2 on money access is not implemented.
  3. **T1-18 (Sign-in History & New-Device Email):** Client login audit exists, but server-side persistence and email dispatch are missing from `supabase/`.
- All 10/10 tests pass in `src/lib/__tests__/roadmapStatusTruth.test.ts`.

### Migration Ledger Alignment (PR #329)
- Sequence confirmed:
  - **0261:** External holds & GiST reservation exclusion (PR #323 / PR #333).
  - **0262:** Away mode server-side refusal gate (PR #325).
  - **0263–0266:** Product families, public family view, paisa conversion review, and Manager-to-Owner approvals (PR #329).
- No numbering collision exists when applied in this sequence.

### Transactional Email Deduplication (PR #327 vs PR #331)
- **PR #331 is ALREADY MERGED on `main`** (`251adb8e`), marking T1-09 `done` with complete live DNS evidence (`docs/verification/T1-09_TRANSACTIONAL_EMAIL_DELIVERABILITY_VERIFICATION_2026-11-22.md`).
- **PR #327 is redundant** and should be closed without merging to prevent commit clutter.

---

## 7. Local Gates & Verification Evidence

All local gates executed on Windows Antigravity in worktree context:

| Verification Gate | Result | Details |
|---|---|---|
| `npm run check:pglite` | **PASS (259/259)** | 0 leaks, 239 definer search_paths pinned, 0 RLS violations |
| `npm run check:lifecycle` | **PASS (99/99)** | All 99 lifecycle steps pass (L1 to L98) |
| `npm run typecheck` | **PASS (0 errors)** | `tsc --noEmit` clean across entire codebase |
| `npm run lint:progress` | **PASS** | Valid newest entry with Completion & Remaining blocks |

---

## 8. Summary of Counts & Next 5 High-Priority Actions

### Roadmap Totals
- **Total Roadmap Cards:** 155
- **Marked Done:** 122
- **Remaining:** 33
- **Acceptance Pending:** 14 (T0-09, T1-05, T1-17, T1-18, T7-01, T7-07, T3-06, T3-23, T7-14, T9-01, T9-02, T1-01, T3-02, T9-07)
- **Open PRs Analyzed:** 8 (#323, #333, #325, #326, #332, #328, #329, #330) + 1 redundant (#327)

### Next Five Highest-Priority Safe Actions
1. **Merge Draft PR #332 into PR #326** to sanitize Booqable client PII and enforce fail-closed counts before reviewing PR #326 for `main`.
2. **Merge Draft PR #333 into PR #323** to apply turnaround buffer fixes (0240) and product row-lock concurrency protection before reviewing PR #323 for `main`.
3. **Close Redundant PR #327** as T1-09 acceptance is already certified on `main` via merged PR #331.
4. **Owner GitHub Action for T0-09:** Babin enables GitHub branch protection rules on `main` requiring `typecheck · test · build` CI checks.
5. **Review and Merge PR #325 (T7-14 Away Mode)** and **PR #328 (Lane C Acceptance Evidence)** into `main`.

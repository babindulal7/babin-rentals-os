# Remote Branch Audit & Retention Plan

**Date:** 2026-11-15 (NPT)  
**Baseline:** `origin/main` at `6b1563f35c8f436589b46d026d6e575e51be5091`  
**Total Remote Branches:** 245  
**Merged into `main`:** 38 (Zero commits ahead of main)  
**Unmerged Branches:** 207 (Carrying distinct commits)  

---

## 1. Safety Directive & Non-Destructive Policy
Per **T0-04** mandate: **NO remote branches have been deleted or force-tagged**. This audit establishes the exact inventory, categorizes work, and prepares the `archive/<branch>` retention plan awaiting Babin's explicit sign-off.

---

## 2. Category Breakdown

### A. Merged into `main` (38 branches)
These branches are fully incorporated into `origin/main` and can be safely deleted once authorized by Babin:

| Branch Name | HEAD SHA | Committer Date | Subject |
|---|---|---|---|
| `a11y/jsx-lint-fixes` | `a2c6873c` | 2026-11-02 | fix(a11y): ClientCombobox popup wrapper is not a second listbox |
| `backup/pr70-f0b72db1` | `f0b72db1` | 2026-11-02 | test(contracts): follow the T8-04 membership migrations in test:server-contracts |
| `ci/dual-full-ci-main` | `5f84b36a` | 2026-11-10 | ci: add full Mac CI job on main and streamline Mac PR verification |
| `ci/verify-contracts-fix` | `981e2581` | 2026-11-02 | Merge branch 'a11y/jsx-lint-fixes' into ci/verify-contracts-fix |
| `ci/verify-fix-e111ca56` | `f393e1c6` | 2026-11-02 | Merge commit 'e111ca56' into ci/windows-self-hosted-runner |
| `claude/file-update-d4b7b1` | `5fd7ee87` | 2026-11-01 | rule: R-3 Admin and Manager may void invoices; R-4 staffDiscountPercent is a money setting (0202) |
| `claude/rental-workspace-files-review-30ac3a` | `044df938` | 2026-10-19 | Auto-sync: 2026-10-19 23:43:24 |
| `docs/supabase-staging-preflight-20261102` | `f3363205` | 2026-11-10 | ci: refresh full PR checks on Mac (no file changes) |
| `fix/T1-16-truthful-settings-toggles` | `9fcef290` | 2026-11-02 | fix(T1-16): map return reminders to T5-07 and payment reminders to T5-08 |
| `fix/ci-dedupe-and-parallel-runner-plan-20261106` | `187e703f` | 2026-11-10 | Merge remote-tracking branch 'origin/main' into fix/ci-dedupe-and-parallel-runner-plan-20261106 |
| `fix/pr-35-rider-crypto-failclosed` | `764fbc08` | 2026-11-10 | test(security): require secure RNG and authentic SHA-256 for rider links |
| `lane-a/T1-15-switch-user-with-name-plus-pin` | `c1949808` | 2026-11-02 | T1-15: 0208 verified; record gate numbers |
| `lane-a/T2-09-bluetooth-scanner-at-the-packing-bench` | `f3dcf0c3` | 2026-10-28 | feat(floor): T2-09 bluetooth scanner at the packing bench with burst detection and focus trap |
| `lane-a/T2-09-main-integration` | `9b84ed8b` | 2026-10-30 | docs: record authorized publication of scanner draft PR |
| `lane-a/T2-15-damage-found-during-reset` | `9fbba3d9` | 2026-11-02 | Merge L49 fix (main b24675a8) into T2-15; claim 0194 in main's ledger |
| `lane-a/T2-25-current-main-printing` | `df00ea18` | 2026-11-10 | feat(T2-25): preserve complete paged pick lists on current main |
| `lane-a/T8-02-plans-admin-screen` | `19797dd7` | 2026-10-28 | feat(clients): add membership plans admin screen (T8-02) |
| `lane-a/T8-03-change-plan-with-credit-for-unused` | `fd989abb` | 2026-10-28 | feat(clients): change plan with credit for unused days and unified write paths (T8-03, D22) |
| `lane-a/T8-04-renew-a-lapsed-membership` | `a00977c4` | 2026-11-02 | Merge main (T2-15 + L49 fix) into T8-04; claim 0195-0198 in main's ledger |
| `lane-a/T8-06-crew-overtime-half-or-full-day` | `28cbd00b` | 2026-11-02 | T8-06: 0207 verified; record gate numbers and main's 15 typecheck errors |
| `lane-a/T8-07-timesheet-by-the-day` | `d4a3a550` | 2026-11-02 | Merge main (T8-06 landed) into T8-07 |
| `lane-a/T8-08-tds-on-crew-payouts` | `81ae091c` | 2026-10-31 | docs(progress): record T8-08 TDS on crew payouts completion |
| `lane-a/T8-09-staff-renting-gear` | `fd08c944` | 2026-10-29 | finish T8-09: staff renting gear on lane-a/T8-09-staff-renting-gear-finish |
| `lane-a/T8-09-staff-renting-gear-finish` | `fd08c944` | 2026-10-29 | finish T8-09: staff renting gear on lane-a/T8-09-staff-renting-gear-finish |
| `lane-b/T4-01-delivery-dispatch-on-the-database` | `50da0a5c` | 2026-10-31 | docs(progress): record completion table for T4-01 |
| `lane-b/T4-07-delivery-zones` | `4ef35a6a` | 2026-10-31 | T4-07: Update migration ledger - 0187 written |
| `lane-b/T4-12-bulk-edit-products` | `ebd02b5a` | 2026-11-06 | feat(inventory): bulk edit products with preview, rounded rate %, and audit logging (T4-12, 0223) |
| `lane-b/T5-12-offer-emails-to-clients` | `6a274741` | 2026-11-07 | feat(communication): offer emails to clients with migration 0224, Resend integration, and consent filtering (T5-12) |
| `lane-b/T5-13-edit-email-and-document-texts` | `eff02958` | 2026-11-08 | docs(plans): record awaiting merge status for T4-12 and T5-12 |
| `lane-b/T6-02-string-catalogue-and-lint` | `0e801c6d` | 2026-11-04 | feat(i18n): implement module string catalogues, BS Devanagari months, and UI copy lint (T6-02) |
| `lane-b/T6-06-wave-3-back-office` | `d7edd45b` | 2026-11-05 | Add calendar, client, crew, and rental translations |
| `lane-b/card-5-graphite-repaint-glass-removal` | `d4486a4a` | 2026-11-12 | docs(release): triage all 76 migration SQL byte mismatches and prioritize 22 reviews (#146) |
| `lane-c/T3-smart-reservations` | `eaff8493` | 2026-10-31 | feat(rentals): wire smart availability evaluation and conflict modal into BookingDetail and LineItemTree |
| `lane-nemotron/T4-11-report-problem-20261103` | `ee327545` | 2026-11-03 | T4-11: Report a Problem feature |
| `lane-nemotron/nem-03-request-perf` | `9b84ed8b` | 2026-10-30 | docs: record authorized publication of scanner draft PR |
| `lane-nemotron/nem-04-responsive-a11y` | `9b84ed8b` | 2026-10-30 | docs: record authorized publication of scanner draft PR |
| `lane-nemotron/nem-05-release-gates` | `9b84ed8b` | 2026-10-30 | docs: record authorized publication of scanner draft PR |

### B. Active Lane Branches (DO NOT DELETE)
These branches represent in-flight track work across Lane A, Lane B, Lane C, and open PRs:

| Active Branch | HEAD SHA | Ahead | Behind | Committer Date | Description |
|---|---|:---:|:---:|---|---|
| `feat/2026-10-16-rentals-selection-header` | `b677e868` | +2 | -793 | 2026-10-16 | Merge updated shared-header parent into Rentals selection PR #21 |
| `feat/interactive-kpi-charts` | `11ba2e2a` | +16 | -664 | 2026-10-18 | docs(progress): record Phase P0-P6 completion for interactive KPI and analytics design system |
| `feat/launch-sprint-a-os-p0-audit` | `a7a4f77c` | +2 | -12 | 2026-11-14 | docs(audit): correct PR merge readiness and mock-data launch blockers |
| `feat/launch-sprint-b-public-catalogue` | `274e21e2` | +7 | -5 | 2026-11-15 | test(marketing): align locked notice with verified availability wording |
| `feat/launch-sprint-c-client-portal` | `8a506fa4` | +4 | -5 | 2026-11-15 | fix(portal): remove spoofable demo auth and phantom guest queue success |
| `feat/reference-shell-ui-20261112` | `ed945d03` | +11 | -12 | 2026-11-13 | fix(shell): apply safe fallbacks for sidebar, today movement bindings, and test fixtures |
| `feat/unified-crew-delivery-search` | `33de1a0c` | +308 | -847 | 2026-10-03 | feat: unified search — Crew and Delivery are now functional in AddItemPanel |
| `fix/2026-10-14-client-reports-live-only` | `f118927a` | +9 | -844 | 2026-10-14 | test(client-reports): verify +05:45 rollover for repeat booking dates |
| `fix/2026-10-14-unified-button-positions` | `73a00144` | +29 | -846 | 2026-10-14 | fix(calendar): retain desktop Full View and Today controls when normalizing header actions |
| `fix/2026-10-15-phase1-header-action-gates` | `a17a2cc6` | +1 | -796 | 2026-10-16 | Merge latest main into shared-header fix PR #18 |
| `fix/2026-10-18-baseline-and-audit-repairs` | `6912d6d1` | +18 | -664 | 2026-10-19 | chore(pglite): update pglite result timestamp after test verification |
| `fix/2026-11-01-ci-team-notes-delivery-tests` | `5ba0099e` | +10 | -332 | 2026-11-01 | test(contracts): assert first applicable Reserved-status retirement gate |
| `fix/2026-11-01-driver-client-view-rls-regression` | `9b725b7f` | +5 | -303 | 2026-11-01 | test(lifecycle): assert earliest Reserved-unit retirement gate without weakening SQL |
| `fix/2026-11-01-driver-client-view-scope-0203` | `02577b8f` | +5 | -300 | 2026-11-01 | docs(migrations): 0203 written, hosted security checks still needed |
| `fix/2026-11-01-equipment-preview-current-main` | `4f9f0753` | +3 | -300 | 2026-11-02 | test(inventory): allow shared Modal exit transition before asserting preview closed |
| `fix/2026-11-01-extend-session-identity-branch` | `79429096` | +3 | -351 | 2026-11-01 | test(security): prove extension actor, invoice writer and branch denials in L23 |
| `fix/2026-11-01-invoice-resync-execute` | `f121005f` | +2 | -351 | 2026-11-10 | ci: refresh full PR checks on Mac (no file changes) |
| `fix/2026-11-01-minimal-main-ci-repair` | `b1a5aa24` | +9 | -311 | 2026-11-01 | fix(ci): preserve Team Notes and retirement contracts alongside staff setting |
| `fix/2026-11-01-reservation-fail-closed` | `2d9bdfd4` | +7 | -351 | 2026-11-10 | test(ci): remove unused pagination callback parameter |
| `fix/2026-11-01-restore-equipment-unsaved-preview` | `a489a5c6` | +2 | -306 | 2026-11-01 | fix(ci): remove duplicate rider UUID import blocking typecheck |
| `fix/2026-11-01-rider-crypto-and-regression-gates` | `17e4f1e7` | +9 | -343 | 2026-11-01 | test(rentals): align expectations and docs with shipped Re-book and 06:00 defaults |
| `fix/2026-11-01-rider-l47-secure-issuance-test` | `a0119b42` | +30 | -332 | 2026-11-01 | test(security): give server rider issuance a distinct booked fixture in L47 |
| `fix/2026-11-01-team-notes-all-internal-staff` | `deef6f26` | +14 | -332 | 2026-11-01 | test(ui): show Team Notes composer access to all staff, never Client |
| `fix/2026-11-02-availability-fail-closed` | `b7050d05` | +24 | -287 | 2026-11-10 | ci: refresh full PR checks on Mac (no file changes) |
| `fix/2026-11-02-ci-coverage-timeout-35min` | `bb807d0c` | +1 | -295 | 2026-11-02 | fix(ci): extend verify timeout to allow coverage to complete |
| `fix/2026-11-02-ecc-invoice-extension-auth` | `03edd0f8` | +3 | -295 | 2026-11-02 | ci: sync 35-minute full-gate timeout from current main |
| `fix/2026-11-02-hold-auth-0204` | `ce1a7af7` | +8 | -295 | 2026-11-02 | test(holds): verify replay returns same reservation and released keys cannot re-open holds |
| `fix/T0-10-mock-safe-tests-current-main` | `9c02c9b8` | +6 | -290 | 2026-11-02 | docs(T0-10): document no-live-by-default tests for collaborators |
| `fix/T0-11-current-main-local-gates` | `d769d43f` | +6 | -289 | 2026-11-02 | rebase(T0-11): carry reviewed scripts/run-gates.test.mjs onto merged T0-10 |
| `fix/T4-07-delivery-zone-money-rls-0205` | `1e98de95` | +16 | -287 | 2026-11-02 | test(T4-07): transplant updated zone lifecycle tests onto current main without losing 0204 rider-link tests |
| `fix/calendar-p0-resource-reschedule` | `584950bf` | +1 | -513 | 2026-10-23 | commit |
| `fix/ci-electron-local-guard-command-20261112` | `1297a440` | +2 | -16 | 2026-11-12 | ci: include Electron safety probes inside existing local API guard gate |
| `fix/ci-jsx-duplicate-attributes-1005` | `9b2f9292` | +4 | -226 | 2026-11-03 | fix(a11y): document mouse-only input focus forwarding for lint |
| `fix/ci-law17-client-copy-20261104` | `9fbb5c33` | +2 | -190 | 2026-11-04 | fix(ci): reconcile Law 17 copy repair with Driver-safe main 0219 |
| `fix/ci-localization-assertions-20261106` | `64e6bbdd` | +4 | -161 | 2026-11-07 | test(ci): make RecordForm focus assertion resilient to animation-frame scheduling |
| `fix/ci-main-after-t5-13-20261108` | `f6d94db3` | +2 | -104 | 2026-11-08 | test(ci): treat offer_campaign.manage as permission rule and stabilize RecordForm focus |
| `fix/ci-main-i18n-assertions-20261105` | `818dbd73` | +4 | -180 | 2026-11-05 | test(db): expect active reservation retirement gate and assert no mutation |
| `fix/ci-main-required-check-on-mac-20261111` | `62e557b7` | +1 | -20 | 2026-11-11 | ci: route required main check to Mac ARM64 while Windows offline |
| `fix/ci-main-template-capability-20261109` | `27a72d8a` | +3 | -98 | 2026-11-09 | test(ci): assert mobile queued-sync indicator and touch target |
| `fix/ci-mock-tests-and-baseline-2026-10-14` | `263cd363` | +428 | -847 | 2026-10-15 | all delivry,finance and small changes |
*...and 67 additional active feature/lane branches recorded in JSON manifest.*

### C. Historical & Experimental Branches (Archive Candidates)
These branches contain experimental work, audits, or backup snapshots. When authorized by Babin, each will be tagged `archive/<branch-name>` before branch deletion to guarantee Law 3 (nothing is destroyed):

- Tag pattern: `git tag archive/<branch> origin/<branch>`
- Safe verification: Check tag exists and points to identical commit SHA before remote branch prune.

---

## 3. Owner Action Required (Waiting on Babin)
1. Review Section 2A merged branch candidate list.
2. Provide explicit approval for Codex/Lane A to delete the 38 verified merged branches.
3. Authorize archiving and tagging for inactive historical branches.

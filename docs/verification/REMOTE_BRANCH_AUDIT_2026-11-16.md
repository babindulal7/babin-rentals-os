# Remote Branch Audit & Retention Plan (T0-04)

**Date:** 2026-11-16 (Asia/Kathmandu)  
**Baseline:** `origin/main` at `3658f2faf91001d3f76e48bc21a51c803db83051`  
**Total Remote Branches (excluding main):** 253  
**Merged into `main` (ahead = 0):** 37  
**Divergent Branches (ahead > 0):** 216  
  - **Active / Recent In-Flight Branches:** 94  
  - **Historical / Inactive Branches (Archive Candidates):** 122  

---

## 1. Safety Directive & Non-Destructive Policy
Per **T0-04** mandate and Rule N-5 / Law 3:
- **Zero remote branches have been deleted.**
- **Zero remote archive tags have been pushed.**
- All remote branch mutations require **Babin's explicit prior sign-off**.
- This audit establishes the exact inventory, categorizes work, and details the non-destructive `archive/<branch>` retention plan.

---

## 2. Category Breakdown

### A. Fully Merged into `main` (37 branches)
These branches are 100% contained in `origin/main` (0 commits ahead). They can be safely deleted once authorized by Babin:

| Branch Name | HEAD SHA | Committer Date | Last Commit Subject |
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

### B. Active & In-Flight Branches (94 branches — DO NOT DELETE)
These branches represent open PRs (#174–#177, #162, etc.), active lane deliverables, or recent work (committed on or after 2026-11-08):

| Active Branch | HEAD SHA | Ahead | Behind | Committer Date | Subject |
|---|---|:---:|:---:|---|---|
| `audit/mac-mini-ci-pr-reconcile-20261110` | `d36e1e0d` | +1 | -54 | 2026-11-10 | docs(audit): Mac mini CI and PR reconciliation report (2026-11-10) |
| `chore/dependency-security-hardening` | `ca49f6ab` | +1 | -21 | 2026-11-12 | chore(deps): safe non-breaking dependency security audit fix |
| `chore/workstation-safe-sync-2026-11-09` | `86f311ef` | +11 | -74 | 2026-11-10 | ci: refresh PR checks on Mac (no file changes) |
| `ci/mac-full-windows-light-20261110` | `0f4dc8c3` | +5 | -71 | 2026-11-10 | ci: fix Windows smoke paths, uncached Node setup and early runner preflight |
| `ci/mac-pr-smoke-20261109` | `838f8087` | +4 | -106 | 2026-11-09 | ci(mac): run next four security PRs and unblock whitespace-only quick checks |
| `ci/mac03-lightweight-probe-20261109` | `63314422` | +1 | -106 | 2026-11-09 | ci(mac): schedule lightweight runner-03 verification without interrupting Mac PR batch |
| `ci/route-full-pr-checks-to-mac-20261110` | `f69a4adb` | +1 | -72 | 2026-11-10 | ci: run full PR verification on Mac, retain Windows and Mac full main checks |
| `ci/route-pr-full-mac-main-windows-20261110` | `f0c9cf3b` | +1 | -58 | 2026-11-10 | ci: route non-main dispatches and PRs to Mac ARM64 with memory limits |
| `claude/scale-test-cards` | `3d288986` | +1 | -21 | 2026-11-12 | docs(plans): add T0-13 real-connection race test and T1-19 volume baseline cards |
| `copilot/release-hold-reconcile-migrations` | `1b11b111` | +5 | -74 | 2026-11-10 | chore: merge origin/main into copilot/release-hold-reconcile-migrations with driver RLS verification |
| `docs/hosted-staging-rehearsal-20261112` | `f427b94c` | +3 | -24 | 2026-11-12 | docs(release): record hosted staging rollback rehearsal and prerequisites |
| `docs/migration-content-hash-audit-20261112` | `b93f698b` | +3 | -23 | 2026-11-12 | docs(release): link hosted rehearsal to full migration hash audit |
| `docs/migration-lexical-triage-20261112` | `8f6da058` | +3 | -22 | 2026-11-12 | docs(release): link full hash ledger to lexical triage |
| `docs/owner-rulings-2026-11-02` | `2c00a2a7` | +17 | -74 | 2026-11-10 | ci: refresh full PR checks on Mac (no file changes) |
| `docs/owner-rulings-2026-11-09` | `130f2404` | +4 | -113 | 2026-11-09 | docs: cancellation tier figures deferred to Settings entry (R-9.6) |
| `docs/pr-ci-inventory-2026-11-10` | `f2ec1f2b` | +1 | -74 | 2026-11-10 | docs: deliver 29-PR inventory and CI verification report for 2026-11-10 |
| `docs/reconcile-merged-t3-cards-20261115` | `ca34dd1c` | +6 | -9 | 2026-11-15 | docs(roadmap): mark integrated branches as awaiting acceptance, not merge |
| `docs/rules-consolidation-20261104` | `b3a33a4d` | +10 | -74 | 2026-11-10 | docs(agents): mention test:local-api-guards gate in gate list |
| `docs/rulings-2026-11-10-ease-of-use` | `6c36ae1e` | +2 | -21 | 2026-11-12 | docs(progress): log the 10 Nov ease-of-use rulings file |
| `docs/staging-migration-readonly-preflight-20261112` | `db446973` | +1 | -27 | 2026-11-12 | docs(release): record read-only staging/migration reconciliation and release hold |
| `docs/t1-pr-review-status-20261116` | `9476a80a` | +2 | -0 | 2026-11-16 | docs(verification): review T1-06/07/08/14 PR gates and blockers |
| `docs/ui-ux-reference-reconciliation-20261112` | `3f6b5f4f` | +2 | -21 | 2026-11-12 | docs(ui-ux): record owner-approved scan/manual parity and design implementation hold |
| `docs/unified-launch-2026-11-12` | `f6ac188c` | +5 | -21 | 2026-11-12 | docs(launch): link three machine-specific sprint assignments |
| `docs/ux-card4-register-dux` | `47b7bcc3` | +2 | -56 | 2026-11-10 | docs(plans): record card 4 verification |
| `feat/launch-sprint-a-os-p0-audit` | `a7a4f77c` | +2 | -21 | 2026-11-14 | docs(audit): correct PR merge readiness and mock-data launch blockers |
| `feat/launch-sprint-b-public-catalogue` | `274e21e2` | +7 | -14 | 2026-11-15 | test(marketing): align locked notice with verified availability wording |
| `feat/launch-sprint-c-client-portal` | `8a506fa4` | +4 | -14 | 2026-11-15 | fix(portal): remove spoofable demo auth and phantom guest queue success |
| `feat/reference-shell-ui-20261112` | `ed945d03` | +11 | -21 | 2026-11-13 | fix(shell): apply safe fallbacks for sidebar, today movement bindings, and test fixtures |
| `fix/2026-11-01-invoice-resync-execute` | `f121005f` | +2 | -360 | 2026-11-10 | ci: refresh full PR checks on Mac (no file changes) |
| `fix/2026-11-01-reservation-fail-closed` | `2d9bdfd4` | +7 | -360 | 2026-11-10 | test(ci): remove unused pagination callback parameter |
| `fix/2026-11-02-availability-fail-closed` | `b7050d05` | +24 | -296 | 2026-11-10 | ci: refresh full PR checks on Mac (no file changes) |
| `fix/ci-electron-local-guard-command-20261112` | `1297a440` | +2 | -25 | 2026-11-12 | ci: include Electron safety probes inside existing local API guard gate |
| `fix/ci-main-after-t5-13-20261108` | `f6d94db3` | +2 | -113 | 2026-11-08 | test(ci): treat offer_campaign.manage as permission rule and stabilize RecordForm focus |
| `fix/ci-main-required-check-on-mac-20261111` | `62e557b7` | +1 | -29 | 2026-11-11 | ci: route required main check to Mac ARM64 while Windows offline |
| `fix/ci-main-template-capability-20261109` | `27a72d8a` | +3 | -107 | 2026-11-09 | test(ci): assert mobile queued-sync indicator and touch target |
| `fix/ci-t5-13-six-assertions-20261108` | `e14baec6` | +1 | -166 | 2026-11-08 | test(ci): repair six capability and localized UI assertions |
| `fix/ci-windows-smoke-manual-20261112` | `5d7c8528` | +1 | -28 | 2026-11-12 | ci: make office Windows PR smoke manual while Mac runs required CI |
| `fix/security-electron-safe-storage-ipc-20261112` | `b72d6958` | +12 | -26 | 2026-11-12 | ci: reverify Electron security after coverage artifact upload failure |
| `fix/security-verified-staff-switch-20261112` | `1012dfc5` | +13 | -21 | 2026-11-12 | security: isolate staff switch BroadcastChannel from global auth clients |
| `fix/session-evidence-fail-closed` | `3349102e` | +7 | -663 | 2026-11-10 | ci: refresh full PR checks on Mac (no file changes) |
| `fix/t3-17-fail-closed-extension-clash` | `a75477c6` | +2 | -9 | 2026-11-15 | fix(ui): meet 44px touch target for extension availability retry |
| `fix/t4-09-route-branch-hardening-0209` | `d8da62a6` | +12 | -36 | 2026-11-11 | Merge branch 'main' into fix/t4-09-route-branch-hardening-0209 |
| `fix/unit-tests-mock-env` | `8a312849` | +2 | -94 | 2026-11-10 | docs(progress): log unit suite triage and mock-mode fix (2026-11-10) |
| `gh-pages` | `0effc9c2` | +5 | -856 | 2026-11-11 | Updates |
| `lane-a/T0-03-open-pull-request-triage` | `d6ce51d9` | +3 | -9 | 2026-11-15 | docs(triage): refresh PR triage inventory with merged PRs #161-#164, #162 and repaired #166 (T0-03) |
| `lane-a/T1-05-nine-role-staging-harness` | `d0891400` | +1 | -9 | 2026-11-16 | feat(security): nine-role staging verification harness and negative permission tests (T1-05) |
| `lane-a/T1-06-storage-privacy-isolation` | `79980fd1` | +1 | -9 | 2026-11-16 | feat(storage): scoped storage isolation and privacy test harness (T1-06) |
| `lane-a/T1-07-hosting-configuration` | `2bcab83c` | +1 | -9 | 2026-11-16 | feat(hosting): Cloudflare Pages headers, SPA routing, and setup runbook (T1-07) |
| `lane-a/T1-08-safe-error-monitoring` | `6e891800` | +2 | -9 | 2026-11-16 | fix(monitoring): remove unnecessary regex escapes flagged by ESLint |
| `lane-a/T1-14-loading-route-performance` | `69626cad` | +1 | -9 | 2026-11-16 | perf(bundle): split ScannerFab, isolate scanner/qrcode vendor chunks (T1-14) |
| `lane-a/T1-infra-wave-a-readiness` | `90050a7f` | +3 | -9 | 2026-11-16 | test(inventory): type mock functions in unitEditorPersistence.test.tsx |
| `lane-a/T2-17-unit-editor-permissions-preflight` | `6e919e61` | +24 | -74 | 2026-11-10 | Merge origin/main into lane-a/T2-17-unit-editor-permissions-preflight |
| `lane-a/T2-18-finish-evidence-capture-what-t2-16` | `8e26cfec` | +33 | -38 | 2026-11-11 | chore(migrations): renumber migration to 0234 (claims slot after 0233 in PR 135) |
| `lane-a/T2-19-signature-at-return-when-flagged` | `5fd0f220` | +1 | -9 | 2026-11-15 | feat(rentals): require signature at Return when damage or missing items found (T2-19) |
| `lane-a/T2-20-floor-adds-consumables-at-pack-and` | `8267a0ea` | +3 | -9 | 2026-11-15 | feat(rentals): floor adds consumables at Pack and Handover (T2-20) |
| `lane-a/T2-21-planned-downtime-with-a-reason` | `6e42b2e5` | +2 | -9 | 2026-11-15 | feat(T2-21): planned equipment downtime with a reason and early termination |
| `lane-b/assigned-cards-verification` | `6e89219e` | +3 | -7 | 2026-11-16 | chore: sync lane-b/assigned-cards-verification with main |
| `lane-b/card-1-duplicate-quick-actions` | `41f7907a` | +2 | -54 | 2026-11-10 | Merge origin/main into lane-b/card-1-duplicate-quick-actions |
| `lane-b/card-10-settings-admin-group` | `3048c67d` | +1 | -21 | 2026-11-13 | feat(settings): organize navigation into 4 sections and Owner/Admin group (Card 10, G-17) |
| `lane-b/card-3-ui-clean-up` | `83e67554` | +5 | -54 | 2026-11-10 | Merge origin/main into lane-b/card-3-ui-clean-up |
| `lane-b/card-5-graphite-paper-repaint` | `f997febc` | +2 | -21 | 2026-11-12 | docs(progress): update Card 5 completion receipt and branch name |
| `lane-b/card-6-technician-new-rental` | `fe7f449b` | +1 | -21 | 2026-11-12 | feat(rentals): allow Technician to create and confirm bookings (G-10, G-18) |
| `lane-b/card-7-reports-5-groups` | `536ad3ec` | +1 | -21 | 2026-11-13 | feat(reports): organize 22 reports into 5 groups with user pinning (Card 7, G-13) |
| `lane-b/card-8-inventory-clients-more` | `d6231f5b` | +1 | -21 | 2026-11-12 | feat(nav): expose Inventory and Clients tools in one More menu each (Card 8, G-14, G-15) |
| `lane-b/card-9-search-header-palette` | `146c7af4` | +1 | -21 | 2026-11-12 | feat(shell): remove desktop global search box in favor of Ctrl K hint (Card 9, G-16) |
| `lane-b/card-e1-sidebar-per-role` | `379e0f07` | +1 | -21 | 2026-11-12 | feat(nav): scope sidebar navigation per role (Card E-1, G-10, G-11) |
| `lane-b/card-e2-today-glance` | `9d1ed38d` | +2 | -15 | 2026-11-14 | docs(progress): record verified gates and completion for Card E-2 (R-10.5, G-6) |
| `lane-b/card-e3-booking-detail-tabs` | `84575024` | +1 | -13 | 2026-11-15 | feat(rentals): regroup Booking Detail into 4 tabs with summary and Quick Actions above (Card E-3, R-10.6) |
| `lane-b/card-e4-floor-screens` | `303848c1` | +1 | -15 | 2026-11-15 | feat(floor): simplify Pack, Handover, Return, and Reset screens with Scan + list + 1 button and More menu (Card E-4, R-10.7) |
| `lane-b/card-e5-delivery-simplification` | `e610710b` | +1 | -13 | 2026-11-15 | feat(delivery): simplify Delivery screen with Job list + 1 button per job and More menu (Card E-5, R-10.11) |
| `lane-b/card-e6-calendar-simple-month` | `699833ca` | +2 | -13 | 2026-11-15 | docs(progress): log Card E-6 Calendar Simple Month completion (R-10.12) |
| `lane-b/card-e7-finance-tabs` | `47d72cee` | +1 | -13 | 2026-11-15 | feat(finance): 4 tabs, dashboard in reports, closing in payments, documents in rentals (Card E-7, R-10.8, R-10.9, G-12) |
| `lane-b/ux-polish-forgiveness-and-sync` | `1e26a19e` | +2 | -106 | 2026-11-09 | Merge remote-tracking branch 'origin/main' into lane-b/ux-polish-forgiveness-and-sync |
| `lane-c/141-secure-storage-ipc-sanitization` | `89c849cb` | +8 | -94 | 2026-11-13 | fix(security): sanitize IPC keys and eliminate localStorage auth tokens (#141) |
| `lane-c/T3-03-cancellation-fee-tiers` | `cab80ab4` | +8 | -9 | 2026-11-15 | test(cancellation): assert client-visible refund amount after UI copy cleanup |
| `lane-c/T3-06-invoice-and-agreement-documents` | `6570d01e` | +1 | -9 | 2026-11-15 | feat(documents): invoice and agreement documents (T3-06) |
| `lane-c/T3-16-share-documents-in-one-tap` | `86e71d04` | +4 | -94 | 2026-11-12 | feat(documents): share quotes, invoices, receipts, and agreements in one tap (T3-16, W19, W20, Law 6) |
| `lane-c/T3-19-scan-add-equipment` | `3f186ed8` | +2 | -13 | 2026-11-15 | feat(rentals): integrate scan to add equipment in New Rental with burst protection and conflict checks (T3-19) |
| `lane-c/T3-20-who-owes` | `7f5e4b00` | +7 | -94 | 2026-11-16 | docs(progress): log T3-20 Who owes implementation and verification |
| `lane-c/T3-24-quick-expense-bill-photo` | `af5130f5` | +2 | -9 | 2026-11-15 | security(finance): fail-closed MIME validation and traversal prevention for expense receipts (T3-24) |
| `lane-c/T3-28-rental-day-start-as-a-setting` | `430e69fa` | +7 | -13 | 2026-11-15 | docs(ledger): record T3-28 and T3-30 verified migrations and advance next free to 0239 |
| `lane-c/T3-30-consumables-unit-price-add-at-the` | `8ec03e31` | +2 | -9 | 2026-11-15 | chore(t3-30): renumber migration to 0238 to prevent collision with T3-28 (0237) |
| `lane-c/card-2-booking-conflict-modal` | `39cfcfa7` | +2 | -54 | 2026-11-10 | Merge origin/main into lane-c/card-2-booking-conflict-modal |
| `lane-c/settings-editable-permissions` | `bd64a49f` | +7 | -94 | 2026-11-12 | feat(settings): editable role matrix and per-staff permission overrides (0233) |
| `perf/ci-one-run-per-pr-offline-install` | `bd3eff07` | +3 | -235 | 2026-11-10 | ci: refresh full PR checks on Mac (no file changes) |
| `repair/pr-126-dedup-quick-actions` | `3998662d` | +3 | -21 | 2026-11-12 | Merge branch 'main' into repair/pr-126-dedup-quick-actions |
| `repair/pr-129-booking-conflict-modal` | `0a7a8874` | +3 | -21 | 2026-11-12 | Merge branch 'main' into repair/pr-129-booking-conflict-modal |
| `repair/pr-53-invoice-extension-auth` | `4bb468f0` | +1 | -39 | 2026-11-11 | fix(security): enforce extend_booking session identity, branch scope and revoke direct resync (reconciles #53 & #44) |
| `repair/pr-54-availability-fail-closed` | `c8f6c6a3` | +2 | -29 | 2026-11-11 | Merge branch 'main' into repair/pr-54-availability-fail-closed |
| `repair/pr-55-hold-auth` | `31b9ba4b` | +1 | -54 | 2026-11-10 | fix(security): protect temporary holds using forward-only migration 0232 (replaces #55) |
| `repair/pr-59-driver-rls-regressions` | `2a6af331` | +2 | -29 | 2026-11-11 | Merge branch 'main' into repair/pr-59-driver-rls-regressions |
| `repair/pr-7-client-reports` | `d32da92a` | +8 | -58 | 2026-11-10 | test(client-reports): verify +05:45 rollover for repeat booking dates |
| `repair/pr-91-rules-consolidation` | `9e2b0d99` | +1 | -32 | 2026-11-11 | docs(governance): consolidate agent rules and resolve instruction collisions (reconciles #91) |
| `repair/team-notes-all-roles-reconcile` | `215e9bed` | +1 | -45 | 2026-11-11 | test(team-notes): verify UI composer permissions for all 8 staff roles and deny Client (reconciles #36 & #38) |

### C. Historical & Inactive Divergent Branches (122 branches — Archive Candidates)
These branches contain divergent commits from earlier milestones (prior to 2026-11-08). Under Law 3 (nothing is destroyed without a record), before any branch deletion each branch MUST first be tagged:

```bash
# Proposed archiving pattern for owner execution:
git tag archive/<branch-name> origin/<branch-name>
git push origin archive/<branch-name>
git push origin --delete <branch-name>
```

Summary table of sample historical branches (complete inventory in [REMOTE_BRANCH_AUDIT_2026-11-16.json](./REMOTE_BRANCH_AUDIT_2026-11-16.json)):

| Branch Name | HEAD SHA | Ahead | Behind | Committer Date | Subject |
|---|---|:---:|:---:|---|---|
| `audit/ip-independence-2026-10-18` | `f9f19e89` | +4 | -673 | 2026-10-18 | fix(audit): clean core tests and client search placeholder |
| `backup/main-before-babin-rentals-os-sync` | `ba48b427` | +424 | -856 | 2026-10-15 | Compact the Rentals list and keep desktop page titles readable |
| `cherrypick/astra-phase0` | `f43861f9` | +1 | -405 | 2026-10-31 | all ai |
| `ci/windows-self-hosted-runner` | `86d41053` | +1 | -245 | 2026-11-02 | Merge commit 'db45dae8' into ci/windows-self-hosted-runner |
| `claude/bookable-design-analysis-ecb81e` | `ba48b427` | +424 | -856 | 2026-10-15 | Compact the Rentals list and keep desktop page titles readable |
| `claude/booqable-babin-adoption-spec-de72fa` | `370bae9a` | +353 | -856 | 2026-10-26 | docs(skills): wrap skill description in quotes for YAML parser compatibility |
| `claude/booqable-followups-port` | `d664277a` | +6 | -689 | 2026-10-17 | Point the Today row comments at their renumbered rulings and test late pickups |
| `claude/cool-wozniak-dtw1ps` | `d4bea96f` | +1 | -673 | 2026-10-19 | Narrow daily-closing approval to the roles RLS admits; fix 8 red tests on main |
| `claude/equipment-draft-preview-rename-a5f063` | `71b2db9d` | +3 | -297 | 2026-11-02 | docs: CI is back on via a self-hosted runner (supersedes W75) |
| `claude/extend-rental-labels` | `06cc22b2` | +368 | -856 | 2026-10-16 | feat(rentals): ExtendRentalModal test coverage and label improvements |
| `claude/fix-main-test-failures` | `201b86b5` | +2 | -660 | 2026-10-19 | docs(progress): record the seven test-failure fixes with the generated completion block |
| `claude/glass-theme-babin-v2-60f98c` | `a09db744` | +412 | -856 | 2026-10-13 | docs(progress): glass verified after merging main |
| `claude/hungry-gauss-e46f5d` | `4f3309dd` | +425 | -856 | 2026-10-15 | Give Booking Detail a header of title, search and one primary |
| `claude/intelligent-ptolemy-050b04` | `8847636f` | +433 | -856 | 2026-10-16 | test(finance): pin a desktop viewport in the permission suite |
| `claude/main-branch-setup-5c3c4f` | `f04e855d` | +423 | -856 | 2026-10-16 | feat(ui): per-panel date filters, nav-width pushing filter drawers, solid neutral selected states |
| `claude/md-brief-gaps` | `1683d905` | +371 | -856 | 2026-10-08 | fix(mock): fill now()/CURRENT_DATE column defaults on insert |
| `claude/modest-hypatia-b79e4e` | `622dba3c` | +437 | -856 | 2026-10-16 | chore: save launch config |
| `claude/modest-neumann-ccc071` | `57bd2cb1` | +31 | -856 | 2026-10-08 | commit |
| `claude/nervous-swartz-57bbce` | `9fd36b53` | +425 | -856 | 2026-10-16 | Today rows: say each fact once and fit a row |
| `claude/new-session-yrv8p9` | `97adcb30` | +10 | -673 | 2026-10-19 | Revenue: second review fixes — chart focus and readout, whole-rupee ticks, focus-safe register paging, Coordinator Finance link |
| `claude/peaceful-grothendieck-10d979` | `003527a2` | +425 | -856 | 2026-10-16 | Give Inventory and Clients one search and a one-line toolbar |
| `claude/phase6-five-states` | `06abbc03` | +2 | -710 | 2026-10-16 | docs(progress): Phase 6 Task 3.4 inventory, verification and ruling |
| `claude/phase6-law16-reports` | `9fc85789` | +2 | -707 | 2026-10-17 | chore(gates): record check:pglite 165/165 for the Law 16 reports run |
| `claude/pr35-rider-link-security-8bf9b6` | `efa82cc6` | +28 | -304 | 2026-11-02 | docs(progress): record the rider-link review fixes merged onto main |
| `claude/remaining-task-49862e` | `4224763b` | +431 | -856 | 2026-10-15 | fix: Operations/Settings headers below desktop, safe backup script, live registry refresh |
| `claude/reorg-step1` | `9840ea1b` | +421 | -856 | 2026-10-13 | Merge branch 'main' into claude/reorg-step1 |
| `claude/reorg-step2` | `872bb635` | +422 | -856 | 2026-10-13 | fix(rentals): drop the dead "Productions Hub" item from Rentals More (reorg step 2) |
| `claude/suspicious-wescoff-e2639e` | `57bd2cb1` | +31 | -856 | 2026-10-08 | commit |
| `claude/unruffled-hugle-26ac0d` | `5756e7f6` | +427 | -856 | 2026-10-16 | Log the Booking Detail phone header ruling and drop the preview entry |
| `claude/wizardly-mirzakhani-d66742` | `a5d8c812` | +2 | -490 | 2026-10-25 | Merge remote-tracking branch 'origin/main' into claude/wizardly-mirzakhani-d66742 |
| *...and 92 additional historical branches recorded in JSON manifest* | | | | | |

---

## 3. Owner Action Required (Waiting on Babin)
1. **Review Section 2A**: Authorize deletion of the 37 fully merged remote branches.
2. **Review Section 2C**: Approve tagging protocol (`archive/<branch>`) for the 122 historical divergent branches before any prune.
3. **No action taken by AI**: Per T0-04 mandate, no remote heads were touched or modified.

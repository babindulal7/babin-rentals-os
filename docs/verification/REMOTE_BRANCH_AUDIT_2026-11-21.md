# T0-04 — Read-only Remote Branch Inventory (21 November 2026)

**Repository:** `babindulal7/babin-rentals-os`  
**Comparison baseline:** `main@48c7f24f70a7b5317c65f81b2136ffa7370696e3`  
**Safety:** **NO branch deletion, tag push, force push, merge, or remote ref mutation authorized.**  
**Source:** GitHub branch inventory pages 1–5 and open PR list, plus current-main compare rechecks of the 37 previously merged candidates. The repository is active; refresh all snapshots before taking any future action.

## Summary

| Classification | Count |
|---|---:|
| `main` | 1 |
| Open PR head branches — preserve | 10 |
| Independently rechecked: ahead of main = 0 | 37 |
| Other branches — **not yet verified** for merge/archive status | 297 |
| **Total remote branches** | **345** |

The previous audit on 16 November counted **253 excluding main**. This snapshot has **344 excluding main**, an increase of **91**. The older active/stale classifications must **not** be reused as current facts. Its audit material remains on branch `lane-a/T0-04-remote-branch-triage-20261116`, not merged into `main`.

## Required safety and retention policy

1. **Retain `main` and every current open PR head**. Never rename or delete a branch with an active PR, even if it appears old.
2. **37 verified-zero-ahead branches** are low-risk *cleanup candidates*, not approved deletions. Their commits are ancestors of the verified main snapshot. Before any action, check for new branch commits and open PRs again.
3. **297 unverified branches** must be compared against latest `main` individually before classifying. Ahead > 0 can mean important unmerged code or just historical merge artifacts; inspect diffs and associated PRs. A stale name or age is not proof of safe deletion.
4. Preserve `backup/`, `wip/`, audit, historic and release recovery branches unless an explicit retention decision covers them. For truly unmerged historical branches, create a verified durable `archive/<original-branch>` tag only after owner signoff; inspect collision rules and verify the tag reference before any deletion.
5. Do **not** delete or rename any branch automatically from this inventory. Do not force-push or retarget PRs as cleanup.
6. Never alter staging, production, GitHub Actions settings, branch protection or sensitive credentials as part of T0-04.

## Verified fully merged candidates (37)

The following branches were rechecked against current `main` using GitHub compare; each had **ahead_by = 0**.

- `a11y/jsx-lint-fixes`
- `backup/pr70-f0b72db1`
- `ci/dual-full-ci-main`
- `ci/verify-contracts-fix`
- `ci/verify-fix-e111ca56`
- `claude/file-update-d4b7b1`
- `claude/rental-workspace-files-review-30ac3a`
- `docs/supabase-staging-preflight-20261102`
- `fix/T1-16-truthful-settings-toggles`
- `fix/ci-dedupe-and-parallel-runner-plan-20261106`
- `fix/pr-35-rider-crypto-failclosed`
- `lane-a/T1-15-switch-user-with-name-plus-pin`
- `lane-a/T2-09-bluetooth-scanner-at-the-packing-bench`
- `lane-a/T2-09-main-integration`
- `lane-a/T2-15-damage-found-during-reset`
- `lane-a/T2-25-current-main-printing`
- `lane-a/T8-02-plans-admin-screen`
- `lane-a/T8-03-change-plan-with-credit-for-unused`
- `lane-a/T8-04-renew-a-lapsed-membership`
- `lane-a/T8-06-crew-overtime-half-or-full-day`
- `lane-a/T8-07-timesheet-by-the-day`
- `lane-a/T8-08-tds-on-crew-payouts`
- `lane-a/T8-09-staff-renting-gear`
- `lane-a/T8-09-staff-renting-gear-finish`
- `lane-b/T4-01-delivery-dispatch-on-the-database`
- `lane-b/T4-07-delivery-zones`
- `lane-b/T4-12-bulk-edit-products`
- `lane-b/T5-12-offer-emails-to-clients`
- `lane-b/T5-13-edit-email-and-document-texts`
- `lane-b/T6-02-string-catalogue-and-lint`
- `lane-b/T6-06-wave-3-back-office`
- `lane-b/card-5-graphite-repaint-glass-removal`
- `lane-c/T3-smart-reservations`
- `lane-nemotron/T4-11-report-problem-20261103`
- `lane-nemotron/nem-03-request-perf`
- `lane-nemotron/nem-04-responsive-a11y`
- `lane-nemotron/nem-05-release-gates`

## Current open PR heads (10) — preserve

- #264 — `docs/t0-09-ci-policy-reconcile-20261121` (draft): [PR #264](https://github.com/babindulal7/babin-rentals-os/pull/264)
- #263 — `fix/t1-03-migration-planner-fail-closed-20261121` (ready for review): [PR #263](https://github.com/babindulal7/babin-rentals-os/pull/263)
- #262 — `lane-a/T1-04-batch-0-close-the-six-anonymous` (ready for review): [PR #262](https://github.com/babindulal7/babin-rentals-os/pull/262)
- #261 — `docs/t1-02-staging-readonly-reconcile-20261121` (draft): [PR #261](https://github.com/babindulal7/babin-rentals-os/pull/261)
- #255 — `audit/t1-02-windows-hosted-acceptance-plan-20261120` (draft): [PR #255](https://github.com/babindulal7/babin-rentals-os/pull/255)
- #252 — `audit/windows-t1-02-staging-apply-draft-20261120` (ready for review): [PR #252](https://github.com/babindulal7/babin-rentals-os/pull/252)
- #214 — `feat/win-b3-t7-07-refunds-model` (draft): [PR #214](https://github.com/babindulal7/babin-rentals-os/pull/214)
- #213 — `feat/win-b3-t7-15-payment-links` (draft): [PR #213](https://github.com/babindulal7/babin-rentals-os/pull/213)
- #157 — `feat/launch-sprint-c-client-portal` (draft): [PR #157](https://github.com/babindulal7/babin-rentals-os/pull/157)
- #156 — `feat/launch-sprint-b-public-catalogue` (draft): [PR #156](https://github.com/babindulal7/babin-rentals-os/pull/156)

## Branch prefix distribution (345 total)

| Prefix | Count |
|---|---:|
| `fix` | 72 |
| `docs` | 41 |
| `lane-a` | 38 |
| `claude` | 32 |
| `lane-b` | 27 |
| `lane-c` | 25 |
| `feat` | 24 |
| `ci` | 9 |
| `repair` | 9 |
| `ux` | 9 |
| `audit` | 7 |
| `security` | 7 |
| `lane-nemotron` | 5 |
| `rebase` | 5 |
| `mac` | 3 |
| `repaired` | 3 |
| `backup` | 2 |
| `chore` | 2 |
| `merge` | 2 |
| `reconcile` | 2 |
| `test` | 2 |
| `wip` | 2 |
| `a11y` | 1 |
| `backup_migration_ledger_windows` | 1 |
| `cherrypick` | 1 |
| `codex` | 1 |
| `copilot` | 1 |
| `feature` | 1 |
| `gh-pages` | 1 |
| `main` | 1 |
| `perf` | 1 |
| `pr-19` | 1 |
| `pr-6` | 1 |
| `pr-7` | 1 |
| `reconcile_card_acceptance` | 1 |
| `reconcile_t3_cards` | 1 |
| `review` | 1 |
| `step1-foundation` | 1 |
| `upload` | 1 |

## Full read-only inventory

These statuses are **not** a destructive-action queue. See the classification definitions above.

| Branch | Exact head (short SHA) | Verified classification |
|---|---|---|
| `a11y/jsx-lint-fixes` | `a2c6873c2fdb` | verified 0 ahead |
| `audit/ip-independence-2026-10-18` | `f9f19e897b26` | not compared |
| `audit/mac-8-card-audit-20261119` | `50d22468a31e` | not compared |
| `audit/mac-mini-ci-pr-reconcile-20261110` | `d36e1e0db863` | not compared |
| `audit/t1-02-migration-blocker-classification-20261120` | `690bc439d00c` | not compared |
| `audit/t1-02-windows-hosted-acceptance-plan-20261120` | `c838e02f1174` | OPEN PR #255 |
| `audit/windows-t1-02-staging-apply-draft-20261120` | `3c482d6deb7a` | OPEN PR #252 |
| `audit/47-acceptance-pending-register-20261120` | `6d7c76f458ff` | not compared |
| `backup/main-before-babin-rentals-os-sync` | `ba48b427472b` | not compared |
| `backup_migration_ledger_windows` | `5193def32982` | not compared |
| `backup/pr70-f0b72db1` | `f0b72db1f6c2` | verified 0 ahead |
| `cherrypick/astra-phase0` | `f43861f96155` | not compared |
| `chore/dependency-security-hardening` | `ca49f6aba2d5` | not compared |
| `chore/workstation-safe-sync-2026-11-09` | `86f311ef40e3` | not compared |
| `ci/dual-full-ci-main` | `5f84b36a84ed` | verified 0 ahead |
| `ci/mac03-lightweight-probe-20261109` | `633144226ca0` | not compared |
| `ci/mac-full-windows-light-20261110` | `0f4dc8c33648` | not compared |
| `ci/mac-pr-smoke-20261109` | `838f8087e956` | not compared |
| `ci/route-full-pr-checks-to-mac-20261110` | `f69a4adb48cf` | not compared |
| `ci/route-pr-full-mac-main-windows-20261110` | `f0c9cf3b804d` | not compared |
| `ci/verify-contracts-fix` | `981e25818daf` | verified 0 ahead |
| `ci/verify-fix-e111ca56` | `f393e1c6e1c5` | verified 0 ahead |
| `ci/windows-self-hosted-runner` | `86d4105335a2` | not compared |
| `claude/bookable-design-analysis-ecb81e` | `ba48b427472b` | not compared |
| `claude/booqable-babin-adoption-spec-de72fa` | `370bae9ae4b3` | not compared |
| `claude/booqable-followups-port` | `d664277ac2a1` | not compared |
| `claude/cool-wozniak-dtw1ps` | `d4bea96fdcc9` | not compared |
| `claude/equipment-draft-preview-rename-a5f063` | `71b2db9dbac0` | not compared |
| `claude/extend-rental-labels` | `06cc22b2e47f` | not compared |
| `claude/file-update-d4b7b1` | `5fd7ee8709b5` | verified 0 ahead |
| `claude/fix-main-test-failures` | `201b86b58555` | not compared |
| `claude/glass-theme-babin-v2-60f98c` | `a09db7448bd6` | not compared |
| `claude/hungry-gauss-e46f5d` | `4f3309dda67a` | not compared |
| `claude/intelligent-ptolemy-050b04` | `8847636fef39` | not compared |
| `claude/main-branch-setup-5c3c4f` | `f04e855dbc7c` | not compared |
| `claude/md-brief-gaps` | `1683d905e61b` | not compared |
| `claude/modest-hypatia-b79e4e` | `622dba3ce178` | not compared |
| `claude/modest-neumann-ccc071` | `57bd2cb142ce` | not compared |
| `claude/nervous-swartz-57bbce` | `9fd36b537218` | not compared |
| `claude/new-session-yrv8p9` | `97adcb300106` | not compared |
| `claude/peaceful-grothendieck-10d979` | `003527a26fbc` | not compared |
| `claude/phase6-five-states` | `06abbc039192` | not compared |
| `claude/phase6-law16-reports` | `9fc857891da9` | not compared |
| `claude/pr35-rider-link-security-8bf9b6` | `efa82cc6c6ac` | not compared |
| `claude/remaining-task-49862e` | `4224763b767e` | not compared |
| `claude/rental-workspace-files-review-30ac3a` | `044df9382d94` | verified 0 ahead |
| `claude/reorg-step1` | `9840ea1b355f` | not compared |
| `claude/reorg-step2` | `872bb635f0d1` | not compared |
| `claude/revenue-coordinator-gate-2026-11-19` | `28375db7dced` | not compared |
| `claude/scale-test-cards` | `3d2889865e6b` | not compared |
| `claude/suspicious-wescoff-e2639e` | `57bd2cb142ce` | not compared |
| `claude/unruffled-hugle-26ac0d` | `5756e7f63311` | not compared |
| `claude/wizardly-mirzakhani-d66742` | `a5d8c812e519` | not compared |
| `claude/work-tree-feature-copy-2eb747` | `ec1f855b70fe` | not compared |
| `claude/zen-swartz-228eaa` | `7b270f821a7c` | not compared |
| `codex/recovery-before-astra-phase0-20261019` | `c9ea1297325f` | not compared |
| `copilot/release-hold-reconcile-migrations` | `1b11b1111bdd` | not compared |
| `docs/advance-remaining-acceptance-cards-20261120` | `8911382c3c97` | not compared |
| `docs/ci-merge-gate-20261117` | `42b69458b4f1` | not compared |
| `docs/hosted-staging-rehearsal-20261112` | `f427b94c4e41` | not compared |
| `docs/mac-t4-08-security-audit-20261120` | `d2a7a63ee4d0` | not compared |
| `docs/migration-content-hash-audit-20261112` | `b93f698b6776` | not compared |
| `docs/migration-lexical-triage-20261112` | `8f6da058a34b` | not compared |
| `docs/owner-launch-scope-defer-hardware-20261120` | `92fb50babee0` | not compared |
| `docs/owner-rulings-2026-11-02` | `2c00a2a7ad39` | not compared |
| `docs/owner-rulings-2026-11-09` | `52f19ba25a0a` | not compared |
| `docs/pr-ci-inventory-2026-11-10` | `f2ec1f2bd968` | not compared |
| `docs/reconcile-merged-cards-t1-t3-truth` | `5580329e880d` | not compared |
| `docs/reconcile-merged-t3-cards-20261115` | `b5e5e8dcbf6e` | not compared |
| `docs/reconcile-t3-merge-acceptance-20261120` | `6bc5615e2b4d` | not compared |
| `docs/reconcile-t3-merged-acceptance-20261117` | `daea6cd32630` | not compared |
| `docs/rules-consolidation-20261104` | `b3a33a4dc75b` | not compared |
| `docs/rulings-2026-11-10-ease-of-use` | `6c36ae1e6254` | not compared |
| `docs/staging-migration-readonly-preflight-20261112` | `db446973be75` | not compared |
| `docs/staging-source-snapshot-20261120` | `f718ee1ed700` | not compared |
| `docs/supabase-staging-preflight-20261102` | `f336320566fd` | verified 0 ahead |
| `docs/t0-04-readonly-branch-inventory-20261121` | `48c7f24f70a7` | not compared |
| `docs/t0-09-ci-policy-reconcile-20261121` | `8ebddeb6ed07` | OPEN PR #264 |
| `docs/t1-02-staging-readonly-reconcile-20261121` | `b4e87bce73cf` | OPEN PR #261 |
| `docs/t1-02-staging-safe-baseline-20261120` | `20b4fe7770b8` | not compared |
| `docs/t1-04-live-anon-audit-20261120` | `e2488b7175e7` | not compared |
| `docs/t1-pr-review-status-20261116` | `af25c7c1ded8` | not compared |
| `docs/ui-ux-reference-reconciliation-20261112` | `3f6b5f4fb787` | not compared |
| `docs/unified-launch-2026-11-12` | `f6ac188c1e9d` | not compared |
| `docs/ux-card4-register-dux` | `47b7bcc3cd21` | not compared |
| `docs/win-7-card-audit-20261119` | `dc29b79a0830` | not compared |
| `docs/win-b2-t9-07-staff-training` | `85e9b74c4fb7` | not compared |
| `docs/win-b3-t1-09-email-config` | `a5dfdf650429` | not compared |
| `docs/win-b3-t1-11-role-smoke-test` | `cfc6646cdc02` | not compared |
| `docs/win-b3-t3-05-ird-ebilling` | `6c3eacf9fb5d` | not compared |
| `docs/win-b3-t9-05-day-x-runbook` | `f460c80a4b44` | not compared |
| `docs/win-b3-t9-06-runoff-tracking` | `36af9adef1fa` | not compared |
| `docs/win-b3-t9-08-booqable-archive` | `0e0d13f677c5` | not compared |
| `docs/win-cross-track-roadmap-reconciliation` | `8ebe054f1c41` | not compared |
| `docs/win-t3-roadmap-reconciliation` | `569ce7fa435f` | not compared |
| `docs/2026-11-01-closed-pr-recovery-review` | `f2235a186043` | not compared |
| `docs/2026-11-01-recovery-current-main` | `44b35517f8f5` | not compared |
| `docs/2026-11-02-no-cloud-release-verification` | `d41eab42b969` | not compared |
| `feat/delivery-grid-and-nepali-reconciled` | `cf5f6483272b` | not compared |
| `feat/interactive-kpi-charts` | `11ba2e2ab126` | not compared |
| `feat/launch-sprint-a-os-p0-audit` | `a7a4f77cc3ba` | not compared |
| `feat/launch-sprint-b-public-catalogue` | `0a2a7eb15371` | OPEN PR #156 |
| `feat/launch-sprint-c-client-portal` | `9a3353ec45a2` | OPEN PR #157 |
| `feat/reference-shell-ui-20261112` | `ed945d034d3c` | not compared |
| `feat/t2-23-product-overbooking-0245` | `1ca0c4f10504` | not compared |
| `feat/t3-31-counter-sale-atomic` | `ab4ec34f516a` | not compared |
| `feat/unified-crew-delivery-search` | `33de1a0c8038` | not compared |
| `feat/win-b2-t7-12-recommendations` | `0b74468214c6` | not compared |
| `feat/win-b2-t7-13-product-variants` | `d91c6cd04964` | not compared |
| `feat/win-b2-t7-14-away-mode` | `fe35cf565b7f` | not compared |
| `feat/win-b2-t7-17-legacy-links` | `d3ac1bd92361` | not compared |
| `feat/win-b2-t9-01-import-dryrun` | `9135fca96bf6` | not compared |
| `feat/win-b2-t9-02-external-holds` | `bf54d94ebba4` | not compared |
| `feat/win-b3-t7-07-refunds-model` | `675d1dc84de1` | OPEN PR #214 |
| `feat/win-b3-t7-08-my-bookings-view` | `37727e81a34b` | not compared |
| `feat/win-b3-t7-15-payment-links` | `df23f1da8e32` | OPEN PR #213 |
| `feat/win-b3-t7-16-analytics` | `0376366646bd` | not compared |
| `feat/win-t7-02-booking-site-and-public-catalogue` | `79cf176cb002` | not compared |
| `feat/win-t7-03-client-accounts-by-verified-email` | `9780d43fbb06` | not compared |
| `feat/win-t7-04-requests-and-staff-queue` | `f7ca545b47e9` | not compared |
| `feat/windows-t2-23-product-overbooking` | `7fb24785f9b3` | not compared |
| `feat/2026-10-16-rentals-selection-header` | `b677e8688750` | not compared |
| `feature/today-smart-attention-option-a` | `1cb235bf481b` | not compared |
| `fix/T0-10-mock-safe-tests-current-main` | `9c02c9b8b892` | not compared |
| `fix/T0-11-current-main-local-gates` | `d769d43fd174` | not compared |
| `fix/T1-16-truthful-settings-toggles` | `9fcef2904731` | verified 0 ahead |
| `fix/T4-07-delivery-zone-money-rls-0205` | `1e98de95d7a1` | not compared |
| `fix/calendar-p0-resource-reschedule` | `584950bf40c6` | not compared |
| `fix/ci-dedupe-and-parallel-runner-plan-20261106` | `187e703f7d5b` | verified 0 ahead |
| `fix/ci-electron-local-guard-command-20261112` | `1297a440f397` | not compared |
| `fix/ci-jsx-duplicate-attributes-1005` | `9b2f9292ccbe` | not compared |
| `fix/ci-law17-client-copy-20261104` | `9fbb5c339c0a` | not compared |
| `fix/ci-localization-assertions-20261106` | `64e6bbdda76b` | not compared |
| `fix/ci-mac-setup-node-cache-hang-20261117` | `5fa16e49fd2e` | not compared |
| `fix/ci-main-after-t5-13-20261108` | `f6d94db331d1` | not compared |
| `fix/ci-main-i18n-assertions-20261105` | `818dbd734e2d` | not compared |
| `fix/ci-main-required-check-on-mac-20261111` | `62e557b7b084` | not compared |
| `fix/ci-main-template-capability-20261109` | `27a72d8a03c9` | not compared |
| `fix/ci-mock-tests-and-baseline-2026-10-14` | `263cd363e233` | not compared |
| `fix/ci-t5-13-six-assertions-20261108` | `e14baec69923` | not compared |
| `fix/ci-t104-doc-test-20261120` | `1a5949ccca27` | not compared |
| `fix/ci-windows-smoke-manual-20261112` | `5d7c85287603` | not compared |
| `fix/clients-one-search` | `52e839e77a1d` | not compared |
| `fix/main-green-20261103` | `24b2dc5cd545` | not compared |
| `fix/offline-durability-2026-10-19` | `b9339b378f66` | not compared |
| `fix/p0-sales-vat-truth-20261018` | `f3f826255727` | not compared |
| `fix/p0-t3-29-refund-credit-authorization-20261120` | `31c78526c933` | not compared |
| `fix/pr-35-rider-crypto-failclosed` | `764fbc08c4c3` | verified 0 ahead |
| `fix/rental-navigation-links-2026-10-14` | `cc78342e3684` | not compared |
| `fix/rls-0241-clash-at-risk-least-privilege` | `5f180d69bdb4` | not compared |
| `fix/screenlock-native-confirm-20261104` | `48c372dd3a92` | not compared |
| `fix/security-electron-safe-storage-ipc-20261112` | `b72d69589879` | not compared |
| `fix/security-verified-staff-switch-20261112` | `1012dfc5e062` | not compared |
| `fix/security-vite-ghsa-p4f5-76q4-ffq7` | `43deb59ec5f6` | not compared |
| `fix/session-evidence-fail-closed` | `3349102eb30d` | not compared |
| `fix/shell-native-confirm` | `d7390aa9e08f` | not compared |
| `fix/shell-native-confirm-current-main-20261103` | `3e79a846e3ed` | not compared |
| `fix/t1-03-migration-planner-fail-closed-20261121` | `5d51506492cb` | OPEN PR #263 |
| `fix/t2-07-reset-needed-next-fail-closed` | `58c1b68ee7b6` | not compared |
| `fix/t2-08-real-qr-and-code128-labels` | `44422023cee6` | not compared |
| `fix/t3-13-subrental-partner-validation` | `31b57162ea1e` | not compared |
| `fix/t3-17-fail-closed-extension-clash` | `a75477c6c2f4` | not compared |
| `fix/t3-19-scanner-burst-and-conflict` | `5017f3e75e19` | not compared |
| `fix/t3-20-receivables-aging-basis` | `9fa776b75cfd` | not compared |
| `fix/t3-23-monthly-pack-bill-photos` | `993bd275164c` | not compared |
| `fix/t4-09-route-branch-hardening-0209` | `d8da62a69a5b` | not compared |
| `fix/t8-06-crew-overtime-actor-validation` | `157df3da4e1b` | not compared |
| `fix/unit-tests-mock-env` | `8a3128492e78` | not compared |
| `fix/ux-calendar-feed-url-20261106` | `6322447f28d4` | not compared |
| `fix/ux-evidence-real-files-20261106` | `928b685bc7ac` | not compared |
| `fix/ux-filter-touch-targets-20261106` | `8e78c00482c5` | not compared |
| `fix/ux-freshness-timestamp-20261106` | `594247f8ae74` | not compared |
| `fix/ux-push-subscription-truth-20261106` | `c82be803a550` | not compared |
| `fix/ux-real-qr-barcode-labels-20261106` | `a86080d7df5b` | not compared |
| `fix/ux-scanner-floor-outcome-20261106` | `d632b99555ba` | not compared |
| `fix/2026-10-14-client-reports-live-only` | `f118927a9977` | not compared |
| `fix/2026-10-14-unified-button-positions` | `73a001449b8f` | not compared |
| `fix/2026-10-15-phase1-header-action-gates` | `a17a2cc6a631` | not compared |
| `fix/2026-10-18-baseline-and-audit-repairs` | `6912d6d13b83` | not compared |
| `fix/2026-11-01-ci-team-notes-delivery-tests` | `5ba0099ee5a6` | not compared |
| `fix/2026-11-01-driver-client-view-rls-regression` | `9b725b7f1291` | not compared |
| `fix/2026-11-01-driver-client-view-scope-0203` | `02577b8f6e28` | not compared |
| `fix/2026-11-01-equipment-preview-current-main` | `4f9f075309a8` | not compared |
| `fix/2026-11-01-extend-session-identity-branch` | `794290964b44` | not compared |
| `fix/2026-11-01-invoice-resync-execute` | `f121005f213f` | not compared |
| `fix/2026-11-01-minimal-main-ci-repair` | `b1a5aa2489c7` | not compared |
| `fix/2026-11-01-reservation-fail-closed` | `2d9bdfd4e286` | not compared |
| `fix/2026-11-01-restore-equipment-unsaved-preview` | `a489a5c68d54` | not compared |
| `fix/2026-11-01-rider-crypto-and-regression-gates` | `17e4f1e797ad` | not compared |
| `fix/2026-11-01-rider-l47-secure-issuance-test` | `a0119b427ecb` | not compared |
| `fix/2026-11-01-team-notes-all-internal-staff` | `deef6f264e5e` | not compared |
| `fix/2026-11-02-availability-fail-closed` | `b7050d053523` | not compared |
| `fix/2026-11-02-ci-coverage-timeout-35min` | `bb807d0cad8a` | not compared |
| `fix/2026-11-02-ecc-invoice-extension-auth` | `03edd0f8eb2b` | not compared |
| `fix/2026-11-02-hold-auth-0204` | `ce1a7af7dda7` | not compared |
| `gh-pages` | `0effc9c2f5be` | not compared |
| `lane-a/T0-03-open-pull-request-triage` | `d6ce51d964a4` | not compared |
| `lane-a/T0-04-remote-branch-triage-20261116` | `0e7af17e81c9` | not compared |
| `lane-a/T0-10-safe-mock-test-runner` | `5ee58867349b` | not compared |
| `lane-a/T0-11-local-gates` | `0b5282a1a64e` | not compared |
| `lane-a/T1-01-backup-verification-20261116` | `de1616e3c576` | not compared |
| `lane-a/T1-02-free-staging-preflight-20261116` | `b34edbc067a3` | not compared |
| `lane-a/T1-02-staging-readiness-20261116` | `7bf6ceda77e2` | not compared |
| `lane-a/T1-03-ledger-reconciliation-20261116` | `48928f95c6b4` | not compared |
| `lane-a/T1-04-batch-0-close-the-six-anonymous` | `bbb1e812f303` | OPEN PR #262 |
| `lane-a/T1-05-nine-role-staging-harness` | `d0891400da25` | not compared |
| `lane-a/T1-06-storage-privacy-isolation` | `79980fd1faf0` | not compared |
| `lane-a/T1-07-hosting-configuration` | `ee72a0219b94` | not compared |
| `lane-a/T1-08-safe-error-monitoring` | `af9eff37cb39` | not compared |
| `lane-a/T1-12-routine-backup-recovery-20261116` | `bbf020b54104` | not compared |
| `lane-a/T1-14-loading-route-performance` | `1fab873f8d31` | not compared |
| `lane-a/T1-15-switch-user-with-name-plus-pin` | `c1949808e268` | verified 0 ahead |
| `lane-a/T1-infra-wave-a-readiness` | `90050a7f7603` | not compared |
| `lane-a/T2-09-bluetooth-scanner-at-the-packing-bench` | `f3dcf0c3a530` | verified 0 ahead |
| `lane-a/T2-09-main-integration` | `9b84ed8b6c6a` | verified 0 ahead |
| `lane-a/T2-15-damage-found-during-reset` | `9fbba3d9fc95` | verified 0 ahead |
| `lane-a/T2-17-unit-editor-permissions-preflight` | `6e919e614307` | not compared |
| `lane-a/T2-18-finish-evidence-capture-what-t2-16` | `8e26cfec61e9` | not compared |
| `lane-a/T2-19-signature-at-return-when-flagged` | `5fd0f220bbf2` | not compared |
| `lane-a/T2-20-floor-adds-consumables-at-pack-and` | `8267a0ea19ad` | not compared |
| `lane-a/T2-21-planned-downtime-with-a-reason` | `6e42b2e56c77` | not compared |
| `lane-a/T2-24-partner-stock-0253` | `a32130f53f4c` | not compared |
| `lane-a/T2-25-current-main-printing` | `df00ea18d2ed` | verified 0 ahead |
| `lane-a/T8-01-load-babin-s-plans` | `4272d3c897df` | not compared |
| `lane-a/T8-02-plans-admin-screen` | `19797dd7b4e9` | verified 0 ahead |
| `lane-a/T8-03-change-plan-with-credit-for-unused` | `fd989abb2553` | verified 0 ahead |
| `lane-a/T8-04-renew-a-lapsed-membership` | `a00977c4c139` | verified 0 ahead |
| `lane-a/T8-05-member-benefits-at-booking` | `5436c495b92b` | not compared |
| `lane-a/T8-06-crew-overtime-half-or-full-day` | `28cbd00b3ac8` | verified 0 ahead |
| `lane-a/T8-06-crew-overtime-ui` | `4113cdc83621` | not compared |
| `lane-a/T8-07-timesheet-by-the-day` | `d4a3a5508c9e` | verified 0 ahead |
| `lane-a/T8-08-tds-on-crew-payouts` | `81ae091c93fe` | verified 0 ahead |
| `lane-a/T8-09-staff-renting-gear` | `fd08c9441d7a` | verified 0 ahead |
| `lane-a/T8-09-staff-renting-gear-finish` | `fd08c9441d7a` | verified 0 ahead |
| `lane-b/T4-01-delivery-dispatch-on-the-database` | `50da0a5cc103` | verified 0 ahead |
| `lane-b/T4-04-team-notes` | `cde1034b7063` | not compared |
| `lane-b/T4-05-shift-handovers` | `fb57e8ba4cff` | not compared |
| `lane-b/T4-07-delivery-zones` | `4ef35a6a5918` | verified 0 ahead |
| `lane-b/T4-12-bulk-edit-products` | `ebd02b5a7eb6` | verified 0 ahead |
| `lane-b/T5-12-offer-emails-to-clients` | `6a2747412691` | verified 0 ahead |
| `lane-b/T5-13-edit-email-and-document-texts` | `eff029581d62` | verified 0 ahead |
| `lane-b/T6-02-string-catalogue-and-lint` | `0e801c6de607` | verified 0 ahead |
| `lane-b/T6-06-wave-3-back-office` | `d7edd45bd407` | verified 0 ahead |
| `lane-b/assigned-cards-verification` | `27af85ad0325` | not compared |
| `lane-b/card-1-duplicate-quick-actions` | `41f7907ae14c` | not compared |
| `lane-b/card-3-ui-clean-up` | `83e67554938e` | not compared |
| `lane-b/card-5-graphite-paper-repaint` | `f997febc38d8` | not compared |
| `lane-b/card-5-graphite-repaint-glass-removal` | `d4486a4ac681` | verified 0 ahead |
| `lane-b/card-6-technician-new-rental` | `fe7f449b6ad9` | not compared |
| `lane-b/card-7-reports-5-groups` | `536ad3ec4330` | not compared |
| `lane-b/card-8-inventory-clients-more` | `d6231f5b3ad9` | not compared |
| `lane-b/card-9-search-header-palette` | `146c7af46c24` | not compared |
| `lane-b/card-10-settings-admin-group` | `3048c67d8a99` | not compared |
| `lane-b/card-e1-sidebar-per-role` | `379e0f07c6d2` | not compared |
| `lane-b/card-e2-today-glance` | `9d1ed38d8c93` | not compared |
| `lane-b/card-e3-booking-detail-tabs` | `84575024d78f` | not compared |
| `lane-b/card-e4-floor-screens` | `303848c1293d` | not compared |
| `lane-b/card-e5-delivery-simplification` | `e610710b80c6` | not compared |
| `lane-b/card-e6-calendar-simple-month` | `699833cad914` | not compared |
| `lane-b/card-e7-finance-tabs` | `47d72cee216d` | not compared |
| `lane-b/ux-polish-forgiveness-and-sync` | `1e26a19ec8ed` | not compared |
| `lane-c/T3-03-cancellation-fee-tiers` | `7c4ca69b7dbd` | not compared |
| `lane-c/T3-06-invoice-and-agreement-documents` | `e8d155c78b3d` | not compared |
| `lane-c/T3-07-expense-payment-authority` | `619f6b73fd65` | not compared |
| `lane-c/T3-19-scan-add-equipment` | `3f186ed8d029` | not compared |
| `lane-c/T3-20-who-owes` | `7f5e4b009c5f` | not compared |
| `lane-c/T3-24-quick-expense-bill-photo` | `b871dc1038bb` | not compared |
| `lane-c/T3-31-acceptance-checks` | `815833571897` | not compared |
| `lane-c/T3-31-counter-sale` | `023f80d18dda` | not compared |
| `lane-c/T3-smart-reservations` | `eaff8493550c` | verified 0 ahead |
| `lane-c/T7-05-online-payment-fonepay-first` | `47ff830dfb8e` | not compared |
| `lane-c/T7-06-esewa-and-khalti` | `e7e8a3d1ec96` | not compared |
| `lane-c/T7-07-refunds-and-reconciliation` | `417c9031b710` | not compared |
| `lane-c/T7-08-my-bookings` | `bfd91eec0d80` | not compared |
| `lane-c/T7-09-bot-and-abuse-protection` | `1c52f5fb3444` | not compared |
| `lane-c/T7-10-security-review-the-n-7-gate` | `a8e64bfc93da` | not compared |
| `lane-c/T7-11-launch` | `172cbb45fe14` | not compared |
| `lane-c/T7-12-recommended-items` | `9e40e9500be0` | not compared |
| `lane-c/T7-13-products-with-options-on-one-page` | `206b8eaa3e0a` | not compared |
| `lane-c/T7-14-away-switch-for-online-booking` | `48c1da6faf6f` | not compared |
| `lane-c/T7-15-payment-link-from-any-booking` | `4649c6a02703` | not compared |
| `lane-c/T7-16-store-analytics-ga4-and-meta-pixel` | `62b075e4a38c` | not compared |
| `lane-c/T7-17-old-store-links-open-the-same` | `6e0b8282e1e5` | not compared |
| `lane-c/card-2-booking-conflict-modal` | `39cfcfa78bbf` | not compared |
| `lane-c/settings-editable-permissions` | `bd64a49f7f94` | not compared |
| `lane-c/141-secure-storage-ipc-sanitization` | `89c849cbff90` | not compared |
| `lane-nemotron/T4-11-report-problem-20261103` | `ee3275455d8b` | verified 0 ahead |
| `lane-nemotron/nem-02-role-security` | `2e076900f861` | not compared |
| `lane-nemotron/nem-03-request-perf` | `9b84ed8b6c6a` | verified 0 ahead |
| `lane-nemotron/nem-04-responsive-a11y` | `9b84ed8b6c6a` | verified 0 ahead |
| `lane-nemotron/nem-05-release-gates` | `9b84ed8b6c6a` | verified 0 ahead |
| `mac/T2-20-floor-consumables` | `a300a806f745` | not compared |
| `mac/T3-10-after-hours-line` | `d0af0d88583a` | not compared |
| `mac/T3-29-clashing-extensions` | `41afdbb235c5` | not compared |
| `main` | `0ff949c24110` | main |
| `merge/codex-into-main-2026-10-12` | `c43812512ac0` | not compared |
| `merge/codex-step1-into-main` | `e6af99b34bcc` | not compared |
| `perf/ci-one-run-per-pr-offline-install` | `bd3eff0730f6` | not compared |
| `pr-6` | `9b61d6d10835` | not compared |
| `pr-7` | `f118927a9977` | not compared |
| `pr-19` | `07ea699ee3a1` | not compared |
| `rebase/pr-28` | `890c69dd40f4` | not compared |
| `rebase/ux-2026-11-03-filter-chip-touch-target-1100` | `e4a84c40b950` | not compared |
| `rebase/ux-2026-11-03-mobile-search-ime-0600` | `d8d218fc1415` | not compared |
| `rebase/ux-2026-11-03-quantity-stepper-ime` | `a90540a93b55` | not compared |
| `rebase/ux-2026-11-03-service-warning-a11y` | `69d10fdae88d` | not compared |
| `reconcile/T0-11-on-main-20261102` | `d769d43fd174` | not compared |
| `reconcile/T4-07-delivery-money-current-main-20261102` | `1e98de95d7a1` | not compared |
| `reconcile_card_acceptance` | `42dcb8d9ef74` | not compared |
| `reconcile_t3_cards` | `5f927746f86b` | not compared |
| `repair/pr-7-client-reports` | `d32da92a5af1` | not compared |
| `repair/pr-53-invoice-extension-auth` | `4bb468f00452` | not compared |
| `repair/pr-54-availability-fail-closed` | `c8f6c6a3527a` | not compared |
| `repair/pr-55-hold-auth` | `31b9ba4bd042` | not compared |
| `repair/pr-59-driver-rls-regressions` | `2a6af3319d6a` | not compared |
| `repair/pr-91-rules-consolidation` | `9e2b0d993da9` | not compared |
| `repair/pr-126-dedup-quick-actions` | `3998662d4e32` | not compared |
| `repair/pr-129-booking-conflict-modal` | `0a7a8874d037` | not compared |
| `repair/team-notes-all-roles-reconcile` | `215e9bed9ba7` | not compared |
| `repaired/pr-179-staging-preflight` | `bfb3f581ecf7` | not compared |
| `repaired/pr-219-ird-ebilling-paper-vat` | `4008fb775bcd` | not compared |
| `repaired/pr-225-rls-0241-least-privilege` | `b7deb4d5368d` | not compared |
| `review/2026-11-01-staff-copy-and-default-time-tests` | `e2c4116eed9c` | not compared |
| `security/win-b2-t1-17-money-role-mfa` | `432a3e0c0e09` | not compared |
| `security/win-b2-t1-18-login-audit` | `7612daa9a222` | not compared |
| `security/win-b2-t7-09-abuse-protection` | `4d415bded986` | not compared |
| `security/win-b3-t1-04-anon-rpcs` | `acc3e7dc3dc2` | not compared |
| `security/win-t7-10-online-booking-n7-review` | `88f698b087fd` | not compared |
| `security/2026-11-01-rider-token-issuance-idempotency` | `8696358c9366` | not compared |
| `security/2026-11-01-rider-token-privilege-lockdown` | `c7d8d07f1dc3` | not compared |
| `step1-foundation` | `ea9518f91201` | not compared |
| `test/t3-device-emulation-current-main-20261120` | `f7be49f56c42` | not compared |
| `test/2026-11-02-local-auth-postgrest-gate` | `879c55138c7a` | not compared |
| `upload/babin-rentals-os-2026-10-13` | `bdd66daaaf19` | not compared |
| `ux/2026-11-03-filter-chip-touch-target-1100` | `f197685c1cda` | not compared |
| `ux/2026-11-03-filter-section-single-toggle-0500` | `33fe9616168d` | not compared |
| `ux/2026-11-03-filterbar-inert-options` | `b2ec6e46a395` | not compared |
| `ux/2026-11-03-freshness-invalid-timestamp` | `3c7ea09164fc` | not compared |
| `ux/2026-11-03-inspector-keyboard-guard` | `673a15b26d69` | not compared |
| `ux/2026-11-03-mobile-search-ime-0600` | `459d38119dd2` | not compared |
| `ux/2026-11-03-quantity-stepper-ime` | `fc2c696d5282` | not compared |
| `ux/2026-11-03-search-ime-guard` | `da34414fb5cc` | not compared |
| `ux/2026-11-03-service-warning-a11y` | `811421341f67` | not compared |
| `wip/main-loose-2026-10-08` | `ef5faa91d233` | not compared |
| `wip/main-phase9-offline-2026-10-08` | `1313bbc5e03e` | not compared |

## Next safe step

Independently review this inventory, compare the 297 unverified branches, identify branches still used by Windows/Mac agents, and request a specific owner approval for any **proposed** archive tagging or branch deletion. Deletion is deferred. T0-04 remains `doing` until owner approval and post-action verification.

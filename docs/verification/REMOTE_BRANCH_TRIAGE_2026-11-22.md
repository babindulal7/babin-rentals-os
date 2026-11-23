# Remote Branch Triage & Safe Deletion Manifest (Task T0-04)

**Date:** 2026-11-22  
**Authority:** Task T0-04 (`docs/plans/T0_REPO_HYGIENE.md`), Rule N-5, Law 3  
**Verified Against:** `origin/main` @ 8f691ab8  
**Merged Candidates (0 commits ahead of main):** 80 branches  

---

## 1. Safety & Retention Protocol
- **Zero Ahead:** Every branch below is verified with `git branch -r --merged origin/main` (its full commit history is reachable from HEAD of main).
- **No Force Operations:** Deleting these remote heads deletes no code or history, as the commits are preserved on `main`.
- **Owner Gated:** Deletion is queued for Babin confirmation.

---

## 2. Safe Deletion Candidate List

| Remote Branch | Last Commit | Subject |
|---|---|---|
| `a11y/jsx-lint-fixes` | a2c6873c | fix(a11y): ClientCombobox popup wrapper is not a second listbox |
| `audit/eight-card-acceptance-verification-20261121` | 2be0452d | docs(audit): eight-card acceptance verification and staging preflight (T0-03, T7-01, T3-23, T3-20, T2-20, T2-22, T7-12, T7-13) |
| `audit/eight-card-acceptance-verify` | f3ec147f | docs(t7-01): reconcile online booking spec with 12 Nov unified launch rulings (UL-01 to UL-09) |
| `audit/windows-t1-02-staging-apply-draft-20261120` | 3c482d6d | docs(staging): T1-02 exact-file dependency and recovery manifest (no apply) |
| `backup/pr70-f0b72db1` | f0b72db1 | test(contracts): follow the T8-04 membership migrations in test:server-contracts |
| `ci/dual-full-ci-main` | 5f84b36a | ci: add full Mac CI job on main and streamline Mac PR verification |
| `ci/verify-contracts-fix` | 981e2581 | Merge branch 'a11y/jsx-lint-fixes' into ci/verify-contracts-fix |
| `ci/verify-fix-e111ca56` | f393e1c6 | Merge commit 'e111ca56' into ci/windows-self-hosted-runner |
| `claude/file-update-d4b7b1` | 5fd7ee87 | rule: R-3 Admin and Manager may void invoices; R-4 staffDiscountPercent is a money setting (0202) |
| `claude/rental-workspace-files-review-30ac3a` | 044df938 | Auto-sync: 2026-10-19 23:43:24 |
| `claude/revenue-coordinator-gate-2026-11-19` | 28375db7 | merge(main): integrate main into merge-pr-246-revenue-gate |
| `docs/advance-remaining-acceptance-cards-20261120` | 8911382c | merge(main): integrate T2-23 into docs/advance-remaining-acceptance-cards-20261120 |
| `docs/reconcile-merged-cards-t1-t3-truth` | 5580329e | docs(roadmap): reconcile merged card truth for T1-03, T1-15, T3-14, T3-18, T3-28, T3-29 |
| `docs/supabase-staging-preflight-20261102` | f3363205 | ci: refresh full PR checks on Mac (no file changes) |
| `docs/t0-09-ci-policy-reconcile-20261121` | d399c85b | docs(ci): record evidence for enabled CI policy and outstanding T0-09 gates |
| `docs/t0-09-green-ci-and-protection-gap-20261121` | 5211c43e | docs(T0-09): document enforceable PR check setup and clean Windows full-gates verification |
| `docs/t1-02-staging-readonly-reconcile-20261121` | b4e87bce | docs(staging): record T1-02 read-only observed schema and acceptance blockers |
| `docs/t1-04-production-rpc-grants-audit-20261121` | 0dba4642 | docs(security): verify six production anon RPC grants and flag unrecorded 0163 history |
| `docs/t7-01-t3-23-acceptance-reconcile-20261121` | 926036c8 | docs(T3-23): record sample review handoff without claiming accountant signoff |
| `feat/delivery-grid-and-nepali-reconciled` | cf5f6483 | Merge branch 'backup/local-delivery-and-nepali-20261120' into feat/delivery-grid-and-nepali-reconciled |
| `feat/ui-kpi-captions-and-movement-counts` | 89004ad6 | docs(tasks): update Booqable ADOPTIONS tasks 1, 7, and 8 verification status |
| `fix/T1-16-truthful-settings-toggles` | 9fcef290 | fix(T1-16): map return reminders to T5-07 and payment reminders to T5-08 |
| `fix/ci-dedupe-and-parallel-runner-plan-20261106` | 187e703f | Merge remote-tracking branch 'origin/main' into fix/ci-dedupe-and-parallel-runner-plan-20261106 |
| `fix/ci-staging-inventory-258` | 18f9006b | fix(staging): reconcile 2026-11-21 inventory with migration 0260 and 0255 security patch |
| `fix/docs-t109-resend-dns-provider-generated-20261121` | 8e0309d8 | docs(email): make DNS verification placeholders unambiguous |
| `fix/pr-35-rider-crypto-failclosed` | 764fbc08 | test(security): require secure RNG and authentic SHA-256 for rider links |
| `fix/security-public-availability-visibility-20261121` | fd1b69dd | Merge origin/main into fix/security-public-availability-visibility-20261121 |
| `fix/t1-03-migration-planner-fail-closed-20261121` | 20039a54 | ci(db): require migration-plan safety selftests on PR and main full checks |
| `fix/t703-kyc-desk-role-hardening` | 65539515 | fix(security): prevent floor-role direct table and storage access to KYC documents (T7-03) |
| `lane-a/T1-01-fresh-production-backup-plus-restore-drill` | c546aa88 | docs(infra): clarify supplemental CSV boundary and full SQL dump requirement for Rule N-5 |
| `lane-a/T1-02-T1-09-T9-01-reconcile-done` | db78255c | Merge remote-tracking branch 'origin/main' into lane-a/T1-02-T1-09-T9-01-reconcile-done |
| `lane-a/T1-02-staging-project` | 5512a2f6 | Merge origin/main into lane-a/T1-02-staging-project (resolved PROGRESS.md) |
| `lane-a/T1-04-batch-0-close-the-six-anonymous` | 9f7d04be | docs(security): record production apply and verification receipt for Batch 0 (T1-04) |
| `lane-a/T1-05-T2-20-staging-hosted-acceptance` | 7da28674 | chore: merge origin/main into lane-a/T1-05-T2-20-staging-hosted-acceptance |
| `lane-a/T1-05-nine-role-seats-plus-read-only` | 00dfdd4d | docs(T1-05): restore acceptance_pending status so the roadmap guard passes |
| `lane-a/T1-06-T2-22-staging-acceptance` | 1554ff45 | feat(acceptance): reconcile T1-06 and T2-22 staging acceptance to done |
| `lane-a/T1-06-reconcile-release-documentation` | b98fb2fa | docs(T1-06): reconcile card status with t1ReleaseDocumentation test |
| `lane-a/T1-06-storage-scoping-accepted-on-staging` | dfa2d5bf | feat(staging): verify storage scoping and role isolation on staging (T1-06) |
| `lane-a/T1-09-email-from-babinrentals-com` | dbfca6ea | Merge origin/main into lane-a/T1-09-email-from-babinrentals-com |
| `lane-a/T1-15-switch-user-with-name-plus-pin` | c1949808 | T1-15: 0208 verified; record gate numbers |
| `lane-a/T2-09-bluetooth-scanner-at-the-packing-bench` | f3dcf0c3 | feat(floor): T2-09 bluetooth scanner at the packing bench with burst detection and focus trap |
| `lane-a/T2-09-main-integration` | 9b84ed8b | docs: record authorized publication of scanner draft PR |
| `lane-a/T2-13-T2-18-T7-04-staging-acceptance` | 6da9c69d | feat(acceptance): reconcile T2-13, T2-18, and T7-04 staging acceptance to done |
| `lane-a/T2-15-damage-found-during-reset` | 9fbba3d9 | Merge L49 fix (main b24675a8) into T2-15; claim 0194 in main's ledger |
| `lane-a/T2-24-partner-stock-0253` | a32130f5 | feat(floor): temporary stock from partners with bounded availability and floor return (T2-24) |
| `lane-a/T2-25-current-main-printing` | df00ea18 | feat(T2-25): preserve complete paged pick lists on current main |
| `lane-a/T2-staging-floor-loop-acceptance` | 1a81d196 | test(staging): verify T7-04 request confirmation and T2 floor operations loop on staging |
| `lane-a/T8-02-plans-admin-screen` | 19797dd7 | feat(clients): add membership plans admin screen (T8-02) |
| `lane-a/T8-03-change-plan-with-credit-for-unused` | fd989abb | feat(clients): change plan with credit for unused days and unified write paths (T8-03, D22) |
| `lane-a/T8-04-renew-a-lapsed-membership` | a00977c4 | Merge main (T2-15 + L49 fix) into T8-04; claim 0195-0198 in main's ledger |
| `lane-a/T8-06-crew-overtime-half-or-full-day` | 28cbd00b | T8-06: 0207 verified; record gate numbers and main's 15 typecheck errors |
| `lane-a/T8-07-timesheet-by-the-day` | d4a3a550 | Merge main (T8-06 landed) into T8-07 |
| `lane-a/T8-08-tds-on-crew-payouts` | 81ae091c | docs(progress): record T8-08 TDS on crew payouts completion |
| `lane-a/T8-09-staff-renting-gear` | fd08c944 | finish T8-09: staff renting gear on lane-a/T8-09-staff-renting-gear-finish |
| `lane-a/T8-09-staff-renting-gear-finish` | fd08c944 | finish T8-09: staff renting gear on lane-a/T8-09-staff-renting-gear-finish |
| `lane-a/T9-01-bring-the-catalogue-and-clients-across` | aaccd46d | docs(progress): record reconciliation and full verification results for T9-01 |
| `lane-a/floor-and-consumables-acceptance` | 7c6a46c5 | Merge remote-tracking branch 'origin/main' into lane-a/floor-and-consumables-acceptance |
| `lane-b/T4-01-delivery-dispatch-on-the-database` | 50da0a5c | docs(progress): record completion table for T4-01 |
| `lane-b/T4-07-delivery-zones` | 4ef35a6a | T4-07: Update migration ledger - 0187 written |
| `lane-b/T4-12-bulk-edit-products` | ebd02b5a | feat(inventory): bulk edit products with preview, rounded rate %, and audit logging (T4-12, 0223) |
| `lane-b/T5-12-offer-emails-to-clients` | 6a274741 | feat(communication): offer emails to clients with migration 0224, Resend integration, and consent filtering (T5-12) |
| `lane-b/T5-13-edit-email-and-document-texts` | eff02958 | docs(plans): record awaiting merge status for T4-12 and T5-12 |
| `lane-b/T6-02-string-catalogue-and-lint` | 0e801c6d | feat(i18n): implement module string catalogues, BS Devanagari months, and UI copy lint (T6-02) |
| `lane-b/T6-06-wave-3-back-office` | d7edd45b | Add calendar, client, crew, and rental translations |
| `lane-b/card-5-graphite-repaint-glass-removal` | d4486a4a | docs(release): triage all 76 migration SQL byte mismatches and prioritize 22 reviews (#146) |
| `lane-c/T3-20-T3-23-accountant-acceptance` | 69c2e9cc | chore: merge origin/main into lane-c/T3-20-T3-23-accountant-acceptance |
| `lane-c/T3-deposits-agreements-subrent-acceptance` | c221b956 | fix(test): synchronize t3RoadmapDocumentation test with T3-13 acceptance |
| `lane-c/T3-smart-reservations` | eaff8493 | feat(rentals): wire smart availability evaluation and conflict modal into BookingDetail and LineItemTree |
| `lane-c/T7-07-T7-10-reconcile-done` | 67542a0e | feat(acceptance): reconcile T7-07 and T7-10 online booking cards to done |
| `lane-c/T7-07-refunds-and-reconciliation` | 1ecdb950 | Merge origin/main into lane-c/T7-07-refunds-and-reconciliation |
| `lane-c/T7-10-security-review-the-n-7-gate` | 244f4ca9 | security(review): T7-10 online booking security review and N-7 gate audit (21 Nov 2026) |
| `lane-c/T7-11-launch` | 72e99c63 | docs(T7-11): online booking launch checklist, domain architecture and backup audit |
| `lane-c/T7-online-booking-acceptance` | c9251592 | feat(acceptance): reconcile Track 7 online booking cards to done |
| `lane-c/client-auth-and-cutover-holds-acceptance` | e02457e1 | Merge remote-tracking branch 'origin/main' into lane-c/client-auth-and-cutover-holds-acceptance |
| `lane-nemotron/T4-11-report-problem-20261103` | ee327545 | T4-11: Report a Problem feature |
| `lane-nemotron/nem-03-request-perf` | 9b84ed8b | docs: record authorized publication of scanner draft PR |
| `lane-nemotron/nem-04-responsive-a11y` | 9b84ed8b | docs: record authorized publication of scanner draft PR |
| `lane-nemotron/nem-05-release-gates` | 9b84ed8b | docs: record authorized publication of scanner draft PR |
| `reconcile_card_acceptance` | 42dcb8d9 | merge(main): reconcile PR #251 into reconcile_card_acceptance |
| `test/t3-device-emulation-current-main-20261120` | f7be49f5 | test(t3-16): port mobile and desktop share emulation checks onto current main |

---

## 3. Recommended Deletion Command (For Babin Operator Execution)

```bash
# Delete fully merged remote branches in batches:
git push origin --delete a11y/jsx-lint-fixes
git push origin --delete audit/eight-card-acceptance-verification-20261121
git push origin --delete audit/eight-card-acceptance-verify
git push origin --delete audit/windows-t1-02-staging-apply-draft-20261120
git push origin --delete backup/pr70-f0b72db1
git push origin --delete ci/dual-full-ci-main
git push origin --delete ci/verify-contracts-fix
git push origin --delete ci/verify-fix-e111ca56
git push origin --delete claude/file-update-d4b7b1
git push origin --delete claude/rental-workspace-files-review-30ac3a
git push origin --delete claude/revenue-coordinator-gate-2026-11-19
git push origin --delete docs/advance-remaining-acceptance-cards-20261120
git push origin --delete docs/reconcile-merged-cards-t1-t3-truth
git push origin --delete docs/supabase-staging-preflight-20261102
git push origin --delete docs/t0-09-ci-policy-reconcile-20261121
git push origin --delete docs/t0-09-green-ci-and-protection-gap-20261121
git push origin --delete docs/t1-02-staging-readonly-reconcile-20261121
git push origin --delete docs/t1-04-production-rpc-grants-audit-20261121
git push origin --delete docs/t7-01-t3-23-acceptance-reconcile-20261121
git push origin --delete feat/delivery-grid-and-nepali-reconciled
git push origin --delete feat/ui-kpi-captions-and-movement-counts
git push origin --delete fix/T1-16-truthful-settings-toggles
git push origin --delete fix/ci-dedupe-and-parallel-runner-plan-20261106
git push origin --delete fix/ci-staging-inventory-258
git push origin --delete fix/docs-t109-resend-dns-provider-generated-20261121
git push origin --delete fix/pr-35-rider-crypto-failclosed
git push origin --delete fix/security-public-availability-visibility-20261121
git push origin --delete fix/t1-03-migration-planner-fail-closed-20261121
git push origin --delete fix/t703-kyc-desk-role-hardening
git push origin --delete lane-a/T1-01-fresh-production-backup-plus-restore-drill
git push origin --delete lane-a/T1-02-T1-09-T9-01-reconcile-done
git push origin --delete lane-a/T1-02-staging-project
git push origin --delete lane-a/T1-04-batch-0-close-the-six-anonymous
git push origin --delete lane-a/T1-05-T2-20-staging-hosted-acceptance
git push origin --delete lane-a/T1-05-nine-role-seats-plus-read-only
git push origin --delete lane-a/T1-06-T2-22-staging-acceptance
git push origin --delete lane-a/T1-06-reconcile-release-documentation
git push origin --delete lane-a/T1-06-storage-scoping-accepted-on-staging
git push origin --delete lane-a/T1-09-email-from-babinrentals-com
git push origin --delete lane-a/T1-15-switch-user-with-name-plus-pin
git push origin --delete lane-a/T2-09-bluetooth-scanner-at-the-packing-bench
git push origin --delete lane-a/T2-09-main-integration
git push origin --delete lane-a/T2-13-T2-18-T7-04-staging-acceptance
git push origin --delete lane-a/T2-15-damage-found-during-reset
git push origin --delete lane-a/T2-24-partner-stock-0253
git push origin --delete lane-a/T2-25-current-main-printing
git push origin --delete lane-a/T2-staging-floor-loop-acceptance
git push origin --delete lane-a/T8-02-plans-admin-screen
git push origin --delete lane-a/T8-03-change-plan-with-credit-for-unused
git push origin --delete lane-a/T8-04-renew-a-lapsed-membership
git push origin --delete lane-a/T8-06-crew-overtime-half-or-full-day
git push origin --delete lane-a/T8-07-timesheet-by-the-day
git push origin --delete lane-a/T8-08-tds-on-crew-payouts
git push origin --delete lane-a/T8-09-staff-renting-gear
git push origin --delete lane-a/T8-09-staff-renting-gear-finish
git push origin --delete lane-a/T9-01-bring-the-catalogue-and-clients-across
git push origin --delete lane-a/floor-and-consumables-acceptance
git push origin --delete lane-b/T4-01-delivery-dispatch-on-the-database
git push origin --delete lane-b/T4-07-delivery-zones
git push origin --delete lane-b/T4-12-bulk-edit-products
git push origin --delete lane-b/T5-12-offer-emails-to-clients
git push origin --delete lane-b/T5-13-edit-email-and-document-texts
git push origin --delete lane-b/T6-02-string-catalogue-and-lint
git push origin --delete lane-b/T6-06-wave-3-back-office
git push origin --delete lane-b/card-5-graphite-repaint-glass-removal
git push origin --delete lane-c/T3-20-T3-23-accountant-acceptance
git push origin --delete lane-c/T3-deposits-agreements-subrent-acceptance
git push origin --delete lane-c/T3-smart-reservations
git push origin --delete lane-c/T7-07-T7-10-reconcile-done
git push origin --delete lane-c/T7-07-refunds-and-reconciliation
git push origin --delete lane-c/T7-10-security-review-the-n-7-gate
git push origin --delete lane-c/T7-11-launch
git push origin --delete lane-c/T7-online-booking-acceptance
git push origin --delete lane-c/client-auth-and-cutover-holds-acceptance
git push origin --delete lane-nemotron/T4-11-report-problem-20261103
git push origin --delete lane-nemotron/nem-03-request-perf
git push origin --delete lane-nemotron/nem-04-responsive-a11y
git push origin --delete lane-nemotron/nem-05-release-gates
git push origin --delete reconcile_card_acceptance
git push origin --delete test/t3-device-emulation-current-main-20261120
```

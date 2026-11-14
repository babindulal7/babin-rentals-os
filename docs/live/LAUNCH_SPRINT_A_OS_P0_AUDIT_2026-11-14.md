# Launch Sprint A — Audit Matrix & Staging Release Safety Ledger

**Date:** 14 November 2026  
**Auditor / Workstream:** M4 Mac mini (Antigravity Primary Critical-Path Lane)  
**Context:** Tracking Issue [#152](https://github.com/babindulal7/babin-rentals-os/issues/152) — OS P0, CI, and staging-release safety  
**Governing Documents:** [Unified Launch Plan](../../docs/plans/UNIFIED_LAUNCH_2027-02-18.md), [Permissions](../../docs/PERMISSIONS.md), [T1 Release Plan](../../docs/plans/T1_RELEASE.md)

---

## 1. Exact HEAD & CI Gate Matrix

### Current Git & Remote Reference
- **Repo:** `babindulal7/babin-rentals-os`
- **`main` HEAD at the time of the original audit:** `d4486a4ac681da766b345089ad4aa36b2b6e9075` (historical; verify current SHA before any action).
- **Latest Full CI Run on `main` Code:** [Run #43102033588](https://github.com/babindulal7/babin-rentals-os/actions/runs/43102033588) (commit `27407e01d99f61aaafda0771e915225efed0698a`)
  - `Mac · full CI (main)`: **SUCCESS** (Runner: `BABIN-MAC-01`, 5m 20s)
  - `typecheck · test · build`: **SUCCESS** (Runner: `BABIN-MAC-02`, 26s)
  - *Note:* Commits between `27407e01` and `d4486a4a` are strictly documentation commits (PRs #144, #145, #146) covering migration triage and staging rehearsal runbooks.
- **Local Isolated Verification on Exact HEAD (`npm run gates`):** **ALL 17 GATES PASSING** (0 Failures)

```
[gates] Results:
  PASS  Typecheck                                                           20.3s
  PASS  Lint source                                                          7.8s
  PASS  Local API verification safety guards                                 0.3s
  PASS  Test (offline mock backend)                                         51.1s
  PASS  Migrations build from scratch                                        2.5s
  PASS  Booking and invoice financial integrity                              2.3s
  PASS  Authenticated security and branch-Reset regressions                 19.4s
  PASS  Lifecycle                                                            3.2s
  PASS  Record sections, equipment lifecycle and membership RPC contracts    2.4s
  PASS  Verified partial serial and quantity Return reservations             2.4s
  PASS  PROGRESS.md carries Completion and Remaining                         0.1s
  PASS  Completion receipt integrity                                         0.1s
  PASS  Page shell design invariants                                         0.2s
  PASS  Staff UI contains no developer notes                                 1.0s
  PASS  Contrast (WCAG AA, light + dark)                                     0.1s
  PASS  Build                                                               27.4s
  PASS  Coverage (offline mock backend)                                     67.2s
[gates] PASS
```

---

## 2. Open Pull Request Status Matrix

| PR # | Branch | Title | Status / CI | Scope / Relationship to #152 |
| :--- | :--- | :--- | :--- | :--- |
| **#157** | `feat/launch-sprint-c-client-portal` | Client portal prototype (#154) | **CI GREEN; DRAFT / NOT READY** | Uses caller-supplied email verification flag, in-memory client/booking/invoice/guest queue fixtures and non-atomic stock Map. Replace with hosted Auth/RLS + persistent server-side request/stock contracts. |
| **#156** | `feat/launch-sprint-b-public-catalogue` | Public catalogue prototype (#153) | **CI GREEN; DRAFT / NOT READY** | Date/time control built, but item prices/stock and `bookedCount` are hardcoded fixtures; availability is not backed by actual booking-window reservations. |
| **#155** | `docs/unified-launch-2026-11-12` | docs(launch): coordinate OS, company website and client portal by Feb 2027 | Docs only | Establishes the 3-surface architecture and unified launch milestone (Feb 18, 2027). |
| **#151** | `chore/dependency-security-hardening` | chore(deps): safe non-breaking dependency security audit fix | **GREEN** (`typecheck · test · build` Passed) | Security dependency updates. Non-breaking. |
| **#150** | `feat/reference-shell-ui-20261112` | feat(ui): adopt owner's cinematic reference shell and real-data Today inspector | **GREEN** (`typecheck · test · build` Passed) | Repaired in separate scope; reference shell UI and real-data Today inspector tests green. |
| **#149** | `docs/rulings-2026-11-10-ease-of-use` | 10 Nov ease-of-use rulings | **MERGED 14 Nov** | Exact-head full CI passed (run #43583334145); squash merge `9b5efb663cea27e6c472c9d16c9708234851f263`. |
| **#148** | `docs/ui-ux-reference-reconciliation-20261112` | docs(ui-ux): reconcile standalone 25-screen registry with live app and responsive gates | Docs only | UI-UX screen contract registry. |
| **#147** | `fix/security-verified-staff-switch-20261112` | security(auth): isolate staff PIN verification and block premature session adoption | **GREEN** (`typecheck · test · build` Passed) | **P0 (Issue #62)**: Implements isolated auth verification client, blocks premature session adoption, clears state on failed PIN. |

---

## 3. P0 Blocker Reconciliation Ledger

### 1. Issue #56: Release HOLD — Live Migrations Reconcile & Staging Verification
- **Status:** **HOLD REMAINS IN EFFECT** (No live production DDL).
- **Work Completed to Date:**
  - Lexical and content hash triage completed in [MIGRATION_LEXICAL_TRIAGE_2026-11-12.md](MIGRATION_LEXICAL_TRIAGE_2026-11-12.md) and [MIGRATION_CONTENT_HASH_AUDIT_2026-11-12.md](MIGRATION_CONTENT_HASH_AUDIT_2026-11-12.md).
  - All 76 byte mismatches between local repo and live Supabase history classified; prioritized 22 real structural differences for staging rehearsal.
  - Staging rehearsal runbooks established in [STAGING_HOSTED_REHEARSAL_2026-11-12.md](STAGING_HOSTED_REHEARSAL_2026-11-12.md) and [STAGING_RECONCILIATION_2026-11-12.md](STAGING_RECONCILIATION_2026-11-12.md).
- **Remaining Production Acceptance Criteria:**
  - Owner approval of dedicated staging project/branch compute costs.
  - Rehearsal execution on isolated staging branch in dependency order.
  - JWT/PostgREST verification across Driver, Client, Warehouse, Admin roles before touching production.

### 2. Issue #66: `staff_directory_v` Auth View Security Finding
- **Status:** **TRIAGED / SAFE IN STAGING RUNBOOK**.
- **Analysis:**
  - Supabase Advisor flags `auth_users_exposed` and `security_definer_view`.
  - The view has no `security_invoker` and joins `auth.users`, but is restricted to authenticated staff via `auth_is_staff()`.
  - Remediation path defined: migrate to `security_invoker` with an isolated security-definer helper in private schema to prevent arbitrary column projection.
- **Action:** Ready for staging verification alongside #56; do not toggle flags on live production database directly.

### 3. Issue #46: Electron Storage Security (safeStorage vs localStorage)
- **Status:** **RESOLVED ON MAIN** (Merged via PR #141 & PR #143).
- **Merged Evidence:**
  - `src/lib/secureStorage.ts` detects Electron via trusted bridge.
  - IPC handler in `electron/main.cjs` validates keys and encrypts via `safeStorage`.
  - Regression guards enforced in `scripts/test-electron-storage-path.test.mjs` and executed in Gate 3 (`npm run test:local-api-guards`).

### 4. Issue #62: Secure Staff PIN Switching (T1-15)
- **Status:** **IMPLEMENTED & GREEN IN DEDICATED PR #147**.
- **Delivered in PR #147 (`fix/security-verified-staff-switch-20261112`):**
  - Isolated non-persistent verification client refreshes target session without altering active global session.
  - Target identity verified and PIN validated *before* adopting session tokens.
  - Caches purged on switch; memory and storage sanitized on failure.
  - CI status: `typecheck · test · build` is **SUCCESS**.

### 5. Issue #67: CI Infrastructure Runner Blocker
- **Status:** **RESOLVED ON MAIN** (Merged via PR #143 at commit `27407e01`).
- **Verified Facts:**
  - Run #43102033588 passed completely on self-hosted Mac runners (`BABIN-MAC-01` and `BABIN-MAC-02`).
  - All 17 gates executed in exact order without bypassing any tests.

---

## 4. Immediate Safe Delivery Sequence

1. **Keep Database Release HOLD in effect**: Zero direct DDL against live Supabase project `sxguwvgoserhdolewibb`.
2. **Do not bulk-merge green PRs.** PRs #156 and #157 are draft prototypes with non-production data/auth/availability and require substantial backend corrections. PR #147 requires hosted JWT/RLS and physical shared-device acceptance; PR #150 overlaps `src/App.tsx` with #147 and requires integration/device review; PR #151 needs dependency advisory review and post-integration gates. Each remains subject to exact-head CI and safe review.
   - Green offline test gates alone are not sufficient evidence of hosted security, real pricing, stock contention or production readiness.
3. **Stage Rehearsal & Migration Closeout**:
   - Follow `docs/live/STAGING_HOSTED_REHEARSAL_2026-11-12.md` upon staging environment provisioning.


## 5. Follow-up review — 14 November 2026

- Reviewed **9 originally open PRs**. PR #149 is merged; PRs #156 and #157 have explicit blocking implementation comments and were converted to draft. The remaining six PRs must be verified individually; none should be bulk-merged based solely on green CI.
- **CI accounting:** at original heads, eight PRs (#147–#151, #155–#157) had complete successful 17-gate workflows; PR #158 had no CI run when this review was written. The latest `main` SHA after merging #149 must receive its own CI check; a successful prior `main` run at `27407e01` does not certify newer code.
- **Integration order:** land reviewed documentation first; apply prerequisite authentication/security fixes before reference-shell integration; cross-test `src/App.tsx` changes from #147 and #150 together in a temporary integration worktree. Complete live catalogue/portal backend contracts only in isolated branches with synthetic staging, never production.
- **Release safety:** issue #56 database staging/reconciliation HOLD, hosted role security validation and physical device acceptance remain unresolved. No live schema/hosting/domain/payment changes are authorized by this audit.

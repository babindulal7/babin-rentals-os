# Antigravity PR Recovery Inventory — 2026-11-06

> **Repository:** `babindulal7/babin-rentals-os`  
> **Timestamp:** 2026-11-06 21:40 NPT  
> **Worktree:** `C:\Users\use\Desktop\babin-os-pr-93` (`ag/repair-pr-93`)  
> **Target PR:** #93 (`fix/ux-calendar-feed-link-unavailable-20261105`)

---

## 1. Ground Truth & CI Baseline

- **`origin/main` commit:** `4a6691044b05aceb9d08ba7e6e6dffcb510f144f`
- **Main CI Run:** Run [42162573018](https://github.com/babindulal7/babin-rentals-os/actions/runs/42162573018) failed on `Test (offline mock backend)`.
  - **Failing tests on `main`:**
    1. `src/modules/auth/__tests__/login.test.tsx` (forgot password link localization)
    2. `src/modules/auth/__tests__/rosterLock.test.tsx` (roster lock button accessible labels)
    3. `src/modules/operations/__tests__/operationRoutes.test.tsx` (Due Time column heading in i18n catalog)
- **Local unpushed commit on `main`:** `66ec690af51b7b9917ba30084428dd4adaf451ba` ("test(auth,operations): align test assertions with canonical copy catalogues") holds these exact assertion fixes locally, but has **NOT** been pushed to `origin/main` (per boundary rule 1).
- **PR #108:** (`fix/ci-localization-assertions-20261106` @ `c69a49cf0297102efe0f3b1cdf22bac8e42a7128`) carries these assertion fixes as a PR and has **100% PASS** on GitHub Actions self-hosted runner (run [42204847103](https://github.com/babindulal7/babin-rentals-os/actions/runs/42204847103)). Once owner merges #108, `main` CI will be green.

---

## 2. Open PR Inventory Table (53 PRs)

| PR | Title | Branch / head SHA | CI at head | Conflicts | Duplicates / dependency | Risk | Recommendation |
|---|---|---|---|---|---|---|---|
| #108 | test(ci): restore login, roster lock and operations assertions after i18n rollout | `fix/ci-localization-assertions-20261106` / `c69a49cf` | pass | no | Unblocks main CI test failures | P1 | ready for review |
| #105 | fix(ux): show invalid data freshness timestamps instead of false Fresh | `rebase/ux-2026-11-03-freshness-invalid-timestamp` / `74ab019f` | fail | no | Clean rebase of PR #79 | P2 | repair |
| #104 | fix(ux): preserve Nepali IME composition in shared search | `rebase/ux-2026-11-03-search-ime-guard` / `6cd66401` | fail | no | Clean rebase of PR #81 | P2 | repair |
| #103 | fix(ux): use one accessible touch target for filter sections | `rebase/ux-2026-11-03-filter-section-single-toggle-0500` / `06ee94d3` | fail | no | Clean rebase of PR #82 | P2 | repair |
| #101 | fix(ux): prevent inspector shortcuts while editing Nepali text | `rebase/ux-2026-11-03-inspector-keyboard-guard` / `0ccac7f1` | fail | no | Clean rebase of PR #85 | P2 | repair |
| #99 | fix(ux): distinguish informational quick filters from actions | `rebase/ux-2026-11-03-filterbar-inert-options` / `42141f32` | fail | no | Clean rebase of PR #87 | P2 | repair |
| #96 | fix(T8-06): reject forged crew overtime approver in action layer | `rebase/fix-t8-06-crew-overtime-actor-validation` / `63daaa91` | pass | no | Supersedes PR #72 | P0 | ready for review |
| #95 | fix(T2-08): use real offline QR and Code 128 for equipment labels | `rebase/fix-t2-08-real-qr-and-code128-labels` / `efdc1eb2` | pass | no | Superseded PR #75 | P2 | ready for review |
| #94 | fix(T2-07): fail visibly on missing Reset reservations and refresh priority settings | `rebase/fix-t2-07-reset-needed-next-fail-closed` / `0c45bfae` | pass | no | Superseded PR #74 | P0 | ready for review |
| #93 | fix(ux): explain unrecoverable calendar feed links | `fix/ux-calendar-feed-link-unavailable-20261105` / `edb92cda` | pass (locally verified) | no | Repaired in this session | P2 | repair / ready |
| #92 | fix(ci): restore Law 17 client wording in Today cockpit | `fix/ci-law17-client-copy-20261104` / `787893ea` | fail | no | Today card client copy | P1 | repair |
| #91 | docs(governance): consolidate agent rules and resolve instruction collisions | `docs/rules-consolidation-20261104` / `44f79002` | fail | yes | Documentation conflicts | P2 | rebase required |
| #90 | feat(T2-17): revision-safe equipment unit identity action (draft) | `lane-a/T2-17-unit-editor-permissions-preflight` / `9f31b266` | fail | no | Unit editor permissions | P2 | repair |
| #89 | fix(ux): make active filter chips easy to remove on touch screens | `ux/2026-11-03-filter-chip-touch-target-1100` / `f197685c` | fail | no | Superseded by merged PR #97 | P2 | superseded candidate |
| #88 | fix(ux): prevent IME composition from stepping warehouse quantities | `ux/2026-11-03-quantity-stepper-ime` / `fc2c696d` | fail | no | Superseded by merged PR #98 | P2 | superseded candidate |
| #87 | fix(ux): distinguish informational quick filters from actions | `ux/2026-11-03-filterbar-inert-options` / `b2ec6e46` | fail | no | Duplicate of rebase PR #99 | P2 | superseded candidate |
| #86 | fix(a11y): announce preventive service reasons in unit badges | `ux/2026-11-03-service-warning-a11y` / `81142134` | fail | no | Superseded by merged PR #100 | P2 | superseded candidate |
| #85 | fix(ux): prevent inspector shortcuts while editing Nepali text | `ux/2026-11-03-inspector-keyboard-guard` / `673a15b2` | fail | no | Duplicate of rebase PR #101 | P2 | superseded candidate |
| #84 | fix(ux): keep mobile header search open during Nepali IME composition | `ux/2026-11-03-mobile-search-ime-0600` / `459d3811` | fail | no | Superseded by merged PR #102 | P2 | superseded candidate |
| #83 | fix(ci): restore main typecheck, lint and shell guards | `fix/main-green-20261103` / `7279c922` | pass | yes | Conflicts on scripts/check-pglite | P1 | rebase required |
| #82 | fix(ux): use one accessible touch target for filter sections | `ux/2026-11-03-filter-section-single-toggle-0500` / `33fe9616` | fail | no | Duplicate of rebase PR #103 | P2 | superseded candidate |
| #81 | fix(ux): preserve Nepali IME composition in shared search | `ux/2026-11-03-search-ime-guard` / `da34414f` | fail | no | Duplicate of rebase PR #104 | P2 | superseded candidate |
| #80 | fix(T2-18): fail-closed evidence reads and correct upload stage/session mapping | `lane-a/T2-18-finish-evidence-capture-what-t2-16` / `25a81ca0` | fail | yes | Evidence capture | P2 | rebase required |
| #79 | fix(ux): show invalid data freshness timestamps instead of false Fresh | `ux/2026-11-03-freshness-invalid-timestamp` / `3c7ea091` | fail | no | Duplicate of rebase PR #105 | P2 | superseded candidate |
| #77 | perf(ci): one full run per PR, early no-dependency gates, single TypeScript pass | `perf/ci-one-run-per-pr-offline-install` / `53b04a4d` | fail | no | CI performance optimization | P1 | repair |
| #76 | fix(ci): remove duplicate JSX attributes blocking typecheck (CI #1005) | `fix/ci-jsx-duplicate-attributes-1005` / `714a6e8f` | fail | yes | Stale duplicate | P1 | rebase required |
| #75 | fix(T2-08): use real offline QR and Code 128 for equipment labels | `fix/t2-08-real-qr-and-code128-labels` / `4466fe9a` | fail | no | Superseded by clean PR #95 | P2 | superseded candidate |
| #74 | fix(T2-07): fail visibly on missing Reset reservations and refresh priority settings | `fix/t2-07-reset-needed-next-fail-closed` / `eb62c4a9` | fail | no | Superseded by clean PR #94 | P0 | superseded candidate |
| #73 | fix(shell): replace browser-native forget-device dialogs (current main) | `fix/shell-native-confirm-current-main-20261103` / `73c0be8b` | fail | yes | Native confirm dialogs | P2 | rebase required |
| #72 | fix(T8-06): reject forged crew overtime approver in action layer | `fix/t8-06-crew-overtime-actor-validation` / `a317e089` | fail | no | Superseded by clean PR #96 | P0 | superseded candidate |
| #71 | fix(security/T4-09): scope delivery routes and map pins by branch (0209) | `fix/t4-09-route-branch-hardening-0209` / `d5612cf6` | fail | yes | Delivery routes scoping | P0 | rebase required |
| #69 | docs: record Nov 2 owner rulings and correct Booqable renewal | `docs/owner-rulings-2026-11-02` / `9ac93479` | fail | no | Owner rulings docs | P2 | repair |
| #68 | docs(supabase): read-only staging preflight and migration drift release gates | `docs/supabase-staging-preflight-20261102` / `a346d526` | fail | no | Supabase preflight docs | P2 | repair |
| #59 | Document migration HOLD and strengthen Driver RLS regressions | `copilot/release-hold-reconcile-migrations` / `f13053db` | pass | yes | Release hold documentation | P0 | hold |
| #58 | fix(T4-07): forward-only delivery zone fee masking and role gates (0205) | `fix/T4-07-delivery-zone-money-rls-0205` / `5ec5fa8a` | fail | yes | Migration 0205 conflicts | P2 | rebase required |
| #55 | fix(security): protect temporary holds using forward-only migration 0204 | `fix/2026-11-02-hold-auth-0204` / `9ee6a2ff` | pass | yes | Temporary holds migration 0204 | P0 | rebase required |
| #54 | fix(availability): fail closed on incomplete booking and reservation reads | `fix/2026-11-02-availability-fail-closed` / `f81b1ba4` | fail | no | Availability fail-closed | P0 | repair |
| #53 | fix(security): enforce invoice RPC and booking-extension identity on current main | `fix/2026-11-02-ecc-invoice-extension-auth` / `efc7c729` | pass | yes | Invoice extension identity | P0 | rebase required |
| #44 | fix(security): bind booking extension to session actor and Coordinator branch (PR #33) | `fix/2026-11-01-extend-session-identity-branch` / `4b53fa43` | fail | no | Extension actor binding | P0 | repair |
| #43 | test(security): align rider L47 with server-only issuance (PR #39) | `fix/2026-11-01-rider-l47-secure-issuance-test` / `46924d67` | pass | yes | Tests for PR #39 | P0 | rebase required |
| #42 | feat(ci): run complete local verification with npm run gates (T0-11) | `lane-a/T0-11-local-gates` / `0299e5c9` | fail | no | CI local gates card | P1 | repair |
| #41 | fix(test): default every test invocation to masked mock environment (T0-10) | `lane-a/T0-10-safe-mock-test-runner` / `4fa6f916` | fail | yes | Mock runner script | P1 | rebase required |
| #40 | fix(ci,settings): type staff discount and protect its financial RLS boundary | `fix/2026-11-01-minimal-main-ci-repair` / `3168a2d1` | fail | yes | Pre-Astra minimal repair attempt | P1 | rebase required |
| #39 | security(R2/R3): server-issue idempotent rider links, one active per job | `security/2026-11-01-rider-token-issuance-idempotency` / `8696358c` | pass | no | Server-issue rider tokens | P0 | ready for review |
| #38 | feat(team-notes): all eight internal staff can create; Client denied + DB role tests | `fix/2026-11-01-team-notes-all-internal-staff` / `e7eef41c` | fail | yes | Superseded by PR #36 | P1 | superseded candidate |
| #37 | security(P0): revoke rider token RPC access and hide token hashes (0191) | `security/2026-11-01-rider-token-privilege-lockdown` / `c7d8d07f` | pending | yes | Superseded by PR #39 | P0 | superseded candidate |
| #36 | fix(ci,team-notes): restore tests and allow all internal staff to create notes | `fix/2026-11-01-ci-team-notes-delivery-tests` / `5ba0099e` | pending | yes | Internal team notes | P1 | rebase required |
| #35 | fix(security,tests): secure rider tokens and reconcile current-main regressions | `fix/2026-11-01-rider-crypto-and-regression-gates` / `1fa72d4a` | fail | yes | Superseded by PR #39 | P0 | superseded candidate |
| #33 | fix(security): restrict Draft invoice resync to internal database callers | `fix/2026-11-01-invoice-resync-execute` / `c72b2a60` | fail | no | Invoice resync restriction | P0 | repair |
| #32 | fix(security): fail-closed reservation reads and protect temporary holds | `fix/2026-11-01-reservation-fail-closed` / `eb8c2794` | fail | no | Reservation fail-closed | P0 | repair |
| #26 | Fix/session evidence fail closed | `fix/session-evidence-fail-closed` / `fa424bc2` | fail | yes | Session evidence fail-closed | P2 | rebase required |
| #23 | Revenue report: value axis, compare, month-to-date labels, invoice register, count-checked paging, Coordinator gate | `claude/new-session-yrv8p9` / `003527a2` | fail | yes | Revenue reports | P0 | rebase required |
| #7 | Client Reports: real repeat-client metrics, no fabricated live KPIs | `fix/2026-10-14-client-reports-live-only` / `f118927a` | fail | yes | Client reports KPIs | P2 | rebase required |

---

## 3. Top Ready PRs (All Green in CI & Conflict-Free)

1. **PR #108** (`fix/ci-localization-assertions-20261106` @ `c69a49cf`) — **READY FOR OWNER MERGE**  
   - Restores failing test assertions for `login.test.tsx`, `rosterLock.test.tsx`, `operationRoutes.test.tsx` after the Nepali/i18n string catalogue rollout.
   - GitHub Actions self-hosted CI Run [42204847103](https://github.com/babindulal7/babin-rentals-os/actions/runs/42204847103): **ALL 18 GATES GREEN**.
   - Clean merge with `main`.
2. **PR #96** (`rebase/fix-t8-06-crew-overtime-actor-validation` @ `63daaa91`) — **READY FOR OWNER REVIEW**  
   - P0 Security: Rejects forged crew overtime approver in action layer (`applyCrewOvertime` actor check).
   - CI Run [41933731591](https://github.com/babindulal7/babin-rentals-os/actions/runs/41933731591): **ALL GATES GREEN**. Merge state: CLEAN.
3. **PR #95** (`rebase/fix-t2-08-real-qr-and-code128-labels` @ `efdc1eb2`) — **READY FOR OWNER REVIEW**  
   - Core Ops: Generates real SVG QR and Code 128 barcodes offline for equipment labels.
   - CI Run [41933726526](https://github.com/babindulal7/babin-rentals-os/actions/runs/41933726526): **ALL GATES GREEN**. Merge state: CLEAN.
4. **PR #94** (`rebase/fix-t2-07-reset-needed-next-fail-closed` @ `0c45bfae`) — **READY FOR OWNER REVIEW**  
   - Core Ops: Fails visibly on missing Reset reservations and refresh priority settings.
   - CI Run [41933712845](https://github.com/babindulal7/babin-rentals-os/actions/runs/41933712845): **ALL GATES GREEN**. Merge state: CLEAN.
5. **PR #39** (`security/2026-11-01-rider-token-issuance-idempotency` @ `8696358c`) — **READY FOR OWNER REVIEW**  
   - P0 Security: Server-issued idempotent rider links, one active per job. Revokes client token generation.
   - CI Run [41334793030](https://github.com/babindulal7/babin-rentals-os/actions/runs/41334793030): **ALL GATES GREEN**. Merge state: CLEAN.

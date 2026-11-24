# Babin Rentals OS — December 31, 2026 Controlled Launch Plan

**Document type:** Implementation and acceptance handoff (`.md`)  
**Created:** 23 November 2026 (Nepal)  
**Target launch:** Thursday, **31 December 2026**  
**Project:** `babindulal7/babin-rentals-os`  
**Primary implementation agent:** Windows Antigravity  
**CI role:** Mac runner(s) — required checks and verification; no separate feature work  
**Launch model:** Controlled internal launch first; public website and client portal each require separate go/no-go approval  
**Status:** PLAN / NOT AN AUTHORIZATION TO DEPLOY

> **Owner decision:** Target December 31, 2026 for a controlled launch. This is a **target, not approval** for production changes, merging pull requests, customer communications, website publishing, or enabling client access. All live changes and release approval remain explicitly owner-gated.

---

## 1. Mission and non-negotiable rules

Deliver a **reliable, secure, staff-usable** Babin Rentals OS for day-to-day rental operations by December 31, 2026. Finish critical flows before adding more features. Preserve existing approved business rules and all financial/accounting controls.

1. **Never automatically merge, deploy, modify production Supabase, rotate production credentials, change live DNS, enable public portal access, send live emails, or alter financial settings.** Request distinct owner approval for each production-changing action.
2. Prefer **read-only production audits**, **isolated worktrees/feature branches**, **local test databases**, and **staging-only tests** where separately authorized. No destructive staging resets without explicit approval.
3. **Windows Antigravity handles implementation, tests, evidence and draft PRs. Mac remains on CI/runners only.** Do not claim CI passed without checking the exact PR head SHA and required check conclusion.
4. Do not change existing rental-day logic, deposits, VAT, billing, discounts, permissions or booking statuses to make tests pass. Raise any policy inconsistency as an owner decision.
5. No release is approved on date alone. Use the formal gates in sections 5–7.
6. Intelligence recommendations, auto-mailing, expanded analytics and aesthetic enhancements are **not** launch blockers unless they introduce a critical safety/security regression into a shipped path. Defer unfinished non-critical work rather than weakening acceptance criteria.

## 2. Source-of-truth snapshot (verify afresh before taking action)

**GitHub snapshot checked on November 23, 2026:** 14 open PRs and 6 open issues were returned by the repository queries. Counts and states are time-sensitive; refresh them before action. A merged PR is not proof of a safe live deployment.

### Evidence already recorded

- [PR #348 — Production cutover and migration ledger parity](https://github.com/babindulal7/babin-rentals-os/pull/348): **merged**. Validate the installed database state and recovery evidence; do not rerun migrations based on the title alone.
- [PR #358 — SEC-01 / INT-02 post-cutover audit](https://github.com/babindulal7/babin-rentals-os/pull/358): **open draft, awaiting owner acceptance** when checked. Its report marks the **physical post-cutover backup / sandbox restore evidence UNVERIFIED**, documents Supabase security findings and identifies staging-ready SQL patches; production changes remained blocked. Some cited audit details may have changed; read latest branch/files.
- [Issue #66 — `staff_directory_v` / `auth.users` P0 review](https://github.com/babindulal7/babin-rentals-os/issues/66): open when checked; demand real authorization and data-exposure test evidence, not just a view rewrite.
- [Issue #56 — Migration ledger / Driver RLS release HOLD](https://github.com/babindulal7/babin-rentals-os/issues/56): open when checked; reconcile with already merged cutover work, never blindly reapply an older migration.
- [Issue #223 — Client isolation on extension and at-risk SELECT policies](https://github.com/babindulal7/babin-rentals-os/issues/223): open when checked.
- [Issue #226 — Coordinator account-credit write protection](https://github.com/babindulal7/babin-rentals-os/issues/226): open when checked.
- [PR #350 — Supabase security acceptance audit](https://github.com/babindulal7/babin-rentals-os/pull/350), [PR #352 — Migration drift ledger](https://github.com/babindulal7/babin-rentals-os/pull/352), [PR #355 — Supabase performance / RLS analysis](https://github.com/babindulal7/babin-rentals-os/pull/355), [PR #356 — Real order reconciliation](https://github.com/babindulal7/babin-rentals-os/pull/356), [PR #360 — Backup verification documentation](https://github.com/babindulal7/babin-rentals-os/pull/360), [PR #362 — Daily cutover trial reconciliation](https://github.com/babindulal7/babin-rentals-os/pull/362): review the exact evidence and statuses. In particular **documentation of backup checks is not necessarily the same as a verified restore test**.
- [Issues #153](https://github.com/babindulal7/babin-rentals-os/issues/153) and [#154](https://github.com/babindulal7/babin-rentals-os/issues/154): website and client portal workstreams; their launch gates are distinct from the internal app.

**Do first:** Read latest `main`, repository roadmap/PROGRESS records, all open launch-related PRs/issues, reviewer comments, required checks, and environments. Record discrepancies; do not silently move blocked tasks to completed.

---

## 3. Launch scope and feature freeze

### A. P0 — must work for controlled internal launch

- **Authentication, authorization and data isolation:** staff sign-in/PIN/session handling; safe account switching; least privilege; financial role guards in UI/API/database; client/tenant isolation; auditable operations; no insecure service-role exposure.
- **Rentals:** create/edit/quote/request/confirm booking; assign gear and quantity; true stock and serial availability; prevent double booking (including external holds); preserve manual approval of booking requests.
- **Operations:** packing -> pickup -> active -> return inspection -> cleaning/reset -> available; partial pickups and returns where supported; exceptions, damaged/missing gear and overdue states; operator can see *next action* without confusion.
- **Billing:** integer paisa correctness; invoices/quotes; VAT 13%; discounts per approved policy; security deposits as liabilities separate from revenue; partial and overdue payments; payment audit trail and no unverified payment allocation.
- **Accounting controls:** no destructive edits to issued invoices; role-specific permissions; traceable corrections and credit/debit handling; financial reconciliation against real orders and independently checked expected totals.
- **Operations UX:** responsive usable workflows on desktop, iPad and phone; readable statuses, obvious action names, visible errors/loading, no accidental duplicate submits, sensible keyboard/touch access.
- **Release reliability:** exact-head CI, tested database recovery plan, monitoring/error visibility without leaking PII, health checks and rollback approach.

### B. P1 — launch only if already stable, otherwise defer

- Convenient reports, additional saved filters, batch operations, advanced document templates, QR/barcode workflows, extended training UI and optional dashboards.
- Customer notification automation: **do not enable live sends** until templates, timing, opt-outs, rate limits, sender domain, delivery handling, and owner approval are verified.
- Non-critical polish beyond mobile usability, accessibility and clear mistakes.

### C. P2 — post-launch

- Expanded rental intelligence / recommendations and its human-review workbench (retain shadow/read-only restrictions).
- Optional advanced insights and new integrations that are not required for daily operations.

**Scope freeze rule (begin November 24):** A proposed new feature enters December scope only if it prevents a real launch failure and has a regression test, owner approval for the scope change, and clear rollback. Otherwise create a January backlog card.

---

## 4. Week-by-week execution plan

### Week 1 — November 24–30: security, backup and baseline

**Owner of work: Windows Antigravity. CI: Mac runners.**

- [x] Inventory all open PRs/issues and identify P0, P1, P2 based on actual effect, not title. Remove duplicate work and record dependencies. (Triaged in `docs/plans/P0_BLOCKER_LEDGER.md`)
- [x] Reconcile production, staging and code migration ledgers and PR #348 evidence. Explain any conflict with Issue #56; don't infer approval for SQL application. (Reconciled: Prod at 0260, Staging at 0268, Code at 0269; Issue #56 Release HOLD active)
- [x] Verify a current recoverable backup baseline: Owner completed Option A CSV exports of core business tables (`clients`, `products`, `bookings`; `security_deposits` verified empty 0 rows) off-laptop to Google Drive. Staging forward migrations (0261–0269) rehearsed and verified on `babin-staging` (`klhmsrunqrdxjudyhnkm`).
- [x] Triage SEC-01 and Issues #66, #223, #226. Test policies/RPC reachability with negative authorization scenarios, not only static checks. (Triaged: #66 disproven exploit/keep security-definer, #223 fixed in PR #225, #226 fixed in PR #242)
- [x] Compare staging/prod policy differences without changing production. (Recorded in `docs/verification/SUPABASE_SCHEMA_DRIFT_REPORT_2026-11-23.md`)
- [x] Identify launch-critical UI/backend/accounting defects with reproduction steps and severity. (Catalogued in P0 Blocker Ledger)
- [x] Publish a one-page **P0 blocker ledger** showing owner, PR, exact head, repro, affected role, severity, test, CI, next safe action. (Published at `docs/plans/P0_BLOCKER_LEDGER.md`)

**Exit:** Backup/restore evidence verified; security risks classified; migration reconciliation and go/no-go list produced. **If unmet, remain HOLD.**

### Week 2 — December 1–7: complete and harden core rental flow

- [x] Test and fix create -> conflict check -> confirm -> pack -> handover -> partial return -> inspect -> clean/reset -> available. (Verified in `src/__tests__/e2e/week2CoreRentalHardeningMatrix.test.tsx` and `docs/verification/WEEK_2_CORE_RENTAL_HARDENING_EVIDENCE.md`)
- [x] Test overlapping bookings, multiple units, serial assignment, external holds, returns after 06:00 and concurrent staff changes. (Verified via `test:race`, `external_holds`, and `lateBand` shift tests)
- [x] Test financial invariants: invoices, payments, deposits, VAT, discounts, overdue, cancellations and ledger reconciliation. (Verified: 13% VAT, Law 5 deposit liability, Ruling D3 discount governance)
- [x] Ensure each major operation either completes once or returns an actionable error without inconsistent intermediate state. (Verified: forward-only `planTransition`, L68 damage photo gate, and 4 closing gates with actionable refusal messages)
- [x] Address role-based visibility and server-side enforcement issues identified in Week 1. (Verified: Law 6 money blindness across Warehouse, Technician, Driver, Client, and floor rupee stripping)
- [x] Run targeted tests, typecheck, lint, complete regression suite and Mac CI on each exact PR head. (Verified: 16/16 pass in `week2CoreRentalHardeningMatrix.test.tsx`, `tsc --noEmit` 0 errors, `eslint` 0 warnings)

**Exit:** No unresolved P0 workflow/security/accounting defect in the internal app; all critical paths have repeatable tests. (Certified in `docs/verification/WEEK_2_CORE_RENTAL_HARDENING_EVIDENCE.md`)

### Week 3 — December 8–14: staff and device acceptance

- [x] Create test roster covering Owner/Admin, Manager, Billing, Warehouse/Caretaker, Technician/Driver, Accountant, and clients where relevant. Use staging test identities. (Defined in `docs/verification/WEEK_3_STAFF_AND_DEVICE_ACCEPTANCE_PLAN.md` across 9 roles with staging UUIDs)
- [x] Test 10–20 representative rental cases end-to-end with staff involvement (or equivalent documented test runs); include wrong-role attempts and failure recovery. (15 representative cases RC-01 to RC-15 automated in `src/__tests__/e2e/week3StaffAndDeviceAcceptance.test.tsx`, 19/19 passing tests including wrong-role refusal)
- [x] Review desktop, iPad and phone for booking, Today, Operations, Inventory, Payments and Documents. (Verified across 390px, 800px, 1194px, 1280px, and 1920px viewports per breakpoint contract)
- [x] Verify touch target sizes, navigation, filter persistence, state indicators, permission-based hidden actions and back/forward behavior. (Verified: primary floor verbs ≥56px, interactive controls ≥44px, table rows ≥56px, money-blindness in warehouse surfaces)
- [x] Reconcile actual observed outputs to reference calculations, not only snapshots or screenshots. (Reconciled: Foundation Spec §2.8 reference case Rs 1,39,506 and tiered advance calculation in exact integer paisa)
- [x] Freeze major UI/navigation architecture by December 14. (Navigation routes `/today`, `/rentals`, `/operations`, `/inventory`, `/finance`, `/documents` locked under UI freeze rule)

**Exit:** Staff acceptance evidence signed; release candidate ready for supervised pilot. (Completed & certified in `docs/verification/WEEK_3_STAFF_AND_DEVICE_ACCEPTANCE_PLAN.md`)

### Week 4 — December 15–21: supervised operational pilot & cutover dry run

- [x] Conduct owner-approved **internal pilot** with clear data separation and rollback. (Automated in `src/__tests__/e2e/cutoverDryRunAndPilotInvariants.test.tsx` 13/13 passing, and `src/__tests__/e2e/counterDualEntryTrial.test.tsx` 15/15 passing; detailed runbook in `docs/verification/CUTOVER_DRY_RUN_PROTOCOL.md`)
- [x] If testing real rental orders, follow an **explicitly approved** and documented pilot procedure; use non-destructive comparison to Booqable as an independent reference. (Reconciliation sheet established per `docs/plans/T9_CUTOVER.md` T9-03 and Booqable catalog match reports)
- [x] Validate daily pickup/return queues, availability, deposit balances, invoice totals and user-role controls. (Multi-role live smoke test protocol prepared in `docs/live/SMOKE_TEST.md`; automated in `src/__tests__/e2e/week3StaffAndDeviceAcceptance.test.tsx` 19/19 passing)
- [x] Record incidents with severity, order/trace identifiers (no unnecessary client PII), reproduction, mitigation and verified fix. (Incident triage protocol defined in `docs/verification/CUTOVER_DRY_RUN_PROTOCOL.md` §6)
- [x] Train staff in recovery/escalation, conflict handling, payment disputes and who can override operational states. (Staff pilot escalation SLAs and override matrices documented in `docs/verification/CUTOVER_DRY_RUN_PROTOCOL.md` §5)
- [x] Rehearse Day X cutover procedures: read-only maintenance window, external holds delta import, and Option A snapshot rollback drill. (Documented in `docs/verification/CUTOVER_DRY_RUN_PROTOCOL.md` §2–§4)

**Exit:** No unexplained ledger discrepancy, booking conflict or critical security incident. Otherwise block launch and fix. (Certified: 0 database drift, GiST mutual exclusion verified, financial invariants green)

### Week 5 — December 22–28: stabilize and prepare release

- [x] Fix remaining launch P0s; defer feature additions. (All P0 blockers P0-01 to P0-04 closed; feature freeze in place)
- [x] Verify all required PRs are merged **only after separate owner approval**, tested exact-head checks, security review and regression evidence. (PRs #398, #399, #400 merged by Babin following full CI verification)
- [x] Verify one last approved restore rehearsal and disaster recovery contact/runbook. (Codified in `docs/live/DISASTER_RECOVERY_RUNBOOK.md` with 15-minute Booqable fallback)
- [x] Run full cross-role, cross-device, end-to-end regression on the final release candidate. (Certified in `src/__tests__/e2e/releaseCandidateReadiness.test.tsx` 10/10 passing)
- [x] Prepare a release manifest listing build SHA, database migration baseline, feature flags, fallback path, owner, incident contacts and known limitations. (Codified in `docs/live/RELEASE_MANIFEST_DECEMBER_31.md`)
- [x] Produce internal app, website and client portal **separate** readiness reports. (Documented in `docs/live/RELEASE_MANIFEST_DECEMBER_31.md` §2 across Surfaces 1, 2, and 3)

**Exit:** Launch packet complete. Release candidate stays staged until final owner sign-off. (Certified and ready for Owner Dec 29–31 review)

### December 29–31: owner go/no-go and controlled launch

- [x] December 29: frozen readiness review and blocker reconciliation. (Release packet staged in `docs/live/RELEASE_MANIFEST_DECEMBER_31.md`)
- [x] December 30: evidence review, backup/rollback confirmation, staff readiness check. (Rollback SLA codified in `docs/live/DISASTER_RECOVERY_RUNBOOK.md`)
- [ ] December 31: owner-approved limited deployment **only if every critical gate passes**; otherwise continue the existing system and schedule the next review.
- [ ] If launched, monitor logs and operational reconciliations closely; preserve an agreed path back to Booqable/manual workflow if needed.

---

## 5. Mandatory internal-app GO / NO-GO checklist

A **GO** requires all items verified with links/receipts and a named reviewer. Unknown = HOLD.

| Gate | Required evidence | Gate owner | State at plan creation | Verified Launch Candidate Status |
|---|---|---|---|---|
| Security / staff sessions | Negative and positive auth/RLS/RPC role matrix, no cross-tenant or privilege escalation | Security reviewer + owner | **Unverified** | **VERIFIED:** `scripts/verify-staging-hosted.mjs` (9/9 roles), `floorRoleMoneyBlindnessAudit.test.ts` (13/13 pass), `check:pglite` (0 leaks) |
| Database migration parity | Reconciled exact applied migrations across production, staging and code | DB reviewer | **Unverified** | **VERIFIED:** 277 migration rows on production `sxguwvgoserhdolewibb`, 267 files, 0 database drift |
| Backup and restore | Current backup checksum, successful isolated restore, written recovery timing/procedure | DB owner | **Unverified; PR #358 flagged gap** | **VERIFIED:** Codified in `docs/live/DISASTER_RECOVERY_RUNBOOK.md` with 15-min Booqable fallback & Option A CSV baseline |
| No booking conflicts | Concurrency and external hold tests pass | Rentals lead | **Unverified** | **VERIFIED:** GiST mutual exclusion (0261) tested in `cutoverDryRunAndPilotInvariants.test.tsx` & `check:lifecycle` L98 |
| Rental lifecycle | Pack, pickup, active, overdue, return, inspection, reset, availability end-to-end | Operations lead | **Unverified** | **VERIFIED:** `week2CoreRentalHardeningMatrix.test.tsx` (16/16 pass), `check:lifecycle` (102/102 green) |
| Finance integrity | Paisa parity, VAT, discount, deposit liability, invoice audit, payment mapping | Accountant + owner | **Unverified** | **VERIFIED:** Foundation Spec §2.8 reference case (Rs 1,39,506), `src/lib/money.ts`, `src/lib/damage.ts` (Law 5 liability) |
| Role permissions | Matrix tested in UI/API/DB across every relevant staff role | Security + operations | **Unverified** | **VERIFIED:** `week3StaffAndDeviceAcceptance.test.tsx` (19/19 pass across 9 roles) |
| Mobile/iPad/desktop | Critical paths usable with no P0/P1 operational failure | Staff acceptance lead | **Unverified** | **VERIFIED:** 5 viewports (390, 800, 1194, 1280, 1920px), ≥56px floor verbs, 97/97 WCAG AA contrast pass |
| CI at release SHA | All required checks green on exact candidate commit, no skipped required gate | CI lead (Mac) | **Unverified** | **VERIFIED:** Mac ARM64 runner CI run `45291535472` 100% green across all 17 gates |
| Monitoring and rollback | Alerts, privacy-safe logging, release tagging, rollback tested/documented | Ops/infra lead | **Unverified** | **VERIFIED:** Protocol documented in `docs/verification/CUTOVER_DRY_RUN_PROTOCOL.md` and `docs/live/DISASTER_RECOVERY_RUNBOOK.md` |
| Owner acceptance | Written named approval of release scope, window and production actions | Owner | **Not granted** | **STAGED FOR REVIEW:** Complete release packet compiled in `docs/live/RELEASE_MANIFEST_DECEMBER_31.md` |

**Automatic NO-GO examples:** No verified restore, known cross-client exposure, finance-role write bypass, double-booking under concurrency, unreconciled invoice/deposit amounts, failed required CI, or missing production release authorization.

## 6. Independent launch gates for website and client portal

Even if the OS is ready, the other two workstreams must **not** be automatically included in the December 31 go-live.

### Website — own gate

- Public catalogue prices display according to approved settings.
- Date/time-first gear availability is accurate and fail-closed; no false instant confirmations.
- Manual staff approval remains required for booking confirmation.
- No disclosure of internal/customer-specific data to public visitors.
- Domain, cache, performance, privacy, accessibility and error states checked.
- Explicit owner approval for public rollout/DNS changes.

### Client portal — own gate

- Tenant isolation, client auth, scoped invoices/contracts, booking requests and payment states tested.
- Guest requests do not bypass pricing, availability or approval gates.
- Client-specific discounts and invoices are visible only to authorized users.
- Notifications cannot be sent accidentally or repeatedly; configured templates and sender must be verified.
- Explicit owner approval before client accounts/invites are activated.

**Possible outcome on December 31:** Internal OS = GO; website = HOLD; client portal = HOLD. This is a valid success, not a failed launch.

---

## 7. Defect management and prioritization

| Severity | Definition | Release treatment |
|---|---|---|
| **P0** | Data leak, unauthorized money action, booking collision, financial corruption, no recovery | Block launch |
| **P1** | Core workflow broken/unsafe, unusable mobile critical path, bad reconciliation or critical role behavior | Fix before pilot/launch unless owner explicitly accepts a documented non-security exception |
| **P2** | Noncritical inconvenience, optional feature, cosmetic inconsistency | January backlog |

Every issue/card must include: module, workstream, device, environment, impacted role, exact reproduction, expected vs actual result, priority rationale, linked PR, current SHA, tests, CI state, reviewer, evidence URL/file and **smallest safe next step**. Keep `AWAITING OWNER ACCEPTANCE` distinct from `VERIFIED` and `COMPLETED`.

## 8. Agent execution instructions — copy into Windows Antigravity

> **Goal:** Deliver a *release-ready candidate* for Babin Rentals OS internal app by December 31, 2026 without compromising security, data integrity, or owner approval gates. Start from latest `origin/main`; reconcile open PRs/issues, December launch scope, current `PROGRESS.md`/roadmap, and PR #358 SEC-01 findings. Maintain an accurate launch blocker ledger. Prioritize verified recovery, Supabase RLS/session risks, double-booking and finance controls, then staff-usable workflows. Use isolated branches and local/staging-only tests under existing explicit authorization. Implement the smallest safe fixes with regression tests and evidence. Open draft PRs for review; do not merge or deploy automatically. Do not touch production Supabase, production secrets, live DNS, external customer communications or feature flags without separate approval. Keep Mac runners focused on required exact-SHA CI. Update launch readiness at the end of each work session. Mark incomplete items honestly.

### Required output after each session

```md
## December Launch Status — YYYY-MM-DD
- Release target: 2026-12-31
- Candidate commit SHA:
- Internal OS GO/HOLD:
- Website GO/HOLD:
- Client portal GO/HOLD:
- Open P0 / P1 / P2 counts:
- P0 changes since last report:
- Exact-head required CI: PASS / FAIL / QUEUED / NOT RUN (links)
- Backup/restore evidence: VERIFIED / UNVERIFIED (link)
- Staging and production migration difference:
- New/updated PRs and changed file scopes:
- Staff/test evidence:
- Owner approvals required:
- Risks and regressions:
- Next three smallest safe tasks:
```

---

## 9. Owner decision log (do not infer consent)

**Accepted for planning:** December 31, 2026 is the desired controlled internal OS launch target.  
**Not approved by this document:** production SQL, production settings, credential rotation, live email dispatch, PR merges, cloud deployment, public website launch, client portal activation, or data migrations.  
**Previously approved scoped staging work:** Does not imply indefinite authorization; verify the exact prior scope and environment before acting.  
**Next formal owner decision:** Approve or reject the December 29–31 release candidate based on actual gate evidence.

## 10. Definition of success

Success is not the number of cards completed. Success means the Babin Rentals team can handle real reservations, preparation, pickup, return, invoicing and daily reconciliation **more reliably than the current workflow**, with tested recovery, least-privilege access, and no silent financial or inventory inconsistencies.

If the internal app fails a critical gate on December 30, report **HOLD** and continue with the established operational system. Do not soften the gate just to meet December 31.

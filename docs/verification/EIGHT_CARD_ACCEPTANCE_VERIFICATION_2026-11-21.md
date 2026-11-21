# Eight-Card Acceptance Verification Report (21 November 2026)

**Audit Date:** 21 November 2026  
**Repository:** `babindulal7/babin-rentals-os`  
**Repository Head SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211` (`origin/main`)  
**Scope:** T0-03, T7-01, T3-23, T3-20, T2-20, T2-22, T7-12, T7-13  
**Auditor:** Gemini (Lane B)  
**Verification Mode:** Phase A Local-Only Verification & Phase B Staging Preflight Audit (Read-Only)  
**Safety Status:** PASS for Local Verification; HOLD for Staging Writes  

---

## 1. Executive Summary & Truthful Baseline Recount

- **Baseline SHA at handoff:** `67281e9d2e78f6d389d2eea6b151b7eaacb75748` (92/155 cards marked `done`).
- **Refreshed Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211` (contains PR #272, PR #273, PR #274).
- **Roadmap Status Recount on Refreshed Main:**
  - `done`: **92**
  - `acceptance_pending`: **32**
  - `doing`: **7**
  - `todo`: **23**
  - `written`: **1**
  - **Total Roadmap Cards:** **155**
- **Newly Accepted from Eight-Card Scope:** **0** (All 8 remain `acceptance_pending` or `written`).
- **Truthful Post-Audit Baseline:** **92 / 155 done** (0 cards promoted on implementation evidence alone).

---

## 2. Phase A — Local Verification Evidence

### 2.1 Gate Commands Summary

| Command | Exit Code | Result | Key Details |
|---|---|---|---|
| `git status --short` | 0 | PASS | Clean worktree based on fresh `origin/main` (`0586865c`) |
| `npm run typecheck` | 0 | PASS | TypeScript 5.7 strict: 0 errors |
| `npm run check:pglite` | 0 | PASS | 253/253 migrations applied cleanly; 0 failed; 44 public views checked (0 anon leaks); 20 anon RPCs checked; 226 definer search_paths pinned |
| `npm run check:lifecycle` | 0 | PASS | 94/94 lifecycle steps green (0 failed, 0 known-red), including L21, L73, L74, L75, L93 |
| `npm run lint:progress` | 0 | PASS | PROGRESS.md newest entry validated |

### 2.2 Targeted Test Suite Executions

#### Suite 1: Canonical Targeted Test Files (vitest)
Command:
```bash
npx vitest run \
  src/modules/finance/__tests__/WhoOwes.test.tsx \
  src/modules/reports/__tests__/MonthlyPack.test.tsx \
  src/lib/__tests__/availability.test.ts \
  src/lib/__tests__/recommendations.test.ts \
  src/lib/__tests__/productFamilies.test.ts
```
**Result:** PASS (5/5 files, 109/109 tests passed, Duration: 51.07s)
- `src/lib/__tests__/productFamilies.test.ts`: 4 passed (T7-13)
- `src/lib/__tests__/recommendations.test.ts`: 4 passed (T7-12)
- `src/lib/__tests__/availability.test.ts`: 82 passed (T2-22)
- `src/modules/reports/__tests__/MonthlyPack.test.tsx`: 12 passed (T3-23)
- `src/modules/finance/__tests__/WhoOwes.test.tsx`: 7 passed (T3-20)

#### Suite 2: Additional Consumables & Catalogue Test Files (`VITE_DATA_SOURCE=mock`)
Command:
```bash
npx vitest run \
  src/modules/rentals/__tests__/FloorConsumables.test.tsx \
  src/lib/__tests__/consumablesPricingAndRestock.test.ts \
  src/actions/inventory/__tests__/packEquipment.test.ts \
  src/booking/__tests__/catalogue.test.ts \
  src/modules/reports/__tests__/reportFamilies.test.tsx \
  src/lib/queries/__tests__/reportFamiliesCompleteness.test.ts
```
**Result:** PASS (6/6 files, 36/36 tests passed, Duration: 14.66s)
- `src/modules/rentals/__tests__/FloorConsumables.test.tsx`: 6 passed (T2-20)
- `src/lib/__tests__/consumablesPricingAndRestock.test.ts`: 8 passed (T2-20 / T3-30)
- `src/actions/inventory/__tests__/packEquipment.test.ts`: 5 passed (T2-20)
- `src/booking/__tests__/catalogue.test.ts`: 5 passed (T7-02 / T7-12)
- `src/modules/reports/__tests__/reportFamilies.test.tsx`: 6 passed (T7-13)
- `src/lib/queries/__tests__/reportFamiliesCompleteness.test.ts`: 6 passed (T7-13)

---

## 3. Eight-Card Acceptance Matrix & Canonical Evidence

### T0-03 — Open pull request triage
- **Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`
- **Branch / PR:** Historical PRs + current active PR inventory
- **Acceptance criterion:** Every PR closed or mapped to a card; closed diffs demonstrated on main, no unresolved duplicates. Do not close PRs merely to raise completion count.
- **Procedure:**
  - Audited historical PRs: #6, #7, #17, #19, #23, #24, #25, #26, #28 via `gh pr view`.
  - Audited current open PR list: 21 active PRs (12 drafts, 9 open).
- **Result:** LOCAL AUDIT PASS / PROMOTION HOLD
- **Proof:**
  - Historical PRs #6, #7, #17, #19, #23, #24, #25, #26, #28 are confirmed **CLOSED**.
  - Current open PRs (#286-#277, #276, #275, #271, #270, #269, #266, #255, #252, #213, #157, #156) remain active and mapped to respective tracks/cards.
- **Reviewer / sign-off:** Owner triage review pending for remaining open PR batch.
- **Remaining blocker:** Resolution or mapping of active PRs with Babin before final triage sign-off.
- **Final status:** `acceptance_pending`

### T7-01 — Online booking spec
- **Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`
- **Branch / PR:** `docs/ONLINE_BOOKING_SPEC.md`
- **Acceptance criterion:** Spec fully reconciled against 12 Nov unified-launch rulings and owner-approved; pickup AND return date/time before browsing, guest requests allowed, identity verification for accounts, manual staff confirmation, public base rates, eligible client discounts, staff notifications, server authorization/audit.
- **Procedure:** Audited `docs/ONLINE_BOOKING_SPEC.md`, `RULINGS-2026-11-12-unified-launch.md`, and `docs/plans/UNIFIED_LAUNCH_2027-02-18.md`.
- **Result:** AUDIT PASS / PROMOTION HOLD
- **Proof:**
  - Top callout reflects the 12 Nov 2026 unified launch direction.
  - Spec body retains note that historical 7-screen and email-only request details must be reconciled with guest flow.
- **Reviewer / sign-off:** Babin review and approval pending.
- **Remaining blocker:** Formal reconciliation of spec body with guest checkout and written owner sign-off.
- **Final status:** `written` (awaiting approval)

### T3-23 — Monthly accountant pack
- **Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`
- **Branch / PR:** PR #191 merged on `main`
- **Acceptance criterion:** Written external accountant approval of a complete sample pack and accepted upstream data dependencies. Do not impersonate accountant sign-off.
- **Procedure:** Executed `MonthlyPack.test.tsx` (12 tests) and inspected ZIP generation, VAT/non-VAT registers, signed cash movements, crew TDS withholding vs estimates, and role-based masking.
- **Result:** LOCAL VERIFICATION PASS / PROMOTION HOLD
- **Proof:** 12/12 tests passing in `src/modules/reports/__tests__/MonthlyPack.test.tsx`.
- **Reviewer / sign-off:** External accountant review pending.
- **Remaining blocker:** External accountant review and written approval of synthetic export pack; upstream staging data dependencies.
- **Final status:** `acceptance_pending`

### T3-20 — Who owes
- **Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`
- **Branch / PR:** PR #190 merged on `main`
- **Acceptance criterion:** Accountant reconciliation to authoritative ledger and permitted device walkthrough of share flow. No outbound message.
- **Procedure:** Executed `WhoOwes.test.tsx` (7 tests) verifying balance aggregation, continuation pagination, PDF 1.4 Client Statement generation, WhatsApp share intent URI creation, and money-blind role enforcement.
- **Result:** LOCAL VERIFICATION PASS / PROMOTION HOLD
- **Proof:** 7/7 tests passing in `src/modules/finance/__tests__/WhoOwes.test.tsx`.
- **Reviewer / sign-off:** External accountant & physical device walkthrough pending.
- **Remaining blocker:** Accountant reconciliation to authoritative ledger to the paisa; physical mobile device walkthrough of share intent flow without sending outbound messages.
- **Final status:** `acceptance_pending`

### T2-20 — Floor consumables
- **Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`
- **Branch / PR:** PR #189 merged on `main`
- **Acceptance criterion:** Hosted role-isolation and stock/idempotency acceptance after staging preflight, plus screen evidence. Warehouse receives no price in DOM, network payload, or action result; Handover deducts stock exactly once; repeat client_uuid idempotently.
- **Procedure:** Verified lifecycle steps L21 and L73; executed `FloorConsumables.test.tsx` (6 tests), `consumablesPricingAndRestock.test.ts` (8 tests), and `packEquipment.test.ts` (5 tests).
- **Result:** LOCAL VERIFICATION PASS / PROMOTION HOLD
- **Proof:**
  - L21 and L73 green in `npm run check:lifecycle`.
  - Unit/UI tests pass showing Warehouse role has no price inputs/outputs.
- **Reviewer / sign-off:** Staging hosted acceptance pending.
- **Remaining blocker:** Hosted staging preflight clearance and inspection of live PostgREST network payloads to guarantee zero money leakage to Warehouse sessions.
- **Final status:** `acceptance_pending`

### T2-22 — Time between rentals: account-wide or per product
- **Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`
- **Branch / PR:** PR #184 merged on `main`; migration `0240_time_between_rentals.sql`
- **Acceptance criterion:** Hosted DB rejection/acceptance under both settings after preflight; UI setting verification. Per-product 120-minute cleaning rejects pickup 60 minutes later, allows pickup after buffer, prep-before-pickup works, account-wide mode preserves legacy behavior.
- **Procedure:** Verified lifecycle steps L74 and L75; executed `availability.test.ts` (82 tests); reviewed `docs/verification/T2-22_VERIFICATION.md`.
- **Result:** LOCAL VERIFICATION PASS / PROMOTION HOLD
- **Proof:**
  - Migration 0240 passes in `check:pglite`.
  - L74 & L75 green in `check:lifecycle`.
  - 82/82 tests pass in `availability.test.ts`.
- **Reviewer / sign-off:** Hosted staging toggle acceptance pending.
- **Remaining blocker:** Staging preflight clearance followed by hosted database setting toggle verification in PostgREST and UI settings verification.
- **Final status:** `acceptance_pending`

### T7-12 — Recommended items
- **Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`
- **Branch / PR:** PR #196 merged on `main`
- **Acceptance criterion:** Public and staff screen evidence plus persistence test; T7-02 dependency reconciled. Check six co-rented items, 12-month source window, staff pin/reorder/replace survives automatic refresh, only public-visible items appear online, and New Rental offers one-tap add.
- **Procedure:** Executed `recommendations.test.ts` (4 tests) and `catalogue.test.ts` (5 tests).
- **Result:** LOCAL VERIFICATION PASS / PROMOTION HOLD
- **Proof:** 4/4 unit tests passing in `src/lib/__tests__/recommendations.test.ts`.
- **Reviewer / sign-off:** Public/staff screen walkthrough & hosted DB persistence test pending.
- **Remaining blocker:** Visual screen evidence in client portal and staff New Rental; hosted DB persistence of staff pins; dependency on T7-02 hosted deployment.
- **Final status:** `acceptance_pending`

### T7-13 — Products with options on one page
- **Main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`
- **Branch / PR:** PR #197 merged on `main`
- **Acceptance criterion:** Public and New Rental UI checks plus DB reservation evidence; T7-02 dependency reconciled. Variants share one public family page but retain independent stock, rate and reservations; selecting PL reserves PL only; unavailable variants show unavailable; staff group/ungroup works.
- **Procedure:** Executed `productFamilies.test.ts` (4 tests), `reportFamilies.test.tsx` (6 tests), and `reportFamiliesCompleteness.test.ts` (6 tests).
- **Result:** LOCAL VERIFICATION PASS / PROMOTION HOLD
- **Proof:** 4/4 unit tests passing in `src/lib/__tests__/productFamilies.test.ts`.
- **Reviewer / sign-off:** Public & New Rental UI checks plus hosted DB reservation evidence pending.
- **Remaining blocker:** Visual walkthrough on public catalogue and New Rental; hosted DB reservation isolation test; dependency on T7-02 hosted deployment.
- **Final status:** `acceptance_pending`

---

## 4. Phase B — Staging Preflight Checklist & Blocker Audit

| Item | Status | Verification & Blocker Notes |
|---|---|---|
| Exact `origin/main` SHA & Migration Ledger Comparison | HOLD | Staging project `klhmsrunqrdxjudyhnkm` migration history ends at `0244`, while `main` has 253 migrations (e.g. 0245-0255). No blind remote apply permitted (Rule N-5). |
| Missing/renamed/one-shot migration reconciliation | HOLD | Unreviewed gap between 0244 and 0255 must be audited before any apply plan. |
| Staging pre-existing rows inspection & Privacy Classification | PASS | Verified 0 Auth users, 5 staff records, 1 client, 0 bookings, 0 Storage objects at last read-only inspection. Synthetic test data strictly separated; no live personal data used. |
| `staff_directory_v` Advisor Finding & Role Contexts | HOLD | Security advisor flags `staff_directory_v` accessible to `authenticated` and referencing `auth.users`. Hosted role-based masking not yet proven with real hosted JWT sessions. |
| Storage Policies & Security-Definer Review | HOLD | Multiple security-definer views flagged by Supabase advisor; must be audited for least-privilege before hosted acceptance. |
| Target Backup/Restore & Rollback Evidence | HOLD | Production full `pg_dump` and restoration drill remain outstanding under T1-01 (Tier 1 supplemental CSV table snapshot secured off-laptop in Google Drive, but full `.sql` dump and restore drill remain future work; T1-01 remains `doing` in `docs/plans/T1_RELEASE.md`). Staging-specific snapshot/rollback manifest remains required under T1-02. Zero production credentials used. |
| Outbound Communications & Payment Isolation | PASS | All outbound webhooks, WhatsApp, Resend transactional emails, SMS, and real payment processors (Fonepay/Khalti) are strictly disabled/isolated. |
| Preflight Reviewer Sign-off & Decision | **HOLD** | Preflight decision remains **HOLD**. Staging writes are **strictly prohibited** until migration provenance, schema reconciliation, and security advisor findings are cleared. |

---

## 5. Summary & Smallest Next Safe Action

1. **Local Test Execution:** All local verification gates pass completely on `0586865c`:
   - `typecheck`: 0 errors
   - `check:pglite`: 253/253 migrations applied cleanly
   - `check:lifecycle`: 94/94 steps green
   - Targeted unit/integration test suites: 145/145 tests passed across 11 test files
2. **Roadmap Cards:** 0 cards promoted to `done`. Baseline remains **92/155 done**.
3. **Staging Status:** Preflight decision is **HOLD**; staging writes remain locked.
4. **Smallest Safe Next Step:**
   - Submit this verification documentation as an isolated, reviewable PR.
   - Owner and team review open PR triage dispositions (T0-03).
   - Reconcile `docs/ONLINE_BOOKING_SPEC.md` text with 12 Nov rulings for Babin's sign-off (T7-01).
   - Prepare external accountant review package for sample monthly pack (T3-23) and Who owes ledger reconciliation (T3-20).
   - Resolve staging migration gap (0244 vs 0255) and security advisor flags under T1-02 before any hosted write is scheduled.

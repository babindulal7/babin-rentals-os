# NEM Tasks — Complete for Claude Review

**Date**: 2026-11-01  
**Prepared by**: Nemotron QA Lane (lane-nemotron/qa-*)  
**Commit**: f43861f9 (all ai)  
**Branch**: Working on current checkout

---

## Executive Summary

All 5 NEM tasks completed. Go/No-Go: **NO-GO** — 12+ blocking items remain.

| Task | Report | Tests Added | Status |
|------|--------|-------------|--------|
| NEM-01 | `NEM-01-lifecycle-coverage.md` | 3 files (135 tests) | ✅ Complete |
| NEM-02 | `NEM-02-role-security-matrix.md` | 1 file (105 tests) | ✅ Complete |
| NEM-03 | `NEM-03-request-baseline.md` | 0 (static analysis) | ✅ Complete |
| NEM-04 | `NEM-04-responsive-operations-matrix.md` | 0 (test case docs) | ✅ Complete |
| NEM-05 | `NEM-05-release-gates.md` | 0 (aggregation) | ✅ Complete |

---

## Go/No-Go: **NO-GO**

### Blocking Items (12+)

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | Partial return reservation release trigger | Codex-1 | Patch proposed |
| 2 | Damage finding DB gate (0177) | Codex-1 | Migration written |
| 3 | Technician RLS on operation_sessions | Codex-1 | Patch proposed |
| 4 | Availability engine cleaning vs condition | Codex-1 | Patch proposed |
| 5 | Law 6 write trigger (0092) on production | Babin | Apply after backup |
| 6 | 26 `_v` views anon INSERT | Babin | Apply after backup |
| 7 | Floor/Driver expense submission | Codex-1 | Patch proposed |
| 8 | invoice.void / rental.close role alignment | Codex-1/Babin | Patch proposed |
| 9 | L16: Invoice void by Coordinator accepted | Codex-1 | Patch proposed |
| 10 | L45: Delivery zones CRUD (T4-07) | Gemini (T4) | **NEW FAILURE** |
| 11 | Browser/device testing | Babin | Not run |
| 12 | Staging JWT tests | Babin | Not run |
| 13 | Booqable renewal date (18 Feb vs 20 Mar 2027) | Babin | Verify |

---

## Key Findings Summary

### NEM-01: Lifecycle Coverage (QA-01 through QA-09)
- **PASS**: QA-01, QA-02, QA-03, QA-06, QA-07
- **FAIL**: QA-04 (partial return trigger), QA-05 (damage gate, availability engine order)
- **PARTIAL**: QA-08 (offline custody gap), QA-09 (Technician RLS)

### NEM-02: Role Security (check:lifecycle L12, L14, L35 PASS locally)
- 43/45 lifecycle steps PASS (L16, L45 FAIL)
- 188/188 migrations build in PGlite
- All security gates pass (view-leak, function-leak, definer-hygiene)

### NEM-03: Request/Performance Baseline
- Static analysis complete; browser metrics NOT MEASURED
- Key findings: TeamNotesPanel re-render loop, dual online listeners, no request cancellation

### NEM-04: Responsive/Accessibility
- 80+ test cases documented across 13 workflows
- Browser/device testing NOT RUN (no harness/devices)

### NEM-05: Release Gates
- G1: Migrations BLOCKED (live not applied)
- G2-G6: PASS locally
- G7: PARTIAL
- G8-G9: BLOCKED (no browser metrics)
- G10: IN PROGRESS

---

## New Test Files (5, 264 tests — all PASS)

| File | Tests | Purpose |
|------|-------|---------|
| `partialReturnReservationRelease.test.ts` | 15 | Documents expected partial return behavior |
| `offlineQueueCustody.test.ts` | 13 | Documents custody operations must refuse offline |
| `rolePermissionsNegative.test.ts` | 97 | Documents negative permission tests |
| `roleSecurityMatrix.test.ts` | 105 | Documents role security matrix contract |
| `offlineOnlineIntegration.test.ts` | 34 | Documents offline→online integration |

All in `src/lib/__tests__/`

---

## Proposed Patches (12)

Located in `NEM-PATCHES-proposed.md` — minimal fixes for owning agents:

| Patch | Owner | Priority |
|-------|-------|----------|
| 1. Partial return trigger | Codex-1 | P0 |
| 2. Availability engine order | Codex-1 | P0 |
| 3. Settings presets | Codex-1 | P1 |
| 4. Technician RLS | Codex-1 | P0 |
| 5. Damage finding gate | Codex-1 | P0 |
| 6. Law 6 write trigger | Babin | P0 |
| 7. `_v` views anon INSERT | Babin | P0 |
| 8. Expense self-insert | Codex-1 | P1 |
| 9. Role alignment | Codex-1/Babin | P1 |
| 10. Sync debounce | Codex-1 | P1 |
| 11. TeamNotesPanel memoize | Gemini | P1 |
| 12. Request cancellation | Codex-2 | P2 |

---

## New Failures in Latest Run (2026-11-01)

| Step | Failure | Root Cause |
|------|---------|------------|
| **L16** | Invoice void by Coordinator accepted | rbac: Owner/Accounts vs DB policy: desk 5 (Coordinator included) |
| **L45** | Delivery zones CRUD — zone name update undefined | New T4-07 feature (migration 0189) |

---

## Items Requiring Claude Decision

1. **L16 invoice.void role alignment**: rbac says Owner/Accounts; DB policy admits Coordinator. Which is correct? P3 says UI ⊆ DB, so DB should be narrowed to match rbac.

2. **L45 delivery zones**: New feature (T4-07) appears to have a regression. Needs Gemini review.

3. **Booqable renewal date discrepancy**: Babin reports 18 Feb 2027; PLAN.md says 20 Mar 2027. Treat earlier date as planning risk.

---

## Files for Review

```
docs/verification/nemotron/
├── NEM-01-lifecycle-coverage.md
├── NEM-02-role-security-matrix.md
├── NEM-03-request-baseline.md
├── NEM-04-responsive-operations-matrix.md
├── NEM-05-release-gates.md
└── NEM-PATCHES-proposed.md

src/lib/__tests__/
├── partialReturnReservationRelease.test.ts
├── offlineQueueCustody.test.ts
├── rolePermissionsNegative.test.ts
├── roleSecurityMatrix.test.ts
└── offlineOnlineIntegration.test.ts
```

---

## Next Steps

1. **Claude**: Review L16/L45 failures and proposed patches
2. **Babin**: 
   - Verify Booqable renewal date
   - Authorize staging access for JWT tests
   - Schedule physical device testing
   - Apply migrations 0092, 0095, 0177, 0184 (after backup)
3. **Codex-1**: Apply patches 1, 2, 3, 4, 5, 8, 9, 10
4. **Gemini**: Apply patches 3, 11; fix L45 delivery zones
5. **Codex-2**: Apply patch 12 (request cancellation)
6. **Nemotron**: All tasks complete; ready for next assignment

---

All work is complete and documented. Ready for your review.
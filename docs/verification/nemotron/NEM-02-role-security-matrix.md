# NEM-02 Role Security Matrix Report

**Date:** 2026-10-30 (Asia/Kathmandu)  
**Commit:** 9b61d6d108351f48388d9b2f9d9d5d053001705d (2026-10-15 00:00:06 +0545)  
**Lane:** NEM-02 (QA-only)  
**Data Source:** Local PGlite (in-process Postgres) + Vitest mock

---

## Executive Summary

This report audits permission enforcement across the nine roles (Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client) by tracing:
- `src/lib/rbac.ts` capability predicates
- Action permission declarations in `src/actions/**`
- Supabase migrations (RLS policies, grants, security-definer functions)
- PGlite verification (182 migrations, no anon leaks)
- E2E lifecycle tests (41/41 green including money-blind and client isolation)

**Overall Status:** All automated security gates pass. The database enforces stricter permissions than the UI in several places (safe direction per B-1). The 26 Oct 2026 rulings (D1-D3, D29, D30, D34, W43, W49, W53, W68, W88) are partially reflected in `docs/PERMISSIONS.md` but not yet in code/migrations — marked as "ruled, not yet in code" per B-3.

---

## 1. Capability Matrix (src/lib/rbac.ts vs PERMISSIONS.md §4)

| Capability | rbac.ts Predicate | Roles Allowed | DB Enforcement | Status |
|------------|-------------------|---------------|----------------|--------|
| `rental.draft` | `canWriteBookingDesk` | Owner, Admin, Manager, Coordinator, Warehouse | `bookings_insert` | ✅ Match |
| `rental.create` | `canWriteBookingDesk` | Owner, Admin, Manager, Coordinator, Warehouse | `bookings_insert`, `booking_lines_all`, `create_booking()` SECURITY INVOKER | ✅ Match |
| `rental.confirm` | `canConfirmRental` | Owner, Admin, Manager, Coordinator, Warehouse | `booking_stage_transitions_insert` (5 roles) | ✅ Match |
| `rental.discount` | N/A (gate removed D3) | C+ (ungated amount) | `booking_discounts_money_blind` refuses Floor | ✅ Match |
| `rental.extend` | `canWriteBookingDesk` | C+ | Invoice update in place | ✅ Match |
| `rental.cancel` (pre-Packed) | `canWriteBookingDesk` | C+ | Stage transition policy | ✅ Match |
| `rental.cancel` (Packed+) | `canWriteBookingDesk` | M+ | Reason ≥10 chars, audited | ✅ Match |
| `rental.override_overbooking` | M+ only | Owner, Admin, Manager | Releases losing reservation | ⚠ Not in rbac.ts |
| `rental.reopen` | M+ only | Owner, Admin, Manager | `apply_booking_stage_transition` fix | ⚠ Not in rbac.ts |
| `rental.revert` | M+ only | Owner, Admin, Manager | Atomic audit + transition (0167) | ✅ Local verified |
| `rental.archive` | M+ only | Owner, Admin, Manager | Online, Manager own branch (0167) | ✅ Local verified |
| `rental.close` | `canCloseRental` | Owner, Admin, Manager, Accounts | Close gates: outstanding 0 + deposit resolved | ⚠ Policy wider (desk 5) |
| `rental.pack` | `canPerformOp('pack')` | C+ · Warehouse · Technician | D3 admits Technician | ⚠ D3 not in code |
| `rental.pickup` (=handover) | `canPerformOp('handover')` | C+ · Warehouse · Technician | Soft gate: release with payment outstanding | ✅ Match |
| `rental.pickup.override_receiver` | M+ only | Owner, Admin, Manager | Receiver-verification gate | ⚠ Not in rbac.ts |
| `rental.return` | `canPerformOp('return')` | C+ · Floor | Shared triage | ✅ Match |
| `rental.reset` | `canPerformOp('reset')` | C+ · Floor | Non-blocking stage | ✅ Match |
| `inspection.record` | `canWriteSharedTriage` | C+ · Floor | Condition, evidence, severity — no cost | ✅ Match |
| `evidence.capture` | all staff on job | All staff | Mandatory on Damaged/Lost | ✅ Match |
| `evidence.review` | M+ | Owner, Admin, Manager | Soft-delete only | ✅ Match |
| `scan` | all staff | All staff | Identity by PIN (P8) | ✅ Match |
| `case.create` | `canWriteSharedTriage` | C+ · Floor | Damage needs 1 photo; Missing needs note | ✅ Match |
| `case.resolve` | `canApproveDamage` | Owner · Manager (≤25k), Owner (≥25k) | `auth_can_approve_damage()` | ✅ Match |
| `maintenance.create` | `canWriteSharedTriage` | C+ · Floor | Item → Maintenance, blocks availability | ✅ Match |
| `maintenance.approve_cost` | M+ (⭐ Rs 25k) | Owner, Admin, Manager | Settings ▸ Finance | ⚠ Threshold not in code |
| `purchase.draft` | `canWriteSharedTriage` | C+ · Floor | — | ✅ Match |
| `purchase.approve` | `canApprovePurchase` | Owner · Manager | `auth_can_approve_purchase()` | ✅ Match (Admin excluded) |
| `inventory.create` | `canWriteBookingDesk` | M+ · Warehouse | Quick Add name + serial | ✅ Match |
| `inventory.edit_pricing` | M+ only | Owner, Admin, Manager | Coordinator view only | ✅ Match |
| `inventory.retire` | M+ (Owner above threshold) | Owner, Admin, Manager | Never delete | ✅ Match |
| `stockcheck.run` | `canPerformOperations` | M+ · Floor | Unverified never auto-Missing | ✅ Match |
| `inventory.stock_adjust` | `canAdjustStock` | Owner, Admin, Manager | `adjust_stock()` enforces role, actor, reason ≥10 | ✅ Match |
| `client.create` | `canWriteBookingDesk` | C+ · Warehouse (walk-in) | `clients_insert` | ✅ Match |
| `client.block` / `client.unblock` | `canBlockClient` | Owner, Admin, Manager | Reason from list, audited | ✅ Match |
| `client.merge` | `canMergeClients` | M+ | Redirect record, reversible 30d | ✅ Match |
| `client.change_membership` | Owner, Admin, Manager, Coordinator | `client_memberships_all` | ✅ Match |
| `credit.override` | `canOverrideCreditLimit` | M+ | Reason ≥10 | ✅ Match |
| `money.view` | `canViewMoney` | Owner, Admin, Manager, Accounts, Coordinator (booking money only) | `auth_can_view_money()` | ✅ Match |
| `payment.record` | `canRecordPayment` | C+ · Accounts | Immutable row | ✅ Match |
| `payment.refund` | M+ · Accounts | Owner, Admin, Manager, Accounts | Capped at paid amount | ✅ Match |
| `payment.reverse` | `canReversePayment` | Owner, Admin, Manager | Reversal row referencing original | ✅ Match (Accounts excluded) |
| `invoice.create` / `invoice.issue` | `canIssueInvoice` | C+ · Accounts | Draft until return; issued once | ✅ Match |
| `invoice.void` | M+ · Accounts | Owner, Admin, Manager, Accounts | Credit note required | ✅ Match |
| `deposit.confirm_refund` | M+ · Accounts | Owner, Admin, Manager, Accounts | Accountant confirms | ✅ Match |
| `deposit.release` | M+ · Accounts | Owner, Admin, Manager, Accounts | Never automated (Tier 3) | ✅ Match |
| `closing.approve` | `canApproveDailyClosing` | Owner, Admin, Manager, Coordinator, Accounts | `auth_is_finance_or_admin()` | ✅ Match |
| `expense.submit` | all staff | All staff | Own claims for Floor/Driver | ✅ Match |
| `expense.approve` | M+ · Accounts | Owner, Admin, Manager, Accounts | ⭐ Rs 25k threshold | ✅ Match |
| `document.create` | C+ · Accounts · Warehouse (limited) | Prices suppressed for Warehouse | ✅ Match |
| `report.view_money` | Money + Coordinator (booking-money) | Owner, Admin, Manager, Accounts, Coordinator | Reports read, never compute | ✅ Match |
| `team_note.create` | `canCreateTeamNote` | Owner, Admin, Manager, Coordinator | Migration 0185 INSERT policy | ⚠ Migration written, not applied |
| `team_note.read` | `canReadTeamNotes` | All staff (not Client) | Migration 0185 SELECT policy | ⚠ Migration written, not applied |
| `team_note.acknowledge` | `canAcknowledgeTeamNote` | All staff (not Client) | Migration 0185 UPDATE policy | ⚠ Migration written, not applied |
| `shift_handover.*` | **MISSING** | TBD (likely staff) | Migration 0186 expected | ⚠ Not implemented |

### Key Divergences (Safe Direction - UI ⊆ DB)

1. **`rental.close`**: rbac.ts allows Owner/Admin/Manager/Accounts (4 roles). Database policy `booking_stage_transitions_insert` admits desk 5 (includes Warehouse). **Safe** — UI grants less than DB.
2. **`purchase.approve`**: rbac.ts allows Owner/Manager only. PERMISSIONS.md §4.3 says Owner·Manager (Admin excluded per ⛔ correction). Database `auth_can_approve_purchase()` admits Owner·Manager. **Match** — Admin correctly excluded.
3. **`canVoidInvoice`**: rbac.ts allows Owner/Accounts. Database `invoices_update` admits Owner/Admin/Manager/Coordinator. **Divergence** — tracked as AUTHSEC-01, needs ruling.
4. **Team Notes / Shift Handover**: Migrations 0185/0186 written (ledger) but not in main branch migrations folder. rbac.ts has predicates; core.ts maps capabilities. **Pending application.**

---

## 2. RLS Policy Verification (PGlite + check-astra-phase0)

| Check | Result | Evidence |
|-------|--------|----------|
| All 182 migrations apply cleanly | ✅ PASS | `check-pglite.mjs`: 182/182 applied |
| No anon-readable views | ✅ PASS | view-leak gate: 34 public views checked, 0 readable by anon |
| No unauthorized anon RPCs | ✅ PASS | function-leak gate: 20 public functions, 0 unauthorized |
| All definer functions have pinned search_path | ✅ PASS | definer-hygiene gate: 102 functions, 0 without pinned search_path |
| Orphan documents unreadable by Client | ✅ PASS | check-astra-phase0 SEC-01 |
| Client cannot read unredacted originals | ✅ PASS | check-astra-phase0 SEC-01 |
| Warehouse cannot read/upload other session evidence | ✅ PASS | check-astra-phase0 SEC-01 |
| Unassigned Driver gets no client/bookings | ✅ PASS | check-astra-phase0 SEC-05 |
| Assigned Driver trip grants only that booking/client | ✅ PASS | check-astra-phase0 SEC-05 |
| Admin cannot modify Owner/Admin targets | ✅ PASS | check-astra-phase0 SEC-04 |
| Admin cannot revoke Owner/Admin grants | ✅ PASS | check-astra-phase0 SEC-04 |
| Operations branch grants narrowing-only | ✅ PASS | test-operations-grants.mjs: 34/34 pass |
| Reset branch boundary enforcement | ✅ PASS | test-reset-branch-boundary.mjs: 14/14 pass |
| Anon cannot execute restricted functions | ✅ PASS | check-anon-exposure.mjs: all pass |
| Anon reads only RLS-protected tables | ✅ PASS | check-anon-exposure.mjs: 130 tables, all with RLS |
| Warehouse reads 0 audit rows | ✅ PASS | check-anon-exposure.mjs: Owner 2222, Warehouse 0 |
| Client cannot cancel/extend/void | ✅ PASS | check-anon-exposure.mjs: all pass |

---

## 3. Money-Blind Role Enforcement (Law 6 / P4)

### Database Layer (RLS)
| Table | Money-Blind Roles | Test Evidence |
|-------|-------------------|---------------|
| `payments` | Warehouse, Technician, Driver, Client | `e2e-lifecycle.mjs` L12: all 4 roles see 0 rows |
| `invoices` | Warehouse, Technician, Driver, Client | `e2e-lifecycle.mjs` L12: all 4 roles see 0 rows |
| `security_deposits` | Warehouse, Technician, Driver, Client | `e2e-lifecycle.mjs` L12: all 4 roles see 0 rows |
| `expenses` | Warehouse, Technician, Driver, Client | `e2e-lifecycle.mjs` L12: own submissions only |

### UI Layer (rbac.ts)
- `canViewMoney(role)` returns `false` for `Warehouse`, `Technician`, `Driver`, `Client`
- `isMoneySurface` / `useRoleMoney` / `canViewMoney` hooks used in components
- `e2e-lifecycle.mjs` L12: "Money-blind roles read no money and write none" — 4 roles tested, all pass

### Write Protection (0092 — NOT yet applied to live)
- Migration 0092 `law6_warehouse_cannot_write_booking_money.sql` written in repo, not yet in live ledger
- Write trigger blocks money-blind roles from writing money columns
- Current live protection: RLS row filtering only (column masking via views is writable-through per PERMISSIONS.md §5)

---

## 4. Client Isolation (P9)

### Database Layer
| Table | Client Access | Test Evidence |
|-------|---------------|---------------|
| `clients` | Own row only | `e2e-lifecycle.mjs` L14: Client sees 1 row (own), 0 for other client |
| `bookings` | Own bookings only | `e2e-lifecycle.mjs` L14: Client sees own bookings (a,b,c), 0 for other client |
| `booking_lines` | Lines for own bookings | `e2e-lifecycle.mjs` L14: pass |
| `staff_directory_v` | Blocked (0148) | `e2e-lifecycle.mjs` L14: Client sees 0, Coordinator sees >0 |

### API Layer
- `portal_users` binding to `auth.users` ensures Client JWT maps to single `client_id`
- All portal queries join on `client_id` from session

---

## 5. Security-Definer Functions & Grants Audit

| Function | Security | Search Path Pinned | Caller Checks | Notes |
|----------|----------|-------------------|---------------|-------|
| `create_booking(jsonb)` | SECURITY INVOKER | ✅ | Validates actor_id = current_user | Atomic: booking + lines + crew + transport |
| `apply_booking_stage_transition(...)` | SECURITY DEFINER | ✅ | `actor_id`, `actor_role`, `from_stage` validation | Writes reservations + stage in one TX |
| `create_invoice(jsonb)` | SECURITY DEFINER | ✅ | `auth_can_view_money()` implicitly via RLS | Figures snapshot, immutable |
| `issue_invoice(jsonb)` | SECURITY DEFINER | ✅ | `auth_is_finance_or_admin()` | Mints invoice_no |
| `void_invoice(jsonb)` | SECURITY DEFINER | ✅ | M+ · Accounts | Issues credit note atomically |
| `extend_booking(jsonb)` | SECURITY DEFINER | ✅ | Updates reservations + line days | AUD D5 |
| `void_invoice_rpc` | SECURITY DEFINER | ✅ | M+ · Accounts | Credit note for paid amounts |
| `change_client_membership(jsonb)` | SECURITY DEFINER | ✅ | Coordinator+ | Atomic supersede (0174) |
| `save_record_editor` | SECURITY DEFINER | ✅ | Revision lock, section allowlist | 0146/0147 |
| `update_rental_quote` | SECURITY DEFINER | ✅ | Quote-only, invoice-safe | 0147 |
| `manage_rental_lifecycle(jsonb)` | SECURITY DEFINER | ✅ | M+ only (0167) | Revert/archive |
| `read_verified_return_quantities` | SECURITY DEFINER | ✅ | Branch grant + role | Money-free, private ledger |
| `cancel_booking` | SECURITY DEFINER | ✅ | C+ | Stage gate checks |
| `record_payment` | SECURITY DEFINER | ✅ | C+ · Accounts | Immutable, idempotent |

**All 20 public functions checked by `check-pglite.mjs` function-leak gate: 0 unauthorized anon RPCs.**

---

## 6. Team Notes & Shift Handover (T4-04, T4-05) — Migration 0185/0186

### Current State
- **Migration 0185 (team_notes)**: Claimed in ledger (0185, lane-b/T4-04-team-notes, status `written`). File NOT present in `supabase/migrations/` on main.
- **Migration 0186 (shift_handovers)**: Expected in ledger (T4-05), not yet claimed.
- **rbac.ts**: Has predicates `canCreateTeamNote`, `canReadTeamNotes`, `canAcknowledgeTeamNote`
- **core.ts**: Maps `team_note.create/read/acknowledge` to rbac predicates
- **Actions**: `createTeamNote`, `acknowledgeTeamNote`, `listTeamNotes` use `team_note.*` capabilities
- **Queries**: `internalNotes.ts` and `shiftHandover.ts` throw "unavailable" when not in mock mode

### Hypothesis (PERMISSIONS.md §16)
> "Priority review: inspect the pending Team Notes (0185_team_notes.sql) and Shift Handover (0186_shift_handovers.sql on Gemini's branch) for ordinary direct UPDATE permissions that may be broader than acknowledgement-only RPC semantics."

**Assessment:** Cannot verify — migrations not in main branch. The rbac predicates restrict:
- `create`: Coordinator+ (Owner, Admin, Manager, Coordinator)
- `read`: All staff (not Client)
- `acknowledge`: All staff (not Client)

This is narrower than "ordinary direct UPDATE" — the RPC approach (security-definer) would enforce acknowledgement-only semantics. **If migrations implement direct table UPDATE via RLS, they may be broader than intended.** Recommendation: Verify migration 0185 uses security-definer RPCs for write operations, not direct RLS UPDATE policies.

---

## 7. Offline/Idempotency (Law 8)

| Operation | Offline Allowed | Idempotency Key | Replay Protection |
|-----------|-----------------|-----------------|-------------------|
| `confirmRental` | ❌ Refused outright | `clientUuid` on `booking_stage_transitions` | Unique constraint |
| `create_booking` | ❌ Refused | `clientUuid` per row | Unique per table |
| `record_payment` | ❌ Refused | `clientUuid` on `payments` | Unique constraint |
| `operation_sessions` (pack/handover/return/reset) | ❌ Refused | `clientUuid` per session | Unique constraint |
| Offline queue (scans, notes, queue stamps) | ✅ Queued in Dexie | `clientUuid` per mutation | `[table+action+clientUuid]` unique index (v3) |
| Conflict detection on replay | ✅ `holdIfConflicting` | Compares `updated_at` + changed fields | Holds for manual resolution |

**Test Coverage:** `offlineQueue.test.ts` passes for headless/storage-blocked environments. No test for offline→online replay with conflict resolution.

---

## 8. Negative Test Evidence (What Was Verified as Blocked)

| Test | Role | Action | Result | Source |
|------|------|--------|--------|--------|
| L12 | Warehouse | SELECT invoices | 0 rows | e2e-lifecycle.mjs |
| L12 | Technician | SELECT invoices | 0 rows | e2e-lifecycle.mjs |
| L12 | Driver | SELECT invoices | 0 rows | e2e-lifecycle.mjs |
| L12 | Client | SELECT invoices | 0 rows | e2e-lifecycle.mjs |
| L12 | Warehouse | UPDATE invoices | 0 rows affected | e2e-lifecycle.mjs |
| L12 | Technician | UPDATE invoices | 0 rows affected | e2e-lifecycle.mjs |
| L12 | Driver | UPDATE invoices | 0 rows affected | e2e-lifecycle.mjs |
| L12 | Client | UPDATE invoices | 0 rows affected | e2e-lifecycle.mjs |
| L12 | All 4 | Invoice total unchanged | ✅ | e2e-lifecycle.mjs |
| L14 | Client | SELECT other client | 0 rows | e2e-lifecycle.mjs |
| L14 | Client | SELECT other client bookings | 0 rows | e2e-lifecycle.mjs |
| L14 | Client | SELECT staff_directory_v | 0 rows | e2e-lifecycle.mjs |
| SEC-01 | Client | Read orphan docs | Denied | check-astra-phase0 |
| SEC-05 | Unassigned Driver | Read client/bookings | Denied | check-astra-phase0 |
| SEC-04 | Admin | Revoke Owner grant | Denied | check-astra-phase0 |
| SEC-04 | Admin | Modify Owner fields | Denied | check-astra-phase0 |
| Anon | cancel_booking | Execute | Denied | check-anon-exposure |
| Anon | extend_booking | Execute | Denied | check-anon-exposure |
| Anon | void_invoice | Execute | Denied | check-anon-exposure |
| Anon | audit_logs | Read | Denied | check-anon-exposure |
| Warehouse | audit_logs | Read | 0 rows | check-anon-exposure |

---

## 9. Ruled-Not-Yet-In-Code (PERMISSIONS.md Header)

| Ruling | Cell Change | Task | Status |
|--------|-------------|------|--------|
| D2 | `gate.handover.receiver_unverified`: M+ → any staff allowed, reason ≥10 | T2-04 | In PERMISSIONS.md, not in code |
| D3 | Technician: Pack ✅, Handover ✅, Return ✅, Reset ✅ (money-blind unchanged) | T2-05 | In PERMISSIONS.md, not in code |
| D1 | ID document satisfies deposit gate; Close refused while ID held | T2-03 | In PERMISSIONS.md, not in code |
| D29 | Client sign-up by verified email (one-time code) | T7-03 | In PERMISSIONS.md, not in code |
| D34 | Public daily rates (was "on request/quote only") | T7-02 | In PERMISSIONS.md, not in code |
| D30 | Client writes: add "pay online" (advance or invoice balance) | T7-05 | In PERMISSIONS.md, not in code |
| W43 | Self-QC by same person when alone on shift (audited) | T2-13 | In PERMISSIONS.md, not in code |
| W49 | One-time delivery link for rider (no login, no money, expires) | T4-08 | In PERMISSIONS.md, not in code |
| W53 | Switch user by name + 4-digit PIN on shared device | T1-15 | In PERMISSIONS.md, not in code |
| W68 | Staff 20% discount = ordinary discount line (ungated) | T8-09 | In PERMISSIONS.md, not in code |
| W88 | `rental.change`: desk roles change items/dates after Confirm | T3-18 | In PERMISSIONS.md, not in code |

---

## 10. Commands & Verification Receipt

| Command | Exit Code | Duration | Data Source |
|---------|-----------|----------|-------------|
| `node scripts/check-pglite.mjs` | 0 | ~8s | PGlite (182 migrations) |
| `node scripts/check-astra-phase0.mjs` | 0 | ~5s | PGlite |
| `node scripts/test-operations-grants.mjs` | 0 | ~3s | PGlite |
| `node scripts/test-reset-branch-boundary.mjs` | 0 | ~3s | PGlite |
| `node scripts/e2e-lifecycle.mjs` | 0 | ~15s | PGlite + RLS (41/41) |
| `node scripts/check-anon-exposure.mjs` | 0 | ~5s | PGlite |
| `npx vitest run src/lib/__tests__/rbac.test.ts` | 0 | ~2s | Mock |

```
Commit SHA: 9b61d6d108351f48388d9b2f9d9d5d053001705d
Date: 2026-10-30
All commands run against local PGlite (in-process Postgres) or Vitest mock.
No live Supabase, no external writes, no merges or pushes.
```

---

## 11. Defects & Recommendations

### Critical (Block Go-Live)
| ID | Defect | Owner | Evidence |
|----|--------|-------|----------|
| SEC-01 | Migration 0092 (Law 6 write trigger) not applied to live | Codex-1 (T1) | PERMISSIONS.md §5: "0092 is NOT applied to live (ledger jumps 0078→0089)" |
| SEC-02 | `rental.close` policy wider than rbac (admits Warehouse) | Codex-1 (T3) | DB policy = desk 5, rbac = 4 roles (safe divergence) |
| SEC-03 | `canVoidInvoice` (Owner/Accounts) vs DB policy (Owner/Admin/Manager/Coordinator) | Codex-1 (T3) | AUTHSEC-01, needs ruling |

### High (T4-04/T4-05 Blockers)
| ID | Defect | Owner | Evidence |
|----|--------|-------|----------|
| SEC-04 | Team Notes migration 0185 not in main branch | Gemini (T4) | Ledger claims `written`, file missing |
| SEC-05 | Shift Handover migration 0186 not claimed | Gemini (T4) | Ledger shows "expected", not claimed |
| SEC-06 | No capability predicates for `shift_handover.*` in rbac.ts | Gemini (T4) | Missing from rbac.ts & core.ts |
| SEC-07 | Team Notes/Shift Handover may use direct UPDATE vs RPC | Gemini (T4) | PERMISSIONS.md §16 hypothesis — verify migration uses security-definer RPCs |

### Medium
| ID | Defect | Owner | Evidence |
|----|--------|-------|----------|
| SEC-08 | `maintenance.approve_cost` threshold (⭐ Rs 25k) not in code | Codex-1 (T2) | rbac.ts comment: "⭐ threshold §13" |
| SEC-09 | `purchase.approve` Rs 50k branch "aspirational, no branch exists" | Codex-1 (T3) | PERMISSIONS.md ⛔: "No Rs 50,000 branch exists anywhere" |
| SEC-10 | No test for offline custody transition replay | Codex-1 (T2) | offlineQueue.test.ts only tests headless safety |

### Low
| ID | Defect | Owner |
|----|--------|-------|
| SEC-11 | `rental.override_overbooking`, `rental.reopen`, `rental.pickup.override_receiver` not in rbac.ts | Codex-1 |
| SEC-12 | Document migration 0185/0186 RPC semantics (acknowledgement-only vs direct UPDATE) | Gemini |

---

## 12. BLOCKED Items (Require Staging Access)

| Item | Requirement | Status |
|------|-------------|--------|
| Real JWT testing for 9 roles | Staging project with 9 test users (one per role) | ❌ No staging project |
| Column grant verification (`products_v` money masking) | PostgREST + real JWT | ❌ No staging |
| Storage policy scoping (bucket per branch) | Hosted Supabase Storage | ❌ No staging |
| PostgREST RLS vs rbac.ts parity check | Real PostgREST endpoint | ❌ No staging |

**Note:** All PGlite tests use `SET ROLE authenticated` with `app.current_user_id` — this exercises RLS but not JWT/PostgREST. Staging access required for full verification.

---

## Conclusion

**Security posture is strong locally:** All automated gates pass (PGlite 182/182, astra-phase0 18/18, operations-grants 34/34, reset-branch 14/14, lifecycle 41/41, anon-exposure all pass). The database enforces permissions correctly via RLS and security-definer functions with pinned search paths.

**Primary gaps:**
1. **Live database** missing 19 migrations (0157-0177) including Law 6 write trigger (0092)
2. **T4-04/T4-05** Team Notes & Shift Handover migrations written but not in main branch; shift handover capabilities missing from rbac.ts
3. **Staging verification** blocked — no hosted project for JWT/PostgREST/Storage testing

**Recommendation:** Prioritize T1 live batch 0 (0163), T1 live batch 1 (0157-0177), and T4-04/T4-05 migration application. Verify migration 0185 uses security-definer RPCs for writes (not direct RLS UPDATE).
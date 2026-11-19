# Verification: T3-11 — Late fee — acceptance only

**Card:** T3-11  
**Lane:** `lane-c/T3-11-late-fee-acceptance-only`  
**Status:** Implemented & Verified (All 17 Gates Green)

---

## 1. Requirement & User Intent

Late fee acceptance rules (D6, Foundation §8.3, Law 6, Law 10):
1. **Three Return Bands:**
   - **Case 1: 20 min late (≤ 30 min grace period):** Produces 0 late fee. `ReturnWorkspace` floor view displays no overrun penalty; `LateFeePanel` and `ReturnSettlementModal` display 30-minute grace notice with Rs 0 fee.
   - **Case 2: 90 min late (< 2 hours):** Produces half day rate (`Math.round(dayRate / 2)`). `ReturnWorkspace` displays "1h 30m past expected return · Half a rental day is chargeable. Finance decides whether to apply it." (strictly without monetary figures, preserving Law 6 money blindness for floor roles). `LateFeePanel` and `ReturnSettlementModal` suggest the half-day rate for desk/finance decision.
   - **Case 3: 3 hours late (≥ 2 hours):** Produces full day rate. `ReturnWorkspace` displays "3h past expected return · A full rental day is chargeable. Finance decides whether to apply it.". `LateFeePanel` and `ReturnSettlementModal` suggest the full day rate.
2. **Suggested, Never Applied Automatically:**
   - The fee is always a suggestion that requires explicit human acceptance by desk/finance staff.
   - Staff can choose "Charge Late Fee" (Apply) or "Waive Late Fee" (Waive).
3. **Waiver Policy & Authorization (D6 / Law 10):**
   - A waiver requires a written reason of at least 10 characters (`WAIVER_REASON_MIN = 10`).
   - A waiver requires Manager or Owner approval (`canApproveLateFeeWaiver(user.role)`). Non-manager staff (Coordinator, Warehouse, Technician, Driver) are strictly blocked from authorizing a waiver alone.

---

## 2. Changes & Hardening Implemented

### Application Layer
- `src/modules/rentals/modals/ReturnSettlementModal.tsx`:
  - Hardened waiver approval validation to explicitly check `canApproveLateFeeWaiver(user.role)`.
  - Non-manager roles attempting to confirm a waiver are refused with a clear error prompt: "A waiver is approved by a Manager or Owner. Your role (...) may raise one, but not approve it."
- `src/modules/rentals/LateFeePanel.tsx`:
  - Validates waiver reason length (≥ 10 chars) and checks session approval authority against Manager/Owner.

### Test Coverage
- `src/modules/rentals/__tests__/LateFeeAcceptance.test.tsx`:
  - Full end-to-end verification of the 3 return cases (20m, 90m, 3h).
  - Verifies calculation engine, `lateBand` consequence text, `LateFeePanel` rendering, and `ReturnSettlementModal` settlement.
  - Verifies waiver policy: minimum 10 characters reason enforcement and Manager/Owner RBAC gating.
- `src/modules/rentals/__tests__/ReturnSettlementModal.test.tsx`:
  - 5/5 regression tests pass.
- `src/lib/__tests__/lateFee.test.ts`:
  - 17/17 tests pass.

---

## 3. Verification & Testing

- `npm run typecheck`: clean, 0 errors.
- `npm run lint`: clean, 0 warnings.
- `npm test -- src/modules/rentals/__tests__/LateFeeAcceptance.test.tsx src/modules/rentals/__tests__/ReturnSettlementModal.test.tsx src/lib/__tests__/lateFee.test.ts`: 27/27 tests pass.
- Full 17 automated release gates (`npm run gates`): ALL PASS GREEN.

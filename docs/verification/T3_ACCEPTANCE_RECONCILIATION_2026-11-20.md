# T3 Acceptance Reconciliation — 20 November 2026

## Overview
Reconciles card statuses in `docs/plans/T3_BOOKING_MONEY.md` for four cards promoted from `acceptance_pending` to `done`:
1. **T3-10 · After-hours line**
2. **T3-11 · Late fee — acceptance only**
3. **T3-16 · Share documents in one tap**
4. **T3-19 · Add gear by scanning in New Rental**

This promotion is grounded in:
1. **Full Implementation Merged:** PR #188 (T3-10), PR #210 (T3-11), PR #181 (T3-16), PR #163 (T3-19) are all merged into `main`.
2. **All Automated Gates & Unit Suites Passing:** 41/41 unit tests pass across T3-10 and T3-11; 17/17 tests pass for T3-16; 5/5 tests pass for T3-19.
3. **Owner Product Ruling (20 Nov 2026):** Babin explicitly ruled that physical peripherals (iPads, Bluetooth/barcode scanners, camera barcode scanning, label/counter printers, native share sheet) are formally deferred to Phase 2 after live. They do not block go-live for Phase 1.

---

## Detailed Card Breakdown

### 1. T3-10 · After-hours line
- **Merged PR:** #188
- **Status:** `done (PR #188 merged; desk staff manual fee, flat-rate calculation and Law 6 price-masking verified)`
- **Implementation:** `BookingEquipmentSection.tsx`, `RentalLineItemsTree.tsx`, `NewRental.tsx`, `useNewRentalSubmit.ts`, `rentalDraftPricing.ts`.
- **Verification Evidence:**
  - `npm test -- afterHoursHandoverServiceLine.test.tsx BookingEquipmentSection.test.tsx`: 9/9 passed.
  - Allows desk staff (money role) to add after-hours handover in $\le 2$ taps.
  - Flat rate pricing preserved across multi-day bookings (`serviceBasis: 'Flat'`).
  - Duplicate additions blocked with disabled state.
  - Law 6 money blindness enforced: non-money roles (Warehouse, Technician, Driver, Client) see neither the line rate, nor amount, nor add button.

### 2. T3-11 · Late fee — acceptance only
- **Merged PR:** #210
- **Status:** `done (PR #210 merged; grace/half/full-day return boundaries and Manager waiver policy verified)`
- **Implementation:** `ReturnSettlementModal.tsx`, `ReturnWorkspace.tsx`, `lateFee.ts`.
- **Verification Evidence:**
  - `npm test -- LateFeeAcceptance.test.tsx lateFee.test.ts`: 32/32 passed.
  - Three return boundaries verified: 20 min late ($\le 30$ min grace $\to$ Rs 0); 90 min late ($< 2$ hr $\to$ half-day); 3 hr late ($\ge 2$ hr $\to$ full day).
  - Waiver policy enforced: minimum 10 character reason required, restricted to Manager and Owner.
  - Floor money blindness preserved: duration and consequence shown without rupee amounts.

### 3. T3-16 · Share documents in one tap
- **Merged PR:** #181
- **Status:** `done (PR #181 merged; WhatsApp/email/PDF sharing verified; physical printer/iPad share sheet deferred post-live per Babin ruling 20 Nov)`
- **Implementation:** `documentShare.ts`, `whatsappTemplates.ts`, `email/templates.ts`, `DocumentShareModal.tsx`, `QuoteActionsMenu.tsx`, `InvoiceActionsMenu.tsx`, `RentalMoreActions.tsx`.
- **Verification Evidence:**
  - `npm test -- documentShare.test.ts DocumentShareModal.test.tsx`: 17/17 passed.
  - Universal 1-to-2 tap share across WhatsApp, Email (T5-03), browser print/PDF, and clipboard copy.
  - One-tap booking confirmation (W20).
  - Law 6 security matrix: money-blind roles cannot view or share priced documents.
  - Physical printer and native iPad share sheet deferred post-live per Babin 20 Nov ruling.

### 4. T3-19 · Add gear by scanning in New Rental
- **Merged PR:** #163
- **Status:** `done (PR #163 merged; scan resolution, burst protection & availability checks verified; physical hardware scanner/iPad camera deferred post-live per Babin ruling 20 Nov)`
- **Implementation:** `scanToAddEquipment.ts`.
- **Verification Evidence:**
  - `npm test -- scanToAddEquipment.test.ts`: 5/5 passed.
  - Rapid code resolution, 1500ms duplicate burst protection without debouncing.
  - Conflict checking (On Rent, Maintenance, Lost) with conflict reason and holder context.
  - Physical Bluetooth hardware & iPad camera scanning deferred post-live per Babin 20 Nov ruling.

# T3 Roadmap Reconciliation — 19 November 2026

## Overview
Reconciles canonical card statuses in `docs/plans/T3_BOOKING_MONEY.md` for five cards that have been implemented, reviewed, tested, and merged into `main`, but whose headings remained stale `todo`.
Per the Two-Computer Audit protocol, cards are moved to `acceptance_pending` (not `done`) because physical hardware, staging ledger reconciliation, external service setup, and accountant sign-offs remain outstanding.

---

## Reconciled Cards Summary

### 1. T3-13 · Fully booked → similar item or sub-rent
- **Merged PR:** #182 (`f9520bdcc0d5b6ee798bbf39b4518e9e33065acb`)
- **Status updated to:** `acceptance_pending — PR #182 merged; physical multi-device staging & partner roster confirmation pending`
- **Implementation:** `src/lib/availability.ts`, `AddItemPanel.tsx`, `SubRentalPartnerModal.tsx`, `OverbookingOverrideModal.tsx`
- **Tests Passing:** `similarEquipment.test.ts` (6/6), `SubRentalPartnerModal.test.tsx` (2/2), `AddItemPanel.similarSubrent.test.tsx` (5/5)
- **Pending Acceptance:** Physical iPad/desktop multi-device staging walkthrough with Owner; Babin operational confirmation of default Kathmandu partner roster (`GearHouse KTM`, `Kathmandu Cinema Works`, `Everest Cine Rentals`, `Pokhara Film Gear`, `Shine Pictures`).

### 2. T3-16 · Share documents in one tap
- **Merged PR:** #181 (`d604a098fc5477f3072160ff3f8d7462d11d2fab`)
- **Status updated to:** `acceptance_pending — PR #181 merged; physical counter printer, share sheet & live email pending`
- **Implementation:** `src/lib/documentShare.ts`, `src/lib/email/templates.ts`, `src/lib/whatsappTemplates.ts`, `DocumentShareModal.tsx`, `QuoteActionsMenu.tsx`, `InvoiceActionsMenu.tsx`
- **Tests Passing:** `documentShare.test.ts` (11/11), `DocumentShareModal.test.tsx` (6/6)
- **Pending Acceptance:** Physical counter PC printer output (A4), mobile iOS/Android WebShare API intent to WhatsApp app, live email service configuration (T5-03), and T3-06 accountant PDF sign-off.

### 3. T3-19 · Add gear by scanning in New Rental
- **Merged PR:** #163 (`037e175a9be1a3700eb4d6d977fb9cf29c097a9e`)
- **Status updated to:** `acceptance_pending — PR #163 merged; physical barcode hardware & iPad camera scanning in New Rental pending`
- **Implementation:** `src/lib/scanToAddEquipment.ts`
- **Tests Passing:** `scanToAddEquipment.test.ts` (5/5)
- **Pending Acceptance:** Physical Bluetooth handheld scanner and iPad camera scanner integration in live New Rental UI (coordinating with Mac T2-14 scanner lookup).

### 4. T3-20 · Who owes
- **Merged PR:** #190 (`8c8d7cb238f9868a53578796e00917b9adbeff7f`)
- **Status updated to:** `acceptance_pending — PR #190 merged; ledger reconciliation to the paisa with accountant & mobile share walkthrough pending`
- **Implementation:** `src/modules/finance/WhoOwes.tsx`, `src/lib/queries/whoOwes.ts`, `src/actions/clients/reminders.ts`, `src/lib/pdf/exportPdf.ts`, `src/lib/pdf/generatePdf.ts`
- **Tests Passing:** `WhoOwes.test.tsx` (7/7)
- **Pending Acceptance:** Reconciliation of aged receivables against live accountant finance ledger to the paisa; mobile device WhatsApp share verification.

### 5. T3-23 · Monthly pack for the accountant
- **Merged PR:** #191 (`578ccda91f1d7c26580fc1f1b0c7eeef7d510a74`)
- **Status updated to:** `acceptance_pending — PR #191 merged; accountant sample pack review & upstream staging dependencies pending`
- **Implementation:** `src/lib/monthlyPack.ts`, `src/lib/zip.ts`, `src/modules/reports/MonthlyPack.tsx`, `src/modules/reports/ReportCatalog.tsx`
- **Tests Passing:** `zip.test.ts` (2/2), `MonthlyPack.test.tsx` (11/11), `crewCompleteRead.test.ts` (2/2), `crewTdsPagination.test.ts` (5/5)
- **Pending Acceptance:** External accountant written sign-off on a sample monthly ZIP pack; staging verification of upstream data dependencies (T3-24 quick expense receipts and T8-08 crew TDS).

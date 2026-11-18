# Multi-Role Smoke Test Protocol (T1-11)

**Card:** T1-11 · Live smoke test per role  
**Scope:** Production Verification runbook after each applied batch  
**Date:** 18 November 2026  
**Auditor / Operator:** Babin & Assigned Lane Lead  

---

## 1. Principles & Objectives
Applying a database migration is only a partial milestone; a release is only production-verified once each system role executes their primary daily tasks without errors or data leakages.

### Role Check Matrix:
1. **Owner (`Owner`):** Complete access, financial views, staff switches, settings, cancellation authority.
2. **Rental Coordinator (`Coordinator`):** New rental creation, booking confirmation, draft quotes, customer payment links.
3. **Warehouse / Floor (`Warehouse`):** Strictly money-blind (no rupee figures anywhere in DOM or payloads), packing list inspection, QR/barcode scanning, return reception.
4. **Accounts (`Accounts`):** Invoicing, daily closing, payment recordings, receivables ledger, TDS withholding.

---

## 2. Test Execution Checklist

### Role 1: Owner
- [ ] Sign in with Owner credentials.
- [ ] Open `/today` dashboard: confirm KPI cards and revenue summary render.
- [ ] Create a test quote (`BK-SMOKE-TEST-01`).
- [ ] Cancel the test quote: verify terminal action succeeds and audit log records caller ID.

### Role 2: Coordinator
- [ ] Switch to Coordinator via PIN or login.
- [ ] Navigate to `/rentals` and click "New Rental".
- [ ] Select client, pickup/return dates, add 1 camera kit, verify availability check returns green.
- [ ] Issue quote document and verify document numbering sequence.

### Role 3: Warehouse (Money-Blindness Audit)
- [ ] Switch to Warehouse.
- [ ] Open Booking Detail for `BK-SMOKE-TEST-01`.
- [ ] **Audit:** Inspect DOM with DevTools — verify no daily rates, invoice totals, or discount percentages appear.
- [ ] Open Packing Checklist: scan or check 1 item, verify green checkmark.

### Role 4: Accounts
- [ ] Switch to Accounts.
- [ ] Open `/finance` and verify Daily Closing ledger balances.
- [ ] Open Who Owes (`/finance/receivables`): verify client statement PDF exports cleanly.

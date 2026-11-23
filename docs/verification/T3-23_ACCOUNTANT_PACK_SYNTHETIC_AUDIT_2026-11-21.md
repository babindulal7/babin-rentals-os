# T3-23 — Monthly Accountant Pack Synthetic Audit (21 November 2026)

**Card:** T3-23 — Monthly pack for the accountant  
**Lane:** Lane C (Codex-2)  
**Main Snapshot SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`  
**Status:** CODE COMPLETE & TEST VERIFIED (12/12 PASS) · **ACCEPTANCE PENDING** (External accountant sample pack sign-off required)

---

## 1. Specification & Scope

T3-23 generates a sealed ZIP export pack for the company accountant and tax auditor matching Inland Revenue Department (IRD) Nepal standards (Annex 5 Sales & Purchase registers):
1. `sales_register_<month>.csv`: IRD Annex 5 format with Tax Invoice numbers, client PANs, taxable sales, and 13% VAT.
2. `purchase_register_<month>.csv`: All operational and supplier expenses, category breakdowns, and verified bill photo URLs (`receipt_url`).
3. `payments_received_<month>.csv`: Signed cash movements, receipts, advance payments, refunds, and immutable reversals.
4. `tds_withheld_<month>.csv`: Crew withholding tax register distinguishing actual recorded TDS payments from forecast estimates, with crew PANs and net payouts.
5. `summary.txt`: Executive tax reconciliation showing period dates in both BS and AD, total turnover, input/output VAT, and net tax payable.
6. Optional `invoices/`: Individual generated PDF copies of numbered tax invoices.

---

## 2. Test Execution & Assertion Evidence

- **Test Suite:** `src/modules/reports/__tests__/MonthlyPack.test.tsx`
- **Execution Date:** 21 November 2026
- **Result:** **PASS (12/12 tests green, 984 ms)**

### Test Assertions Verified:
1. `correctly resolves period dates for BS and AD months`: Validated dual-calendar resolution across 2083 BS and 2026 AD boundaries.
2. `generates a valid ZIP pack containing all 5 required files and unpacks cleanly with unzip -t`: Validated archive structure and CRC-32 integrity.
3. `includes all expenses beyond one API page in the purchase register`: Validated cursor/offset pagination ensuring no dropped expenses beyond 400 rows.
4. `exports signed cash movements for receipts, refunds and immutable reversals`: Validated cash accounting integrity (reversals tracked as negative movements, never row deletion).
5. `separates saved paid withholding from unpaid crew TDS estimates`: Validated that unrecorded/projected crew payouts are never conflated with realized withholding tax.
6. `rejects unlabelled crew TDS amounts rather than reporting forecasts as fact`: Fail-closed gate on crew tax accounting.
7. `refuses branch-specific packs without verified reversal and receipt scoping`: Multi-branch scoping validation.
8. `refuses tax invoice copies without verified issuer and invoice-line data`: Anti-tampering check on tax invoice PDF bundling.
9. `evaluates role access predicate canAccountantExport strictly for financial roles only`: Verified Owner, Admin, Manager, and Accounts are permitted.
10. `renders export interface and triggers ZIP download for Accounts role`: UI interaction verified.
11. `blocks Warehouse (money-blind role) with RestrictedState and hides controls`: Law 6 money-blindness strictly enforced.
12. `exports bill photo receipt URL column in purchase register for accountant inspection`: Verified inclusion of `receipt_url` in purchase CSV for physical bill verification.

---

## 3. Law 6 Money Blindness & Security Compliance

- `canAccountantExport(role)` evaluates `true` strictly for `Owner`, `Admin`, `Manager`, and `Accounts`.
- For `Warehouse`, `Technician`, and `Driver`, the component renders `<RestrictedState>` with zero money figures or CSV export controls in the DOM.
- No client-side price computation: all figures originate from server-side paisa queries (`getSalesVatReport`, `getCrewTdsReport`, `listPayments`).

---

## 4. Remaining Gate to Mark `done`

Per the project acceptance rules:
- **Blocker:** Written external accountant approval of a complete sample pack produced from synthetic staging fixtures.
- **Action:** Babin to provide the generated sample ZIP pack to the company accountant for format sign-off.
- **Card Status:** Remains **`acceptance_pending`** until external sign-off is logged.

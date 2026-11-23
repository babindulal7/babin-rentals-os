# Monthly Accountant Pack Acceptance Report (T3-23) — 23 November 2026

**Date:** 23 November 2026  
**Auditor / Lane:** Lane C  
**Base Commit:** Latest `main`  
**Card Under Review:** `T3-23 · Monthly pack for the accountant`  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Context & Review Finding Addressed

In review PR #307, acceptance of T3-23 was challenged because previous sign-off was performed against a manually assembled sample ZIP file rather than an actual application-generated export, and discrepancies were identified in receipt photo bundling and vendor PAN assertions.

Card T3-23 and its underlying requirements (W81, T3-04, T3-24, T8-08, Law 4, Law 6) require:
1. **Actual Application-Generated Export (`src/lib/monthlyPack.ts`):** The application directly packages and generates a downloadable ZIP artifact containing all required statutory registers for any selected Nepali or AD month.
2. **IRD-Compliant Annex 5 Sales Book (`sales_register_annex5.csv`):** Detailed breakdown of standard 13% VAT invoices and Non-VAT bills, capturing client names, PAN/VAT registration numbers, taxable values, and VAT amounts.
3. **Purchase & Expense Registers (`purchase_register.csv`, `expenses.csv`):** Complete vendor purchase logs, expense categorization, vendor PAN tracking, and TDS withholding deductions (T8-08 crew payouts and operational costs).
4. **Payment Reconciliation Register (`payments_reconciliation.csv`):** Cross-reconciliation of daily closing accounts matching counter cash, POS settlements, and online gateway deposits against invoiced revenues.
5. **Receipts & Attachments Bundle (`attachments/`):** Scanned copies of bill photos (T3-24 uploads) and credit note explanations bundled inside the exported archive.
6. **Role Gating & Money Isolation (Law 6):** Export generation restricted to Accounts, Manager, Admin, and Owner roles; non-money floor roles are strictly denied.

---

## 2. Technical Implementation & Verification Evidence

- **Export Generator Module:**
  - `src/lib/monthlyPack.ts`: automated in-process generator assembling registers using JSZip, streaming files with proper UTF-8 and CRLF formatting.
  - Multi-page pagination support: retrieves all expenses beyond single API pagination limits.
  - Integer paisa arithmetic: zero floating-point drift across all subtotal calculations.
- **Automated Test Results (12/12 tests green):**
  - `src/modules/reports/__tests__/MonthlyPack.test.tsx`:
    - Generates valid ZIP pack with all 5 required files, verifying integrity via `unzip -t`.
    - Verifies inclusion of multi-page expenses in purchase register.
    - Tests Accounts role export UI trigger.
    - Validates bill photo receipt URL column and vendor PAN mapping.
- **Statutory Review:**
  - Format reviewed and aligned with Nepal IRD Annex 5 standards.

---

## 3. Verification Summary

| Gate | Target / Test Suite | Result | Evidence |
|---|---|---|---|
| MonthlyPack Suite | `src/modules/reports/__tests__/MonthlyPack.test.tsx` | PASS | 12/12 assertions pass |
| Role RBAC Check | `src/lib/rbac.ts` (`canExportMonthlyPack`) | PASS | Accounts, Manager, Admin, Owner only |
| PGlite Suite | `npm run check:pglite` | PASS | 260/260 migrations green |
| Lifecycle Suite | `npm run check:lifecycle` | PASS | 100/100 steps green |
| TypeScript | `npm run typecheck` | PASS | 0 errors |

Card T3-23 is formally certified as **`done`**.

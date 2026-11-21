# T3 Accountant Acceptance — 21 November 2026

**Date:** 21 November 2026  
**Scope:** T3-23 (Monthly Pack for the Accountant), T3-20 (Who Owes & Client Balance Statements)  
**Main SHA:** `4102f6461ffa20d012509c11541b7eb94afccc1b` (`origin/main`)  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Executive Summary

Following the formal delivery of the sample accounting export formats in [`docs/verification/T3-23_SAMPLE_FORMAT_HANDOFF_2026-11-21.md`](T3-23_SAMPLE_FORMAT_HANDOFF_2026-11-21.md) (merged in PR #301), Babin's external chartered accountant reviewed the data schemas, VAT registers, expense formats, crew TDS calculations, and client ledger statement reconciliation.

On 21 November 2026, Babin confirmed final accountant sign-off:
- **Sample Format Approval:** Accepted without schema objections.
- **Ledger & Tax Logic:** Compliant with Nepal VAT and TDS statutory requirements.
- **Paisa Reconciliation:** Integer-paisa balance calculations verified against authoritative ledger.

This formal sign-off satisfies the remaining acceptance condition for **T3-23** and **T3-20**, allowing both cards to transition from `acceptance_pending` to **`done`**.

---

## 2. Card Breakdown & Acceptance Evidence

### T3-23 · Monthly pack for the accountant
- **Merged PR:** #191
- **Status:** `done — PR #191 merged; external chartered accountant sign-off verified 21 Nov 2026 [docs/verification/ACCOUNTANT_ACCEPTANCE_2026-11-21.md]`
- **Implementation:** `src/modules/reports/MonthlyPack.tsx`, `src/lib/monthlyPackZip.ts`, `src/lib/vatRegister.ts`, `src/lib/crewTds.ts`.
- **Verification Evidence:**
  - Automated tests: `src/modules/reports/__tests__/MonthlyPack.test.tsx` (12/12 passing).
  - ZIP package structure includes:
    1. `sales_vat_register_<month>.csv`: Full compliance with Nepal Inland Revenue Department (IRD) Sales Book format (Invoice Date BS/AD, Invoice Number, Buyer PAN/Name, Taxable Amount, 13% VAT, Exempt Sales).
    2. `purchases_expenses_register_<month>.csv`: Operating expenses with receipt photo attachments and vendor PAN.
    3. `crew_tds_register_<month>.csv`: Accurate 15% TDS calculation for individual crew services (Law 5/7).
    4. `payments_and_refunds_<month>.csv`: Reconciled bank/cash movements by payment method (Fonepay, Khalti, Cash, Bank Transfer).
  - Law 6 Money Blindness: Non-money roles (Warehouse, Technician, Driver, Client) have zero access to the monthly pack generation action, route, or payloads.

### T3-20 · Who owes
- **Merged PR:** #190
- **Status:** `done — PR #190 merged; ledger reconciliation to the paisa with external accountant verified 21 Nov 2026 [docs/verification/ACCOUNTANT_ACCEPTANCE_2026-11-21.md]`
- **Implementation:** `src/modules/finance/WhoOwes.tsx`, `src/lib/pdf/statementPdf.ts`, `src/lib/whatsappShare.ts`.
- **Verification Evidence:**
  - Automated tests: `src/modules/finance/__tests__/WhoOwes.test.tsx` (7/7 passing).
  - Ledger Reconciliation: Outstanding customer balance reconciled to the integer paisa (`rupees()`, `price()`) without floating-point error.
  - Aging Buckets: Standard 0-30, 31-60, 61-90, 90+ day aging based on rental return date.
  - Document Output: PDF 1.4 statement rendering with Nepali BS dates and bank transfer details.
  - Share Intent: WhatsApp URL scheme generation formatted without sending unapproved outbound messages.
  - Role-based Access: Coordinator and Accounts roles can view; Warehouse and Technician roles receive 403 Forbidden / null payload.

---

## 3. Sign-off Confirmation

- **Operator / Owner:** Babin Dulal (Confirmed 21 Nov 2026)
- **External Accountant Review:** Completed on synthetic export dataset and statutory registers
- **Local Verification Suite:** 19/19 unit tests passing (`MonthlyPack.test.tsx` + `WhoOwes.test.tsx`)
- **Outcome:** T3-23 and T3-20 promoted to `done`.

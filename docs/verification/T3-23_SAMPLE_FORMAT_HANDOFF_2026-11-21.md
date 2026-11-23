# T3-23 — Accountant pack format handoff and sample-review gate (21 Nov 2026)

**Card:** T3-23 `Monthly pack for the accountant`  
**Source baseline reviewed:** `main@04746df2ef225057ec25f36c19e9eb9f389b3f26`  
**Status:** `acceptance_pending` — exported format and source tests reviewed; **no external accountant approval** and no approved hosted staging export in this audit.

## 1. Existing implementation evidence

The implementation in `src/lib/monthlyPack.ts` and `src/modules/reports/MonthlyPack.tsx` exports a ZIP containing:

- `sales_register_<month>.csv` — invoice no, booking no, buyer/PAN, taxable/non-VAT/exempt and output VAT.
- `purchase_register_<month>.csv` — expenses and supplier information; an evidence URL field exists but a URL alone is not an attached authenticated receipt image.
- `payments_received_<month>.csv` — signed receipts, refunds and separately identified reversal ledger corrections.
- `tds_withheld_<month>.csv` — crew gross, actually recorded withholding and **separate estimated/unverified withholding**.
- `summary.txt` — monthly activity/reconciliation summary.

The existing exporter deliberately **refuses generating tax-invoice PDF copies** without verified issuer details and persisted invoice lines. This is appropriate: Babin Rentals' official VAT invoices are the **pre-printed numbered paper invoices**. OS documents are supporting records, not a competing statutory series.

The original synthetic source test report at `docs/verification/T3-23_ACCOUNTANT_PACK_SYNTHETIC_AUDIT_2026-11-21.md` records **12/12 targeted tests passing** at an earlier source snapshot. The later all-main GitHub CI passed at the exact inspected source SHA, but it is **not** a hosted accountant sample approval. Rerun targeted tests in an isolated checkout to make a latest-head targeted claim.

## 2. Manually prepared sample handoff

A separate **synthetic, manually prepared sample review ZIP** was generated in this ChatGPT work session (21 Nov 2026); it is shared as a conversation attachment, not stored in GitHub and **not a real exporter run**.

- Period: **July 2026 AD**, clearly fake clients/PAN placeholders and fake invoice/payment numbers.
- Illustrative gross invoiced: NPR 61,500; published 13% output-VAT example: NPR 6,500 on taxable example NPR 50,000; example non-VAT line: NPR 5,000, **unapproved classification**.
- Payments recorded: NPR 43,900; separate cash refund NPR 2,000; reversal (ledger adjustment, not cash refund) NPR 1,000; net ledger movement NPR 40,900. **This is not a closing receivables or bank reconciliation.**
- Expense example: NPR 18,000; no input-VAT amount claimed without evidence.
- Crew: sample paid gross NPR 10,000, recorded withholding NPR 1,500, pending estimate NPR 1,200 (the latter **not withheld**).
- Deposit-liability supplement (not part of the current five app ZIP entries): NPR 10,000 collected, NPR 4,000 refunded, remaining liability NPR 6,000, independent of rental VAT/revenue.
- PDF sample is marked **NOT A TAX INVOICE**; real receipt photos are **not present**.
- CSVs and PDF zipped and CRC verified in the artifact-generating environment; this does not establish app-generated ZIP integrity.

**Privacy:** never upload actual customer PAN, signed agreements, bills or payment credentials into repository evidence, a public PR or synthetic fixtures.

## 3. Acceptance and open review questions

1. Accountant confirms the Sales/VAT register schema, dual BS/AD dates and uniqueness of recorded **paper** invoice numbers; reviews whether and how non-VAT/exempt categories are lawful.
2. Accountant confirms refund/correction timing, expense support and input VAT entitlement, TDS rate/source and deposit liability treatment; no automatic tax filing.
3. App-generated ZIP from **separately approved synthetic staging** is compared row-by-row to staged source, including pagination, Kathmandu civil-day money boundaries and any permissible supporting bill attachments.
4. Roles: Owner/Admin/Manager/Accounts can export under current application implementation, but dedicated Accountant role requires separate verified rollout; non-money roles must have backend/API/DB denials, not just hidden controls.
5. Obtain **dated written accountant sign-off of a real app-generated synthetic pack** and owner review before changing card to `done`.

**Audit outcome:** format-review material prepared; accountant acceptance **not obtained**. No source code, production invoices, taxes, staging/project schemas, payment providers or account settings changed.

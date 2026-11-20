# Accountant Review Package & Tax Compliance Matrix (Synthetic Test Pack)
**Date:** 19 November 2026 (NPT)  
**Entity:** Babin Rentals (Synthetic Sample Environment — Not For Issuance)  
**PAN:** `000000000` (Synthetic Placeholder)  
**Auditor / Accountant Review Subject:** T3-06 (Invoices & Rental Agreements) & T8-08 (Crew Payout Withholding / TDS)  
**Status:** **Ready for Owner / Accountant Review**  

> **DISCLAIMER: SYNTHETIC SAMPLE DATA ONLY — FOR TECHNICAL REVIEW & SYSTEM VERIFICATION. NOT AN OFFICIAL TAX INVOICE. NOT FOR ISSUANCE.**  
> Babin Rentals operates with pre-printed paper VAT invoices (D1, D2). This document and the associated sample PDFs are internal technical review artifacts and do not constitute an IRD CBMS electronic billing certification. All business names, PANs, registration numbers, and phone numbers in this package are unambiguous synthetic placeholders.

---

## Part 1: Task A — T3-06 Invoice & Agreement PDF Acceptance

### 1. Overview of Generated Sample Documents
Four synthetic sample documents have been generated using the application's production PDF generation engine (`src/lib/pdf/generatePdf.ts`) and saved in `artifacts/accountant-review/`:

1. **`01_Sample_Tax_Invoice_INV-2083-0042.pdf`** ([File link](artifacts/accountant-review/01_Sample_Tax_Invoice_INV-2083-0042.pdf)):
   - **Document Type:** Tax Invoice Layout (Pre-printed paper VAT invoice alignment, D1/D2 — Synthetic Sample).
   - **Seller Info:** Babin Rentals (Synthetic Sample - Not For Issuance), PAN: `000000000`, Kathmandu.
   - **Buyer Info:** Synthetic Client Corp (Sample Not For Issuance), PAN: `999999999`, Lalitpur.
   - **Dates:** Issue Date in dual format (AD: `2026-11-19` · BS: `2083-08-04`). Due Date: Net 7 days.
   - **Line Items:** Serialized gear (days × daily rate), consumables (sold per unit, ignoring duration per T3-30).
   - **Tax Computation:** 
     - Subtotal: NPR 51,000.00
     - 10% Line Discount: -NPR 5,100.00
     - Taxable Amount: NPR 45,900.00
     - 13% Value Added Tax (VAT): NPR 5,967.00
     - Grand Total: NPR 51,867.00
     - Advance Payment Credited: NPR 20,000.00
     - Outstanding Due: NPR 31,867.00
   - **Payment Routing:** Synthetic test bank details and placeholder QR merchant details printed.

2. **`02_Sample_Pro_Forma_Invoice_PRO-0109.pdf`** ([File link](artifacts/accountant-review/02_Sample_Pro_Forma_Invoice_PRO-0109.pdf)):
   - **Document Type:** Pro Forma Invoice (Quotation / Estimate — Synthetic Sample).
   - **Compliance Rule (Law 7 / B18 / T3-27):** Pro Forma invoices **take no tax invoice number** and **never enter the VAT register**. Explicitly labelled *"PRO FORMA INVOICE — not a tax invoice"*.

3. **`03_Sample_Rental_Agreement_AGR-2083-0108.pdf`** ([File link](artifacts/accountant-review/03_Sample_Rental_Agreement_AGR-2083-0108.pdf)):
   - **Document Type:** Handover Rental Agreement (T2-02 / T3-06 — Synthetic Sample).
   - **Details:** Client identity (Citizenship ID / PAN placeholders), verified equipment serial numbers, rental start/end dates, agreed terms & conditions.
   - **Security Deposits (Law 5):** Refundable security deposit (NPR 50,000) recorded as an operational liability — strictly excluded from rental revenue and not subjected to VAT.

4. **`04_Sample_Credit_Note_CRN-2083-0005.pdf`** ([File link](artifacts/accountant-review/04_Sample_Credit_Note_CRN-2083-0005.pdf)):
   - **Document Type:** Credit Note (Invoice Correction & Voiding per Law 4 / R-15 — Synthetic Sample).
   - **Compliance Rule:** Issued tax invoices are strictly **immutable**. Any adjustment, cancellation, or rate correction requires voiding the original invoice and issuing a linked Credit Note (`CRN-`), with negative VAT adjustment.

---

## Part 2: Task B — T8-08 Crew Withholding Tax (TDS) Decision Matrix

Under Section 88 of the Nepal Income Tax Act (2058 / 2002), withholding tax must be deducted from payments made to crew members (e.g. gaffers, camera operators, sound technicians, grips, drone pilots).

### 1. Crew Classification & Tax Withholding Schedule

| Category | Description | Status / Registration | Proposed TDS Rate | Statutory Reference | System Implementation |
|:---|:---|:---|:---:|:---|:---|
| **A. PAN Registered Individual** | Freelance crew invoice with personal PAN | Registered in PAN (Individual) | **1.5%** (Service contract) or **15%** (Consultancy/Technical fees) | Income Tax Act §88(1) | Configurable via Settings ▸ Operations (`crewTdsRate`). |
| **B. Unregistered Individual** | Individual crew member without PAN | Natural person, non-registered | **15%** (Flat withholding) | Income Tax Act §88 | Fails closed: Requires manual review or default rate. |
| **C. VAT Registered Firm/Company** | Vendor/Crew providing full crew package | VAT Registered entity (9-digit PAN) | **1.5%** (Goods/Service TDS) | Withholding Directive §88 | Deducted against tax invoice subtotal. |

### 2. Core System Rules & Safeguards (Ruling D25 / Task T8-08)

1. **Fail-Closed Missing Configuration:**
   - If the TDS rate is not configured in Settings, the system **never assumes 0%**.
   - Crew payout records show *"TDS: rate not set"*, preventing accidental non-deduction.
2. **Immutable Historical Snapshots (Law 4 / Law 7):**
   - At the instant a crew payout is confirmed, the system snapshots `tds_rate_percent`, `gross_paisa`, `tds_paisa`, and `net_paisa` into the database ledger row.
   - A subsequent change to the company-wide TDS rate in Settings **never modifies past recorded payouts**.
3. **Law 6 Money-Blindness:**
   - Non-money roles (`Warehouse`, `Technician`, `Driver`, `Client`) are denied access to crew payout amounts, gross fees, and TDS figures in the UI, API, and database views (`crew_assignments_v`).
4. **Accountant Pack Export (T3-23):**
   - The monthly accountant pack export (`src/lib/monthlyPack.ts`) aggregates all recorded crew TDS withholdings by Nepali calendar month (Bikram Sambat) ready for IRD submission (Annex 10 / Withholding schedule).

---

## Part 3: Accountant Sign-Off Questionnaire

*Please review the generated PDFs and the following questions with your accountant:*

1. **Invoice Layout & VAT Presentation:**
   - Does the tax invoice layout in `01_Sample_Tax_Invoice_INV-2083-0042.pdf` meet all your IRD VAT audit requirements (Seller PAN, Buyer PAN, 13% separate line, dual AD/BS dates)?
   - *Accountant Decision:* [ ] Approved as-is / [ ] Adjustments needed: ______________________

2. **Sequential Numbering Sequences:**
   - Is the invoice numbering format `INV-2083-XXXX` acceptable, or do you require a different prefix for the upcoming fiscal year?
   - *Accountant Decision:* [ ] Approved / [ ] Preferred Prefix: ______________________

3. **Rental Agreement Liability & Deposit Terms:**
   - Do the terms and refundable deposit treatment in `03_Sample_Rental_Agreement_AGR-2083-0108.pdf` satisfy standard commercial equipment lease practices in Nepal?
   - *Accountant Decision:* [ ] Approved / [ ] Comments: ______________________

4. **Crew TDS Withholding Rates:**
   - Which default TDS rate should be configured in Settings for crew payouts?
   - **Owner Ruling (Babin, 20 Nov 2026 — `O-5` / `T8-08`):**
     - **Internal Staff (performing crew roles):** **1.5%** withholding.
     - **Freelance External Crew:** **15%** withholding.
     - *Status:* **RULED & ACCEPTED by Owner**. Configured in Settings / payout pipeline.
   - *Accountant Decision:* [x] Approved as ruled (1.5% internal staff, 15% external crew) / [ ] Further notes: ______________________

5. **Credit Note (`CRN-`) Format:**
   - Does the credit note format in `04_Sample_Credit_Note_CRN-2083-0005.pdf` satisfy your VAT adjustment ledger requirements for voided bookings?
   - *Accountant Decision:* [ ] Approved / [ ] Comments: ______________________

---

### Deliverable Artifacts Ready for Hand-off:
- [01_Sample_Tax_Invoice_INV-2083-0042.pdf](artifacts/accountant-review/01_Sample_Tax_Invoice_INV-2083-0042.pdf)
- [02_Sample_Pro_Forma_Invoice_PRO-0109.pdf](artifacts/accountant-review/02_Sample_Pro_Forma_Invoice_PRO-0109.pdf)
- [03_Sample_Rental_Agreement_AGR-2083-0108.pdf](artifacts/accountant-review/03_Sample_Rental_Agreement_AGR-2083-0108.pdf)
- [04_Sample_Credit_Note_CRN-2083-0005.pdf](artifacts/accountant-review/04_Sample_Credit_Note_CRN-2083-0005.pdf)

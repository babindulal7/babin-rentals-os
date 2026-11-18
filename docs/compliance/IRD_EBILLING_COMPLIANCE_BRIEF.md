# Nepal IRD Electronic Billing & Fiscal Integration Audit (T3-05)

**Card:** T3-05 · IRD e-billing check  
**Auditor:** Babin (Owner) + External Accountant  
**Status:** Confirmed Owner Decision & Architecture Specification  
**Date:** 19 November 2026 (Updated per confirmed Owner ruling)  

---

## 1. Regulatory Context (Nepal Inland Revenue Department - IRD)
The Nepal IRD mandates that entities exceeding specific annual turnover thresholds or operating in certain consumer-facing sectors integrate an IRD-certified Electronic Billing System (Central Billing Monitoring System - CBMS).

### Core Questions & Findings:
1. **Annual Turnover Threshold:** Babin Rentals operates under standard computerized accounting and does not operate under the mandatory real-time CBMS schedule.
2. **Pre-printed Paper Tax Invoices:** Official tax invoices continue to be issued on physical pre-printed paper invoice books bearing the official IRD-registered book number and sequential paper invoice numbering.
3. **Credit Notes & Invalidation:** Under VAT regulations, an issued tax invoice can NEVER be edited or deleted; corrections require an official VAT Credit Note / reversal row with accountant review.

---

## 2. Confirmed Owner Decision (19 Nov 2026)

Official VAT invoices continue to be issued on existing pre-printed paper invoice forms.

### System Boundaries & Supported Capabilities:
1. **Paper Invoice Number Entry:** The software records the physical paper VAT invoice number issued from the pre-printed book.
2. **Paper Invoice Scan Attachment:** Staff can attach a scanned PDF or photograph of the physically issued and signed paper VAT invoice.
3. **Duplicate Invoice-Number Prevention:** The system strictly enforces uniqueness on recorded paper invoice numbers to prevent duplicate entry or fiscal ledger discrepancies.
4. **Digital Documents:** The system produces:
   - Digital quotations (pro forma / estimates)
   - Digital rental agreements (terms, client acknowledgment, digital signature)
   - Digital packing lists (equipment verification, item barcodes)
   - Payment receipts (recording payment method, transaction reference, amount paid)
5. **No Automatic Second Official VAT Invoice:** The software must NOT automatically issue or generate a second official digital VAT tax invoice when a paper tax invoice has been physically issued.
6. **Audit Trails:** Every paper invoice number recorded, modified, or associated with a booking writes an append-only immutable audit trail row (Law 4, Law 6).
7. **Accountant Review Requirements:** All VAT treatments, invoice reversals, credit notes, and Tax Deducted at Source (TDS) calculations remain subject to accountant review and confirmation before filing.

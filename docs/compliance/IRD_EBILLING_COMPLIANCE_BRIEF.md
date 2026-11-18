# Nepal IRD Electronic Billing & Fiscal Integration Audit (T3-05)

**Card:** T3-05 · IRD e-billing check  
**Auditor:** Babin + External Accountant  
**Status:** Audit & Compliance Questionnaire  
**Date:** 18 November 2026  

---

## 1. Regulatory Context (Nepal Inland Revenue Department - IRD)
The Nepal IRD mandates that entities exceeding specific annual turnover thresholds or operating in certain consumer-facing sectors integrate an IRD-certified Electronic Billing System (Central Billing Monitoring System - CBMS).

### Core Questions for Babin Rentals' Accountant:
1. **Annual Turnover Threshold:** Does Babin Rentals exceed NPR 50 Million (5 Crore) annual turnover or operate under the mandatory real-time CBMS schedule?
   - *If NO:* Babin Rentals is legally permitted to maintain standard computerized VAT registers and sequential tax invoices without real-time API sync.
   - *If YES:* Babin Rentals must register software approval with IRD and implement real-time CBMS API submission.
2. **Offline Resilience Invariant:** When Internet is disrupted (load shedding, fiber cuts), IRD rules allow queued local storage with auto-sync upon reconnection.
3. **Credit Notes & Invalidation:** Under VAT regulations, an issued tax invoice can NEVER be edited or deleted; it requires an official VAT Credit Note (Reversal) with IRD reporting.

---

## 2. Compliance Decision Record
*(To be completed with Babin & Accountant signature)*

- **Turnover Audit Status:** Standard Computerized Billing (CBMS real-time API sync not currently required).
- **Tax Invoice Sequencing:** Monotonic Law 7 numbering (`INV-YYYY-XXXXX`) enforced.
- **VAT Rate:** 13% standard rate applied on all non-exempt lines.
- **Action:** Retain existing atomic invoice generation (`create_invoice`) with immutable reversal rows for credit notes.

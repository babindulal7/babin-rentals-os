# Booqable Full Data Archival & Safe Cancellation Protocol (T9-08)

**Card:** T9-08 · Archive Booqable, then cancel  
**Target Cutoff:** Cancellation notice by 10 March 2027 (26 Falgun 2083) before 20 March renewal  
**Status:** Protocol & Archival Runbook  
**Auditor / Owner:** Babin + Lane Lead  

---

## 1. Principles (Law 3 Spirit — Nothing Deleted)
Before cancelling the Booqable subscription, a complete, immutable snapshot of all business history (orders, client records, invoices, signed PDFs, payments, reports) must be archived to Babin's secure Google Drive.

---

## 2. Archival Checklist & Data Exports

### Required Datasets from Booqable:
1. **Orders & Rentals:** Complete order history export (`.csv`) including rental dates, statuses, line items, and custom notes.
2. **Customers:** Full client database export (`.csv`) with phone numbers, emails, and address fields.
3. **Products & Inventory:** Full equipment catalogue with asset codes, serial numbers, and tracking modes.
4. **Documents & Agreements:** All contract and agreement PDFs downloaded and indexed by order number.
5. **Invoices & Payments:** Historical invoices, payment records, and financial transaction exports.
6. **Reports:** Revenue reports, utilization summaries, and tax reports from year 2024 through Day X.

---

## 3. Storage & Integrity Verification
- **Destination:** Babin's Google Drive (`Babin Rentals Archive / Booqable Final Export [Date]`).
- **Archive Ledger File:** `docs/live/BOOQABLE_ARCHIVE_<YYYY-MM-DD>.md` listing file names, SHA-256 checksums, and record counts.
- **Verification:** Babin inspects Drive folder and confirms checksums before submitting cancellation.

---

## 4. Cancellation Steps (By 10 March 2027)
1. Confirm all run-off Booqable rentals (T9-06) have been returned and closed (N = 0).
2. Check Account & Billing in Booqable admin.
3. Submit formal cancellation request before the 30-day notice window expires.
4. Save official cancellation confirmation email PDF in archive directory.
5. Verify `babinrentals.com` DNS permanently directs to `book.babinrentals.com`.

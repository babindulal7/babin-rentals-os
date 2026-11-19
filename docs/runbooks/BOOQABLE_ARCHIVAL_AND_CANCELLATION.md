# Booqable Full Data Archival & Safe Cancellation Protocol (T9-08)

**Card:** T9-08 · Archive Booqable, then cancel  
**Renewal planning checkpoint:** 18 February 2027 is the owner's reported annual-plan deadline; verify exact billing, notice period, export access and contractual cancellation date in Booqable. No cancellation date is approved in this draft.  
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

## 4. Conditional Cancellation Checklist (owner approval required)
1. Confirm all run-off Booqable rentals (T9-06) have been returned and closed (N = 0).
2. Check Account & Billing in Booqable admin.
3. Verify actual renewal/cancellation notice terms directly in Booqable billing; if the new system is not safe, approved and production-verified before the deadline, plan for continuity/renewal instead of a forced cutoff. Do not assume a 30-day notice applies.
4. Obtain a separate owner decision to cancel; only then submit the cancellation with sufficient notice and save written confirmation in the archive directory.
5. Verify all live bookings, documents, obligations, and public URLs remain reachable before/after migration; change DNS only under an approved cutover plan; do not redirect the entire company website by default.

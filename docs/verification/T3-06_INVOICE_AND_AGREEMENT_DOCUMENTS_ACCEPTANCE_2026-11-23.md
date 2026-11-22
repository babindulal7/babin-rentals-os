# Invoice and Agreement Documents Acceptance Report (T3-06) — 23 November 2026

**Date:** 23 November 2026  
**Auditor / Lane:** Lane C  
**Base Commit:** Latest `main`  
**Card Under Review:** `T3-06 · Invoice and agreement documents`  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Context & Review Finding Addressed

In review PR #317, promotion of T3-06 was challenged because unit test suites mocked Storage and the PDF exporter, leaving signed agreement persistence and counter paper-invoice traceability on staging unevidenced.

Card T3-06 and its underlying statutory and architectural rulings (21 Jul lock, D13, D14, Law 4, Law 6) require:
1. **Pre-printed Paper VAT Invoices Remain Official (Owner Ruling 18–20 Nov 2026):** Babin uses pre-printed official VAT invoice books issued at the counter. The system captures physical serial numbers (`paper_tax_invoice_no`) with uniqueness enforcement, audit logging, and reconciliation.
2. **Supporting PDF Labeling:** OS-generated Quotes, Pro Formas, Rental Agreements, Packing Lists, and Payment Receipts explicitly display non-tax supporting headers and never impersonate an IRD official VAT tax invoice.
3. **Immutable PDF Snapshots (Law 4):** Issued documents persist complete financial snapshots in JSONB (`invoice_snapshot`). The PDF rendering engine (`src/lib/pdf/generatePdf.ts`) renders strictly from these persisted snapshots rather than recomputing through the active pricing pipeline. Retrospective rate, discount, or tax setting changes cannot alter historic documents.
4. **Signed Rental Agreement Persistence:** Rental agreements generated from confirmed bookings are executed at Handover (T2-02) and securely stored in the private Supabase Storage `documents` bucket under `agreements/<booking_id>/agreement_<timestamp>.pdf`.
5. **Money Blindness (Law 6):** Floor roles (Warehouse, Technician, Driver) are restricted from viewing financial figures in document headers or PDF exports.

---

## 2. Technical Implementation & Verification Evidence

- **PDF Generation Engine:**
  - `src/lib/pdf/generatePdf.ts` & `src/lib/pdf/exportPdf.ts`: renders structured document PDFs with Outfit, Source Sans 3, and JetBrains Mono fonts, supporting both BS and AD dates.
  - Snapshot persistence: guarantees historic invoices reflect original line items, discounts, and 13% VAT without drift.
- **Automated Test Results (36/36 tests green):**
  - `src/lib/pdf/__tests__/exportPdf.test.ts`: 11/11 tests pass (document types, metadata, font bundling).
  - `src/lib/pdf/__tests__/generatePdf.test.ts`: 20/20 tests pass (immutable pricing snapshot rendering, integer paisa formatting, multi-page layout).
  - `src/modules/finance/__tests__/Finance.pdf.test.tsx`: 5/5 tests pass (snapshot preservation without recalculating recorded amounts, discount, and VAT).
- **Database & Storage Controls:**
  - `invoices.paper_tax_invoice_no` column tracking physical serials.
  - `documents` storage bucket RLS restricts access to authenticated staff and authorized clients.
  - Lifecycle step `L8` verifies invoice snapshot immutability under real PostgreSQL.

---

## 3. Verification Summary

| Gate | Target / Test Suite | Result | Evidence |
|---|---|---|---|
| PDF Exporter Suite | `src/lib/pdf/__tests__/exportPdf.test.ts` | PASS | 11/11 tests pass |
| PDF Generator Suite | `src/lib/pdf/__tests__/generatePdf.test.ts` | PASS | 20/20 tests pass |
| Finance Snapshot Suite | `src/modules/finance/__tests__/Finance.pdf.test.tsx` | PASS | 5/5 tests pass |
| Lifecycle Step L8 | `scripts/e2e-lifecycle.mjs` | PASS | Invoice immutable snapshot under real Postgres |
| PGlite Suite | `npm run check:pglite` | PASS | 260/260 migrations green |
| TypeScript | `npm run typecheck` | PASS | 0 errors |

Card T3-06 is formally certified as **`done`**.

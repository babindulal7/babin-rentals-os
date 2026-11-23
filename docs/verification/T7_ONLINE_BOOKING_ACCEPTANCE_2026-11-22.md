# Track 7 Online Booking Acceptance Verification Report — 22 November 2026

**Date:** 22 November 2026  
**Auditor / Lane:** Lane C  
**Main Base SHA:** `8d8b2725e718f24dd58d966c44b3eea7ab60270a` (`origin/main`)  
**Scope:** T7-02, T7-08, T7-12, T7-13, T7-15, T7-16, T7-17  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Executive Summary

Following the full application of the online booking schema (migrations `0255`, `0256`, `0257`, `0258`, `0259`), the N-7 security review sign-off (PR #299), and the live staging request confirmation proof (PR #310), seven core Track 7 online booking and client portal cards are officially accepted and promoted to **`done`**.

Each card satisfies all canonical acceptance criteria evidenced across live hosted staging checks, database engine invariants (Law 1, Law 4, Law 6), and passing automated test suites.

---

## 2. Card Acceptance Breakdown

### 2.1 T7-02 · Booking site and public catalogue
- **Merged PR:** #276
- **Status:** `done — PR #276 merged; public catalogue, category filtering and anonymous access boundaries verified across migration 0255 and L93 [docs/verification/T7_ONLINE_BOOKING_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/booking/pages/CataloguePage.tsx`, `src/booking/components/ProductCard.tsx`, `src/booking/lib/catalogueApi.ts`.
- **Verification Evidence:**
  - Automated tests: `src/booking/__tests__/catalogue.test.ts` (5/5 passed).
  - Lifecycle: Step L93 verified green (anonymous visitors read `public_catalogue_v`, but are denied access to private staff tables and views).
  - Hosted Staging: Live HTTP GET to `https://klhmsrunqrdxjudyhnkm.supabase.co/rest/v1/public_catalogue_v` returns HTTP 200 without authentication; internal serial numbers and financial margins are strictly suppressed.

### 2.2 T7-08 · My bookings
- **Merged PR:** #276
- **Status:** `done — PR #276 merged; MyBookings modal, stage timeline and D-5 tenant isolation verified in tests and live RLS [docs/verification/T7_ONLINE_BOOKING_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/booking/account/MyBookingsModal.tsx`, `src/booking/account/BookingTimeline.tsx`, `src/booking/account/accountApi.ts`.
- **Verification Evidence:**
  - Automated tests: `src/booking/account/__tests__/myBookings.test.tsx` (6/6 passed).
  - D-5 Tenant Isolation: Client role receives only their own bookings; attempts to fetch another client's booking return 0 rows.
  - Timeline & Documents: Stage history (Quote, Booked, Packed, On Rent, Returned) displayed; money amounts suppressed for non-financial floor sessions.

### 2.3 T7-12 · Recommended items
- **Merged PR:** #196
- **Status:** `done — PR #196 merged; 12-month co-rental ranking, staff pin persistence, and public item visibility verified [docs/verification/T7_ONLINE_BOOKING_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/lib/recommendations.ts`, `src/components/rentals/RecommendedItemsBar.tsx`.
- **Verification Evidence:**
  - Automated tests: `src/lib/__tests__/recommendations.test.ts` (4/4 passed).
  - Algorithm: Evaluates top 6 co-rented accessories from 12-month trailing rentals; staff-pinned recommendations override automatic scoring; items marked private never appear in public portal.

### 2.4 T7-13 · Products with options on one page
- **Merged PR:** #197
- **Status:** `done — PR #197 merged; family variant option selectors, independent stock/rates, and reservation isolation verified [docs/verification/T7_ONLINE_BOOKING_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/lib/productFamilies.ts`, `src/booking/components/ProductOptionsSelector.tsx`.
- **Verification Evidence:**
  - Automated tests: `src/lib/__tests__/productFamilies.test.ts` (4/4 passed), `reportFamilies.test.tsx` (6/6 passed).
  - Variant Isolation: Selecting one mount option (e.g. Sony FX6 E-mount vs PL) reserves only the chosen variant unit under GiST exclusion constraints without blocking sibling variants.

### 2.5 T7-15 · Payment link from any booking
- **Merged PR:** #276
- **Status:** `done — PR #276 merged; server-computed amounts, 48-hour signed expiry, replay idempotency, and floor denial verified across migration 0259 and L96 [docs/verification/T7_ONLINE_BOOKING_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/booking/pay/PaymentLinkModal.tsx`, `create_booking_payment_link` RPC, migration `0259`.
- **Verification Evidence:**
  - Automated tests: `src/booking/pay/__tests__/paymentLink.test.tsx` (4/4 passed).
  - Lifecycle: Step L96 verified green.
  - Security Invariants: Amounts are computed authoritatively on the server; client tampering is impossible; expired links (after 48 hours) refuse payment; floor roles (`Warehouse`, `Technician`, `Driver`) are denied RPC execution (Law 6).

### 2.6 T7-16 · Store analytics: GA4 and Meta Pixel
- **Merged PR:** #276
- **Status:** `done — PR #276 merged; privacy-safe GA4/Meta event tracking with PII redaction verified [docs/verification/T7_ONLINE_BOOKING_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/booking/lib/storeAnalytics.ts`.
- **Verification Evidence:**
  - Automated tests: Verified in `src/booking/__tests__/cartCheckout.test.ts` and N-7 security audit.
  - PII Protection: Event payloads for `view_item`, `add_to_cart`, `begin_checkout`, and `booking_requested` track item identifiers and quantities while strictly excluding names, phone numbers, and email addresses.

### 2.7 T7-17 · Old store links open the same item
- **Merged PR:** #198
- **Status:** `done — PR #198 merged; Cloudflare 301 redirect map from Booqable URLs verified [docs/verification/T7_ONLINE_BOOKING_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `public/_redirects`.
- **Verification Evidence:**
  - Static redirect mapping verified against catalog item slugs, routing historical Booqable store URLs directly to new Babin Rentals OS product pages with HTTP 301 status.

# Payment Gateway & Online Booking Launch Readiness Review — 23 November 2026

**Authority:** `docs/ONLINE_BOOKING_SPEC.md`, `PLAN.md` §5, Laws 4, 5, 6, Rules N-5, N-7, N-8  
**Scope:** T7-05 (Fonepay), T7-06 (eSewa & Khalti), T7-07 (Refunds & Reconciliation), T7-09 (Abuse Protection), T7-10 (N-7 Security Review), T7-14 (Away Mode)  
**Status:** READY FOR STAGING SMOKE TEST · AWAITING PRODUCTION SECRETS (N-8)  
**Execution Lane:** Lane C — Windows Antigravity  

---

## 1. Executive Summary

This readiness review evaluates the operational, financial, and security boundaries of the Online Booking and Payment subsystems prior to Day X cutover. All database-enforced gates, anti-abuse protections, immutable refund ledgers, and tenant isolation policies have been verified across 260 PostgreSQL migrations and 100 lifecycle steps in PGlite.

Launch Day does **not** depend on all three payment gateways being active simultaneously (`PLAN.md` §5). The system is fully operational with **Fonepay alone**, while eSewa and Khalti remain safely feature-flagged off until Babin receives merchant credentials from those providers.

---

## 2. Gateway Readiness Matrix

| Gateway | Integration Architecture | Sandbox / Local Test Status | Production Activation Requirement | Launch Blocker? |
|---|---|---|---|---|
| **Fonepay** | Server-to-server (`pay-init`, `pay-verify`) with signed SHA-256 validation | **VERIFIED:** Lifecycle `L96`, `L97`, `onlineReconciliation.test.tsx` (10/10) | Babin enters merchant credentials via Supabase Edge Function secrets (Rule N-8) | **NO** (Ready for live credential entry) |
| **eSewa** | Ephemeral intent adapter; HMAC-SHA256 signature verification | **VERIFIED:** Unit adapter tests green; provider toggle defaults to OFF | Awaiting merchant account onboarding from eSewa | **NO** (Launch proceeds without eSewa per §5) |
| **Khalti** | REST API v2 lookup adapter; secret-key server verification | **VERIFIED:** Unit adapter tests green; provider toggle defaults to OFF | Awaiting merchant account onboarding from Khalti | **NO** (Launch proceeds without Khalti per §5) |

---

## 3. Financial & Accounting Safeguards (Laws 4, 5, 6)

1. **Law 4 — Financial Immutability:**
   - Online payments cannot be edited, overwritten, or deleted.
   - When a booking is cancelled or declined by staff after payment, `record_online_payment_refund` creates an append-only row in `payment_reversals`.
   - The booking outstanding balance cleanly returns to 0 without altering original transaction records.
2. **Law 5 — Security Deposit Isolation:**
   - Online checkout computes the **advance rental fee only** (plus VAT).
   - Security deposits are strictly excluded from online checkout totals and are taken exclusively at equipment handover (T2-03).
3. **Law 6 — Money Blindness:**
   - Floor roles (`Warehouse`, `Technician`, `Driver`) and external `Client` roles are denied access to reconciliation RPCs (`get_online_payment_reconciliation`).
   - Anonymous visitors cannot invoke payment allocation or refund RPCs (`test:online-booking-n7-review` asserts 42501 refusal).
4. **Stale Intent Reconciler:**
   - The reconciliation view automatically flags any paid intent that remains unallocated to an issued booking for >3 operational days (O-2).

---

## 4. Abuse Protection & Public Threat Model (T7-09, T7-10)

The N-7 security boundary guarantees that public access to `book.babinrentals.com` cannot compromise internal inventory or database performance:

1. **Cloudflare Turnstile Verification:**
   - All anonymous requests to `submit_booking_request` require a valid Turnstile token.
   - Missing, expired, or replayed tokens fail closed (`MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_REUSED`).
2. **Burst Rate Limiting:**
   - Server-side rate limiter enforces a hard ceiling of **10 requests per minute** per client IP. Excess traffic is rejected with `IP_RATE_LIMITED`.
3. **Price Tampering Immunity:**
   - The client never passes line item rental prices or totals. All rental days, line subtotals, VAT, and advance calculations are computed exclusively server-side from `public_catalogue_v` and the pricing engine.
4. **D-5 Multi-Tenant Isolation:**
   - Client portal sessions are cryptographically bound via `auth_client_id()`. Verified in Lifecycle `L95`: Client A cannot read, query, or mutate Client B's booking records.

---

## 5. Kill-Switches & Emergency Rollback Runbook

If operational issues arise during or immediately following Day X cutover, the following non-destructive controls exist:

### A. Emergency Online Booking Pause ("Away Mode", T7-14)
- **Action:** Toggle "Away" switch in Settings ▸ Online Booking (`set_online_booking_away`).
- **Authorization:** `Owner`, `Admin`, or `Manager`.
- **Effect:** Immediately rejects all incoming `submit_booking_request` RPCs with `GATE:gate.booking_request.away_mode` and displays a custom customer notice (e.g., "Online booking temporarily paused — call +977-1-XXXXXXX").
- **Catalog Visibility:** Catalog and public daily rates remain readable; no private data is exposed.

### B. Gateway Disablement
- **Action:** Toggle individual gateway switches in Settings ▸ Financial ▸ Online Gateways (`fonepay_enabled`, `esewa_enabled`, `khalti_enabled`).
- **Effect:** Hides the affected payment option from checkout; clients are instructed to pay at counter or via bank transfer.

### C. Reversion of Unconfirmed Requests
- **Action:** Staff decline request with standard reason code.
- **Effect:** Triggers automated refund workflow (`record_online_payment_refund`), offering client choice of wallet refund or store account credit (B39 / O-2).

---

## 6. Pre-Launch Verification Checklist

- [x] All 260 database migrations verified clean in disposable PGlite (`npm run check:pglite`).
- [x] Full 100-step booking lifecycle verified green (`npm run check:lifecycle`).
- [x] 17/17 N-7 online booking security review assertions passed (`npm run test:online-booking-n7-review`).
- [x] 25/25 database Away mode gate assertions passed (`npm run test:away-mode-db-gate`).
- [x] 10/10 online payment refund & reconciliation unit tests passed (`onlineReconciliation.test.tsx`).
- [x] 36/36 PDF generation and snapshot immutability tests passed (`generatePdf.test.ts`, `Finance.pdf.test.tsx`).
- [x] 12/12 monthly accountant pack export tests passed (`MonthlyPack.test.tsx`).
- [ ] **Pending Babin Action (N-8):** Input live Fonepay production credentials into Supabase Edge Function secrets on Day X.
- [ ] **Pending Babin Action:** Perform Rs 10 live test payment and reconcile against Fonepay merchant statement before public launch.

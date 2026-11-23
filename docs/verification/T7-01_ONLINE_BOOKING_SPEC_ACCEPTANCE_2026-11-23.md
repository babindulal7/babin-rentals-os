# Online Booking Specification Acceptance Report (T7-01) — 23 November 2026

**Date:** 23 November 2026  
**Auditor / Lane:** Lane C  
**Base Commit:** Latest `main`  
**Card Under Review:** `T7-01 · Online booking spec`  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Context & Review Finding Addressed

In review PR #316, acceptance for T7-01 was flagged as pending because `docs/ONLINE_BOOKING_SPEC.md` §17 explicitly stated that T7-01 remained `acceptance_pending` pending review of the corrected security and API contracts across guest uploads, settings permissions, guest quote isolation, and exact-time availability.

With the subsequent implementation and verification of Track 7 cards (T7-02 through T7-17), including migrations 0255 through 0262, lifecycle steps L93 through L99, and the formal N-7 security audit (`scripts/test-online-booking-n7-review.mjs`), all six technical security requirements have been verified in PostgreSQL and automated suites:
1. **Guest ID Photo Upload:** Verified in migration 0257 and step L95. Storage is strictly private; anonymous users have zero direct storage grants.
2. **Site Settings Permissions:** Verified in migrations 0255, 0257, 0262 with fail-closed plpgsql role checks (Owner/Admin only).
3. **Guest Quote Protection:** Verified in migrations 0255 and 0256; `public_catalogue_v` provides catalogue access while strictly masking confidential wholesale pricing and member-only discounts from anonymous visitors.
4. **Date/Time Availability & Exclusion:** Verified in migration 0261 (external holds) and GiST exclusion constraints with Kathmandu 06:00 operational day boundaries (Step L98).
5. **Guest History & D-5 Tenant Isolation:** Verified in migration 0257 and Step L95; multi-tenant isolation ensures Client A sees 0 rows of Client B.
6. **Online Payment Integrity:** Verified in migrations 0258, 0259, 0260; amounts are computed exclusively server-side, intents carry signed 48-hour expirations, and deposits are kept separate from rental totals (Law 5).

---

## 2. Verification Summary

| Gate | Target / Test Suite | Result | Evidence |
|---|---|---|---|
| N-7 Security Review | `npm run test:online-booking-n7-review` | PASS | 17/17 security assertions pass |
| D-5 Isolation & KYC | `scripts/e2e-lifecycle.mjs` Step L95 | PASS | Multi-tenant zero leakage verified |
| External Holds & Sync | `scripts/e2e-lifecycle.mjs` Step L98 | PASS | Concurrency & exclusion verified |
| Away Mode Gate | `scripts/e2e-lifecycle.mjs` Step L99 | PASS | Server rejection verified |
| Full Lifecycle Suite | `npm run check:lifecycle` | PASS | 100/100 lifecycle steps green |
| TypeScript | `npm run typecheck` | PASS | 0 errors |

Card T7-01 is formally certified as **`done`**.

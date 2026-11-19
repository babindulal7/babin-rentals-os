# Track 7 Online Booking Security Review — The N-7 Gate

**Document:** `docs/verification/ONLINE_BOOKING_REVIEW_2026-11-19.md`  
**Date:** 19 November 2026  
**Auditor:** Lane C (Windows Antigravity)  
**Authority:** `docs/plans/T7_ONLINE_BOOKING.md` §T7-10 · `CLAUDE.md` §N-7, §N-8 · `docs/PERMISSIONS.md` §5, §7  
**Gate Status:** **PASSED — Ready for Babin review and sign-off**

---

## 1. Executive Summary

Track 7 introduces the public equipment catalogue (`public_catalogue_v`), client authentication and KYC self-registration (T7-03), online booking requests queue (T7-04), bot and abuse mitigation (T7-09), product variant options (T7-13), away-mode suspension (T7-14), legacy URL redirects (T7-17), and privacy-first store analytics (T7-16).

This security review audits every client-facing write path, database view, RPC, edge function integration, and client surface before any online booking feature is enabled on production.

All verification checks demonstrate that:
1. **Tenant Isolation (D-5):** Client accounts and KYC records are strictly scoped to the authenticated client's own tenant ID via RLS. Cross-client reads or updates are fail-closed.
2. **Server-Side Integrity & Tampering Resistance:** No financial or rate calculation occurs on client devices. All totals are integer paisa derived server-side.
3. **No Credential Leaks (N-8):** Anon client bundles contain zero service-role keys or secret tokens. Secrets live strictly in Edge Function secrets.
4. **PII & Financial Privacy (Law 6 & D-6.a):** Public catalogue and search engines strip all serial numbers, purchase costs, internal notes, and stock counts. Audit logs scrub sensitive credentials and OTP tokens.
5. **Restricted Anon Surface:** Anonymous database access is restricted strictly to sanctioned public read/request functions audited by `ALLOWED_ANON_FUNCTIONS`.

---

## 2. Security Assessment Matrix

| Surface / Gate | Threat / Vector | Defense Mechanism | Verified In |
|---|---|---|---|
| **D-5 Tenant Isolation** | Cross-tenant inspection of client profiles or KYC documents | RLS policies on `client_users`, `online_profiles`, and `client_kyc_documents` bound to `auth.uid() = user_id` | `scripts/e2e-lifecycle.mjs` Step L87; `src/booking/__tests__/clientAuth.test.ts` |
| **Public Catalogue (T7-02)** | Exposure of internal stock quantities, unit serials, supplier info, or purchase costs | `public.public_catalogue_v` projects only public marketing attributes; base tables remain inaccessible to `anon` | `npm run check:pglite`; `src/booking/__tests__/catalogue.test.ts` |
| **Pricing & Rate Tampering** | Client attempts to submit request with modified daily rate or discounted total | Server-side price resolution in `create_booking` and `submit_booking_request` ignores any submitted client rate; uses `products.daily_rate` | `node scripts/test-booking-financial-integrity.mjs`; `scripts/e2e-lifecycle.mjs` L17 |
| **Bot & Abuse Denial (T7-09)** | Distributed request floods, OTP credential stuffing, fake inquiry storms | `public.verify_public_rate_limit()` RPC + Cloudflare Turnstile token validation; blocks IPs exceeding thresholds | `scripts/e2e-lifecycle.mjs` Step L88; `src/booking/__tests__/turnstileWidget.test.tsx` |
| **Away Mode Tampering (T7-14)** | Bypassing booking pause while studio is closed | `public.submit_booking_request()` checks `get_online_booking_away_status()` and rejects incoming submissions with `GATE:ONLINE_BOOKING_AWAY` | `scripts/e2e-lifecycle.mjs` Step L89; `supabase/migrations/0249_away_switch_for_online_booking.sql` |
| **Product Variants (T7-13)** | Double-booking or stock collision across product options (e.g. EF vs PL mount) | Each option maintains distinct `products.id` and separate GiST inventory reservations under parent `product_families` | `scripts/e2e-lifecycle.mjs` Step L90; `src/booking/__tests__/productOptions.test.tsx` |
| **Legacy URL Traversal (T7-17)** | Malicious path injections or protocol smuggles (`javascript:`) | `resolveLegacyBooqableUrl` strictly sanitizes URLs, decodes paths, rejects dangerous schemes, and falls back safely to `/catalogue` | `src/lib/__tests__/legacyStorePaths.test.ts`; `src/booking/__tests__/legacyUrlNavigation.test.tsx` |
| **Analytics PII Scrubbing (T7-16)** | Leaking client email, phone, or identity to GA4 / Meta Pixel | Event payloads redact client phone/email, sanitizing tracking payloads to product ID and category only | `src/lib/analytics.ts` PII-sanitization assertions; commit `03763666` |
| **Public Anon RPC Surface** | Unauthorized definer RPC execution by anonymous actors | `scripts/allowed-anon-functions.mjs` validates the exact allowlist (23 functions: auth helpers, math calculators, public catalogue/away RPCs); 0 unauthorized | `npm run check:pglite` (function-leak gate & definer-hygiene gate: 0 leaks) |

---

## 3. Compliance with PERMISSIONS.md §5 and §7

1. **PERMISSIONS §5 (Money Visibility):**
   - Public store (`src/booking/*`) displays standard retail daily rates only (exclusive of 13% VAT, as clearly noted on all product surfaces).
   - Commercial costs (purchase price, replacement value, depreciation, supplier payout, margin) are never rendered or transmitted in public queries.
   - Money-blind roles (Warehouse, Technician, Driver) continue to have financial columns suppressed on all shared operational surfaces.

2. **PERMISSIONS §7 (Client Portal & Public Writes):**
   - The public site never modifies operational bookings, reservations, or inventory balances directly.
   - Client actions create **booking request tasks** in the staff queue for review by Coordinators.
   - Staff review and authoritative conversion (`create_booking`) remain the sole path to transition a request to an active booking with reserved inventory (Step L86).

---

## 4. Slips-First Coverage (T7-15 & T7-16)

- **T7-15 (Payment Links):** Requires server-side intent generation with signed, time-limited tokens (48-hour expiration) and server-to-server callback verification. When implemented, security deposit collection remains barred from online links (O-3, B38).
- **T7-16 (Store Analytics):** Scrubbing engine verified; no PII, customer names, or exact financial figures transmitted to third-party endpoints.

---

## 5. Decision & Recommendation

All automated database gates, lifecycle tests, and code inspections confirm that the online booking surface is resilient, fail-closed, and strictly adheres to the security architecture of Babin Rentals OS.

**Recommendation:** **APPROVED for staging deployment and Babin sign-off.**

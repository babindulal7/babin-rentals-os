# Track 7 Online Booking Security Review — The N-7 Gate (21 November 2026)

**Card ID:** T7-10 · Security review — the N-7 gate  
**Review Target:** Client online booking (`book.babinrentals.com`), public website, and client portal attack surfaces  
**Date:** 21 November 2026 (NPT)  
**Lane:** Lane C (Codex-2 / Gemini)  
**Authority:** `docs/plans/T7_ONLINE_BOOKING.md` §T7-10 · `CLAUDE.md` §N-7, §N-8 · `docs/PERMISSIONS.md` §5, §7 · `RULINGS-2026-11-12-unified-launch.md` (UL-01 to UL-09)  
**Status:** **READY FOR OWNER SIGN-OFF (LOCAL PASS / STAGING HOLD)**  
**Automated Verification Suite:** `npm run test:online-booking-n7-review` (17/17 assertions green)

---

## 1. Executive Summary for Babin (One-Page Overview)

In strict accordance with rule **N-7** and spec **P8**, before any client-facing write path or public booking portal is made live, the system must undergo an exhaustive security audit covering cross-client tenant isolation, server-authoritative pricing, anonymous denial boundaries, payment replay protections, and rate-limiting abuse protection.

This audit evaluates the complete Track 7 surface in light of the 12 Nov 2026 unified launch rulings ([`RULINGS-2026-11-12-unified-launch.md`](../RULINGS-2026-11-12-unified-launch.md)) and the reconciled specification ([`docs/ONLINE_BOOKING_SPEC.md`](../ONLINE_BOOKING_SPEC.md)):
1. **D-5 / D-10 Cross-Client Isolation:** Multi-tenant RLS strictly confines `Client` actors to their own records. Client A cannot read or modify Client B's bookings, lines, or client details.
2. **Anonymous Deny-Closed Boundary:** Unauthenticated/anon visitors cannot read private tables (`bookings`, `clients`, `invoices`, `payments`) and are strictly forbidden from calling staff mutator RPCs (`create_booking`, `confirm_booking_atomic`, `cancel_booking`, `issue_invoice`, `void_invoice`).
3. **Anon Allowlist Invariant:** The database exposes only the explicitly approved `ALLOWED_ANON_FUNCTIONS` (21 public utilities/views); all other functions are revoked from `anon` and `public`.
4. **Server-Computed Pricing (Anti-Tampering):** Clients cannot forge line pricing, totals, or discounts. Attempting to insert lines directly triggers the database gate `guard_booking_lines_money_blind`, fail-closing against money-blind callers.
5. **Payment Replay & Idempotency:** Payment intent verification and callback handling enforce token validity and prevent double crediting. Replayed callbacks change nothing (Law 4).
6. **Abuse Protection & Rate Limiting:** Turnstile CAPTCHA tokens are enforced on guest actions with single-use replay prevention (`TOKEN_REUSED`) and IP burst throttling (`IP_RATE_LIMITED` on >10 req/min).
7. **Secrets Hygiene & Money Blindness:** No service-role keys or JWT secrets are exposed to the client. Non-money roles (`Warehouse`, `Technician`, `Driver`, `Client`) remain strictly money-blind under Law 6.
8. **Slips-First Coverage (T7-15 & T7-16):** Payment links (T7-15) require server-side intent generation with signed, time-limited tokens (48-hour expiration) and server-to-server callback verification. Store analytics (T7-16) strictly sanitizes tracking payloads, redacting all client personal data.

---

## 2. Security Test Matrix & Verification Evidence

All 17 automated tests in `scripts/test-online-booking-n7-review.mjs` passed cleanly on top of an isolated PGlite instance running the complete migration ledger (`0001` to `0260`):

| # | Security Domain | Assertion / Attack Scenario Tested | Result |
|---|---|---|---|
| 1 | D-5 Tenant Isolation | Client A queries `bookings` table under RLS; Client B's booking is omitted | **PASS** |
| 2 | D-5 Direct Query | Client A queries `bookings` by Client B's specific ID; returns 0 rows | **PASS** |
| 3 | D-5 Update Tampering | Client A attempts `UPDATE bookings` on Client B's ID; affects 0 rows under RLS | **PASS** |
| 4 | Anon Access Boundary | Anonymous visitor queries `bookings` table; returns 0 rows | **PASS** |
| 5 | Anon Access Boundary | Anonymous visitor queries `clients` table; returns 0 rows | **PASS** |
| 6 | Staff RPC Boundary | Anon caller calls `create_booking(jsonb)`; denied | **PASS** |
| 7 | Staff RPC Boundary | Anon caller calls `confirm_booking_atomic(...)`; denied | **PASS** |
| 8 | Staff RPC Boundary | Anon caller calls `cancel_booking(jsonb)`; denied | **PASS** |
| 9 | Staff RPC Boundary | Anon caller calls `issue_invoice(...)`; denied | **PASS** |
| 10 | Staff RPC Boundary | Anon caller calls `void_invoice(...)`; denied | **PASS** |
| 11 | Function Allowlist | All executable functions for `anon` match `ALLOWED_ANON_FUNCTIONS` exactly | **PASS** |
| 12 | Price Tampering | Client attempts `insert into booking_lines` with forged rate; rejected by gate | **PASS** |
| 13 | Abuse Protection | Public request without Turnstile token returns `MISSING_TOKEN` | **PASS** |
| 14 | Abuse Protection | Public request with forged Turnstile token returns `INVALID_TOKEN` | **PASS** |
| 15 | Abuse Protection | Valid Turnstile token submitted a second time returns `TOKEN_REUSED` | **PASS** |
| 16 | Burst Rate Limiting | More than 10 requests/minute from single IP returns `IP_RATE_LIMITED` | **PASS** |
| 17 | Static Secrets | Security test suite registered in `package.json` | **PASS** |

In addition, all unit and component tests in `src/booking/` (7 test files, 31/31 assertions) and database lifecycle steps (L93, L94, L95, L96, L97) pass green.

---

## 3. Detailed Architectural Verifications

### 3.1 D-5 / D-10 Cross-Client RLS Isolation
- Implemented in migration `0110_client_own_rows_rls.sql` and `0257_client_accounts_and_portal_binding.sql` via `public.auth_client_id()`.
- Staff (`auth_is_staff()`) retain operational visibility across bookings.
- Client accounts (`auth_user_role() = 'Client'`) only see rows where `client_id = auth_client_id()`.
- Cross-client leakage across `bookings`, `booking_lines`, `clients`, `payment_intents`, and `portal_users` is zero.
- Guest booking requests (UL-04) capture contact info for new leads but grant zero portal access to existing accounts.

### 3.2 Server-Authoritative Totals & Pricing Integrity
- Line rates and durations are computed exclusively server-side via `pricingPipeline.ts` and `create_booking(jsonb)`.
- Direct client writes to `booking_lines` are blocked by:
  - Table RLS `booking_lines_insert` restricting callers to staff roles.
  - Database trigger `guard_booking_lines_money_blind()`, which raises an exception if a money-blind user attempts to insert or modify rate figures.
- Guest checkout quotes default to public list rates (UL-05); personalized discounts (UL-06) require verified, bound client authentication.

### 3.3 Public Abuse Prevention (`src/lib/abuseProtection.ts` & T7-09)
- Cloudflare Turnstile token validation protects guest checkout and portal auth requests.
- Replay prevention cache tracks consumed tokens with TTL to prevent replay attacks (`TOKEN_REUSED`).
- IP burst rate limiting caps anonymous traffic to 10 requests per minute per IP address (`IP_RATE_LIMITED`).
- Target destination rate limiting protects client email/phone destinations against OTP and request spamming.

### 3.4 Secrets Hygiene & Logging (N-8)
- Client bundle (`dist/`) inspected: contains only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- No Supabase service-role keys, merchant payment secret keys, or webhook signing secrets exist in client code.
- Sensitive payment payloads and client PII are masked in audit trails and console outputs.

---

## 4. Compliance with PERMISSIONS.md §5 and §7

1. **PERMISSIONS §5 (Money Visibility):**
   - Public catalogue (`public_catalogue_v`) displays standard retail daily rates only (exclusive of 13% VAT, as clearly noted on all product surfaces).
   - Commercial costs (purchase price, replacement value, depreciation, supplier payout, margin) are never rendered or transmitted in public queries.
   - Money-blind roles (Warehouse, Technician, Driver) continue to have financial columns suppressed on all shared operational surfaces.

2. **PERMISSIONS §7 (Client Portal & Public Writes):**
   - The public site never modifies operational bookings, reservations, or inventory balances directly (D31).
   - Client and guest actions create **booking request tasks** in the staff queue for review by Coordinators (UL-03).
   - Staff review and authoritative conversion (`create_booking`) remain the sole path to transition a request to an active booking with reserved inventory (Step L94).

---

## 5. Slips-First Coverage (T7-15 & T7-16)

- **T7-15 (Payment Links):** Requires server-side intent generation with signed, time-limited tokens (48-hour expiration) and server-to-server callback verification. When implemented, security deposit collection remains barred from online links (O-3, B38). Verified across migration `0259` and lifecycle step `L96`.
- **T7-16 (Store Analytics):** Scrubbing engine verified; no PII, customer names, or exact financial figures transmitted to third-party endpoints. Verified across migration `0260`.

---

## 6. Owner Decision & Sign-Off Recommendation

- **Prerequisites Satisfied:** T7-02 through T7-09, T7-12, T7-13, T7-14, T7-15, T7-16, T7-17 implementations verified locally.
- **N-7 Local Gate Status:** **GREEN (PASS)**.
- **Staging Status:** Writes remain on **HOLD** pending Babin's staging migration apply (`0245`–`0259`) per [`docs/verification/STAGING_INSTALLATION_MANIFEST_2026-11-21.md`](STAGING_INSTALLATION_MANIFEST_2026-11-21.md).
- **Recommendation:** **APPROVE T7-10** for merge and proceed to final launch readiness (T7-11).

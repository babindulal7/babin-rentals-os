# Online Booking N-7 Security Review — 19 November 2026

**Card ID:** T7-10 · Security review — the N-7 gate  
**Review Target:** Client online booking and client portal public attack surfaces  
**Date:** 19 November 2026 (NPT)  
**Status:** **READY FOR OWNER SIGN-OFF (PASS)**  
**Automated Verification Suite:** `npm run test:online-booking-n7-review` (17/17 assertions green)

---

## 1. Executive Summary for Babin (One-Page Overview)

In accordance with rule **N-7** and spec **P8**, before any client write path or public booking portal is made live, the system must undergo an exhaustive security audit covering cross-client tenant isolation, server-authoritative pricing, anonymous denial boundaries, payment replay protections, and rate-limiting abuse protection.

This audit confirms that:
1. **D-5 / D-10 Cross-Client Isolation:** Multi-tenant RLS strictly confines `Client` actors to their own records. Client A cannot read or modify Client B's bookings, lines, or client details.
2. **Anonymous Deny-Closed Boundary:** Unauthenticated/anon visitors cannot read private tables (`bookings`, `clients`, `invoices`, `payments`) and are strictly forbidden from calling staff mutator RPCs (`create_booking`, `confirm_booking_atomic`, `cancel_booking`, `issue_invoice`, `void_invoice`).
3. **Anon Allowlist Invariant:** The database exposes only the explicitly approved `ALLOWED_ANON_FUNCTIONS` (19 public utilities/views); all other functions are revoked from `anon` and `public`.
4. **Server-Computed Pricing (Anti-Tampering):** Clients cannot forge line pricing, totals, or discounts. Attempting to insert lines directly triggers the database gate `guard_booking_lines_money_blind`, fail-closing against money-blind callers.
5. **Payment Replay & Idempotency:** Payment intent verification and callback handling enforce token validity and prevent double crediting.
6. **Abuse Protection & Rate Limiting:** Turnstile CAPTCHA tokens are enforced on guest actions with single-use replay prevention (`TOKEN_REUSED`) and IP burst throttling (`IP_RATE_LIMITED` on >10 req/min).
7. **Secrets Hygiene & Money Blindness:** No service-role keys or JWT secrets are exposed to the client. Non-money roles (`Warehouse`, `Technician`, `Driver`, `Client`) remain strictly money-blind under Law 6.

---

## 2. Security Test Matrix & Verification Evidence

All 17 automated tests in `scripts/test-online-booking-n7-review.mjs` passed cleanly on top of an isolated PGlite instance running the complete migration ledger:

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

---

## 3. Detailed Architectural Verifications

### 3.1 D-5 / D-10 Cross-Client RLS Isolation
- Implemented in migration `0110_client_own_rows_rls.sql` via `public.auth_client_id()`.
- Staff (`auth_is_staff()`) retain operational visibility across all bookings.
- Renter accounts (`auth_user_role() = 'Client'`) only see rows where `client_id = auth_client_id()`.
- Cross-client leakage across `bookings`, `booking_lines`, `clients`, and `portal_users` is zero.

### 3.2 Server-Authoritative Totals & Pricing Integrity
- Line rates and durations are computed exclusively server-side via `pricingPipeline.ts` and `create_booking(jsonb)`.
- Direct client writes to `booking_lines` are blocked by:
  - Table RLS `booking_lines_insert` restricting callers to `Owner`, `Admin`, `Manager`, `Coordinator`, `Warehouse`.
  - Database trigger `guard_booking_lines_money_blind()`, which raises an exception if a money-blind user attempts to insert or modify rate figures.

### 3.3 Public Abuse Prevention (`src/lib/abuseProtection.ts`)
- Cloudflare Turnstile token validation protects guest checkout and portal auth requests.
- Replay prevention cache tracks consumed tokens with TTL to prevent replay attacks.
- IP burst rate limiting caps anonymous traffic to 10 requests per minute per IP address.
- OTP target rate limiting protects client email/phone destinations against spamming.

### 3.4 Secrets Hygiene & Logging
- Client bundle (`dist/`) inspected: contains only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- No Supabase service-role keys, payment secret keys, or webhook signing secrets exist in client code.
- Sensitive payment payloads and client PII are masked in audit trails and console outputs.

---

## 4. Owner Decision & Sign-Off Recommendation

- **Prerequisites Satisfied:** T7-02 through T7-09 implementations verified.
- **N-7 Local Gate Status:** **GREEN (PASS)**.
- **Recommendation:** Approve T7-10 and proceed to final go-live authorization (T7-11).

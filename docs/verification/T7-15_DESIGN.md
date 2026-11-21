# T7-15 · Security and Architecture Design Note: Payment Link from Any Booking

**Author:** Antigravity (Windows Lane C)  
**Task:** T7-15 · Payment link from any booking (`lane-c/T7-15-payment-link-from-any-booking`)  
**Authority:** `RULINGS-2026-10-26.md` (D30), `RULINGS-2026-10-27-booqable.md` (B17, B38, B55), `PLAN.md` §4.2 (O-3), `CLAUDE.md` (Law 4, Law 6).  

---

## 1. Threats & Vulnerabilities Model

| Threat | Attack Vector | Mitigation / Architecture Invariant |
|---|---|---|
| **Client Amount Tampering** | Attacker alters amount in query param, localStorage, or API request to pay less than due. | **Server-authoritative calculation:** The amount is calculated strictly on the database side inside `create_booking_payment_link`. The public pay page and `pay-init` Edge Function look up the token hash in `payment_intents` and bill the stored `amount_paisa`. Client amount inputs are strictly ignored. |
| **Token Forgery / Enumeration** | Attacker guesses sequential IDs or brute-forces UUIDs to view other clients' bookings or pay them. | **High-Entropy Opaque Tokens:** Tokens are 256-bit (32 bytes) cryptographically secure random values (`gen_random_bytes(32)` encoded as hex / base64url). Only the SHA-256 hash `token_hash` is stored in `public.payment_intents`. Brute-forcing is mathematically infeasible. |
| **Expired Link Abuse** | Attacker attempts to pay after rental terms, invoice figures, or booking dates have changed. | **Strict 48-Hour TTL:** `expires_at` defaults to `now() + interval '48 hours'`. Any lookup or payment initialization against an intent where `now() > expires_at` immediately fails closed with `GATE:gate.payment_link.expired`. |
| **Superseded Link Race** | Coordinator generates a new link for updated balance, but old link is paid. | **Link Invalidation upon Regeneration:** Creating a new payment link for a booking automatically transitions any existing active/pending payment link intents for that booking to `expired`. |
| **Double-Payment / Replay** | Callback or client pays the same link twice. | **Idempotent Single-Use Allocation:** Once allocated (`status = 'allocated'`), `pay-init` and `pay-verify` refuse further payment processing (`status <> 'pending'`). |
| **Security Deposit Smuggling** | Staff or client attempts to collect security deposit via online payment link. | **Strict Exclusion of Deposits (O-3, B38):** `create_booking_payment_link` calculates advance required or invoice outstanding excluding liability deposit rows. UI explicitly displays note: *"Security deposits are collected in person at equipment collection/handover."* |
| **Money-Blind Role Leak (Law 6)** | Warehouse, Technician, or Driver generates payment links or views amounts. | **Strict Postgres Gating:** `create_booking_payment_link` is guarded by `auth_can_view_money()`. Denied roles throw `GATE:gate.rbac.money_denied`. Direct SQL access blocked by RLS. |
| **PII Leak on Public Pay Page** | Anonymous visitor inspects pay page markup and extracts full client history or address. | **Minimal Public Projection:** Public RPC `get_payment_link_details` returns only sanitized booking descriptor: `booking_number`, masked client name (e.g., `B*** D***`), rental period, items count, and `amount_paisa`. Full client records, internal notes, equipment serials, and staff identities are never returned. |

---

## 2. Who Can Read / Write What

### Roles & Access Matrix

| Role / Actor | `create_booking_payment_link` RPC | View Payment Link in Booking Detail | Public `/pay/link?token=...` Page | Pay / Init with Providers |
|---|---|---|---|---|
| **Owner / Admin / Manager** | ALLOW | ALLOW | ALLOW | ALLOW |
| **Coordinator / Accounts** | ALLOW | ALLOW | ALLOW | ALLOW |
| **Warehouse / Technician / Driver** | **DENIED** (Throws error) | **HIDDEN / DENIED** (No money in DOM) | ALLOW (if holder of link) | ALLOW |
| **Anonymous (Public Client)** | **DENIED** (Anon execution revoked) | **DENIED** | **ALLOW** (Sanitized details via token) | **ALLOW** (Via secure Edge Function) |

---

## 3. Database Schema Changes (`0255_payment_link_from_any_booking.sql`)

### Additions to `public.payment_intents`:
- `token_hash text unique`: SHA-256 hash of the plaintext bearer token.
- `is_payment_link boolean not null default false`.
- `created_by uuid references public.users(id)`: Audit trail of staff member generating link.
- Partial index: `create index idx_payment_intents_token_hash on public.payment_intents(token_hash) where token_hash is not null;`

### Stored Procedures:
1. `public.create_booking_payment_link(p_booking_id uuid, p_target text default 'balance') returns jsonb`
   - Security definer, checks `auth_can_view_money()`.
   - Rejects cancelled bookings.
   - Calculates exact outstanding balance in integer paisa from invoice (or advance required from booking totals if pre-invoice).
   - Generates plaintext token `raw_token` via `encode(gen_random_bytes(32), 'hex')`.
   - Expires any prior unallocated link intents for the same booking:
     `update public.payment_intents set status = 'expired' where booking_id = p_booking_id and is_payment_link = true and status = 'pending';`
   - Inserts new intent with `token_hash = digest(raw_token, 'sha256')`, `expires_at = now() + interval '48 hours'`.
   - Returns JSON with `token` (plaintext, returned once), `intent_id`, `amount_paisa`, `expires_at`.

2. `public.get_payment_link_details(p_token text) returns jsonb`
   - Security definer, accessible to `anon, authenticated`.
   - Hashes `p_token` and queries `public.payment_intents`.
   - If not found or expired (`expires_at < now()`), returns `{ "valid": false, "reason": "expired_or_not_found" }`.
   - If already allocated (`status in ('paid', 'allocated')`), returns `{ "valid": false, "reason": "already_paid", "booking_number": ... }`.
   - If valid and pending, returns `{ "valid": true, "intent_id": ..., "amount_paisa": ..., "booking_number": ..., "client_name_masked": ..., "start_date": ..., "end_date": ..., "expires_at": ... }`.

---

## 4. Edge Function & Payment Integration

- `supabase/functions/pay-init/index.ts`:
  - When `token` is supplied in place of `booking_id` or `booking_request_id`, resolves intent by hashing `token` and querying `public.payment_intents`.
  - Re-verifies `expires_at > now()` and `status = 'pending'`.
  - Initializes Fonepay, eSewa, or Khalti transaction strictly using the DB stored `amount_paisa`.
- `supabase/functions/pay-verify/index.ts`:
  - On provider callback / verification, calls `allocate_payment_intent(v_intent_id)`.
  - Idempotent: if intent is already allocated, returns success immediately without creating duplicate payment rows (Law 4).
  - Creates immutable `public.payments` row with `method = 'online_fonepay'` (or esewa / khalti).

---

## 5. UI & Share Experience

- In `BookingDetail.tsx`:
  - When `outstanding_paisa > 0` and user has `canViewMoney`:
    - Shows button: **"Payment Link"** (Tabler `IconLink`).
    - Opens modal showing:
      - Authoritative amount due.
      - Generated 48-hour secure link.
      - Actions:
        - **Copy Link** (Clipboard with toast).
        - **WhatsApp Draft** (`https://wa.me/{phone}?text={encodedMsg}`).
        - **Email Draft** (`mailto:{email}?subject=...&body=...`).
        - Regenerate link (with confirmation warning that old link expires).
- In public route `src/booking/pay/PaymentLinkPage.tsx` (`/pay/link?token=...`):
  - Fetches details via `get_payment_link_details(token)`.
  - Clean client-facing branded card:
    - Babin Rentals branding.
    - Booking Number & Rental Dates.
    - Amount Due formatted with Nepali grouping (`रु 1,85,000`).
    - Expiration notice (Countdown or 48-hour badge).
    - Deposit notice: *"Security deposit is separate and payable upon gear pickup."*
    - Direct payment actions using active providers (`Fonepay`, `eSewa`, `Khalti`).

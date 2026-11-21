# T7-05 Design Note: Online Payment Integration (Fonepay First)

**Date:** 19 November 2026  
**Lane:** Lane C (Windows Antigravity)  
**Card:** T7-05 · Online payment — Fonepay first  
**Authority:** `docs/plans/T7_ONLINE_BOOKING.md` §T7-05; `CLAUDE.md` §N-5, §N-8, Law 4, Law 6; Rulings D30, O-3, B17, B38, B55; `docs/PERMISSIONS.md` §5, §7.

---

## 1. Threats and Mitigations

| Threat | Risk | Mitigation |
|---|---|---|
| **Client Amount Tampering** | Attacker modifies the payable amount in the request payload or query parameters to pay Rs. 1 for a Rs. 50,000 rental | **Server-Derived Figures Only:** The payable amount is strictly computed on the server (by `pay-init` querying SQL mirror of `calculateAdvanceRequired()` or booking invoice balance). Any client-submitted amount is completely ignored. The computed figure is stored in `payment_intents.amount_paisa` as an immutable integer. |
| **Fake Redirect / Client Forgery** | Attacker navigates directly to success redirect URL without completing payment | **Server-to-Server Only (D30):** Browser redirect never allocates a payment or marks an intent paid. Only `pay-verify` executing a server-to-server query against Fonepay's verification API with cryptographic signature/HMAC verification can transition intent status to `paid`. |
| **Callback Replay Attack** | Attacker intercepts valid provider callback and replays it multiple times to credit a booking multiple times | **Idempotent Transition & Unique Intent Keys (Law 4, Law 8):** `payment_intents` enforces unique `provider_ref` and unique `client_uuid`. `allocate_payment_intent` checks status and ensures exactly one immutable `payments` row is generated. Replayed callbacks return HTTP 200 with matching state and execute zero writes. |
| **Security Deposit Commingling** | Taking security deposits online converts customer liability to taxable/commercial revenue | **Strict Exclusion (O-3, B38, Law 5):** Online payment intents are restricted strictly to rental advance or invoice balance. Security deposits are never included in online payment calculations and must be collected at handover. |
| **Credential / Secret Leakage (N-8)** | Exposing Fonepay merchant secret key or HMAC key in client bundles or Git | **Edge Secrets Only:** Fonepay merchant credentials live exclusively in Supabase Edge Function secrets (`FONEPAY_MERCHANT_CODE`, `FONEPAY_SECRET_KEY`). Client apps interact only via the public `pay-init` and `pay-verify` endpoints. |
| **Money-Blind Information Exposure (Law 6)** | Warehouse, Technician, or Driver viewing payment amounts or intent details | **RLS Filtering:** `payment_intents` has RLS enabled. Select is restricted to authenticated users passing `auth_can_view_money()` or the owning client. Floor roles receive 0 rows. |

---

## 2. Who Can Read and Write What

### 2.1 Table `public.payment_intents`
- **Columns:**
  - `id uuid primary key default gen_random_uuid()`
  - `client_uuid text not null unique` (Law 8)
  - `booking_id uuid references public.bookings(id) on delete set null`
  - `booking_request_id uuid references public.booking_requests(id) on delete set null`
  - `client_id uuid references public.clients(id) on delete set null`
  - `provider text not null check (provider in ('fonepay', 'esewa', 'khalti'))`
  - `amount_paisa bigint not null check (amount_paisa > 0)`
  - `status text not null default 'pending' check (status in ('pending', 'paid', 'allocated', 'failed', 'expired'))`
  - `provider_ref text`
  - `provider_response jsonb`
  - `expires_at timestamptz not null default (now() + interval '48 hours')`
  - `paid_at timestamptz`
  - `allocated_at timestamptz`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`

- **Read Policy:**
  - **Client (Authenticated):** Can read intents matching their `client_id` or `booking_request_id`.
  - **Staff with Money Access (`auth_can_view_money()`):** Can read all payment intents for financial reconciliation and daily closing.
  - **Floor Staff (`Warehouse`, `Technician`, `Driver`):** Zero rows (Law 6).
  - **Anon:** Zero rows.

- **Write Policy:**
  - Direct INSERT/UPDATE/DELETE is revoked from public, anon, and authenticated roles.
  - Intents are created and transitioned exclusively via `SECURITY DEFINER` RPCs and Edge Functions operating with service privileges.

### 2.2 RPCs
- `public.create_payment_intent(p_client_uuid text, p_booking_id uuid, p_booking_request_id uuid, p_provider text)`:
  - Validates booking or request existence.
  - Computes amount server-side (advance required or outstanding balance).
  - Inserts pending intent with 48-hour expiration.
- `public.allocate_payment_intent(p_intent_id uuid, p_provider_ref text, p_provider_response jsonb)`:
  - Called by `pay-verify`.
  - Validates intent is not expired and not already allocated.
  - Transitions intent to `paid`.
  - If linked to an active booking, atomically records an immutable row in `public.payments` (method `'Fonepay'`, provider reference).
  - If linked to an unconfirmed request, leaves as `paid, not allocated` until staff confirm the booking.

---

## 3. How It Fails Closed

1. **Amount Mismatch / Tampering:** Any attempt to manipulate payable figures is defeated because Edge Functions and SQL RPCs query the database directly for booking line items, day counts, and daily rates.
2. **Expired Intent:** If `now() > expires_at`, `allocate_payment_intent` refuses to allocate and marks the intent as `expired`.
3. **Double Allocation:** When `allocated_at IS NOT NULL`, the allocation RPC returns the existing payment record immediately without inserting a duplicate payment.
4. **Network / Edge Failures:** If Fonepay's server-to-server callback cannot be authenticated or verified with the upstream merchant endpoint, the intent remains in `pending` and no payment row is minted.
5. **Zero Public Credentials:** All merchant authorization is isolated to Supabase Edge Functions with environment variables.

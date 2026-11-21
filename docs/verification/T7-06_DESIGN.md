# T7-06 Security Design Note: eSewa and Khalti Payment Gateways

**Card:** T7-06 · eSewa and Khalti (lane C + Babin)  
**Date:** 20 November 2026  
**Status:** Design note for review (Authority: `docs/plans/prompts/T7-06.md`, Ruling D30, Law 1, Law 4, Law 5, Law 6, Law 8, N-8)

---

## 1. System Overview

Babin Rentals OS supports three major Nepali digital payment rails for online booking advances and invoice settlement:
1. **Fonepay** (Direct merchant QR / intent API, implemented in T7-05)
2. **eSewa** (ePAY v2 integration with HMAC-SHA256 signature verification)
3. **Khalti** (ePayment v2 integration with server-to-server lookup verification)

Each provider is gated behind an independent activation switch. Providers stay **OFF** until their merchant account credentials exist. The client-facing payment screen displays only switched-on providers.

---

## 2. Threat Model & Mitigations

### Threat 1: Client-Side Amount Tampering (Law 1 Violation)
- **Risk:** Malicious user modifies transaction amount in client JS or HTTP request to pay Rs 1 instead of the required Rs 5,000 advance.
- **Mitigation:**
  - `amount_paisa` is computed strictly on the server by Postgres RPC `create_payment_intent` (`0251_payment_intents_and_fonepay.sql`).
  - Edge Functions `pay-init` and `pay-verify` read the authoritative `amount_paisa` directly from `public.payment_intents`. Any client-submitted amount is ignored.
  - Verification fails closed if the provider's reported amount does not match `payment_intents.amount_paisa`.

### Threat 2: Browser Redirect Spoofing (Ruling D30 Violation)
- **Risk:** Client modifies the return URL query string (`?status=COMPLETE&ref=FAKE123`) to simulate a successful payment without transferring funds.
- **Mitigation:**
  - Ruling D30: *A browser redirect alone never counts as payment confirmation.*
  - The return URL only initiates a backend verification handshake (`pay-verify`).
  - For **eSewa**: Backend validates the `signed_field_names` HMAC-SHA256 signature using `ESEWA_SECRET_KEY`. In sandbox/live, it also performs server-to-server status verification against eSewa's transaction status API.
  - For **Khalti**: Backend makes an authenticated server-to-server POST request to `https://khalti.com/api/v2/epayment/lookup/` with the server secret key `KHALTI_SECRET_KEY`.
  - Only upon successful server-to-server verification does Postgres execute `allocate_payment_intent`.

### Threat 3: Replay Attacks & Duplicate Webhook Callbacks (Law 8 Violation)
- **Risk:** Provider sends multiple webhooks or client repeatedly refreshes the callback page, causing multiple payment rows or double allocation.
- **Mitigation:**
  - `public.allocate_payment_intent` is atomic and idempotent (`0251_payment_intents_and_fonepay.sql:437`).
  - If `intent.status = 'allocated'`, the function immediately returns `{ success: true, already_allocated: true, payment_id }` without inserting a new row in `payments`.
  - GiST exclusion locks and database transactions prevent race conditions.

### Threat 4: Financial Immutability & Reversals (Law 4 Violation)
- **Risk:** Modifying past payment rows or deleting payment records upon cancellation or dispute.
- **Mitigation:**
  - Payments are immutable the instant they are written. `payments` table UPDATE and DELETE triggers reject modifications.
  - Corrections and refunds write append-only rows to `payment_reversals` via `record_online_payment_refund` (T7-07).

### Threat 5: Money-Blind Role Leakage (Law 6 Violation)
- **Risk:** Non-money roles (Warehouse, Technician, Driver, Client) viewing provider credentials, merchant discount rates, or reconciliation totals.
- **Mitigation:**
  - Postgres RLS on `payment_intents` limits view access to money roles (`Owner`, `Admin`, `Manager`, `Accounts`) and the intent owner.
  - Reconciliation RPC `get_online_payment_reconciliation` filters rows to 0 for non-money roles.

### Threat 6: Credential Leakage into Client Bundle (N-8 Boundary)
- **Risk:** API keys or merchant secrets bundled into Vite frontend.
- **Mitigation:**
  - `VITE_*` bundle contains zero merchant secrets.
  - Merchant credentials (`FONEPAY_SECRET_KEY`, `ESEWA_SECRET_KEY`, `KHALTI_SECRET_KEY`) reside exclusively in Supabase Edge Function environment variables.

---

## 3. Provider On/Off State & Configuration

Each provider is controlled by database-backed settings in `public.system_settings`:
- `payment_provider_fonepay`: `{"enabled": true, "env": "sandbox"}`
- `payment_provider_esewa`: `{"enabled": false, "env": "sandbox"}`
- `payment_provider_khalti`: `{"enabled": false, "env": "sandbox"}`

When credentials are missing or `enabled` is `false`:
- `get_available_payment_methods()` RPC omits the provider from public list.
- `pay-init` Edge Function refuses to initiate intents for disabled providers with actionable error: `Payment provider [esewa|khalti] is currently unavailable.`
- The public `OnlinePaymentModal` presents tab selector only for currently switched-on providers.

---

## 4. Provider-Specific Technical Specifications

### A. eSewa (ePAY v2)
1. **Initiation:**
   - Message structure: `total_amount`, `transaction_uuid` (`intent_id`), `product_code`, `signed_field_names` (`total_amount,transaction_uuid,product_code`), `signature` (Base64-encoded HMAC-SHA256).
   - Form post to:
     - Sandbox: `https://rc-epay.esewa.com.np/api/epay/main/v2/form`
     - Live: `https://epay.esewa.com.np/api/epay/main/v2/form`
2. **Verification (`pay-verify`):**
   - eSewa redirects with base64 encoded response or calls backend.
   - Decodes response: `transaction_code`, `status` (`COMPLETE`), `total_amount`, `transaction_uuid`, `signature`.
   - Validates HMAC signature against `ESEWA_SECRET_KEY`.
   - Server-to-server check: GET `https://rc-epay.esewa.com.np/api/epay/transaction/status/?product_code=...&total_amount=...&transaction_uuid=...`

### B. Khalti (ePayment v2)
1. **Initiation:**
   - Server-to-server POST to `https://khalti.com/api/v2/epayment/initiate/` (or sandbox `https://dev.khalti.com/api/v2/epayment/initiate/`).
   - Headers: `Authorization: Key <KHALTI_SECRET_KEY>`.
   - Payload: `return_url`, `website_url`, `amount` (integer paisa!), `purchase_order_id` (`intent_id`), `purchase_order_name`.
   - Returns: `pidx`, `payment_url`.
2. **Verification (`pay-verify`):**
   - Client redirect returns with `pidx`, `status`, `txnId`.
   - Server-to-server POST to `https://khalti.com/api/v2/epayment/lookup/` with body `{ "pidx": pidx }`.
   - Validates response: `status = 'Completed'`, `total_amount` equals `intent.amount_paisa`.
   - Allocates intent atomically.

---

## 5. Fail-Closed Behavior

1. **Unknown Provider:** Rejected with HTTP 400.
2. **Disabled Provider:** Rejected with HTTP 403 / "Provider is not enabled".
3. **Invalid Signature / Tampered Payload:** Rejected with HTTP 400; intent remains `pending` / moves to `failed`; no payment row created; no booking confirmed.
4. **Network Timeout / Upstream Outage:** HTTP 504; user notified to check status or retry; intent status remains unallocated; flagged if unresolved after 3 days.
5. **Reconciliation:** All 3 providers appear in `get_online_payment_reconciliation` by provider name.

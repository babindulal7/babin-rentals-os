# T7 — Online booking & payments

**Goal:** replace the Booqable store before Booqable is switched off: a public catalogue with daily
rates at `book.babinrentals.com`, client accounts by verified email, booking requests that staff
confirm, and online payment by Fonepay, eSewa and Khalti. **Lane C · Codex-2.** Rulings: S9, S15, D29, D30, W63–W66, W84, W85,
D31, D34; 30 Aug D2 (binding only by verified control of the client's stored email); Laws 4, 5, 6,
8; P8; **N-7 — no portal write path is switched on before test D-5 passes**; N-8 (Babin enters
every gateway credential).

**Exit (G7):** on live at day X: a new visitor browses rates, signs in with an emailed code,
requests gear for dates, pays the advance with Fonepay (eSewa and Khalti when their accounts are
open), staff confirm in two taps, the client sees the booking and invoice in "My bookings". D-5
passes on staging and live. Nothing is reserved before staff confirm (D31).

**What already exists:** `portal_users`, `portal_sessions`, `portal_auth_challenges` tables (deny-all
by design); the `Client` role (money-blind for internal figures, sees **own** money — PERMISSIONS
§5); `create_booking(jsonb)`; `calculateAdvanceRequired()` in `src/lib/pricingPipeline.ts`;
`marketing.html` as a precedent for a second entry document. **What changes in PERMISSIONS (same
commit as the code, B-3):** §7 "no public signup" → verified-email sign-up (D29); §7 "no catalogue
in v1" and §5 "rates on request/quote only" → public daily rates (D34); a fifth client write —
"pay online" (D30).

---

### T7-01 · Online booking spec            status: todo · size: M · Claude writes (arrives as a file)
**What** — One document, `docs/ONLINE_BOOKING_SPEC.md`, fixing before any code: the screens
(catalogue, product, cart with dates, sign-in, request, pay, my bookings), the tables
(`booking_requests`, `booking_request_lines`, `payment_intents`, portal binding), the RPCs and
Edge Functions, every RLS policy, the D-5 test list, the client emails (T5-06), and the exact
PERMISSIONS §5/§7 text that will change.
**Why** — Payments and cross-client isolation are the two places a guess costs most.
**Where** — `docs/ONLINE_BOOKING_SPEC.md`.
**Database** — none (design only).
**Done when** — the spec answers every "who may read/write what" for anon, Client and staff; O-2
and O-3 defaults are written in.
**Needs** — none.

### T7-02 · Booking site and public catalogue            status: todo · size: L · lane C
**What** — A third entry document (`booking.html`, like `marketing.html`) with its own small bundle —
no staff code in it — deployed by the second Pages project (T1-07). Reads a deliberately public
`public_catalogue_v`: product name, category, description, photos, **daily rate** (and week/month
rates where set), bundle contents. **Never** cost, replacement value, stock counts or anything
internal. Availability: an anonymous RPC `public_availability(product_ids, from, to)` returning
only "available / not available" per product and day — no booking numbers or names. Product
photos: a public `catalogue` bucket, uploaded by Owner/Admin/Manager from the equipment editor
(today a local preview only — this card builds the upload). Add both objects to an explicit anon
allow-list so `check:pglite` still fails on any **other** anon-readable view or function.
**What shows online (W64):** every product with a rate can be listed, but each product has two
switches set by staff — **Show online** (on/off) and **Only inside bundles** (the item never appears
alone; it appears as part of the bundles that contain it). Both default to off until staff turn them
on, so nothing appears online by accident.
**Why** — S9, D34.
**Where** — `vite.config.ts` (third input), new `src/booking/`, new migration, equipment editor
photo section, `scripts/check-pglite.mjs` + `scripts/allowed-anon-functions.mjs` (+ a views list).
**Database** — migration (claim number): view, RPC, bucket + policies; lifecycle step "anon reads
catalogue and availability, nothing else".
**Done when** — catalogue loads fast on a phone over 4G; an anon probe of every other view/table
returns nothing; Warehouse-only fields never appear in the payload.
**Needs** — T1-07.

### T7-03 · Client accounts by verified email            status: todo · size: L · lane C
**What** — Sign-in with an **emailed one-time code** (no passwords — PERMISSIONS §7), through
Supabase Auth with the T1-09 SMTP. First sign-in asks for name, phone and optional company/PAN.
**Binding (30 Aug D2):** if the verified email matches exactly one client record's stored email,
the account is bound to that client; otherwise it is bound to **nothing** — it can browse and
request, and staff decide at confirm time to link it to an existing client or create one (audited).
Write the policies that end the deny-all on the `portal_*` tables. Cloudflare Turnstile on the
code request (T7-09). **ID on file (W50, W84):** a new online client uploads one ID document (photo
+ type + number) with their first request; staff check it at confirm; it is stored once and reused
(W51), in a private bucket readable by staff with access and by that client only.
**Why** — D29; P8.
**Where** — new migration, `src/booking/auth/*`, `src/lib/auth.tsx` (Client branch),
`docs/PERMISSIONS.md` §7.
**Database** — migration (claim number): binding table/columns, RLS for every portal-readable
table keyed on the session's client; **D-5 tests** in `scripts/` and lifecycle: as Client A, rows of
Client B = 0 across bookings, invoices, payments, cases, documents, requests, payment intents.
**Done when** — D-5 green on PGlite and staging; an unbound account reads only its own requests;
N-7 respected (no write path enabled before D-5 green).
**Needs** — T1-05 (two Client seats), T1-09, T7-01.

### T7-04 · Requests and the staff queue            status: todo · size: L · lane C
**What** — Client side: cart → dates (availability shown, D31: **nothing held**) → request with the
full price **with VAT** and the advance due (D34, computed server-side). Staff side: an "Online
requests" queue (chip on Rentals and a Today card; paid requests on top, D31); **Confirm** opens New
Rental prefilled and creates the booking with `create_booking` (reservations happen here); **Decline**
needs a reason the client sees. Client gets emails: request received, confirmed, declined (T5-03).
**Rules from 26 Oct (W63, W66, W85):** pickup at least **12 hours** after the request; delivery can
be chosen with the **zone fee** (T4-07; "outside the valley" means staff will quote); staff promise an
answer within **1 hour, any time** — the request turns orange at 45 minutes ⭐ and pops up again on
staff phones (T5-09).
**Why** — D29, D31, D34, W63, W66, W85.
**Where** — `src/booking/*`, `src/modules/rentals/RentalsList.tsx`, `NewRental.tsx` prefill,
`src/modules/today/*`, new migration.
**Database** — migration (claim number): `booking_requests` + lines + RLS (client: own; staff:
Coordinator+ write, floor roles no money columns); lifecycle "request never creates a reservation";
"confirm creates exactly one booking (idempotent on request id)".
**Done when** — end-to-end on staging with two clients; a double-tap on Confirm creates one booking.
**Needs** — T7-02, T7-03.

### T7-05 · Online payment — Fonepay first            status: todo · size: L · lane C + Babin
**What** — Edge Functions `pay-init` and `pay-verify` (+ the provider's callback URL). `pay-init`
computes the amount **on the server** (advance from the request or the balance of an invoice —
SQL mirror of `calculateAdvanceRequired()`, tested equal to the TypeScript), creates a
`payment_intents` row (idempotent key) and returns the provider's payment page or QR. `pay-verify`
confirms the payment **server-to-server with the provider** — a browser redirect alone never
counts. A paid intent on an unconfirmed request stays "paid, not yet allocated" (shown in daily
closing as money in); when staff confirm, it becomes an immutable `payments` row against the
booking (method Fonepay, provider reference) through the existing record-payment path. Online
payments cover the **rental advance or invoice balance only** — the security deposit is taken at
handover (⭐ O-3). Use the provider's current merchant API and sandbox first.
**Why** — D30 (Babin already has a **Fonepay merchant** account).
**Where** — new `supabase/functions/pay-init/`, `pay-verify/`, `src/booking/pay/*`,
`src/actions/finance/recordPayment.ts` (allocation), `src/lib/queries/closing.ts`.
**Database** — migration (claim number): `payment_intents` + RLS (client own; money roles read;
floor roles none) + allocation function; lifecycle "tampered amount refused", "replayed callback
changes nothing", "intent allocates once".
**Done when** — sandbox payments succeed, fail and time out correctly; one real Rs 10 live payment
(Babin) is recorded and reconciled with the Fonepay statement.
**Needs** — T7-04; Babin obtains Fonepay merchant API credentials from the bank and enters them as
Edge Function secrets (N-8).

### T7-06 · eSewa and Khalti            status: todo · size: M each · lane C + Babin
**What** — The same pattern as T7-05 for eSewa and for Khalti, each behind a switch that stays off
until its merchant account and credentials exist. The pay screen shows only switched-on methods.
**Why** — D30.
**Where** — `supabase/functions/pay-*`, provider adapters.
**Database** — none beyond T7-05 (method values).
**Done when** — sandbox success/failure/timeout per provider; one real small payment each.
**Needs** — Babin opens both merchant accounts (start week 1; onboarding time unknown). **X does
not wait for these** — PLAN §5.

### T7-07 · Refunds and reconciliation            status: todo · size: M · lane C
**What** — If staff decline a request that was paid, the screen shows "Refund due" with the
provider and reference; staff refund in the provider's merchant portal (or by API where offered) and
record it — a reversal row, never an edit (Law 4). ⭐ O-2: full refund to the same wallet within 3
working days. A reconciliation report lists online payments by provider and day against
`payment_intents`, flags any paid intent not allocated or refunded after 3 days.
**Why** — D30, D31; Law 4.
**Where** — `src/modules/finance/*`, `src/lib/queries/*`.
**Database** — migration (claim number) if refunds need their own table beside `payment_reversals`.
**Done when** — a declined paid request on staging ends with a recorded refund and a zero balance;
the report reconciles a sandbox day.
**Needs** — T7-05.

### T7-08 · My bookings            status: todo · size: M · lane C
**What** — For a signed-in client: their bookings (the six-step client timeline), invoices with
balance, receipts, documents (quote, agreement, invoice — PERMISSIONS §7 P2–P5) and **Pay balance**
(T7-05). Read-only otherwise. Extension requests, payment-proof upload and remote agreement signing
go to T10 unless time allows.
**Why** — D29–D30; PERMISSIONS §7.
**Where** — `src/booking/account/*`.
**Database** — none beyond T7-03 policies.
**Done when** — D-5 still green; a client sees their own invoice balance update after paying.
**Needs** — T7-03, T7-05.

### T7-09 · Bot and abuse protection            status: todo · size: S · lane C
**What** — Cloudflare Turnstile on "send me a code", "send request" and "pay"; the token is verified
in the Edge Function / RPC, not just in the browser. Per-IP and per-email rate limits on code
requests and requests.
**Why** — A public form invites spam; Turnstile's free plan has unlimited challenges (T1 appendix).
**Where** — `src/booking/*`, `supabase/functions/*`.
**Database** — none (or a small rate-limit table).
**Done when** — a scripted burst is refused; a normal user never sees a puzzle in normal use.
**Needs** — T7-03.

### T7-10 · Security review — the N-7 gate            status: todo · size: M · lane C
**What** — Before any client write path is on in live: D-5 green on staging; amount tampering,
callback replay and forged-session tests green; secrets only in Edge Function secrets; no PII or
amounts in logs; the anon allow-list contains exactly the two public objects; PERMISSIONS §5/§7
match the code. Written up in `docs/verification/ONLINE_BOOKING_REVIEW_<date>.md`.
**Why** — N-7; P8.
**Database** — none.
**Done when** — Babin reads the one-page summary and says go.
**Needs** — T7-02 … T7-09.

### T7-11 · Launch            status: todo · size: S · lane C + Babin
**What** — `book.babinrentals.com` goes live on day X (CNAME at the DNS host); `babinrentals.com`
gets a clear "Book online" link (and later the O-1 answer); the Booqable store stops taking new
bookings the same day (T9-05).
**Why** — S9, S15.
**Done when** — a real client books and pays online on day X.
**Needs** — T7-10, T9-04 go decision.

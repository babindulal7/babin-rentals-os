# Online booking and payments — specification (T7-01)

**Status:** SPEC ONLY — design written 1 Nov 2026 by Claude; arrives as a file for Babin to approve
(`PLAN.md` §6). No code, migration or permission changed in this commit.
**Binds:** [T7-02 … T7-11](plans/T7_ONLINE_BOOKING.md) (lane C · Codex-2). Each card builds the part
named in §14 and may not change this document's answers — a card that finds one wrong files a ruling
(B-2), it does not guess.
**Rulings it implements:** S9, S15, D29, D30, D31, D34, W50, W51, W63–W66, W84, W85
([`RULINGS-2026-10-26.md`](../RULINGS-2026-10-26.md), [`-workflow.md`](../RULINGS-2026-10-26-workflow.md)),
30 Aug D2 (binding only by verified control of the client's stored email), Laws 3–8, P8, **N-7**, N-8.
**Defaults taken (⭐, B-5):** O-2, O-3 and eleven more, listed once in §13 so Babin can flip them.

---

## 0. The five places a wrong guess costs the most

Read these before any section. Each is a decision this spec makes that the plan cards did not spell out.

1. **Opening email sign-up makes every `authenticated` policy reachable by strangers.** Anyone with the
   public anon key can call Supabase Auth directly and get an `authenticated` session — Turnstile on
   our page does not stop that. So the safety test is not only "Client A cannot read Client B" (D-5) but
   **"a brand-new account with no client reads zero staff rows, anywhere"** (D-10, §9). Captcha must be
   switched on in Supabase Auth itself, not just in the page (§11).
2. **`0188` added expiring temporary holds; D31 says a request holds nothing.** `create_or_extend_hold`
   must never be called by the online flow. The request path writes no `inventory_reservations` row of
   any state; reservations happen only inside Confirm (§6.4). `public_availability()` counts confirmed
   reservations and active holds as busy, so an item held at the desk shows as not available online.
3. **Today a payment is a client-side insert** (`recordPayment.ts`: `next_document_number`, then
   `idempotentInsert('payments', …)`, method written into `notes`). There is no payment RPC. So the
   online **allocation** (paid intent → immutable `payments` row) is a **new SQL function that mirrors
   that insert exactly** and is tested equal to it (§8.3) — not a call to something that does not exist.
4. **The browser never sends an amount, a price, a client id or a user id.** The server derives all four
   (§6, §8). A paid intent is trusted only after a server-to-server check with the provider; a browser
   redirect alone never counts (§8.2).
5. **Floor roles get no access to online requests at all** — not even the non-money columns the T7-04
   card allowed. Stricter wins (B-1); the queue is a desk job (§9). Revert is one line (§13, ⭐ 9).

---

## 1. Who can do what — the actors

| Actor | How they are recognised | What they can ever do |
|---|---|---|
| **Anonymous visitor** | anon key, no session | Read the public catalogue and a yes/no availability answer. Nothing else. |
| **Unbound account** | `auth.users` row (email verified), **no** `portal_users` row; at most a `portal_link_requests` row | Browse, build a cart, submit requests, pay the advance on their **own** request, read their **own** requests. Sees no booking, invoice, client record or document. |
| **Bound client** | `portal_users` row with `client_id` (0072) | Everything above **plus** P1–P5 of PERMISSIONS §7 for their own client, and **Pay balance** on their own invoices. |
| **Coordinator** | staff | Read the queue; **Confirm** or **Decline**; see the requester's ID image; create or link the client. |
| **Manager · Admin · Owner** | staff | All Coordinator does, plus: set "Show online"/"Only inside bundles"/photos, hand-bind an account to a client, record an online refund or reversal. |
| **Accounts** | staff | **Read** requests, intents, reconciliation. No confirm, no decline, no refund. |
| **Warehouse · Technician · Driver** | staff, money-blind | **Nothing** on this feature. The requests, intents and request ID images are invisible to them. |

A session where `auth_is_staff()` is true that opens the booking site is treated as a staff session:
the site shows "You are signed in as staff — sign out to book as a client" and every client RPC refuses
(`gate.online.staff_session`). A staff member books as a client with a separate email, never by role
mix-up.

`auth_user_role()` already resolves a session with no `users` row to `Client` (PERMISSIONS §12 D-6) —
that is what makes a fresh sign-up land safely, and it is why D-10 exists.

---

## 2. The seven screens

One small bundle (`booking.html`, T7-02): **no staff code in it**, so a client cannot even download the
staff app's screens. Phone first (360 px), 4G over a Kathmandu connection. English first. T6 covers the
staff screens only; Nepali for this public site is already placed in **T10 (after go-live)** by the T6 note
("the client booking site in Nepali … go to T10 unless Babin moves them up"). When it is built it must use the approved glossary ([`src/i18n/glossary.ne.json`](../src/i18n/glossary.ne.json)).
BS leads in every date shown, AD underneath; stored in UTC (Law 7). Amounts in `NPR 12,500`, Latin
digits. The word "customer" appears nowhere (Law 15). Errors inline; toasts for successes only (Law 12).

Tap budget (R-39), counted from intent to committed success:

| Journey | Budget |
|---|---|
| Signed-in client, product page → request submitted | **≤ 5 taps** (Add → Dates → Request → Confirm summary → Send) |
| New visitor, same | **≤ 5 taps + typing the email and the 6-digit code**; name and phone asked once |
| Request confirmed email → advance paid | **≤ 2 taps** to reach the provider's page |
| Returning client, **Pay balance** | **≤ 3 taps** from `/account` |

| # | Screen · route | Reads | Writes | States that must exist |
|---|---|---|---|---|
| **S1** | **Catalogue** · `/` | `public_catalogue_v`: name, category, photo, daily rate, "per day + VAT" | none | loading skeleton · empty ("Nothing listed yet") · error with retry · offline |
| **S2** | **Product / bundle** · `/p/:slug`, `/b/:slug` | the view row + bundle contents (names and quantities only); `public_availability` for the chosen dates | none | not available on those dates (with the next free day) · "Only available as part of a bundle" never shown as a single item |
| **S3** | **Cart with dates** · `/cart` | cart (browser only, until submit); `online_price_quote()` for the price | none | dates inside the 12-hour notice → inline "Pickup must be at least 12 hours from now" · a line no longer available → inline, cart kept |
| **S4** | **Sign in** · `/sign-in` | — | Auth: emailed code (Turnstile); `online_profile_save` for name, phone, optional company/PAN | wrong code (5 tries, then 15-minute lock) · code expired (10 min) · resend after 60 s · "check your inbox" |
| **S5** | **Request** · `/request` | quote: items, days, subtotal, **VAT**, **full price**, **advance due** (W65), delivery zone fee (W85); ID status | `request_submit` (via the Edge Function, §11) · ID upload to the private bucket | ID missing → inline, submit disabled with the reason spoken · zone "Outside the valley" → "Staff will quote this" and no fee shown · duplicate tap → same request (Law 8) |
| **S6** | **Pay** · `/pay/:requestId` | request status, amount due, the **switched-on** methods only | `pay-init` → provider page; return page calls `pay-verify` | provider failed · timed out · amount mismatch ("We could not match this payment — staff will contact you; do not pay again") · already paid |
| **S7** | **My bookings** · `/account` | own requests (all statuses); if bound: bookings, invoices with balance, receipts, documents (P2–P5); the six-step client timeline | **Withdraw** (own `Requested`); **Pay balance** | unbound: "We will link this account to your company record — until then you can see your requests" · empty · declined shows the reason and, if paid, "Refund due" |

Never on any screen: cost, replacement value, stock counts, serial numbers, branch internals, booking
numbers of other people, who has the gear, or any "X left" counter.

---

## 3. What is public — and the only two public objects

`anon` may do exactly two things. Both are on an explicit allow-list so `check:pglite` fails on any
**other** anon-readable relation or executable function (it already fails on functions via
`scripts/allowed-anon-functions.mjs`; this adds the relation half).

### 3.1 `public_catalogue_v` (view)

| Column | From | Rule |
|---|---|---|
| `id`, `kind` (`product`/`bundle`), `slug` | products / bundles | stable slug, generated once, never reused |
| `name`, `category_name`, `description` | same | description is staff-written copy, not internal notes |
| `photo_paths text[]` | `catalogue` bucket | public paths only |
| `daily_rate_paisa`, `weekly_rate_paisa`, `monthly_rate_paisa` | `daily_rate`·`weekly_rate`·`monthly_rate` | **rupees `numeric(14,2)` → integer paisa in the view** (`round(rate*100)::bigint`); null when not set; a row with no positive daily rate is not listed |
| `bundle_contents jsonb` | bundle lines | `[{name, qty}]` only |

**Row filter (W64):** `show_online = true` **and** a positive daily rate. A product with
`online_bundle_only = true` is never its own row; it appears only inside `bundle_contents` of a bundle
that is itself `show_online`. **Both switches default to false** (new columns on `products`; `show_online`
on `bundles`). Nothing appears online by accident.

**Never in the view, not even null:** `purchase_price`, `book_value`, replacement value, deposit %,
quantity on hand, `serial_number`, `sku`, `branch_id`, location, supplier, status, maintenance, utilisation,
`notes`, `created_by`. The view is `security_invoker = false` **with** `revoke insert, update, delete` from
`anon` and `authenticated` (the 7 Sep hole: all 26 older `_v` views were writable by `anon`; this one is
born closed, and `check:pglite` asserts it).

### 3.2 `public_availability(p_product_ids uuid[], p_from date, p_to date)` (function)

Returns `(product_id uuid, day date, available boolean)`. `SECURITY DEFINER`, `STABLE`,
`set search_path = public, pg_temp`, `statement_timeout` 2 s inside the function.

- **Input bounds** (refused with an error, not clipped): ≤ 30 ids · range ≤ 60 days · `p_from ≥ today − 1`.
- **"Available"** = at least one unit free on that day, counting `inventory_reservations` in state
  `confirmed` **and** `active_hold`, plus units out for maintenance. **No quantity parameter and no count
  is ever returned** — otherwise repeated calls binary-search the stock level.
- Never returns a booking number, client, date range of another booking, or hold owner.
- Whether a *quantity* fits is checked at submit and at Confirm, where the caller is authenticated and
  rate-limited. Residual risk accepted: a determined authenticated user can learn "N or more are free" by
  submitting requests of increasing quantity; rate limits (§11) bound it, and the number is not money.
- Added to `ALLOWED_ANON_FUNCTIONS`. Granted to `anon` and `authenticated`; nothing else new is.

### 3.3 Storage

| Bucket | Public? | Write | Read |
|---|---|---|---|
| `catalogue` | **public read** (objects only, listing disabled) | Owner · Admin · Manager (equipment editor, T7-02) | anyone |
| `request-ids` | **private** | the signed-in account, **only** into `<auth_uid>/…`; ≤ 8 MB; `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | the owning account; staff with `online.request.read` through a **60-second signed URL** |

`catalogue` objects carry no EXIF location (strip on upload). Old uploaded files matching no record stay
quarantined (D33) — the new buckets are born with the same "no linked record → no access" rule.

---

## 4. Sign-in and the portal binding (T7-03)

**Builds on migration `0072`, which is already applied on live (31 Aug).** `portal_users` has
`auth_user_id`, `email`, `email_verified_at`; `portal_link_requests` exists; `portal_claim_by_verified_email()`
is the **only** writer of a self-registered binding; `auth_client_id()` (0110) resolves the acting client.
PERMISSIONS §7 still says the portal tables are "deny-all today" — that is stale since 0072; §8 corrects it.
**T7-03 does not rebuild any of this.** It adds what 0072 left for later.

1. **Sign-in = Supabase Auth email code, no passwords.** `signInWithOtp({email, options:{captchaToken}})`,
   6 digits, **10-minute expiry** (set `otp_expiry = 600`, matching the `portal_auth_challenges` rule),
   sent by the T1-09 SMTP from an `@babinrentals.com` address. Single use. No magic-link path
   (a link in a forwarded email is a takeover).
2. **First sign-in asks once:** name, phone, optional company and PAN → `online_profile_save`. Stored in
   `online_profiles` (§5.5), prefilled on every later request (R-39).
3. **Binding on every sign-in** calls `portal_claim_by_verified_email()`:
   - verified email equals **exactly one** active client's stored email, and that client is unclaimed →
     bound;
   - none, several, or already claimed → **not bound**, a `portal_link_requests` row records it, the
     account reads nothing client-side. No name, phone, company or domain matching. Ever.
4. **An unbound account can still request** (T7-03). `booking_requests` therefore keys on the **auth
   user**, with `client_id` nullable (§5.1).
5. **Staff linking, Coordinator at Confirm:** the *booking* is attached to a client the Coordinator picks
   or creates (always audited). That does **not** bind the *account*. The account binds only when
   (a) its verified email equals the client's stored email — which is automatic when the Coordinator
   **creates the client from the request** (email is prefilled from the verified address, read-only) — or
   (b) a **Manager+ hand-binds** it from the link-requests card, reason ≥ 10 characters, audited. Until
   then the person sees their request and gets every email, but not the booking in S7 and cannot
   **Pay balance**. *Why stricter than the card implied:* a wrong hand-bind shows one company's invoices
   to a stranger, and D2's whole point is that "fails closed" means "sees nothing". Revert (§13, ⭐ 10):
   allow Coordinator to hand-bind.
6. **Policies that end the deny-all** are the 0072 set plus the ones in §9. No `INSERT`/`UPDATE`/`DELETE`
   policy for `authenticated` on `portal_users`, ever (the definer function is the single door; a
   `check:security` assertion pins the count at 11 + the new ones).
7. **N-7:** no client **write** path is switched on in live until D-5 **and** D-10 pass on staging and the
   T7-10 review is signed. Technically: the Edge Functions and the five client RPCs are deployed, but the
   Pages project for `book.babinrentals.com` does not exist and Supabase Auth email sign-up stays **off**
   until Babin turns it on in the dashboard (an Owner action, listed in `BABIN_ACTIONS.md`).

---

## 5. Tables

All money is **integer paisa** (`bigint`), converted from the rupee `numeric` columns only at the edges,
as `recordPayment.ts` already does ("the ONE conversion"). Every write carries a `client_uuid` (Law 8);
a duplicate is refused, not re-run. Nothing is deleted (Law 3): terminal states are named. Migration
numbers are claimed per the ledger (T7-02 · T7-03 · T7-04 · T7-05).

### 5.1 `booking_requests` (T7-04)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `client_uuid` | uuid **unique** not null | idempotency key from the browser at submit |
| `confirm_client_uuid` | uuid **unique** not null default `gen_random_uuid()` | the key passed to `create_booking` at Confirm — a double-tap re-hits the same booking (§6.4) |
| `requester_auth_uid` | uuid not null → `auth.users` | set by the server from the verified JWT, never from the body |
| `requester_email` | text not null | verified email snapshot, read from `auth.users` server-side |
| `portal_user_id`, `client_id` | uuid null | set at submit if bound; else by staff at Confirm |
| `contact_name`, `contact_phone`, `company`, `pan` | text | snapshot from the profile at submit |
| `pickup_at`, `return_at` | timestamptz not null | `return_at > pickup_at`; **CHECK `pickup_at ≥ created_at + 12 h`** (W63), measured at submit |
| `delivery_method` | `delivery_method` enum | pickup or Babin delivery online (courier/third party are staff-only) |
| `delivery_zone_id`, `delivery_address` | null | zone required if delivery (T4-07); address required if delivery |
| `needs_delivery_quote` | bool | true for "Outside the valley" |
| `delivery_fee_paisa` | bigint null | from the zone; null when `needs_delivery_quote` |
| `subtotal_paisa`, `vat_paisa`, `rental_total_paisa`, `advance_required_paisa` | bigint not null | server snapshot at submit; **Rental Total = taxable subtotal + VAT, never the deposit** (`pricingPipeline.ts` steps 8–10) |
| `price_snapshot` | jsonb | the full quote, for audit |
| `project_note` | text null | what it is for, ≤ 500 chars |
| `status` | `booking_request_status` | `Requested` · `Confirmed` · `Declined` · `Withdrawn` |
| `decided_at`, `decided_by`, `decline_reason` | | decline reason ≥ 10 characters, **shown to the client** |
| `confirmed_booking_id` | uuid **unique** null → `bookings` | one request, one booking |
| `terms_changed` | bool | staff confirmed different dates/lines than requested → the email says so |
| `created_at`, `updated_at` | timestamptz | |

A submitted request is **never edited by the client** — to change it, withdraw and request again. That
keeps the paid amount tied to one fixed price.

### 5.2 `booking_request_lines` (T7-04)

`id`, `request_id` → request, `kind` (`product`/`bundle`), `product_id` / `bundle_id` (CHECK exactly one),
`quantity > 0`, `days`, `unit_daily_rate_paisa`, `line_total_paisa`. **Insert-only** (a trigger refuses
`UPDATE`/`DELETE`). Visible exactly as its request is.

### 5.3 `payment_intents` (T7-05)

| Column | Notes |
|---|---|
| `id`, `client_uuid` unique | `client_uuid` is the `Idempotency-Key` of `pay-init` |
| `request_id` **xor** `invoice_id` | CHECK exactly one: an advance on a request, or a balance on an invoice (S7) |
| `booking_id` null | set at allocation |
| `requester_auth_uid` | from the JWT |
| `provider` | `fonepay` · `esewa` · `khalti` |
| `purpose` | `request_advance` · `invoice_balance` |
| `amount_paisa` > 0 | **computed by the server** (§8.1); the only amount that can ever be allocated |
| `status` | `Created` → `Pending` → `Paid` → `Allocated`; side paths `Failed`, `Expired`, `Mismatch`, `RefundDue`, `Refunded` — forward-only, enforced by a trigger (§7) |
| `provider_ref` | unique **per provider** where not null — the replay guard |
| `provider_amount_paisa` | what the provider reported at verify |
| `expires_at` | `created_at + 30 min` ⭐ |
| `verified_at`, `allocated_payment_id` (**unique**) → `payments`, `allocated_at` | |
| `refund_amount_paisa`, `refund_provider_ref`, `refunded_at`, `refunded_by` | T7-07: **no separate refunds table** — an unallocated intent carries its refund here; an allocated one is reversed by a `payment_reversals` row on its `payments` row (Law 4) |

**One open intent at a time** per `(request_id, purpose)` / `(invoice_id)` — a partial unique index on
status `Created`/`Pending` — so a double-tap cannot start two payments.

### 5.4 `payment_intent_events` (T7-05)

Append-only log: `intent_id`, `event` (`init`, `callback_received`, `callback_replayed`, `verify_ok`,
`verify_failed`, `verify_mismatch`, `allocated`, `refund_due`, `refunded`, `expired`), `actor`, redacted
provider response `jsonb`, `created_at`. `UPDATE`/`DELETE` raise. A replayed callback adds a
`callback_replayed` row and changes nothing else.

### 5.5 `online_profiles` (T7-03)

`auth_uid` pk, `name`, `phone`, `company`, `pan`, and the **ID on file** (W50/W51/W84): `id_doc_type`,
`id_doc_number`, `id_doc_path`, `id_doc_uploaded_at`. Stored **once** per person and reused on every
request. On Confirm, once staff have looked at the image, the ID is copied into `client_id_documents`
(T2-12) through that table's own insert path — the online table is never the long-term home. `id_doc_number`
is PII, masked exactly as `client_id_documents` masks it; the read predicate is **copied from
`client_id_documents_select`**, not re-invented.

### 5.6 Product columns (T7-02)

`products.show_online bool not null default false`, `products.online_bundle_only bool not null default
false`, `bundles.show_online bool not null default false`, `products.slug`/`bundles.slug`. Writing them is
capability `online.catalogue.publish`.

### 5.7 `online_rate_limits` (T7-09)

`key text`, `window_start`, `count`. Service-role only. Used by the Edge Functions (§11).

---

## 6. The flows

### 6.1 Quote — `online_price_quote(p_lines jsonb, p_pickup timestamptz, p_return timestamptz, p_zone uuid)`

`authenticated`, non-staff. **One pricing implementation, not three:** it calls the same server-side
pricing internals `create_booking` uses (migration 0119, "server side prices"), then applies the advance
rule in SQL. Tested **equal** to `calculateAdvanceRequired()` for every boundary: ≤ NPR 5,000 → full;
5,000 < total ≤ 10,000 → NPR 5,000; > 10,000 → 50 % rounded half-up to the whole rupee (W65). Returns
subtotal, VAT (13 % when enabled in settings), rental total, advance due, delivery fee, per-line
breakdown. A client cannot influence a price: lines carry ids and quantities only.

### 6.2 Submit — `booking_request_submit(p_payload jsonb)`

Reachable **only** through the `request-submit` Edge Function (service role), which has first verified the
JWT, the Turnstile token and the rate limits (§11). The RPC is `revoke … from public, anon, authenticated`.
Steps, in one transaction, any failure rolls all back:

1. Take `auth_uid` and email from the verified JWT passed by the function — never the body. Refuse a staff
   session (`gate.online.staff_session`).
2. Refuse if the account has ≥ 3 open `Requested` requests ⭐ (spam guard).
3. Re-price with §6.1; **ignore any amount the browser sent**.
4. Check `pickup_at ≥ now() + 12 h` (W63) — and again by the CHECK.
5. For each line: product/bundle exists, is `show_online`, quantity fits `public_availability` logic.
   A line that no longer fits → refuse the whole request naming the lines (inline on S5). **No
   reservation, no hold, no `inventory_reservations` row** (D31).
6. ID on file for this account (`online_profiles`) — else refuse (W84).
7. Insert request + lines (idempotent on `client_uuid`: a replay returns the existing request).
8. Write `email_log` rows for "request received" (§10) and raise the staff push (T5-09).

### 6.3 Staff queue (T7-04)

A **chip on Rentals** and a **card on Today**. Order: **requests with a paid advance first** (D31), then
oldest first. Each row: requester, company if bound, pickup date (BS), items summary, full price,
advance, **paid / not paid**, age. The row turns **orange at 45 minutes** ⭐ with the words "Answer due in N
min" (never colour alone, Law 11), and the push re-fires at 45 minutes (T5-09). The promise is **1 hour,
any time** (W66) — never auto-declined, never auto-lapsed ⭐ 6.

### 6.4 Confirm — `booking_request_confirm(p_request_id, p_client_id, p_new_client jsonb, p_payload jsonb, p_id_checked bool)`

Coordinator and above. The UI opens **New Rental prefilled** from the request (dates, lines, zone, client
or "create from this request"); the Coordinator may change anything; Confirm is one button. The function,
in **one transaction**:

1. `SELECT … FOR UPDATE` the request; refuse unless `status = 'Requested'` (so Confirm racing Decline or
   Withdraw has exactly one winner).
2. **Client:** use `p_client_id`, or create the client from `p_new_client` with email forced to the
   requester's verified address (audited). Never auto-match.
3. **ID (W50):** refuse unless `client_has_id_on_file(client)` or `p_id_checked` is true — in which case the
   online ID is copied to `client_id_documents`. (`gate.online.id_unchecked`.)
4. Call `create_booking(p_payload)` with `client_uuid = request.confirm_client_uuid`. A second call hits
   the same key and returns the existing booking (Law 8); `confirmed_booking_id` is unique as the second
   guard.
5. Reserve through the existing server-authoritative path (`confirm_booking_atomic`, 0188). A conflict
   **refuses the whole Confirm**; the request stays `Requested`; the screen says "No longer available —
   change the dates or decline". *T7-04 must verify in code that `create_booking` and
   `confirm_booking_atomic` compose in one transaction; if they cannot, the fallback is `create_booking`
   producing a Draft and the reservation committed immediately after inside the same function, with a
   lifecycle step proving no half-state survives a conflict.*
6. Allocate any `Paid` intents to the new booking (§8.3).
7. Set `status = 'Confirmed'`, `confirmed_booking_id`, `terms_changed` (dates or lines differ from the
   request), `decided_*`. Email "confirmed" (§10). Audit.

### 6.5 Decline and withdraw

- **Decline** — Coordinator+, reason ≥ 10 characters, written for the client. `status = 'Declined'`.
- **Withdraw** — the requester, own `Requested` only. `status = 'Withdrawn'`.
- In both, every `Paid` and unallocated intent for the request moves to `RefundDue`. The screen shows
  **"Refund due"**, provider and reference (T7-07).

### 6.6 Staff changed the terms after payment

The intent amount was the advance on the **original** price. At allocation:

| Case | Result |
|---|---|
| paid = new advance | allocated in full |
| paid > new advance, ≤ new rental total | allocated in full; the extra is simply a larger advance (`gate.payment.over_booking` allows up to the booking's rental total) |
| paid > new rental total | allocate up to the total; the remainder becomes a **partial `RefundDue`** |
| paid < new advance | allocated; the booking shows the shortfall as outstanding; the email asks for the rest |

---

## 7. State machines (enforced by triggers, not by the UI)

```
booking_request:   Requested ──► Confirmed        (only booking_request_confirm)
                       ├──────► Declined          (only booking_request_decline)
                       └──────► Withdrawn         (only the requester, or staff acting for them)
                   Confirmed / Declined / Withdrawn are terminal and immutable.

payment_intent:    Created ─► Pending ─► Paid ─► Allocated
                       │         │         └──► RefundDue ─► Refunded
                       │         ├─► Failed
                       │         ├─► Expired          (late verify: Expired ─► Paid is allowed once, see §8.2)
                       │         └─► Mismatch ─► RefundDue ─► Refunded   (staff review; never auto-allocated)
                   Backward moves are refused. Only the service role may set Paid or Mismatch.
```

Illegal moves raise `gate.online.state`. A booking made from a request is an ordinary booking afterwards.

---

## 8. Online payment

Online payments cover **the rental advance, or an invoice balance — never the security deposit**
(⭐ **O-3**: advance only; deposit by cash or ID at handover). Desk payments stay manual and unchanged.
Fonepay first (Babin already holds a merchant account); eSewa and Khalti each behind a switch that stays
**off** until their merchant account and credentials exist — the pay screen lists only switched-on
methods, and **X does not wait for them** (PLAN §5). Babin enters every credential as an Edge Function
secret (N-8); no credential is ever in the repo, a log, a request body or a chat.

### 8.1 `pay-init` (Edge Function)

Input: `request_id` **or** `invoice_id`, `provider`, `Idempotency-Key`, Turnstile token. **No amount.**

1. Verify JWT and Turnstile; rate limit (§11).
2. Ownership: the request's `requester_auth_uid` equals the caller, or the invoice belongs to the caller's
   **bound** `client_id`. Else refuse with the same message as "not found" (no existence leak).
3. Amount, **on the server**: `request_advance` = `advance_required_paisa` minus already-`Paid`/`Allocated`
   intents; `invoice_balance` = `invoice_outstanding()` (already an anon-safe calculator). For a request
   that is not `Requested`, refuse.
4. Insert the intent (`Created`, idempotent on the key — a replay returns the same intent), call the
   provider adapter, set `Pending`, return the provider's page URL or QR.

### 8.2 `pay-verify` (Edge Function) and the callback

The provider's callback URL and the browser's return both land on `pay-verify`. **Neither is trusted.**
The function looks up the intent by id, then **asks the provider server-to-server** for the transaction's
status and amount, and compares in paisa:

| Provider says | Result |
|---|---|
| success, **amount equals** `amount_paisa` exactly | `Paid`, `provider_ref` stored (unique per provider), `verified_at`, event `verify_ok` |
| success, **any other amount** | `Mismatch` — held for staff, never allocated (tamper or provider error) |
| failure / cancelled | `Failed` |
| still pending after `expires_at` | `Expired` (a late success afterwards moves `Expired → Paid` **once**, then follows the normal path) |
| already `Paid`/`Allocated` (replay) | event `callback_replayed`; **nothing changes** |

The same call may arrive twice, out of order, or hours late; it must be safe each time. If the intent's
request is already `Declined`/`Withdrawn` when payment lands, the intent goes straight to `RefundDue`.

**Adapter contract** (one file per provider under `supabase/functions/_shared/providers/`):
`init(intent) → { redirect_url | qr_payload }` and `verify(intent) → { status, amount_paisa, provider_ref,
raw }`. This spec fixes the contract, **not** the providers' endpoints, signatures or field names: those
are taken from each provider's **current merchant documentation and sandbox**, and a T7-05 session that
cannot reach them stops and tells Babin rather than guessing a signature scheme.

### 8.3 Allocation — `payment_intent_allocate(p_intent_id, p_booking_id)`

New SQL function, run inside Confirm (§6.4 step 6) or when a bound client pays an invoice balance. It
**mirrors `recordPayment.ts` exactly** and a test asserts the resulting `payments` row equals the one the
action would have written for the same input:

- `payment_no` from `next_document_number('payment')`;
- `amount` = rupees from paisa (the one conversion);
- `payment_type = 'Advance Payment'`, `status = 'Received'` (so `sync_payment_to_invoice()` moves the
  invoice);
- `transaction_ref` = the provider reference; method written the same way the action writes it (today into
  `notes`, e.g. "Fonepay (online)");
- `client_uuid` = a deterministic key derived from the intent id, so a retry cannot write a second row;
- `received_by` = the confirming staff member. *If the column is NOT NULL, never invent a "system user" —
  use the confirming actor. T7-05 verifies nullability first.*

Under `FOR UPDATE` on the intent: refuse unless `Paid`; set `Allocated`, `allocated_payment_id`
(unique), event `allocated`. **An intent allocates once.** Payments stay immutable (Law 5): corrections
are reversal rows.

An intent that is `Paid` and **not yet allocated** shows in daily closing as **"money in — not yet
allocated"** (never revenue yet, never hidden) via `src/lib/queries/closing.ts`.

### 8.4 Refunds and reconciliation (T7-07)

⭐ **O-2:** if staff cannot confirm, **full refund to the same wallet within 3 working days.** Staff
refund in the provider's merchant portal (or by API where it exists) and **record** it: the intent gets
`refund_*` columns and `Refunded`; an already-allocated payment gets a `payment_reversals` row. Nothing is
edited (Law 4). A **reconciliation report** lists online payments by provider and day against
`payment_intents` and flags every intent that is `Paid` and neither allocated nor refunded after
**3 days**, every `Mismatch`, and every `Expired` that later paid.

---

## 9. Who may read and write what — every cell

Legend: **R** read · **W** write · **—** nothing (zero rows or refused) · **own** only rows that belong to
the session. "Staff-money" = Owner · Admin · Manager · Coordinator · Accounts. A refused SELECT returns
**zero rows, not an error** — the app must never read "0 rows" as "no data" for a money-blind role
(PERMISSIONS §5).

### 9.1 Tables, views, buckets

| Object | anon | Unbound account | Bound client | Coordinator | Manager · Admin · Owner | Accounts | Warehouse · Technician · Driver |
|---|---|---|---|---|---|---|---|
| `public_catalogue_v` | **R** | R | R | R | R | R | R |
| `products` / `bundles` base tables | — | — | — | existing | existing + `show_online`, `online_bundle_only`, photos (**W**) | existing | existing (no new columns writable) |
| `booking_requests` | — | **R own** (via `requester_auth_uid`) | **R own** (same) | **R all**; **W** only via Confirm/Decline RPCs | R all; W via RPCs | **R all** | **—** |
| `booking_request_lines` | — | R own | R own | R all | R all | R all | **—** |
| `payment_intents` | — | **R own** | R own (+ invoice intents) | R all | R all | **R all** | **—** |
| `payment_intent_events` | — | — | — | R | R | R | **—** |
| `online_profiles` | — | **R/W own** (own row only) | R/W own | **R** (no ID number unless the `client_id_documents` predicate allows) | R | — | — |
| `portal_users` · `portal_sessions` | — | R own (0072) | R own | R | R · **W hand-bind: Manager+ only** | — | — |
| `portal_link_requests` | — | R own | R own | R | R · W resolve | — | — |
| `portal_auth_challenges` | — | — (`using (false)`) | — | — | — | — | — |
| `online_rate_limits` | — | — | — | — | — (service role only) | — | — |
| `inventory_reservations` | — | — | — | existing | existing | existing | existing — **and never written by the request path** |
| `bookings`, `invoices`, `payments`, `client_id_documents` | — | — | **own client only** (0110 + P2–P5) | existing | existing | existing | existing (money-blind: Law 6) |
| bucket `catalogue` | **R** | R | R | R | R · **W** | R | R |
| bucket `request-ids` | — | **R/W own folder** | own folder | R (signed, 60 s) | R (signed, 60 s) | — | **—** |

No `UPDATE` or `DELETE` policy exists for `authenticated` on `booking_request_lines`,
`payment_intent_events`, `payment_intents` (service role and definer functions only), or any portal table
except the staff-gated ones named. Direct `INSERT` into `booking_requests` or `payment_intents` by any
role other than the definer functions is refused.

### 9.2 Functions

| Function | anon | Unbound | Bound | Staff | Notes |
|---|---|---|---|---|---|
| `public_availability` | **X** | X | X | X | the only new anon-executable function |
| `online_price_quote` | — | X | X | — (`staff_session` gate) | |
| `online_profile_save` | — | X | X | — | writes own row only |
| `booking_request_submit` | — | via Edge Function only | same | — | `revoke` from all but service role |
| `booking_request_withdraw` | — | X (own) | X (own) | Coordinator+ on request | |
| `booking_request_confirm` / `_decline` | — | — | — | Coordinator+ | |
| `payment_intent_allocate` | — | — | — | Coordinator+ (inside Confirm) · service role | |
| `portal_claim_by_verified_email` | — | X | X | — | existing |
| hand-bind | — | — | — | **Manager+** | audited, reason ≥ 10 |

### 9.3 Capabilities (added; no existing capability string is renamed — N-6)

| Capability | Roles | RLS predicate it mirrors |
|---|---|---|
| `online.request.create` | Client (unbound or bound) | `requester_auth_uid = auth.uid()` |
| `online.request.withdraw` | Client (own) · Coordinator+ | same + `auth_is_staff()` |
| `online.pay` | Client (own request / own invoice) | ownership in `pay-init` |
| `online.request.read` | Owner · Admin · Manager · Coordinator · Accounts | `auth_can_view_money()` **and** not floor |
| `online.request.decide` (confirm, decline) | Owner · Admin · Manager · Coordinator | Coordinator+ |
| `online.catalogue.publish` | Owner · Admin · Manager | M+ |
| `online.refund.record` | Owner · Admin · Manager | mirrors `gate.payment.reverse`; Accounts read-only ⭐ |
| `online.link.bind` | Owner · Admin · Manager | M+ |

The T-1 matrix round-trip, **T-3 (UI ⊆ DB)** and `rbac.policies.json` move in the **same commit** as each
migration (B-3). `rbac.ts` must not be more permissive than RLS (N-3).

---

## 10. The client emails (feeds T5-06's register)

Every message the app sends a client is in the T5-06 register and a test fails on one that is not. The
five online ones — **to the verified email only, never a typed one**, from an `@babinrentals.com`
address (T1-09), Nepali or English by the account's language, logged in `email_log` (T5-03) with
**ids only, never the body or amounts** in application logs.

| # | Message | Trigger | Contains | Never contains |
|---|---|---|---|---|
| E1 | **Sign-in code** | `signInWithOtp` | 6-digit code, 10-minute expiry, "if you did not ask, ignore this" | a link, the user's name |
| E2 | **Request received** | `booking_request_submit` | items, dates (BS + AD), the client's **own** full price and advance due, "we answer within 1 hour", a link to S7 | cost, internal notes, other bookings |
| E3 | **Payment receipt** | intent → `Paid` | amount, provider, reference, request reference, "your request is not confirmed until we reply" | card or wallet identifiers |
| E4 | **Request confirmed** | Confirm | booking number, dates, what changed if `terms_changed`, advance paid and outstanding, handover place/time, a link to S7 | the deposit as if it were payable online |
| E5 | **Request declined** | Decline / Withdraw-by-staff | the **reason staff wrote**, and — if paid — "Refund due: full amount to the same wallet within 3 working days" | internal reason codes |

Staff are notified by push and the queue chip (T5-09), not by email.

---

## 11. Abuse, rate limits and logging (T7-09)

- **Turnstile in two places that both matter:** (1) **Supabase Auth → Attack Protection → CAPTCHA =
  Cloudflare Turnstile**, so a direct REST call to `/auth/v1/otp` without a token fails — this is the
  one that closes the "stranger signs up with the anon key" hole; (2) the `request-submit` and `pay-init`
  Edge Functions verify the token **server-side** with Cloudflare, not just in the browser.
- **Writes only through Edge Functions** (service role) for `booking_request_submit` and `pay-init`, so
  Turnstile and limits cannot be bypassed by calling the RPC directly. The function takes the user id from
  the **verified JWT** and refuses any `user_id` in the body.
- **Rate limits ⭐** (`online_rate_limits`): code requests 5 / hour / email and 20 / hour / IP; submits
  10 / day / account and ≤ 3 open; `pay-init` 5 / hour / request; availability calls bounded by input size,
  a 2 s timeout, and Cloudflare caching of the catalogue.
- A scripted burst is refused; a normal user never sees a puzzle in normal use (managed-mode Turnstile).
- **Logs carry request/intent ids, never an email, phone, name, ID number, wallet id or amount** (T7-10).
  Provider payloads stored in `payment_intent_events` are redacted of anything that identifies the payer.

---

## 12. The D-5 test list (T7-03 builds, T7-10 re-runs on staging and live)

Runs under **PGlite** (`check:pglite` + `check:lifecycle` in one run = Verified, R-35) **and** on staging
with the two Client seats from T1-05 (Client A bound to company A, Client B bound to company B), plus a
third account that is **unbound**, plus a fourth **brand-new** account. The PERMISSIONS §12 D-5 row is
replaced by this list.

**Isolation (D-5 proper)**

| # | As | Does | Expected |
|---|---|---|---|
| D-5.1 | Client A | select from `bookings`, `booking_lines`, `invoices`, `payments`, `security_deposits`, `cases`, `documents`, `client_id_documents` | only A's rows; **B's rows = 0** in every table |
| D-5.2 | Client A | select `booking_requests`, `booking_request_lines`, `payment_intents`, `online_profiles` | only A's own; B's = 0 |
| D-5.3 | Client A | `update`/`delete` any of the above, `insert` a booking, invoice or payment directly | refused |
| D-5.4 | Client A | call `pay-init` for **B's** invoice or B's request | refused with the same message as "not found" |
| D-5.5 | Client A | withdraw B's request | refused |
| D-5.6 | Client A | read B's object in `request-ids` (direct path and a guessed signed URL) | refused |
| D-5.7 | **Unbound** account | select any `bookings`, `invoices`, `payments`, `clients`, `client_id_documents` | **0 rows** |
| D-5.8 | **Unbound** account | select `booking_requests` | **only their own** |
| D-5.9 | Client A | writes limited to the **five** client writes (§13 text); anything else | refused |

**Strangers (the fresh-signup gate)**

| # | As | Does | Expected |
|---|---|---|---|
| **D-10.1** | **brand-new account**, never bound | enumerate **every** table and view in `public`, `storage.objects`, and every RPC | zero staff rows; every staff RPC refused; the only readable relations are the catalogue view, the account's own request/intent/profile rows |
| D-10.2 | brand-new account | `select` from `users`, `settings`, `audit_events`, `staff_directory_v`, `products` (base), `clients` | 0 rows |
| D-10.3 | brand-new account | `auth_is_staff()`, `auth_user_role()` | `false`, `Client` |
| D-10.4 | brand-new account | call `portal_claim_by_verified_email()` twice | idempotent, binds nothing, one link request |
| D-10.5 | brand-new account | direct REST `POST /auth/v1/otp` **without** a Turnstile token | refused (CAPTCHA on in Auth) |
| D-10.6 | brand-new account | call each **token-gated** RPC directly with a made-up hash — today `get_rider_job_by_token`, `rider_mark_picked_up`, `rider_complete_delivery` (migration 0190) | refused at the **grant** (service role only), not merely by "invalid token"; requires finding R1 in `RULINGS-2026-11-01.md` to be fixed first |

**Anonymous**

| # | As | Does | Expected |
|---|---|---|---|
| D-6.a | anon | read **every** relation and execute **every** function | only `public_catalogue_v` and `public_availability` succeed; any other = 0 rows / refused |
| D-6.b | anon | `insert`/`update`/`delete` on `public_catalogue_v` or any view | refused (the 0095 hole) |
| D-6.c | anon | catalogue payload | contains **none** of: purchase price, replacement value, stock count, serial, SKU, branch, notes |
| D-6.d | anon | `public_availability` with 31 ids, 61 days, a past date | refused; result never contains a booking number or a count |

**Money and payments**

| # | As | Does | Expected |
|---|---|---|---|
| D-P.1 | Client A | `pay-init` with an `amount` in the body | ignored; intent amount = server advance |
| D-P.2 | provider (sandbox) | verify returns success at a **different** amount | intent → `Mismatch`, **not** allocated, no `payments` row |
| D-P.3 | anyone | replay a success callback 5 times | one `Paid`, `callback_replayed` events, **no** second state change, **no** second payment |
| D-P.4 | browser | hit the return URL with "success" but the provider says failed | `Failed`; nothing allocated |
| D-P.5 | Coordinator | Confirm a request with a `Paid` intent | exactly one `payments` row, equal to what `recordPayment.ts` writes for the same input; `Allocated` |
| D-P.6 | Coordinator | double-tap Confirm | exactly **one** booking; second call returns it |
| D-P.7 | Coordinator vs requester | Confirm while the requester withdraws | exactly one outcome |
| D-P.8 | Coordinator | decline a paid request | intent `RefundDue`; reconciliation report lists it |
| D-P.9 | staff | confirm with the total reduced below the paid amount | partial `RefundDue` for the remainder |
| D-P.10 | any | set an intent `Paid` or `Mismatch` | refused unless service role |
| D-P.11 | any | `update`/`delete` a `payments` row or an event | refused (Law 5) |
| D-P.12 | quote | `online_price_quote` vs `calculateAdvanceRequired()` at 0, 4,999, 5,000, 5,001, 10,000, 10,001, 25,001 | equal in paisa |

**Holds and availability**

| # | Does | Expected |
|---|---|---|
| D-H.1 | submit a request | `inventory_reservations` row count **unchanged** (D31) |
| D-H.2 | desk places an `active_hold` | `public_availability` reports not available for those days |
| D-H.3 | Confirm when another booking took the gear | whole Confirm refused; request still `Requested` |

**Floor and Accounts**

| # | As | Does | Expected |
|---|---|---|---|
| D-F.1 | Warehouse · Technician · Driver | select `booking_requests`, `payment_intents`, `booking_request_lines`, `request-ids`; call confirm/decline | 0 rows / refused; the Today card and Rentals chip are **absent** |
| D-F.2 | Accounts | read requests and intents; call confirm, decline, refund | read OK; the three writes refused |
| D-F.3 | staff session | call `booking_request_submit` or `pay-init` | `gate.online.staff_session` |

**App (vitest)** — T-1 matrix round-trip including the new capabilities; T-3 UI ⊆ DB; T-4 money DOM
(Warehouse never renders the queue); the booking bundle contains **no** import from `src/modules/*`,
`src/actions/*` or `src/lib/rbac.ts` (a build-graph assertion); `lint:ui-copy` clean on `src/booking/`.

---

## 13. PERMISSIONS and the ⭐ defaults

### 13.1 The exact text that changes in `docs/PERMISSIONS.md` (same commit as the code, B-3)

**§5, row "Rental rates, replacement value, deposit %"** — last cell, now:
~~on request/quote only~~ → **public daily rates on the catalogue (D34); a request shows the client's own
full price with VAT and the advance due; replacement value and deposit % stay private.**

**§5, row "Booking totals, discount, VAT, advance due, outstanding"** and the three rows below — Client
cell stays **own only**, now **including an unbound account's own request**.

**§7, opening paragraph** — now:
~~OTP login, no passwords; staff-enabled, no public signup.~~ → **Emailed one-time code, no passwords.
Anyone may create an account with an email address they control (D29, 26 Oct 2026). An account sees
nothing about any company until it is bound — automatically when its verified email exactly matches one
client's stored email, otherwise by a Manager or above. Staff confirm every request. Every read is joined
to the session's `client_id` — or, for an unbound account, to its own requests only.**

**§7, the table "Exactly four writes"** becomes **"Exactly five writes"**, all going to a staff queue
except the last, which goes to the provider and then to a staff-allocated ledger row:

| Write | Result staff-side |
|---|---|
| **Request gear** — a cart from the public catalogue, with dates (D34; replaces "free text, no catalogue in v1") **and Withdraw of one's own `Requested` request** | A request in the online queue; Coordinator+ confirms or declines; **nothing is reserved until Confirm** (D31) |
| Request extension | unchanged |
| Upload payment proof | unchanged |
| Sign agreement | unchanged |
| **Pay online** (D30) — the rental advance of own request, or the balance of own invoice, by Fonepay, eSewa or Khalti; **never the security deposit** (O-3) | A `payment_intents` row; becomes an immutable `payments` row only through staff Confirm (request) or immediately-allocated (own invoice); never changes an invoice's status by itself |

**§7, last paragraph** — the sentence "`portal_users`, `portal_sessions`, `portal_auth_challenges` are
**deny-all today**" is replaced by: **0072 (applied 31 Aug) ended the deny-all with explicit policies;
`portal_auth_challenges` stays `using (false)`. No `INSERT`/`UPDATE`/`DELETE` policy for `authenticated`
exists on `portal_users`; the definer function and staff hand-bind are the only doors. N-7 holds: no
client write is enabled in live before D-5 and D-10 pass.**

**§12.2, row D-5** — replaced by §12 of this spec; **D-10** is new.

### 13.2 Defaults taken — flip any by replying with its number (B-5)

| ⭐ | Default | Why | Revert |
|---|---|---|---|
| 1 | **O-2:** full refund to the same wallet within 3 working days | PLAN §4.2 | change the constant and the email wording |
| 2 | **O-3:** online covers advance or invoice balance only; deposit at handover | PLAN §4.2 | allow `purpose = 'deposit'` + a `deposit_movements` path (not built) |
| 3 | Intent expires after **30 minutes** | typical wallet session; a late success still reconciles (§8.2) | one constant |
| 4 | A request is **orange at 45 min**, promise 1 h (W66) | already ruled | — |
| 5 | **Max 3 open requests** per account; 10 submits / day | spam guard | one constant |
| 6 | Requests are **never auto-declined or auto-lapsed** | a paid request must never vanish | add a lapse job |
| 7 | Rate limits as §11 | no data; conservative | one table of numbers |
| 8 | Max **30 lines** per cart; **8 MB** ID image; jpeg/png/webp/pdf | sane bounds | constants |
| 9 | **Floor roles: no access** to requests (T7-04 card allowed non-money columns) | stricter wins (B-1) | add a money-free view for floor roles |
| 10 | **Hand-bind is Manager+**; Coordinator links the booking, not the account | a wrong bind leaks a company's data | allow Coordinator |
| 11 | **Accounts reads, cannot refund**; refund = Owner · Admin · Manager | mirrors `gate.payment.reverse` | add Accounts to `online.refund.record` |
| 12 | ID images of accounts that never complete a booking are **kept, private** (nothing is deleted; retention period is a figure Babin can set) | Law 3 | add a retention job |
| 13 | A submitted request is **immutable**; change = withdraw and re-request | keeps the paid amount tied to one price | add an "edit" that voids intents |

Not decided here and not needed to build: **O-1** (what `babinrentals.com` shows after the store closes),
and the three providers' endpoint details (§8.2).

---

## 14. Build map — which card builds which section

| Card | Builds | Migration (ledger row) | Done when it also proves |
|---|---|---|---|
| **T7-02** Booking site and catalogue | §2 S1–S3, §3, §5.6 | `public_catalogue_v`, `public_availability()`, `catalogue` bucket, `show_online`/`online_bundle_only` | D-6.a–d, D-H.2; `check:pglite` fails on any other anon relation |
| **T7-03** Client accounts | §4, §5.5, §2 S4, `online_price_quote` shell | portal completion (builds on 0072, **not** a rewrite), `online_profiles`, `request-ids` bucket | D-5.1–9, **D-10.1–5**, D-F.3 |
| **T7-04** Requests and queue | §5.1–5.2, §6.1–6.6, §7, §2 S5/S7, §6.3 | `booking_requests` + lines + RPCs | D-H.1, D-H.3, D-P.6–9, D-F.1–2 |
| **T7-05** Fonepay | §5.3–5.4, §8.1–8.3, §2 S6 | `payment_intents`, events, `payment_intent_allocate` | D-P.1–5, D-P.10–12 |
| **T7-06** eSewa · Khalti | §8 adapters behind switches | none | same D-P tests per provider |
| **T7-07** Refunds and reconciliation | §8.4 | none (columns already on the intent) | D-P.8–9 and the report |
| **T7-08** My bookings | §2 S7 (bound view), **Pay balance** | none | D-5 still green |
| **T7-09** Abuse protection | §11, §5.7 | `online_rate_limits` | D-10.5; burst refused |
| **T7-10** Security review | §12 on staging and live; secrets only in Edge Function secrets; no PII or amounts in logs; anon allow-list is exactly two objects | none | Babin reads the one-page summary and says go (N-7) |
| **T7-11** Launch | `book.babinrentals.com` CNAME; Booqable store stops new bookings the same day (T9-05) | none | a real client books and pays on day X |

**Gates for every card:** the list in [`docs/plans/README.md`](plans/README.md) (typecheck, lint, tests on
mock data, `check:pglite` **and** `check:lifecycle` in one run, financial integrity, security, server
contracts, `lint:progress`, UI copy, contrast, build). Drive the changed screen at **375 / 820 / 1440**
and run the screen check in [`docs/USABILITY_TESTS.md`](USABILITY_TESTS.md) §1. Applying any migration to
live is Babin's, after the backup (N-5).

---

## 15. Failure modes the build must handle

| Situation | Behaviour |
|---|---|
| Availability changed between request and Confirm | Confirm refused whole; request stays `Requested`; Coordinator changes dates or declines |
| Two tabs submit the same cart | one request (`client_uuid`) |
| Client pays, then closes the tab before the return page | the provider callback still lands on `pay-verify`; the intent reaches `Paid` without the browser |
| Provider callback arrives **before** the request row commits | `pay-verify` retries with backoff for the intent id; never creates an intent from a callback |
| Late success after `Expired` | `Expired → Paid` once, then normal; shown in reconciliation |
| Client changes email at their provider/mailbox | the account's identity is the verified email at sign-in; a new address is a new account |
| Shared mailbox (`info@company.com`) | by D2's letter, whoever controls it can bind to that company if it is the one stored email — the staff-visible link-request and audit exist for exactly this; Babin may prefer personal emails on client records |
| Two people from one company sign up | the first bound; the second becomes a link request for Manager+ |
| Staff session opens the booking site | refused with the staff-session message (§1) |
| Offline on S3/S5 | the cart is kept; submit is disabled with "You are offline"; **never** shows "sent" before the server answers |
| Provider down | S6 says so inline; the request is still valid; "pay at the desk" remains |
| VAT disabled in settings | quote shows VAT 0; the advance rule runs on the same Rental Total |
| Delivery zone "Outside the valley" | no fee shown; `needs_delivery_quote`; staff type the fee at Confirm; the email says it was added |

---

## 16. Source check

Read to write this: `RULINGS-2026-10-26.md` (S9, S15, D29–D34), `RULINGS-2026-10-26-workflow.md` (W50, W51,
W63–W66, W84, W85), `docs/PERMISSIONS.md` §2, §5, §6, §7, §12, `docs/plans/T7_ONLINE_BOOKING.md`,
`T5_NOTIFICATIONS.md` (T5-06), `T4_SHARED_TOOLS.md` (T4-07), `PLAN.md` §4.2 and §6,
migrations `0005_clients` (portal tables), `0072_portal_email_binding_policies`, `0110_client_own_rows_rls`,
`0144_booking_project_type` (current `create_booking`), `0182` (`client_id_documents`), `0188_smart_reservation_holds`,
`0189_delivery_zones`, `docs/live/schema_migrations_2026-10-15.txt` (0072 applied live),
`src/lib/pricingPipeline.ts` (`calculateAdvanceRequired`, Rental Total), `src/actions/finance/recordPayment.ts`,
`scripts/allowed-anon-functions.mjs`. Nothing here was executed against a database; every behaviour above
is a **design** that T7-02…T7-11 must prove with the §12 tests. Where the current code could not be read to
the end (the `create_booking` + `confirm_booking_atomic` composition, `payments.received_by`
nullability, the provider APIs) the spec says so in place and names who verifies it.

# T7 — Online booking & payments

**Goal:** replace the Booqable store before Booqable is switched off: a public catalogue with daily
rates at `book.babinrentals.com`, client accounts by verified email, booking requests that staff
confirm, and online payment by Fonepay, eSewa and Khalti. **Lane C · Codex-2.** Rulings: S9, S15, D29, D30, W63–W66, W84, W85,
D31, D34; B1–B8, B17, B37–B39, B45 (27 Oct); 30 Aug D2 (binding only by verified control of the client's stored email); Laws 4, 5, 6,
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

### T7-01 · Online booking spec            status: written 1 Nov 2026 — `docs/ONLINE_BOOKING_SPEC.md`; awaiting Babin's approval · size: M · Claude writes (arrives as a file)
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
**Categories and dates first (27 Oct — B3, B7):** the site uses the app's own categories — two levels
plus **Bundle Deals** — with no separate store set. A visitor **picks dates first**; every item then
shows **available / not available** for those dates (no counts); without dates the catalogue shows
rates only. Product photos start fresh (B45): the official photos Babin picks (B49) are uploaded here.
**Why** — S9, D34; B3, B7, B45.
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
**Checkout questions (27 Oct — B8):** the request also asks **Production / project name** and **Shoot
location**; both are saved on the booking (T3-26).
**Why** — D29, D31, D34, W63, W66, W85; B8.
**Where** — `src/booking/*`, `src/modules/rentals/RentalsList.tsx`, `NewRental.tsx` prefill,
`src/modules/today/*`, new migration.
**Database** — migration (claim number): `booking_requests` + lines + RLS (client: own; staff:
Coordinator+ write, floor roles no money columns); lifecycle "request never creates a reservation";
"confirm creates exactly one booking (idempotent on request id)".
**Build notes** — `main` now has 4-hour inventory holds (0188 `create_or_extend_hold`, the
`holdEquipment` action — no screen uses them yet). An online request must **not** place one: D31 says a
request holds nothing until staff confirm; staff confirm through `confirm_booking_atomic` (0188).
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
record it — a reversal row, never an edit (Law 4). **When a paid booking cannot go ahead (O-2, ruled
27 Oct — B39):** staff 1) try to sub-rent; 2) offer the nearest similar item; 3) otherwise refund in
full — **or the client keeps it as account credit, the client's choice** (recorded as credit, not
cash). A refund goes back to the same wallet within ⭐ 3 working days. The at-risk flow that leads here
is T3-29. A reconciliation report lists online payments by provider and day against
`payment_intents`, flags any paid intent not allocated or refunded after 3 days.
**Why** — D30, D31; Law 4; B39.
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

### T7-12 · Recommended items            status: todo · size: M · lane C · [go-live] · slips first
**What** — Each product gets a short list of **recommended items** ("often rented with", ⭐ up to 6)
(B1). The list **fills itself** from past bookings — items most often on the same booking in the last ⭐
12 months, own products only — and **staff can change it** on the product (replace, reorder, pin); a
staff choice is never overwritten by the automatic fill. Shown on the public product page (only items
that show online, T7-02) and in New Rental after adding an item ("Often added: V-mount battery ×2" —
one tap each).
**Why** — B1.
**Where** — the product page in `src/booking/*`, `AddItemPanel.tsx`, the equipment form, a scheduled
refresh.
**Database** — migration (claim a number): `product_recommendations` (product, recommended product,
position, source auto/staff), refreshed by a scheduled function that never touches staff rows;
public read only through `public_catalogue_v` for items shown online; lifecycle "an item not shown
online never appears on the public page".
**Done when** — a camera shows its six most co-rented items; staff swaps one and it stays after the
next refresh; New Rental offers them after the camera is added; screen check.
**Needs** — T7-02.

### T7-13 · Products with options on one page            status: todo · size: M · lane C · [go-live] · slips first
**What** — Products that differ only in an option — lens **mount** (EF / PL / E), cable **length**,
size — show as **one product page with an option picker** (B2), online and in New Rental. Each option
stays its own product underneath (own stock, units, rate and availability), grouped under a parent
"family" ⭐ — so stock, pricing and reservations do not change. With dates chosen (B7), each option
shows available / not available.
**Why** — B2.
**Where** — the product page in `src/booking/*`, `AddItemPanel.tsx`, the equipment form (family and
option label), `public_catalogue_v`.
**Database** — migration (claim a number): `product_families` with `products.family_id` and
`option_label`; the public view shows families; lifecycle "booking an option reserves that option's
units only".
**Done when** — a lens shows EF and PL on one page; choosing PL books a PL unit; staff group and
ungroup products on the equipment form; screen check.
**Needs** — T7-02.

### T7-14 · "Away" switch for online booking            status: todo · size: S · lane C · [go-live] · slips first
**What** — One switch in Settings ▸ Online booking (⭐ Owner · Admin · Manager): **"Away — not taking
online requests"**, with an optional message and an optional "back on" date (B6). While it is on, the
site still shows the catalogue and rates, the request button shows the message ("Back on 15 Feb — call
or WhatsApp us"), and the server refuses new requests. No closed-days calendar.
**Why** — B6.
**Where** — the settings table (0158), `src/booking/*`, the request function (T7-04).
**Database** — the request function checks the setting (inside T7-04's migration if still open,
otherwise claim a number); lifecycle "a request while away is refused".
**Done when** — on: the site shows the message and the server refuses a request; off: requests work;
screen check.
**Needs** — T7-04.

### T7-15 · Payment link from any booking            status: todo · size: M · lane C · [go-live] · slips first
**What** — On any booking with money due (B17), "**Payment link**" makes a Fonepay link for the advance
or the outstanding balance — **the server computes the amount**, never the screen — and shares it by
WhatsApp draft, email or copy (T3-16). When Fonepay confirms server-to-server (T7-05's `pay-verify`),
the payment is recorded once as an immutable payment row (Law 4). Links expire ⭐ after 48 hours; a new
link replaces the old; a paid link cannot be paid twice. The security deposit is never taken online
(O-3, B38). **Design note first** (security card).
**Why** — B17, B55; D30; Law 4.
**Where** — `BookingDetail.tsx`, `supabase/functions/pay-init/` (T7-05), a public pay page in
`src/booking/pay/*`.
**Database** — migration (claim a number): `payment_intents` (T7-05) gain the booking, a hashed link
token and an expiry; lifecycle "an expired link refuses", "the paid amount is the server's figure", "a
replayed callback changes nothing".
**Done when** — a Coordinator sends a link for a booking's balance; the client pays in the Fonepay
sandbox; the payment appears once on the booking and in daily closing; an edited amount in the link is
refused; Warehouse cannot make a link; screen check.
**Needs** — T7-05.

### T7-16 · Store analytics: GA4 and Meta Pixel            status: todo · size: S · lane C · [go-live] · slips first
**What** — Add Google Analytics 4 and the Meta Pixel to the **public booking site only** (B37) — never
to the staff app. Events ⭐: page view, view item, add to request, request sent, payment done (with the
rupee value). **No personal data** in any event: no names, emails, phone numbers or booking numbers.
The IDs are public configuration (`VITE_GA4_ID`, `VITE_META_PIXEL_ID`), not secrets; the scripts load
after the page so the first view is not slower; the site's Content-Security-Policy allows these two
services only; a line on the privacy page says the site uses them ⭐.
**Why** — B37, B55.
**Where** — `booking.html` / `src/booking/*`, `vite.config.ts` (env), the privacy page.
**Database** — none.
**Done when** — GA4 DebugView and Meta's test events show the five events from staging; a test proves
the staff app loads neither script; no personal data in any event (test); the product page's Lighthouse
performance score drops by ⭐ 5 points at most.
**Needs** — T7-02; the two IDs from Babin (BABIN_ACTIONS).

### T7-17 · Old store links open the same item            status: todo · size: S · lane C · [go-live] · slips first
**What** — Old Booqable store addresses (product and category pages) live on in Google results,
Instagram bios and WhatsApp chats. From day X each one opens **the same item** on
`book.babinrentals.com` (B4): T9-01 records each product's Booqable slug; the booking site maps an old
path to the new product or category page; anything unknown goes to the catalogue home — never a dead
page. Babin points `babinrentals.com/*` to `book.babinrentals.com/*` with one Cloudflare redirect rule
that keeps the path, at day X (O-1, B5, T9-05). Before day X, collect the real list of old paths (Google
Search Console or a crawl of the live store) and test every one.
**Why** — B4, B5.
**Where** — the booking site's router (`src/booking/*`), T9-01's slug data, a test list of old paths.
**Database** — the Booqable id ↔ product map already exists (`external_refs`, 0040); T9-01 records each
product's old store slug beside it. Claim a number only if a new column or entity type is needed.
**Done when** — every collected old path lands on the right item or category on staging; a made-up
path lands on the catalogue home; screen check.
**Needs** — T7-02, T9-01.

### T7-10 · Security review — the N-7 gate            status: todo · size: M · lane C
**What** — Before any client write path is on in live: D-5 green on staging; amount tampering,
callback replay and forged-session tests green; secrets only in Edge Function secrets; no PII or
amounts in logs; the anon allow-list contains exactly the two public objects; PERMISSIONS §5/§7
match the code; the public pay page of T7-15 and the analytics of T7-16 are covered (a slips-first card that lands after this review gets its own short review before it goes live). Written up in `docs/verification/ONLINE_BOOKING_REVIEW_<date>.md`.
**Why** — N-7; P8.
**Database** — none.
**Done when** — Babin reads the one-page summary and says go.
**Needs** — T7-02 … T7-09.

### T7-11 · Launch            status: todo · size: S · lane C + Babin
**What** — `book.babinrentals.com` goes live on day X (CNAME at the DNS host); `babinrentals.com`
redirects to `book.babinrentals.com` and old store links open the same item (O-1 ruled 27 Oct — B5;
T7-17); the Booqable store stops taking new bookings the same day (T9-05).
**Why** — S9, S15; B4, B5.
**Done when** — a real client books and pays online on day X.
**Needs** — T7-10, T9-04 go decision.

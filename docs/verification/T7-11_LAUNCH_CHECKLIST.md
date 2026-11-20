# T7-11 · Online Booking Launch Runbook & Operational Checklist

**Status:** Ready for Day X Launch Execution  
**Lane:** Lane C (Windows) + Babin  
**Rulings:** S9, S15; B4, B5; O-1 (27 Oct 2026); N-5, N-7, N-8.

---

## 1. Architecture & Domain Routing (Babin Ruling)

| Hostname | Destination / Target | Purpose | Config Location |
|---|---|---|---|
| `babinrentals.com` | Production Web Host (Vercel / Cloudflare / Nginx) | **Client Front Door**: Public Online Booking Store, Gear Catalogue, Client Accounts, and Public Payment Links | Root domain / Primary public ingress |
| `app.babinrentals.com` | Production Web Host (Cloudflare Pages / Nginx) | **Staff Operations**: Booking management, Today dashboard, Inventory, Floor verification, Crew, Finance, Settings | Subdomain / Staff authentication boundary |
| `book.babinrentals.com` | Canonical Alias / 301 Redirect | Alias redirecting to `https://babinrentals.com` | DNS CNAME `book` → `babinrentals.com` |

---

## 2. babinrentals.com Backup Verification (Booqable Corpus)

The backup of the original `babinrentals.com` Booqable catalog was located and inspected at:
`C:\Users\use\Desktop\Babin rentals products app\archive\legacy_and_duplicates\products-export-2026-06-30.csv`

### Verified Backup Inventory:
- **Total Catalog Products:** 274 equipment products.
- **Fields Preserved:** Booqable UUID, Product Name, SKU, Category/Collections, Stock Identifiers, Base Price in Paisa/Cents (`base_price_in_cents`), Deposit amounts, Photo CDN URLs (`content.booqablecdn.com`), and Barcodes.
- **Sample Verified Items:**
  - `GRP-10-10-SKM-KIT`: 10x10 Skimmer Frame and Cloth (NPR 1,500/day)
  - `GRP-12-12-SKM-KIT`: 12x12 Skimmer and Cloth
  - `GRP-20-20-SKM`: 20x20 Skimmer Cloth (NPR 2,000/day)
  - `58MM_ND`: 58mm ND Filter (NPR 50/day)
- **Integration with Babin Rentals OS:**
  - `external_refs` table (migration 0040) stores Booqable UUID mappings.
  - Legacy URL resolver (T7-17, `src/lib/legacyUrlResolver.ts`) maps historical slugs directly into canonical catalogue IDs so bookmarked links resolve without error.
  - Product rates are mapped 1:1 into integer paisa (`src/lib/money.ts`).

---

## 3. DNS & Ingress Preflight (Babin Action)

- [ ] **DNS Apex & Subdomain Records:**
  - `babinrentals.com` (A / ALIAS) → Production Web Host (Public Booking Store).
  - `app.babinrentals.com` (CNAME) → Production Web Host (Staff App).
  - `book.babinrentals.com` (CNAME) → `babinrentals.com` (Alias).
- [ ] **SSL / TLS Certificates:**
  - Active SSL certificates verified on both `babinrentals.com` and `app.babinrentals.com`.

---

## 3. Production Environment & Secrets (Babin Action)

### Client Bundle Variables (Vite - Public Only, N-8)
*Inlined at build time on production host:*
- `VITE_SUPABASE_URL`: Production Supabase endpoint (e.g. `https://<prod>.supabase.co`).
- `VITE_SUPABASE_ANON_KEY`: Production Supabase anonymous API key (public client key only).
- `VITE_GA4_ID`: Public Google Analytics 4 measurement ID (e.g. `G-XXXXXXXXXX`).
- `VITE_META_PIXEL_ID`: Public Meta Pixel tracking ID (e.g. `XXXXXXXXXXXXXXX`).
- `VITE_APP_VERSION`: Current release tag (e.g. `v1.0.0-day-x`).

### Server Edge Function Secrets (Supabase Vault / Secrets Manager, N-8)
*Configured in Supabase Dashboard ▸ Project Settings ▸ Edge Functions:*
- [ ] `FONEPAY_MERCHANT_CODE`: Babin Rentals production merchant code.
- [ ] `FONEPAY_SECRET_KEY`: Production HMAC-SHA512 secret key.
- [ ] `ESEWA_PRODUCT_CODE`: Production eSewa merchant code (when activated).
- [ ] `ESEWA_SECRET_KEY`: Production eSewa HMAC-SHA256 secret (when activated).
- [ ] `KHALTI_SECRET_KEY`: Production Khalti live secret key (when activated).
- [ ] `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile bot verification server key.

---

## 4. Track 7 Feature Readiness Verification

All upstream Track 7 cards have been implemented, tested, and verified:

1. **Catalogue & Availability (T7-02):**
   - Clean public catalogue rendered via `public_catalogue_v`.
   - Anonymous access limited strictly to catalogue and availability RPCs (D-5 tenant isolation).
2. **Client Accounts & KYC (T7-03):**
   - Passwordless email OTP authentication.
   - Profile completion and ID/citizenship photo upload stored in isolated private bucket.
3. **Requests & Staff Queue (T7-04):**
   - Online requests create zero equipment reservations until confirmed by Coordinator (fail-closed).
   - Staff queue on Today workspace alerts Coordinators with 1-hour SLA.
4. **Online Payments (T7-05, T7-06):**
   - Server-computed amounts only (Law 1, D30).
   - Security deposits strictly excluded from online payments; taken in person at pickup (O-3, B38, Law 5).
   - Fonepay QR dynamic generation; server-to-server signature verification via `pay-verify`.
   - eSewa & Khalti integrations with admin switchboard (OFF by default until credentials verified).
5. **Refunds & Reconciliation (T7-07):**
   - Law 4 payment immutability: reversals recorded as counter-rows.
   - Bank/wallet refunds vs. client account credits.
   - Daily closing reconciliation alerts for unmatched intents.
6. **Customer Portal: My Bookings (T7-08):**
   - Verified clients view order history, active rentals, 6-step lifecycle tracker, invoices, and payment links.
7. **Bot & Abuse Protection (T7-09):**
   - Cloudflare Turnstile token verification on request submission.
   - Rate limiting on public request creation and OTP generation.
8. **Product Recommendations (T7-12):**
   - "Often rented with" suggestions computed from rolling 12-month co-rental frequency.
9. **Products with Options (T7-13):**
   - Single product page with option picker (EF / PL / E mount, cables) grouped under parent families (B2).
10. **Away Switch (T7-14):**
    - Owner/Admin/Manager switch to pause online requests with custom notice (B6).
11. **Payment Links (T7-15):**
    - 48-hour secure payment links generated from any booking with money due.
    - Server-authoritative calculation; deposit excluded; WhatsApp/email sharing.
12. **Store Analytics (T7-16):**
    - GA4 and Meta Pixel tracking on public store only.
    - 5 standard events (`page_view`, `view_item`, `add_to_request`, `request_sent`, `payment_done`).
    - Zero personal identifying data (no names, phones, emails, or booking references).
    - Strictly disabled on staff application surfaces.
13. **Legacy URL Routing (T7-17):**
    - Old Booqable product and category URLs seamlessly redirect to the exact item or category in the new store (B4, B5).

---

## 5. Cutover Protocol (Day X)

### Step 1: Pre-Cutover Health Check (-2 Hours)
- [ ] Confirm staging and local tests are 100% green (`npm run gates`).
- [ ] Verify Supabase production migrations applied up to latest verified ledger number.
- [ ] Verify `settings.online_booking_away_mode = false`.

### Step 2: Booqable Decommissioning (-30 Minutes, T9-05)
- [ ] In Booqable admin settings:
  - Disable online checkout / set cart to "View Only" or disable storefront.
  - Insert storefront announcement banner:
    `"We have upgraded our online booking platform! Please visit https://babinrentals.com to browse our equipment catalogue and request rentals."`
  - Export final backup of Booqable customers, bookings, and inventory records.

### Step 3: Domain Switch (00:00 NPT or Agreed Cutover Window)
- [ ] **Owner-approved change only:** point the `babinrentals.com` apex to the public storefront host using supported A/ALIAS/CNAME-flattening records; use the actual host configuration.
- [ ] Point `book.babinrentals.com` to a host that serves a **one-way HTTP 301 redirect** to `https://babinrentals.com` (a CNAME alone does not create an HTTP redirect). Ensure no rule redirects the apex back to `book`.
- [ ] Keep `app.babinrentals.com` mapped to the separate authenticated staff application. Verify TLS certificates and correct origin/host bindings for all three names.
- [ ] Inspect `curl -I https://babinrentals.com` for a successful public storefront response; inspect `curl -I https://book.babinrentals.com` for `301 Location: https://babinrentals.com/...`. Use `curl -IL --max-redirs 5 https://book.babinrentals.com` to prove it terminates on the apex without a loop.
- [ ] Capture before/after DNS, origin and HTTP redirect evidence; do not make changes unless a separate owner-approved cutover window and rollback configuration are ready.

### Step 4: First Live Transaction Test (+15 Minutes)
- [ ] Navigate to `https://babinrentals.com` from a clean browser / mobile device; independently test that `https://book.babinrentals.com` redirects to the apex.
- [ ] Search an item, select dates, add to cart.
- [ ] Submit booking request as a test client.
- [ ] Coordinator checks Today dashboard: confirms request appears in staff queue.
- [ ] Coordinator confirms booking → verifies exact GiST reservation hold created.
- [ ] Client completes advance payment via Fonepay live QR.
- [ ] Verify server-to-server callback allocates immutable `payments` row and updates invoice balance.
- [ ] Coordinator tests refund / reversal in Finance workspace if test money was moved.

---

## 6. Rollback Protocol

If an unrecoverable failure occurs during DNS cutover or payment gateway handshake:
1. Under a separately approved rollback decision, restore the **recorded previous apex DNS/origin and redirect configuration** using the correct supported record type. Do not assume an apex CNAME exists; revert `book` alias rules coherently to avoid a redirect loop.
2. Once separately authorized, enable the existing "Away — not taking online requests" setting with an approved message that uses the **verified business contact details already configured** in Settings. Do not publish a fabricated contact number.
3. Unconfirmed online requests remain safe in the database without phantom reservations.
4. Investigate server logs / Edge Function logs without user disruption.

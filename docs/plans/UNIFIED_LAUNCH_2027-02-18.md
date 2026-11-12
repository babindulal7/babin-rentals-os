# Babin Rentals — unified OS + website + client portal launch

**Document status:** approved owner *launch direction and settings defaults*; implementation tasks are **NOT YET VERIFIED**. 12 Nov 2026.
**Target:** coordinated launch by **18 February 2027**, conditional on safety, business and physical-device release gates.
**Decision authority:** [12 Nov owner rulings](../../RULINGS-2026-11-12-unified-launch.md). Read [governance](../00_READ_FIRST.md), [permissions](../PERMISSIONS.md), [product rules](../PRODUCT_RULES.md), and [agent workflow](../AGENT_WORKFLOW.md) before changes.
**Existing detailed technical plan:** [T7 online booking](T7_ONLINE_BOOKING.md) and [online booking specification](../ONLINE_BOOKING_SPEC.md). This document reconciles scope and delivery order; it is *not* proof that website/portal code has been built.

## 1. One product, three surfaces

| Surface | Proposed location | Public vs private | Launch-critical behaviour |
| --- | --- | --- | --- |
| Company website + catalogue | `babinrentals.com` | Public | Professional homepage, gear categories, search, product/bundle detail, rental rates, availability for chosen pickup and return datetime, WhatsApp/contact, clear entry to booking and client account. Latest UL-01 supersedes old plan to postpone full company site. |
| Booking + client portal | `book.babinrentals.com` or integrated account paths on same public site | Public request form; verified login for account | Both guest and signed-in booking requests, client-specific discounts only when securely eligible, request status, own bookings/invoices/receipts, online payment when fully validated. |
| Staff Babin Rentals OS | Existing private staff surface | Staff only | Single source of stock and rental truth, pending online-request queue, staff approve/decline, finance role gates, notifications, floor lifecycle, receipts and payment reconciliation. |

Do **not** build three independently writable inventory systems. Public applications use deliberately narrow, server-mediated endpoints; no browser-side role or price assertion is trusted.

## 2. Customer experience (dates and times first)

1. Open the public website and select **Pickup date + time** and **Return date + time** in an obvious, persistent date-range bar *before* equipment browsing. Keep the chosen range across categories, product, bundle and cart; support changing either field without discarding the cart.
2. Show **available / unavailable / checking / unable to check** per product or bundle for that exact interval, including live reservations, holds, maintenance, turnaround and known legacy/Booqable blocks. Unknown is **not** available. Never disclose stock counts, booking names or serial numbers.
3. Show published base rate, fee/VAT breakdown, rental-duration assumptions and availability recheck. Apply `06:00`–`06:00` business rental-day policy through authoritative server rules with Kathmandu timezone (`Asia/Kathmandu`), including cross-midnight and multi-day selections. BS + AD display is consistent; never mix a local date with a UTC instant.
4. Submit a **request**, not a reservation. Guest flow requires contact details, bot/rate-limit protection and audit without granting account access. Signed-in verified/bound client may see eligible personalized prices computed by server. Guest must not see another client's data.
5. Authorized staff receive a notification and queue entry; **manual confirmation** invokes one atomic availability/conflict check and creates exactly one reservation. Decline records a reason. Repeated clicks/notifications/callbacks are idempotent. If stock changed, clearly offer adjustment or decline; never silently accept an impossible request.
6. Secure client portal shows only its owner's request/booking timeline, own invoices, balances and documents. Fonepay sandbox/payment verification is independent; never treat a browser redirect as confirmed money. Public launch can defer optional features, but cannot claim online payment works before provider reconciliation.

**Date/time acceptance samples:** same day; exactly 06:00; 05:59–06:01 across rental-day edge; interval across midnight; 2- to 5-day rental; stock returned late; overlap against confirmed/active and legacy holds; invalid return before pickup; long-range availability read failure; changing date/time after cart filled; iPad/mobile calendar control. Any pricing/legal uncertainty is recorded for owner review rather than guessed.

## 3. Design-approved settings, *not active settings*

Path: **Babin Rentals OS → Settings → Website & Client Portal**. Only Owner/Admin can edit; backend role enforcement and immutable audit trail, with failures shown rather than masked.

| Setting | Launch-design default | Rule |
| --- | --- | --- |
| Online booking confirmation | **Manual staff approval** | A request never reserves inventory or becomes Confirmed automatically |
| Guest booking requests | **Enabled** | Guest requests may be submitted, never grant an account read |
| Public base rental pricing | **Enabled** | Published list rates only; no confidential commercial data |
| Personalized discounts | **Enabled** | Eligible verified/bound signed-in accounts only; server-derived |
| Staff notifications for new requests | **Enabled** | Only authorized staff; delivery failures recoverable |

Additional online-show product switches and the existing Away switch must remain gated and audited; do not publish all inventory accidentally. Changes above are specification only; **do not edit production settings**.

## 4. Three independent workstreams — first sprint

**Branch/worktree rule:** create a fresh worktree for *each* lane from current `origin/main`. Do not edit shared paths without a claim. One agent owns one checkout; no direct main pushes. The documentation draft PR containing this plan remains separate from all implementation PRs.

### A. Mac mini / Antigravity — OS release foundation (critical path)

**Focus:** present security and release blockers, *not* website UI. Start from exact latest main. Audit and repair the existing open PRs rather than duplicating them, especially staff PIN [#147](https://github.com/babindulal7/babin-rentals-os/pull/147), release HOLD [#56](https://github.com/babindulal7/babin-rentals-os/issues/56), staff view [#66](https://github.com/babindulal7/babin-rentals-os/issues/66), Electron auth [#46](https://github.com/babindulal7/babin-rentals-os/issues/46) and CI [#67](https://github.com/babindulal7/babin-rentals-os/issues/67).

**First deliverables:** exact-head CI matrix; concise blocker/release-gate inventory; safe isolated source fixes for P0 issues only; read-only migration-drift mapping; staging requirements and reversible data migration rehearsal plan. Preserve existing finance permissions, stock allocation and lifecycle. Do not apply migrations anywhere hosted or incur staging costs without approval.

**Evidence:** exact SHA + full `npm run gates` on relevant isolated heads; PR/check URLs; reproduce real P0 security assertions. Main is GREEN only if current main's required jobs pass. **No merge, deploy or live DB changes.**

### B. Windows PC 1 / Antigravity or Codex — public website + date-first catalogue

**Own:** public website shell, marketing content/navigation, responsive catalogue/product pages, **pickup and return date + time** picker and read-only availability adapters. Keep any real public API/migration implementation in its own PR subject to security review; do not fabricate available stock or launch a public endpoint before server protections exist.

**First deliverables:** real responsive shell contract, reusable datetime selection state, read-only catalogue/data interface, graceful loading/error/unavailable states; mock-safe isolated preview followed by an API wiring plan. Preserve public prices and secure boundaries, existing brand/site identity and UX on 375/820/1440 px layouts. Avoid modifying staff `src/lib/auth.tsx` or finance code.

**Verification:** select interval, browse category/product, change dates, observe accurate available/unknown, retain selected interval; responsive + keyboard + screen-reader checks; no hidden dummy availability, no misleading payment/booking success.

### C. Windows PC 2 / Codex or Gemini — secure client portal + OS request contract

**Own:** client account architecture and screen drafts; guest request handshake; secure verified-email account; server-owned personalized quotes; My Bookings; request-to-OS queue/notification contract. Initially **design and test-only** security boundaries; coordinate exact API shapes with lane B before implementing endpoints. Keep staff authentication and current migrations untouched unless separate isolated reviewed PR, migration number claimed.

**First deliverables:** Client A/B/unbound/guest access matrix and D-5 / D-10 denial tests; data contracts for `request_submit`, `request_list`, `quote`, authenticated own-bookings and notifications; clear status states. For guest requests, a protected server endpoint plus contact validation/Turnstile/rate limits—not a permissive anon table grant. Test request never writes inventory reservations; confirm does exactly one.

**Verification:** A never sees B, new unbound account gets zero staff data, guest cannot fetch portal rows, own request and own invoice visible only after proper binding, personalized discount applied on server only, staff notification role scope correct.

**Shared file collision protocol:** Website lane owns `src/booking` public display components; Portal lane owns `src/booking/account` and isolated server-contract docs; Mac lane owns OS P0/release work. Before touching `src/lib/auth.tsx`, `docs/PERMISSIONS.md`, `src/lib/pricingPipeline.ts`, T7 plan files, Supabase migrations or global navigation, name one owner and coordinate. No agent edits another lane's worktree.

## 5. Release sequence and exit criteria

| Window (NPT) | Checkpoint | Does NOT count as done until |
| --- | --- | --- |
| **12–19 Nov** | Approved integrated scope, three isolated tasks, date/time-first public prototype, client authorization and OS release blocker matrix | Draft PR, tests and reproducible evidence linked; no fake available stock |
| **Late Nov–Dec** | Company website, catalogue and portal foundation | Real server data contracts + staging ACL/availability proof; no direct public staff access |
| **January 2027** | Guest/account request and staff approval integration, notifications, pricing, payments where verified | End-to-end staging book/request/confirm/payment correctness, D-5/D-10, duplicate request/reservation tests |
| **1–17 Feb** | Staff dress rehearsal, mobile/iPad/desktop, migration backup/rehearsal, Booqable cutover dry run, restore/rollback rehearsal | Full current-main CI and exact-device physical acceptance, real staff sign-off, provider reconciliation |
| **By 18 Feb 2027** | Coordinated launch / Booqable replacement target | Owner go/no-go, backup and migration acceptance, correct inventory, no P0 security bugs, verified domain routing and rollback |

**Mandatory cross-surface demo:** on a phone, a guest chooses pickup and return date/time, sees genuine *yes/no/unknown* catalogue responses, sends a pending request, staff receive it in OS, approve only after a fresh atomic conflict check, and a verified client sees their own booking/invoice. A second client sees none of it. Show the same journey on iPad and desktop. For payment readiness, separately verify provider callbacks, reconciliation, refunds and audit.

**Go/no-go is not a percentage.** Hold production until all mandatory G1–G10 gates in `PLAN.md` and the website addition are met or the Owner explicitly makes and records a scoped change to launch criteria. Booqable remains active until the replacement is proven and cutover is approved.

## 6. Agent instructions and evidence discipline

- Read `docs/00_READ_FIRST.md`, `CLAUDE.md`, `docs/PERMISSIONS.md`, `docs/PRODUCT_RULES.md`, `docs/AGENT_WORKFLOW.md` and latest rulings.
- Inspect current main and all related PRs before writing; no duplicate tasks. Work in one isolated feature branch and **draft PR** per coherent change. CI using self-hosted runners is a finite resource; coordinate rather than launching duplicate jobs.
- For implementation, run `npm run gates` on the exact branch head; include SHA, environment, passing/failing command, links and still-open acceptance steps. Older green tests do not certify a changed commit.
- No live Supabase mutations, hosted staging provisioning without spend approval, DNS edits, production secrets, payment enablement, Booqable switch-off, merge or deploy. No canceling required main CI.
- This specification and tasks do not dispatch any process onto a computer automatically: the designated Antigravity/Codex/Gemini instance must pick up the GitHub assignment on its machine.

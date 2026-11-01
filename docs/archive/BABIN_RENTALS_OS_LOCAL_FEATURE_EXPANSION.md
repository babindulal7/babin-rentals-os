# Babin Rentals OS — Feature Expansion & Smart Compact Implementation

**Status:** Local engineering implementation brief · 21 October 2026
**Execution target:** The existing **local Babin Rentals OS application source folder** opened in Google Antigravity / VS Code
**Reference material:** Nine Babin Rentals UI concepts and `DESIGN TOKENS SPEC v2_0.md` (inspect these files if present in the local workspace; do not assume screenshots show working features)
**Source of truth:** The actual local working tree, its latest `RULINGS-*.md`, `AGENTS.md`, permissions, engines, tests and schema. Prior GitHub observations are background only; they must not override newer local code.
**Workflow:** **LOCAL-ONLY IMPLEMENTATION. No GitHub access, branch creation, commits, push, pull, PR, merge, deployment or cloud publishing.**
**Safety:** No changes to live Supabase, production databases, remote storage, public URLs or real client records. No production migrations or customer portal publication without separate, explicit authorization.

---

## 0. Local execution contract — read first

This document **replaces** the former “branch + PR first” implementation workflow. All work takes place directly in the user’s **existing local app folder**, with **local checkpoints** instead of PRs.

### Required first steps

1. Open the existing **local** Babin Rentals OS folder. If more than one candidate folder exists, select the workspace that contains the active `package.json`, `src/`, `supabase/`, `AGENTS.md` and latest ruling documents. **Do not clone or fetch GitHub.**
2. Read the local authority chain before editing: `AGENTS.md`, `docs/00_READ_FIRST.md`, `CLAUDE.md`, `docs/PERMISSIONS.md`, latest `RULINGS-*.md` (newest first), `docs/PRODUCT_RULES.md`, relevant feature specs, `src/lib/rbac.ts`, local schema, existing tests and actual screen components. Resolve conflicts under the local project’s declared authority order.
3. Audit current file contents and identify what already exists. **Extend rather than duplicate** routes, modals, engines, reports, forms, or operations workspaces. No feature is “new” merely because it appears in an image.
4. Create a **local-only recovery checkpoint** before each phase: save the original affected file copies or a local patch/backup in a private location outside the shipped app. Do **not** include `.env*`, secrets, production data, `node_modules`, build output, or client records in any transferable archive. Record changed paths, intended behavior, tests and a rollback procedure in a local change log.
5. Verify test data access **before starting any server, script or tests**. Prefer `npm run dev:mock` and checked local/PGlite paths. Do **not** run the ordinary live-connected `npm run dev` or any production-targeted command. Inspect commands like `check:anon` or `check:security` to ensure they have no production target before running.
6. Work **one local phase at a time**. Finish the code, tests, screenshots, QA notes and rollback instructions for each phase before starting the next. Ask for approval only where a genuine commercial, legal, database or security decision is needed; otherwise implement unblocked work.
7. **Never claim completion based on a design, a static mock, a stub, an optimistic client update, or a green build alone.** Clearly mark each item as Implemented / Tested / Needs Decision / Blocked.

### Hard stop rules

- No `git` actions of any kind for this assignment (including creating branches or commits), no GitHub integration and no remote source synchronization.
- No live Supabase write, remote migration, reset, seed, schema patch, RPC change, RLS change or destructive operation. Local migration proposals are allowed as **unapplied local source files** after review; testing them must use an isolated local database.
- No deployment, live customer access, public portal, email/SMS blast, or real payment gateway transaction.
- Do not use production client data in local fixtures. Do not disable permissions or RLS to make a screen appear functional.
- Do not invent confirmed bookings, payments, invoice balances, membership grants, cleaning results, calendar conflicts, signatures, business pricing or activity logs.
- Use existing integer-paisa money calculations, 06:00–06:00 NPT rental day, BS/AD formatting, roles, shared status meanings and audit paths.

### Current design authority and an important layout ruling

The old Design Tokens v2.0 document proposed **dark default, Inter, breakpoints 768/1180, radius 8/6 and On Rent green**. Later app rulings and implementation use **light default, Outfit/Source Sans 3, 768/1280, radius 10/8 and On Rent orange**. Do **not** replace later active tokens from the older document. Gold is reserved for external/sub-rented equipment, not membership status.

The **20 October 2026 local ruling**, if still present and not superseded in the actual workspace, places supplemental right-rail content in the **existing shared InformationDrawer** with a right-header toggle. Keep this single drawer: do **not** recreate a permanently visible duplicate rail. On phones reuse its existing sheet presentation and the booking **Money** segment. Maintain the current 64px unified page header and left FilterDrawer rules.

---

## 1. L1 / P0 — Record Payment in an existing booking’s Quick Actions

**Start here. No database schema change is authorized in L1.**

**Target:** `Rentals → Existing Booking → InformationDrawer / existing Quick Actions → Record Payment`; on phone use the existing **Money** segment. Preserve current app navigation and header action registry.

**Locate and reuse (names are examples; confirm against local source):**

- `src/modules/rentals/BookingDetail.tsx`
- `src/modules/finance/modals/RecordPaymentModal.tsx`
- `src/modules/finance/modals/CreateInvoiceModal.tsx`
- `src/lib/queries/finance.ts` (`listInvoices`, `invoicesForBooking`, payment history reads)
- `src/actions/finance/recordPayment.ts`
- `src/lib/rbac.ts` (`canRecordPayment`, `canIssueInvoice`, money visibility)
- Existing booking/finance regression tests.

**Implementation rules**

1. Show the action **only** if `canRecordPayment(role)` and the applicable money-visibility gate permit it. Money-blind or unauthorized users receive **neither the control nor financial figures in the DOM**.
2. Query invoices **by the current booking UUID** through existing finance queries; offer only that booking’s **non-void** invoices. Resolve the selected invoice by its **invoice ID**, never a booking number or ambiguous display number. Recheck server-side authority at write time.
3. Prefill the chosen invoice’s **server-read outstanding** only. Never prefill rental total, deposit, past paid amount or a guess. If the selected invoice changes, follow the existing modal’s untouched-field behavior; do not overwrite an amount the operator edited.
4. Distinguish **loading**, **read failed**, **known no invoice**, **payable**, and **fully settled**. A read error must offer Retry and never claim the booking has no invoice. A confirmed missing invoice disables payment and offers Create Invoice **only if `canIssueInvoice` permits**.
5. A non-void invoice with zero outstanding is **not payable**. Prevent new submissions against fully paid invoices, while keeping previous successful payment history visible. A cancelled booking with an unpaid invoice follows **the existing sanctioned settlement policy**, not an invented blanket cancellation block. If the policy or action-level enforcement is unclear, mark it `TODO(decision)` and keep the unsafe path disabled.
6. Open **the existing** `RecordPaymentModal`, which must call the current `recordPayment` action. The Quick Action itself must **not** insert a payment or synthesize a receipt.
7. Preserve immutable payments, server-issued payment numbers, receiver attribution, method / bank account / reference / notes and server date as supported. Use the existing idempotency key, in-flight submit guard and existing reversal flow. If receipt upload or another field has no supported schema, label it unavailable rather than fabricating persistence.
8. After success, refetch **both** invoice and payment queries and display the remaining balance **only from the refetched server result**. No optimistic balance subtraction. Uploaded proof is pending verification and **does not equal payment received**.
9. Deposits remain in the **separate liability ledger**, excluded from rental revenue and never netted from invoice outstanding.
10. The same action must be reachable with at least a **44px touch target** on phone, iPad and desktop; no hover-only action.

**L1 acceptance checks**

- Owner / Accounts / all other *actually authorized* roles can see and use the action; Warehouse / money-blind / unauthorized roles cannot see controls or amounts.
- Booking A can never post to Booking B’s invoice even if a stale state or crafted invoice ID is supplied; reject it at the action/data layer as well as UI.
- Partial payment updates after a fresh read, later legitimate partial payments work, and double click/retry never creates duplicate ledger entries.
- Fully paid invoices block further collection. Missing invoice, loading and read failure show **different truthful messages**; Retry works. Cancelled booking follows existing policy.
- Payment proof and deposit are never counted as rental receipts\. Booking history and Finance show the same real rows and balances.
- No schema changes; existing mobile Money segment and shared information drawer remain intact.

**Deliverable:** Local source changes, focused tests, L1 QA/rollback log and four responsive screenshots. Do not start L2 until L1 passes or any remaining blocker is explicitly recorded.

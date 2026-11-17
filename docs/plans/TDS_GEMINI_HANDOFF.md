# Handoff for Gemini — TDS slices S3, S4, S5

**Written:** 17 Nov 2026, end of the Claude session that built S1 and S2.
**Branch to continue from:** `lane-b/tds-ledger-client-deduction` (latest commit `a6eb8736`), worktree `.worktrees/tds-rulings`.
**Read first, in this order:** `CLAUDE.md`, `docs/00_READ_FIRST.md`, `PLAN.md`, `PROGRESS.md` (top entry), `RULINGS-2026-11-17.md`, `docs/plans/TDS_BUILD_CARD.md`.

Your job: build the three slices that are not built yet. Do not touch S1 and S2 except to extend them where noted. Update this file's "State" section and `PROGRESS.md` before you stop.

---

## 1. Hard rules (the ones that bite on this work)

- **N-5:** write, number and test migrations locally. **Never apply one to a live Supabase project.** Babin applies `0228` and `0240` after the backup.
- **Claim the migration number first** in `docs/plans/MIGRATION_LEDGER.md`. The next free number is **0241**. Put the claim in its own commit before writing SQL.
- **Never invent a product decision or a number.** Rates are fixed by the rulings (below). A new fee, rate, threshold or default goes to `docs/OPEN_DECISIONS.md` and `PLAN.md` §4.2, then ask Babin.
- **Law 5 / 4:** nothing is edited or deleted. A correction is a Reversal row.
- **Law 6 / N-1:** TDS amounts are money. Warehouse, Technician, Driver and Client see no money. Do not widen the money-visible set.
- **B-1:** stricter wins. **B-2:** every decision goes to three places in the same commit: `RULINGS-<date>.md`, `PROGRESS.md` (Did / Ruled / Verified), and a `// RULING <date>: <one line>` comment at the code or migration site.
- **Law 8:** every write carries a `client_uuid`; a repeat is a no-op.
- **BS is rendered, never stored.** Store the AD date; render the Nepali month with `src/lib/bs.ts` (`formatBsOrAd`).
- **Pages never implement business logic.** A screen shows a figure the database computed (see `client_tds_status`); it does not calculate TDS.
- **No `console.log`, no raw hex colours, no word "customer" in the UI (they are clients). Errors inline, toasts for success only.**
- **One agent per checkout.** If Claude or Codex is working in the same folder, make your own worktree and branch from this one.
- **A migration is "Verified" only when `npm run check:pglite` AND `npm run check:lifecycle` are green in the same run.**

## 2. The rates (settled, do not change)

| Where | Rate | Base | Source |
|---|---|---|---|
| Client deducts from our rental invoice | 1.5% | `invoices.taxable_amount`, before VAT | R-17.1 |
| Crew payout, freelancer | 15% TDS | the payout amount | R-17.2 |
| Crew payout, staff | 1% **income tax, a separate line, not TDS** | the payout amount | R-17.2a |
| Supplier, services, VAT-registered | 1.5% | amount before VAT | R-17.4 |
| Supplier, services, not VAT-registered | 15% | amount before VAT | R-17.4 |
| Supplier, commission | 15% | amount before VAT | R-17.4 |
| Supplier, equipment or vehicle rental | 1.5% | amount before VAT | R-17.4 |

R-17.5 (settled): staff 1% shows on the **crew timesheet** next to each staff member's pay; the supplier payment type is **required, no default**; ledger columns include supplier or client name, TDS certificate number and Nepali month (rendered).

## 3. State — what already exists (S1 and S2, verified locally)

**Database, `supabase/migrations/0240_tds_ledger_and_client_deduction.sql` (not applied to live):**
- `public.tds_ledger` — append-only (triggers `tds_ledger_no_update` / `tds_ledger_no_delete`). Columns: `entry_type` (`Deduction` | `Reversal`), `direction` (`Client Deducted` | `Supplier Deducted`), `amount`, `rate_percent`, `base_amount`, `invoice_id`, `payment_id`, `party_name`, `certificate_number`, `deducted_on` (AD date), `reverses_id`, `reason`, `client_uuid` (unique), `created_by`. Checks: a Reversal needs a reason of 10+ characters; a Client row needs an invoice; **a Supplier row needs a `party_name`**. RLS read: Owner, Admin, Manager, Accounts. Writes only through definer RPCs.
- `tds_client_credit(invoice_id)` — definer helper that sums Client Deducted rows minus reversals; fails closed for money-blind roles.
- `recompute_invoice_payment_state` and `invoice_paid_net` — now add the TDS credit inside `invoices.paid_amount` (the invoice settles at gross; cash takings stay net).
- `record_client_tds(jsonb)` (Owner, Coordinator, Accounts), `reverse_client_tds(jsonb)` (Owner, Admin, Manager), `client_tds_status(uuid)` (read-only, Owner, Admin, Manager, Coordinator, Accounts). Refusals are `GATE:tds.<code>: sentence`.

**App:**
- `src/actions/finance/recordClientTds.ts` — `RECORD_CLIENT_TDS`, `REVERSE_CLIENT_TDS` (permissions reuse `payment.create` / `payment.reverse`; no rate or amount is ever sent; `events: []` because TDS is not cash; `PGRST202` becomes "not available on this server yet").
- `src/lib/queries/clientTds.ts` — `getClientTdsStatus`.
- `src/modules/finance/modals/ClientTdsModal.tsx` — the screen; opened from `BookingDetail.tsx` Quick Actions.
- `src/lib/__mocks__/tds.ts` + wiring in `src/lib/__mocks__/client.ts` — mock copies of the three functions, kept in step with the SQL.
- Tests: `recordClientTds.test.ts` (35), `clientTds.test.ts`, `tds.test.ts`, `ClientTdsModal.test.tsx`. Lifecycle step `L82` in `scripts/e2e-lifecycle.mjs`.

**Ruled 18 Nov 2026 (R-18.1, Babin: "Once per invoice"):** one client deduction per invoice, not per instalment. This is what is built. Do not change it.

## 4. Work to do

### S3 — Supplier TDS (we deduct from a supplier payment)

Goal: when we pay a supplier, record the TDS we deduct as a liability to deposit, at the ruled rate for the supplier type.

1. Find where supplier payments are recorded today (expenses / sub-rental / supplier flows). Search the code first (`grep -ri "supplier" src/modules src/actions`); do not assume. If there is no supplier payment path, **stop and write a question** in `OPEN_DECISIONS.md` instead of building one.
2. Add a **supplier type** that is **required with no default**: VAT-registered service, non-VAT service, commission, equipment or vehicle rental. The rate comes from the type via a constant in SQL (as `c_rate` is in `record_client_tds`), never from a typed field.
3. New RPC `record_supplier_tds(jsonb)` in migration **0241**: write a `Supplier Deducted` Deduction row with `party_name`, `certificate_number` (optional), rate by type, base before VAT, `deducted_on`. Reuse the ledger; **do not add a table**. Roles: Owner, Accounts only unless the existing supplier-payment rule is narrower (then match it, B-1). Idempotent on `client_uuid`. Reversal: reuse the Reversal pattern (generalise `reverse_client_tds` or add `reverse_supplier_tds`; keep the "one reversal per deduction" unique index working).
4. A screen field on the supplier payment form: type picker (tap cards, no default) and a read-only "TDS we deduct: Rs X" shown from a **status function** like `client_tds_status`. Net cash paid is `amount − TDS`; show both.
5. Mock handlers in `src/lib/__mocks__/tds.ts`, kept in step with the SQL.
6. Tests: action tests like `recordClientTds.test.ts`; a lifecycle step `L83` (check `STEPS` ids first for the next free one) with one assertion **per rate** (1.5 / 15 / 15 / 1.5), the required-type refusal, append-only, reversal, and money-blind refusal.

### S4 — Crew payout TDS and the staff 1% line

1. Find the crew payout / timesheet path: `src/modules/crew/TimesheetTab.tsx`, `src/lib/queries/timesheet.ts`, and the payout action. Crew pay is `asset-finance` money (Coordinator cannot see crew pay).
2. **Freelancers:** 15% TDS on the payout. Write a Supplier-direction-style row? **No — decide the direction with Babin if the ledger direction `Supplier Deducted` does not fit crew.** If it does not fit, add `Crew Deducted` to the `direction` check in 0241 and note it in `RULINGS`. Do not overload an existing direction silently.
3. **Staff:** 1% is a **separate income-tax line on the crew timesheet**, not a ledger TDS row. Show it next to each staff member's pay. Compute it in the database or a shared engine function, not in the page.
4. How a person is classed (freelancer vs staff) must come from existing data. If no such field exists, ask Babin; do not add a default.
5. Tests: unit tests on the calculation, a lifecycle step, and drive the timesheet in the browser (mock mode) to confirm the line renders and money-blind roles see nothing.

### S5 — Accountant TDS report and IRD deposit tracking

1. Report: TDS **credits held** (client-deducted, from invoices) and **deposits due** (supplier and crew, liabilities), by Nepali month, with the 25-day IRD deadline computed from `deducted_on`. Render BS with `formatBsOrAd`; store nothing in BS.
2. **IRD deposit status needs its own append-only table**, because `tds_ledger` cannot be updated (e.g. `tds_deposits`: ledger entry ids, deposited_on, voucher number, `client_uuid`, Reversal rows). Never add a mutable status column to `tds_ledger`.
3. Reports follow the existing report conventions in `src/modules/reports` and the Law 16 report tests; check `src/lib/queries/__tests__/reportQueries.law16.test.ts` for the rules a report must meet.
4. Totals must reconcile: report totals equal the ledger sums (Deduction minus Reversal). Add a check that fails if they differ.

## 5. How to work and verify

```bash
npm ci                                  # only if node_modules is missing (a junction exists in .worktrees)
npx vitest run <file>                   # focused tests
npx tsc --noEmit -p .                   # typecheck (slow, ~100 s)
npm run check:pglite                    # all migrations apply from scratch
npm run check:lifecycle                 # lifecycle steps (L82 is the TDS one)
npm run gates                           # the 17-step local merge gate (~25 min); CI is off
npm run completion                      # the R-29 counts; never type a percentage
node scripts/lint-progress.mjs          # PROGRESS entry must have Completion and Remaining
```

- Tests run with `VITE_DATA_SOURCE=mock` forced in `vitest.config.ts`; a stray `.env.local` pointing at live Supabase will not be used.
- **Drive the app, do not just read code.** Mock mode: `node node_modules/vite/bin/vite.js . --mode mock --port <free port> --strictPort`, sign in with the dev quick-logins (`owner@`, `warehouse@`, `billing@babinrentals.com`, any password). The first load can be blank for ~15 s while Vite re-optimises. Booking `716` (invoice INV-2) has a taxable base of Rs 15,130 and was used to verify S2.
- If the dev server stalls, use `npm run build` then `vite preview` (clear the service worker after rebuilds).
- Mock mode does not emulate the payment triggers (`recompute_invoice_payment_state`); the mock TDS handlers move `paid_amount` / `outstanding_amount` / `status` themselves. The SQL is proven only by `check:lifecycle`.
- Pattern for a new lifecycle step: copy `L82` (`STEPS.push`, `as('Role', ...)`, `refuses(...)`, `assertEq(...)`).

## 6. Pitfalls already hit (do not repeat)

- Rebuilding a function from an older migration loses later changes (the membership change was first built on `0197` and dropped the renewal path of `0198`). **Copy the latest body**, then add your change; check the lifecycle steps that cover it.
- A new definer function must pin `set search_path = public, pg_temp`, `revoke all ... from public, anon`, then `grant execute ... to authenticated`, and **fail closed** for money-blind roles (`coalesce(public.auth_can_view_money(), false)` for reads; the TDS credit helper uses `true` only because the database owner has no session).
- Do not send a rate or an amount from the page to an RPC. The action sends ids, a request key and optional text only.
- Do not claim a number is verified because it typechecks. "Typechecks" and "works" are different claims; log what you actually drove.
- `.claude/launch.json` is git-ignored; a preview launcher may start the main checkout instead of your worktree. Confirm which folder you are serving before you call a change verified.

## 7. Done means (per slice)

1. `check:pglite` and `check:lifecycle` green **in the same run**, with a new lifecycle step per slice.
2. Unit tests for actions, queries and screens; `npm run gates` 17/17.
3. Driven in the app for each role that may and may not use it.
4. Three-place log written (RULINGS, PROGRESS Did/Ruled/Verified, code comment), `MIGRATION_LEDGER.md` row updated, `TDS_BUILD_CARD.md` status updated, `PERMISSIONS.md` edited in the same commit if a capability or gate changed (B-3).
5. `PROGRESS.md` entry ends with `## Completion` (from `npm run completion`) and `## Remaining` with counts, plus one line naming where the next session starts.
6. Commit on your branch. **Do not push or merge; Babin merges.** Do not apply any migration to a live project.

## 8. Questions to put to Babin (do not guess)

1. ~~E5~~ — answered 18 Nov: once per invoice (R-18.1).
2. ~~Crew direction~~ — answered 18 Nov (R-18.2): same `tds_ledger`, new `Crew Deducted` direction.
3. ~~Freelancer vs staff~~ — answered 18 Nov (R-18.3): set per payout, no profile flag.
4. Anything in S3 that has no existing supplier payment path: stop and ask rather than invent a flow.

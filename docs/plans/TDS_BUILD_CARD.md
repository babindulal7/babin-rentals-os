# Build card — TDS (client deductions, supplier deductions, crew payouts)

**Status:** open questions answered (R-17.5); awaiting go-ahead to build. **No code written.** Source rulings: `RULINGS-2026-11-17.md` (R-17.1 to R-17.4), closes O-5.
**Migration:** none claimed yet. Claim the next free number in `docs/plans/MIGRATION_LEDGER.md` before any SQL is written.

## Goal

Record TDS correctly in three places, with the rates Babin ruled and nothing typed by hand:

1. **Client-deducted TDS on rental invoices** (R-17.1): 1.5%, before VAT, rental invoices only. The invoice settles at gross. The deducted amount is a credit in the TDS ledger.
2. **TDS we deduct from supplier payments** (R-17.4): VAT-registered services 1.5%; non-VAT services 15%; commission 15%; equipment or vehicle rental 1.5%; before VAT. The deducted amount is a liability in the TDS ledger.
3. **Crew payouts** (R-17.2): freelancers 15% TDS. Staff 1% is a separate income-tax line, not TDS.

## Rules that constrain the build

- **Law 5:** payments are immutable. A TDS deduction is its own row, never an edit to a payment.
- **Law 6:** TDS amounts are money. Warehouse, Technician, Driver and Client see no money (N-1: do not widen the money-visible set).
- **Rates are fixed.** They come from the rulings, not from a free-typed field. A rate change is a new ruling.
- **N-5:** the migration is written, numbered and tested locally. Babin applies it after the backup.

## Settled before build (R-17.5)

1. **Staff 1% income-tax line** shows on the **crew timesheet**, next to each staff member's pay. It is not part of the TDS ledger.
2. **Supplier payment type is required.** There is no default; the user picks service (VAT-registered or not), commission, or equipment/vehicle rental before saving.
3. **Ledger columns:** direction, amount, rate, base, linked invoice or payment, IRD deposit status, **plus** supplier or client name, TDS certificate number, and Nepali month.

## Proposed slices (after the open items are answered)

| Slice | What | Gate |
|---|---|---|
| S1 | TDS ledger table and append-only write RPC; rate and base as constants from the rulings | `check:pglite` and `check:lifecycle` both green |
| S2 | Client TDS on rental invoice settlement: gross settlement, net cash recorded, credit row written | lifecycle step; Law 5 reversal path tested |
| S3 | Supplier TDS on supplier payments, classified by payment type | lifecycle step per rate |
| S4 | Crew payout TDS (15% freelancers) and staff 1% income-tax line | unit tests on the calculation; crew timesheet check in the browser |
| S5 | TDS report for the accountant (deposits due, credits held) | report check against the ledger |

## Revert

Each slice is additive. Revert a slice by removing its RPC call from the settlement or payout path; no existing payment or invoice row is changed, so no data is lost.

## Done means

Both R-29 gates are green in the same run (`check:pglite` and `check:lifecycle`), the ledger totals match the invoices and payouts, and the rates in code match `RULINGS-2026-11-17.md`.

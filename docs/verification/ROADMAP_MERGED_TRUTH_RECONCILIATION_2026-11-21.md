# Roadmap Merged Truth Reconciliation — 2026-11-21

## Summary

This reconciliation synchronises roadmap card statuses across `docs/plans/T1_RELEASE.md` and `docs/plans/T3_BOOKING_MONEY.md` to match merged code, migrations, and owner rulings on `origin/main` as of commit `48c7f24f` (PR #260).

All reconciled cards have been verified with green tests in `src/lib/__tests__/roadmapStatusTruth.test.ts`.

---

## Reconciled Cards

### Track T1 — Release Infrastructure

1. **`T1-03 · Settle the ledger before anything is applied`**
   - **Status:** Promoted to `done`.
   - **Evidence:** PR #260 merged into `main` (`48c7f24f`).
   - **Verification:**
     - Live ledger snapshot `docs/live/schema_migrations_2026-11-20.txt` reconciled (157 live entries ending with `0225`).
     - 7 historical migration renames settled against live SQL definitions.
     - `0047_seed_reference_corpus.sql` quarantined from live apply.
     - Sequential apply plan generated via `scripts/plan-migrations.mjs` (96 migrations, 0 blockers).
     - Verified by `npm run db:plan:selftest` (12/12 checks passed).

2. **`T1-15 · Switch user with name + PIN`**
   - **Status:** Standardised to `done`.
   - **Evidence:** PR #208 merged on `main`.
   - **Verification:**
     - PIN switch logic and 4-digit PIN requirement verified.
     - Migration 0208 (`staff-pin-four-digits`) applied and verified.
     - Status syntax normalised from markdown bold `**done · merged**` to standard roadmap schema.

---

### Track T3 — Booking & Money

3. **`T3-14 · Draft invoice at Confirm, number on full payment`**
   - **Status:** Promoted to `done`.
   - **Evidence:** PR #259 merged into `main` (`82d6cdbe`).
   - **Verification:**
     - Migration `0254_draft_invoice_resync_integrity_and_settlement_numbering.sql` applied in PGlite (252/252 green).
     - Lifecycle step `L92` green in `scripts/e2e-lifecycle.mjs` (93/93 green).
     - Draft invoice auto-creation at confirm, line/date sync, monotonic `INV-` number auto-minting on full settlement, and F5 immutable guard verified.

4. **`T3-18 · Change a confirmed booking`**
   - **Status:** Standardised to `done`.
   - **Evidence:** PR #224 merged into `main` (`44300a17`).
   - **Verification:**
     - `change_booking(jsonb)` RPC revision-locked and GiST-checked.
     - Lifecycle steps `L82` (a change can never double-book), `L83` (packed unit cannot be silently removed), and `L84` (linked booking carries parent id) verified green in PGlite.
     - Status syntax normalised from `complete` to standard `done`.

5. **`T3-28 · Rental day start as a setting`**
   - **Status:** Standardised to `done`.
   - **Evidence:** PR #211 merged into `main` (`5ca1d538`).
   - **Verification:**
     - Migration `0227` (`bookings.rental_day_start` column + settings table row) verified.
     - Lifecycle steps `L80` (existing booking unchanged after setting moves) and `L81` (new booking uses new start) verified green in PGlite.
     - Status syntax normalised from `complete` to standard `done`.

6. **`T3-29 · Extension clash: the Manager decides`**
   - **Status:** Standardised to `done`.
   - **Evidence:** PR #208 merged into `main` (`c29cb212`).
   - **Verification:**
     - Clashing extension Manager decision workflow and at-risk record creation verified.
     - Lifecycle steps `L76` (clashing extension without manager decision refused) and `L77` (decision b marks next booking at risk) verified green in PGlite.
     - Status syntax normalised from `complete` to standard `done`.

---

## Verification Gates Passed

- `npm run check:pglite`: 252/252 applied, 0 failed.
- `npm run check:lifecycle`: 93/93 green steps (L1–L92).
- `npm run typecheck`: clean (0 errors).
- `npm run lint:ui-copy`: clean (0 errors, 12 test assertions pass).
- `npx vitest run src/lib/__tests__/roadmapStatusTruth.test.ts`: 7/7 tests passed.
- `node scripts/lint-progress.mjs`: PASS.

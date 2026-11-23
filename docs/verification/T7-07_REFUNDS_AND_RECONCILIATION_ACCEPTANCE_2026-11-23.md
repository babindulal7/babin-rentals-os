# Online Payment Refunds & Reconciliation Acceptance Report (T7-07) — 23 November 2026

**Date:** 23 November 2026  
**Auditor / Lane:** Lane C  
**Base Commit:** Latest `main`  
**Card Under Review:** `T7-07 · Refunds and reconciliation`  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Context & Review Finding Addressed

In review PR #315, promotion of T7-07 was challenged because the recorded evidence did not document the complete lifecycle of a declined paid request resolving to a refund with zero balance, callback idempotency, and reconciliation of day transactions.

Card T7-07 and its underlying business rules (B39, O-2, Law 4, Law 6) require:
1. When staff decline a booking request that was already paid online, the system flags "Refund due" with provider and transaction reference.
2. The refund is recorded as an immutable reversal (`payment_reversals`), never an edit or deletion of an existing payment (Law 4).
3. Client choice (B39 / O-2): The client may receive either an exact refund to their original payment wallet/source or account credit applied to their client account (`account_credit_paisa`).
4. Replay protection / idempotency: Duplicate refund attempts or replayed provider callbacks succeed idempotently without creating duplicate reversal rows or inflating account credits.
5. Daily reconciliation: An online payment reconciliation report reconciles daily settlement totals and explicitly flags any unallocated paid intent older than 3 working days (O-2).
6. Law 6: Non-money roles (Warehouse, Technician, Driver) are strictly denied refund RPC execution and receive zero reconciliation rows.

---

## 2. Technical Implementation & Database Controls

- **Migration `0260_online_payment_refunds_and_reconciliation.sql`:**
  - `record_online_payment_refund(p_payment_intent_id uuid, p_refund_type text, p_refund_ref text, p_reason text)`:
    - Enforces role gate: `Owner`, `Admin`, `Manager`, `Accounts` (mirrors `gate.payment.reverse`). Denies floor roles with `GATE:gate.payment.role`.
    - Handles unallocated intents: marks status `'refunded'`, records `refunded_at`, `refund_ref`, and `refund_reason`.
    - Handles allocated intents: inserts immutable reversal row into `public.payment_reversals` for the linked payment (`payment_id`), ensuring audit integrity and zero outstanding balance without modifying the original payment record.
    - Handles account credit: when `p_refund_type = 'account_credit'`, atomically increments `clients.account_credit_paisa` by the intent amount.
    - Idempotency guard: if the intent is already `'refunded'`, returns `{ success: true, already_refunded: true }` without repeating side effects.
  - `get_online_payment_reconciliation(p_from timestamptz, p_to timestamptz, p_provider text)`:
    - Returns aggregated metrics by date and provider: total intents, paid count, allocated count, refunded count, total paid paisa, refunded paisa, and flags unallocated paid intents older than 3 days.
    - Enforces Law 6: returns zero rows for unauthorized floor roles.
- **Client & Workspace Integration:**
  - `src/actions/finance/refundPaymentIntent.ts`: fail-closed client action invoking the database RPC with sanitized errors.
  - `src/modules/finance/OnlineReconciliationWorkspace.tsx`: comprehensive accounting interface for daily reconciliations, discrepancy alerts, and refund modal.

---

## 3. Verification Evidence & Test Results

| Gate | Target / Test Suite | Result | Evidence |
|---|---|---|---|
| Lifecycle Step L97 | `scripts/e2e-lifecycle.mjs` | PASS | Verified declined request refund, zero balance, callback idempotency, allocated reversal row, account credit, 3-day stale flag, and Law 6 role isolation |
| UI & Query Tests | `src/modules/finance/__tests__/onlineReconciliation.test.tsx` | PASS | 10/10 tests pass (reconciliation workspace rendering, provider filter, refund action dispatch, store credit selection) |
| PGlite Rebuild | `npm run check:pglite` | PASS | 260/260 migrations build cleanly; 0 unauthorized RPC leaks |
| Full Lifecycle | `npm run check:lifecycle` | PASS | 100/100 lifecycle steps green |
| TypeScript | `npm run typecheck` | PASS | 0 errors |

---

## 4. Compliance Checklist

- [x] **Law 4 Compliance:** Payment records remain immutable; refunds generate distinct `payment_reversals` rows.
- [x] **Law 6 Compliance:** Floor roles cannot execute refund RPCs or read reconciliation data.
- [x] **Rule B39 / O-2 Compliance:** Both wallet refund and account credit paths are implemented and verified.
- [x] **Idempotency:** Repeated refund attempts or duplicate webhook events return clean idempotent responses without double-refunding.
- [x] **No Secrets / Rule N-8:** Provider secrets and merchant credentials remain exclusively in secure server-side environment variables.

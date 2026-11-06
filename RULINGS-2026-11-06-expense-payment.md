# 6 November 2026 — Expense payment authority

## EP-1 — O-24 answered by Babin

Babin selected **"Owner, Admin, Manager and Accounts"** in answer to:

> To finish daily closing, who may record payment of an approved expense?
> Each option also allows that person to have submitted or approved the expense.

These four roles may record payment of an already approved expense. The payer
may be the submitter or the approver. Coordinator, Warehouse, Technician, Driver
and Client are excluded.

Payment recording does not approve the expense. Existing approval thresholds
and the prohibition on approving one's own submission remain in effect.

### Implementation boundary

This ruling resolves permission intent. It does not claim a working settlement
ledger, enable a status-only Paid write or complete daily closing. T3-07 must
record the real payment account, payment time and actor with an immutable,
idempotent audit/settlement path, enforce roles and approved state in Postgres,
and update the UI role predicate, permission cells and T-1 fixture together.
Legacy Paid expenses require account/date allocation; do not invent those facts.

No tax classification, cancellation fee, expense cancellation permission,
opening-balance permission or live deployment is authorized by this ruling.

**Changed now:** OPEN_DECISIONS O-24, PLAN decision index, PERMISSIONS' pending-
implementation notice, T3-07 card and the existing expense writer's implementation
note. The expense menu now states that payment recording is unavailable.

**Revert:** supersede EP-1 with a later explicit Babin ruling; payment-recording
controls remain unavailable until the settlement implementation is verified.

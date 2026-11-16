# T3-18 repair checkpoint — 16 November 2026

**Status: doing. Do not merge as a completed card.**

Branch: `lane-c/T3-18-change-a-confirmed-booking`, worktree `.worktrees/t3-18-security-repair`. Base feature: `8ec3a3a8`; security/retry checkpoint: `a920e097`; daily pricing and audit-order repair: `be25da5a`. The original checkout and its unrelated edits are preserved.

## Current behavior

- Ordinary daily lines recalculate their stored total from quantity × charged days × rate minus the absolute line discount. Warehouse retains negotiated rates and discounts on the server. Structure/custom snapshots remain protected against changes that would invalidate their pricing.
- Draft resync locks the invoice, retains superseded lines with their original values, and excludes history from current sums, staff reads and issue line counts. Booking-level discount changes follow the booking. Audit events are inserted before booking-discount references.
- Warehouse responses remove money, including generated return-pickup fees embedded in transport instructions. Client-health warnings, labels, tooltips, picker rows, quick views and new-client results now mask financial/free-text account details. Operational KYC/equipment reasons remain visible. Pickup-price labels are hidden for money-blind roles.
- Audit identity is the authenticated user. Saved requests replay once without duplicate writes, including after concurrent mock retries; a role downgrade cannot expose an old financial response. Mock saves and their receipt persist together and roll back on a later-row failure.
- Packed identity/quantity/removal changes require unpacking first; quantity holds rebuild atomically. A non-void numbered invoice blocks new booking changes under T3-14/O-14.

## Verification

Current-source `npm run gates`: **PASS, all 17 steps**. Both mock and coverage suites pass 6,963/6,963 tests in 589 files. Source fingerprints match. Log: `artifacts/t3-18-health-gates.log`.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:local-api-guards` | PASS |
| `npm test` | PASS, 6,963 tests |
| `npm run check:pglite` | PASS, 229 migrations |
| `node scripts/test-booking-financial-integrity.mjs` | PASS |
| `npm run check:security` | PASS |
| `npm run check:lifecycle` | PASS, 77/77 |
| `npm run test:server-contracts` | PASS |
| `npm run test:partial-return` | PASS |
| `npm run lint:progress` | PASS |
| `node --test scripts/test-receipt.test.mjs` | PASS |
| `npm run lint:shell` | PASS |
| `npm run lint:ui-copy` | PASS |
| `npm run check:contrast` | PASS, theme tokens; screen finding below remains |
| `npm run build` | PASS |
| `npm run test:coverage` | PASS, 6,963 tests |

- `be25da5a`: lifecycle 77/77 PASS. L77 covers exact paisa, discounts, repeated edits/retries, Warehouse masking, capacity rollback, immutable history, finance RLS and issuing the current amount. The prior full attempt stopped on the audit-reference ordering defect; this commit fixes it.
- Privacy regression first reproduced the money leak, then 45 focused tests in three files passed after the repair.
- Browser: isolated `dev:mock` from this worktree at `127.0.0.1:3018`, Warehouse at 375/820/1440. Warning, picker and quick-view figures are masked. Temporary viewport overrides were reset. An ignored local Vite config allows this worktree to load fonts from the existing parent node_modules.
- **Full screen check NOT PASSED:** the active Client & dates tab has poor contrast; confirmed-booking edit mode uses Draft/confirmation wording. Coordinator browser acceptance remains pending: the mock corpus has only Owner, Warehouse and Accounts users. Five-state, staging and physical-device acceptance remain incomplete.
- Previous checkpoint `a920e097` passed all 17 gates with 6,955 tests, 229 migrations and 76 lifecycle steps. Those results are historical after the current source edits.

Migration **0232 is locally VERIFIED (PGlite and lifecycle green together), NOT APPLIED or PRODUCTION-VERIFIED.** PGlite does not certify hosted JWT, PostgREST, Storage or real devices. The mock does not emulate database reservation and invoice engines.

The required dependency audit reports **37 findings: 4 critical, 13 high, 17 moderate, 3 low**. Local artifact: `artifacts/t3-18-dependency-audit.json`. No dependency or lockfile changes; remediation is separate lane A work.

## Remaining before this card can close

1. Obtain independent review of the locally verified source; the full gates are green.
2. Complete structure/custom repricing using sufficient stored pricing terms. Ordinary daily repricing is implemented; structure/custom edits remain refused.
3. Complete server-validated Warehouse bundle/component additions. The current restriction is unfinished implementation, not a new product policy. Warehouse crew/delivery changes explicitly refuse unsupported edits.
4. Repair the remaining edit-form contracts: `fuelChargePaisa` versus RPC `fuel_charge`, and a submitted `client_id` that the RPC currently preserves. No complete-save claim until unsupported changes are preserved/refused or implemented.
5. Repair the observed edit-mode wording/tab contrast, complete Coordinator and five-state checks, then staging on two devices. Accountant answers O-14/O-17 and T3-28 design review/dependencies remain outstanding.
6. Babin's local merge and later migration application after the required backup/rehearsal.

Shared implementation files `money.ts`, `pricingPipeline.ts`, `rbac.ts` and `actions/core.ts` are unchanged by these repairs. There is no production database action or remote push.

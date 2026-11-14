# T3-18 repair checkpoint — 15 November 2026

**Status: in progress. Do not merge as a completed card.**

Branch: `lane-c/T3-18-change-a-confirmed-booking`, continuing base commit `8ec3a3a8` in `.worktrees/t3-18-security-repair`. The original checkout and its unrelated edits were preserved.

## What changed

- The booking editor removes money fields from Warehouse responses and rejects financial input from that role. Generated return-pickup fees are also removed from the transport instruction text, keeping operational instructions.
- Audit identity is the authenticated user; callers cannot impersonate another user. A retry after a role change cannot expose an earlier money-visible response.
- Packed line removal, quantity and identity changes are refused until the floor work is reversed. Quantity holds are released and rebuilt transactionally when their line changes.
- A non-void numbered invoice blocks new booking changes, as required by T3-14/O-14. Successful old requests still replay their receipt without another write.
- Stored line totals cannot be separated from their quantity, duration, item identity, rate, discount or service basis. These edits are refused while the required repricing path is incomplete.
- The mock persists booking changes and their retry receipt together in one overlay write. Simultaneous retries return the same result. A forced later-row failure restores the original store and writes no partial overlay.
- The card status is corrected to `doing`; the migration ledger distinguishes local verification from application and acceptance.

## Verification

The current-source `npm run gates` passed all 17 steps:

| Check | Result |
|---|---|
| Typecheck, lint, local API safety guards | PASS |
| Mock test suite | 6,955 tests in 589 files, PASS |
| PGlite rebuild | 229 migrations, PASS |
| Financial integrity and authenticated security regressions | PASS |
| Booking lifecycle | 76/76, PASS; L73 covers generated transport-fee redaction, L75 numbered invoices, L76 stored rate/discount guards |
| Server contracts and partial Return | PASS |
| Progress, receipt, shell, UI copy and contrast checks | PASS |
| Production build | PASS |
| Coverage run | 6,955 tests in 589 files, PASS |

The focused mock suite first reproduced the retry race, missing invoice/rate guards and embedded-fee exposure. Its eight cases now pass; the booking-change action suite contributes ten further passing cases.

Migration **0232 is locally VERIFIED, NOT APPLIED or PRODUCTION-VERIFIED**. Local PGlite checks do not certify hosted JWT, PostgREST, Storage or actual devices. Mock saves do not emulate the database reservation or invoice engines.

The required dependency audit reported **37 findings: 4 critical, 13 high, 17 moderate, 3 low**. The report is in the ignored local artifact `artifacts/t3-18-dependency-audit.json`. This card changes no dependency or lockfile; remediation is separate lane A dependency work.

## Remaining before this card can close

1. Implement and verify the supported repricing path so ordinary stored-price item/date changes work, rather than merely refusing stale totals.
2. Complete server-validated bundle/component additions for Warehouse. The current restriction is an unfinished implementation, not a new product policy. Warehouse crew/delivery edits currently produce an explicit refusal.
3. Review the edit form's remaining field contracts: it sends `fuelChargePaisa` while the RPC reads `fuel_charge`, and sends `client_id` while the RPC preserves the original client. These existing mismatches need explicit preservation/refusal or supported writes before the form can claim a complete save.
4. Complete the screen check at 375/820/1440 as Coordinator and Warehouse, then staging acceptance with two devices. Browser access was reported unavailable in the 14 November check; no screen or physical-device acceptance has been performed for this checkpoint.
5. Obtain independent review and Babin's local merge. T3-14 accountant answers O-14/O-17 and T3-28's design review/dependencies remain separate outstanding requirements.

Shared implementation files such as `src/lib/money.ts`, `src/lib/pricingPipeline.ts`, `src/lib/rbac.ts` and `src/actions/core.ts` are unchanged by this repair. There is no production database action or remote push in this checkpoint.

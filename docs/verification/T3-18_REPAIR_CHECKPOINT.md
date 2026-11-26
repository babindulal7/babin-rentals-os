# T3-18 repair checkpoint — 16 November 2026

**Status: doing. Do not merge as a completed card.**

17 Nov follow-up: the Warehouse mock successfully saved a real catalogue bundle on synthetic booking 918 after the editor stopped offering sample bundles and the mock view was connected to the catalogue. Focused tests, typecheck and lint passed. Booking Detail still counts the bundle header as a component and physical item; full current-source gates, screen checks and staging remain open.

Branch: `lane-c/T3-18-change-a-confirmed-booking`, worktree `.worktrees/t3-18-security-repair`. Base feature: `8ec3a3a8`; security/retry checkpoint: `a920e097`; daily pricing and audit-order repair: `be25da5a`. The original checkout and its unrelated edits are preserved.

## Current behavior

- Desk review for custom prices is under development. The 17 Nov decision requires review on any item or date change; removals require confirmation of a zero total. Current local lifecycle is 79/79, focused tests 28/28; screen acceptance and full gates remain open.
- Ordinary daily lines recalculate their stored total from quantity × charged days × rate minus the absolute line discount. Warehouse retains negotiated rates and discounts on the server. Structure/custom snapshots remain protected against changes that would invalidate their pricing.
- Draft resync locks the invoice, retains superseded lines with their original values, and excludes history from current sums, staff reads and issue line counts. Booking-level discount changes follow the booking. Audit events are inserted before booking-discount references.
- Warehouse responses remove money, including generated return-pickup fees embedded in transport instructions. Client-health warnings, labels, tooltips, picker rows, quick views and new-client results now mask financial/free-text account details. Operational KYC/equipment reasons remain visible. Pickup-price labels are hidden for money-blind roles.
- Audit identity is the authenticated user. Saved requests replay once without duplicate writes, including after concurrent mock retries; a role downgrade cannot expose an old financial response. Mock saves and their receipt persist together and roll back on a later-row failure.
- Packed identity/quantity/removal changes require unpacking first; quantity holds rebuild atomically. A non-void numbered invoice blocks new booking changes under T3-14/O-14.

## Verification

The 17 Nov Warehouse mock screen exposed date-preset prices after adding a bundle. The display is now gated and was rechecked in mock mode; the sample save was blocked by its numbered invoice. Full current-source gates and a successful Warehouse screen save remain pending.

Historical baseline `npm run gates`: **PASS, all 17 steps at be25da5a**; later changes have not passed the full suite. Both mock and coverage suites pass 6,963/6,963 tests in 589 files. Source fingerprints match. Log: `artifacts/t3-18-health-gates.log`.

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

Migration **0232 passed the local PGlite rebuild and 80-step lifecycle for this source, NOT APPLIED or PRODUCTION-VERIFIED.** PGlite does not certify hosted JWT, PostgREST, Storage or real devices. The mock does not emulate database reservation and invoice engines.

The required dependency audit reports **37 findings: 4 critical, 13 high, 17 moderate, 3 low**. Local artifact: `artifacts/t3-18-dependency-audit.json`. No dependency or lockfile changes; remediation is separate lane A work.

## Remaining before this card can close

1. Complete current-source verification and obtain independent review; historical full gates do not certify later changes.
2. User decisions: older custom-priced bookings missing original rules require desk review and a new price; on 17 Nov, this was clarified to cover any item or date change. Complete screen acceptance, review and full verification of this local workflow. Complete structure/custom repricing using sufficient stored pricing terms.
3. Warehouse bundle additions now validate active catalogue components, quantities and required items in the database; existing component changes are checked as well. Local lifecycle L80 covers price masking, forgery, retries and invoice pricing. Complete full gates, screen checks and independent review. Warehouse crew/delivery changes explicitly refuse unsupported edits.
4. Fuel charges now save through the correct RPC field; unsupported client reassignment is explicitly refused. Complete any authorized client reassignment workflow when linked invoice handling is available.
5. Edit-mode wording and tab contrast were repaired and Warehouse widths checked. Complete Coordinator and five-state checks, then staging on two devices. Accountant answers O-14/O-17 and T3-28 design review/dependencies remain outstanding.
6. Babin's local merge and later migration application after the required backup/rehearsal.

Shared implementation files `money.ts`, `pricingPipeline.ts`, `rbac.ts` and `actions/core.ts` are unchanged by these repairs. There is no production database action or remote push.

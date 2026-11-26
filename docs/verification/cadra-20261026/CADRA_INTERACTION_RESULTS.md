# Cadra interaction and gate results

Status: **Browser, build and local database/security checks PASS; full suite remains NOT PASSING (5,827/5,829, two timeouts).** Updated 29 October 2026.

Branch: `codex/cadra-responsive-ui-20261026`. Frozen source: `447632cb610f8860ffbaf25ddb684a8a3e147c24df2b4cf94079189c863700d1`. See the [visual matrix](CADRA_BEFORE_AFTER_VISUAL_MATRIX.md), [requirement evidence map](CADRA_REQUIREMENT_EVIDENCE.md), [accepted ruling](../../../RULINGS-2026-10-26.md) and [remaining boundaries](CADRA_REMAINING_GAPS.md).

## Browser interactions

The [driver](browser-interactions.mjs) and [receipt](../../../artifacts/cadra/interactions/results.json) record **23 named checks, zero errors and sourceChanged=false** on the fingerprint above. It uses isolated seeded mock data and blocks nonlocal requests. Existing booking/product identities are discovered from actual seeded records. No custody transition, hosted write, external invitation or production signature is submitted.

| Check | Executed assertion | Result |
|---|---|---|
| Operations 1440×900 light/dark | Actual Return & Inspection dialog; one footer; four stage controls ≥44×44px; one confirmation ≥56px and in viewport; one Tab remains in dialog; Escape dismisses | PASS, 2 checks |
| Operations 820×1180 light/dark | Same assertions at tablet width | PASS, 2 checks |
| Operations 375×812 light/dark | Same assertions at phone width | PASS, 2 checks |
| Operations 320×844 light/dark | Same assertions at narrow phone width | PASS, 2 checks |
| Phone Today switch | Returns replaces Pickups; Return controls stay contained and ≥56px; switching back restores Pickup actions | PASS |
| Phone navigation | One bottom bar, no dock; More/Scan open and dismiss; expanded More uses a contrasting paired surface | PASS |
| Classic comparison | Same Today route; development classic comparison has no dock and default desktop has one | PASS |
| Today modes, 1440px | Loaded board in high contrast, dark glass, light glass and system-dark; correct resolved mode/style; one header/navigation; no width overflow; actual selected-navigation contrast ≥4.5:1 | PASS, 4 checks |
| Today modes, 375px | Same assertions with loaded board at phone width | PASS, 4 checks |
| Forced colors / reduced motion | Active navigation has computed solid 2px outline; forced-colors media active; a probe requesting animation/transition computes animation:none and transition:0s under reduced motion | PASS |
| Unit editor | Existing unit's shelf draft survives 375→820→320→375px; saved value reads back on reopening; original value restored; custody status read-only | PASS |
| Calendar resources | Unavailable warehouse-bay scheduling source is named; desktop empty state and phone resource agenda remain honest | PASS |
| Amendment PDF | Drawn mark and Nepali signer produce retained QA PDF; overlong signer details refuse before upload | PASS |

The actual selected-navigation contrast is **13.713:1** in high contrast, **9.367:1** in dark glass/system-dark and **14.629:1** in light glass at both widths. The selected phone destination is visibly readable in the [current high-contrast image](../../../artifacts/cadra/interactions/today-high-contrast-447632cb.webp).

The [current QA PDF](../../../artifacts/cadra/interactions/sample-schedule-amendment.pdf) was rasterized with Poppler and visually inspected in [this fresh preview](../../../artifacts/cadra/interactions/sample-schedule-amendment-447632cb.png). Nepali text, drawn mark, dates and original-document provenance fit the A4 page. This is a QA artifact, not a signed production agreement.

One Tab-step containment assertion is not an exhaustive focus-loop or assistive-technology audit. Scanner opening does not establish camera permission, physical decoding or a receipt write. The motion probe verifies the shipped suppression rule for that probe; it is not a survey of every animated element.

## Verification history

30 October continuation: the unchanged-source Finance-only diagnostic passed in 23.9 seconds with the existing 60-second limit. A fresh full coverage attempt then passed the Inventory toolbar file (8/8) and Tier 1 file (14/14), including Finance in 11.9 seconds. The complete run is still pending; these focused results do not replace the earlier failed full-suite receipt. Evidence: `artifacts/cadra/finance-only-diagnostic.json` and `artifacts/cadra/continuation-full-coverage.log`. Typecheck passed before this attempt. The seeded worktree preview was restarted and returned HTTP 200 on port 3300.

The earlier complete coverage run passed 5,828/5,828 on `a008a257…`; subsequent changes mean that receipt is historical. Interrupted runs are not promoted to success. A later full attempt exposed a fixed-40ms test wait around asynchronous focus; the focused RecordForm suite passed 31/31 after waiting for the actual focus outcome. The navigation background correction passed 44/44 focused shell tests.

The pre-correction [matrix](../../../artifacts/cadra/pre-navigation-contrast-seeded/results.json) and [interaction receipt](../../../artifacts/cadra/pre-navigation-contrast-interactions/results.json) are retained separately. Current browser evidence above was rerun after the actual navigation change and identifies the frozen current source.

The persistent local checker is [final-local-verification.ps1](../../../artifacts/cadra/final-local-verification.ps1). The fresh full coverage receipt `b383851a-4827-42b4-b139-e8929b63239a` is valid, unchanged-source and **unsuccessful**: 5,827/5,829 passed, two failed, zero skipped, in 473 files. The two failures are the Inventory header-search case in `listPageToolbars.render.test.tsx` and Finance directory case in `tier1-features.test.tsx`; both reached their timeout. [Full structured report](../../../artifacts/test-run-05407ea7-252b-45f3-a53d-db614d6fc40d.json), [failed full-suite state](../../../artifacts/cadra/verification-coverage-state.json). A later focused pass cannot replace this failed full-suite result.

All independent remaining gates passed. The [isolated retry](../../../artifacts/cadra/timeout-files-retry.json) passed 21/22: Inventory header-search passed, while Finance again timed out at 60 seconds. This does not replace the failed full-suite receipt. Finance test/import timing and a successful full-suite rerun remain open.

## Current-source gates

Repository order: completed typecheck → full test → PGlite + lifecycle → build. The persistent runner retains the completed typecheck/lint on the same unchanged fingerprint and runs the remaining checks sequentially. No browser screenshot substitutes for these gates.

| Gate | Current result | Evidence |
|---|---|---|
| Typecheck | PASS on unchanged current source | [Log](../../../artifacts/cadra/final-typecheck.log) |
| ESLint | PASS on unchanged current source | [Log](../../../artifacts/cadra/final-lint.log) |
| Full coverage suite | NOT PASSING — 5,827/5,829, 2 timeouts, 0 skipped | [Log](../../../artifacts/cadra/verified-test-coverage.log), receipt `b383851a-4827-42b4-b139-e8929b63239a`, unchanged source |
| PGlite rebuild | PASS — 177/177; no anonymous view/RPC leak or unpinned definer | [Log](../../../artifacts/cadra/final-pglite.log) |
| Lifecycle | PASS — 33/33 | [Log](../../../artifacts/cadra/final-lifecycle.log) |
| Financial integrity / security | PASS | [Financial](../../../artifacts/cadra/final-financial.log), [security](../../../artifacts/cadra/final-security.log) |
| Server / partial-return contracts | PASS | [Server](../../../artifacts/cadra/final-server-contracts.log), [partial Return](../../../artifacts/cadra/final-partial-return.log) |
| Unit / Calendar / agreement contracts | PASS — 35 assertions / 20 groups / 24 groups | [Units](../../../artifacts/cadra/final-unit-contracts.log), [Calendar](../../../artifacts/cadra/final-calendar-contracts.log), [agreements](../../../artifacts/cadra/final-agreement-contract.log) |
| Receipt integrity | PASS — 11/11 using workspace temporary files; initial container-temp error retained | [Log](../../../artifacts/cadra/final-receipts.log), [initial permission error](../../../artifacts/cadra/receipt-container-temp-error.log) |
| Shell / UI-copy lint | PASS — 801 files and all copy checks | [Shell](../../../artifacts/cadra/final-shell-lint.log), [copy](../../../artifacts/cadra/final-ui-copy.log) |
| Contrast checker | PASS — 97/97 | [Log](../../../artifacts/cadra/final-contrast.log); browser selected-navigation contrast passed separately above |
| Build | PASS — production bundle and PWA, 267 precache entries | [Log](../../../artifacts/cadra/final-build.log) |
| Completion counter | Generated; full suite and coverage remain NOT PASSING | [Generated output](../../../artifacts/cadra/final-completion.log); copied into PROGRESS.md without changing its percentages |
| Progress lint / diff whitespace | PASS | Generated Completion block inserted; Git reports no whitespace errors |

Migrations 0178–0180 are **WRITTEN + VERIFIED locally** by matching successful current-source PGlite/lifecycle receipts. They are **NOT APPLIED or PRODUCTION-VERIFIED**. No hosted migration is performed. The two full-suite timeouts remain a separate acceptance failure.

## Acceptance boundaries

Unit/browser persistence uses the local mock store; actual SQL permission, revision, retry and readback behavior needs the named local contracts. Calendar contracts must establish exact intervals, authorization, conflict/stale refusal and unchanged financial/custody values. Agreement contracts must establish proposal scoping, retained originals, immutable artifacts and atomic commit. Staff attestation/content provenance does not cryptographically authenticate a signer.

The Owner matrix is not role/payload evidence; the requirement map names the separate DOM, requested-column and actual local SQL payload tests. Selected token checks and Today theme smoke do not certify every rendered pixel or every route in every mode.

Physical phone/tablet touch, stylus, rotation, virtual keyboard, camera/scanner, hosted Auth/PostgREST/private Storage, offline/reconnect, native zoom and screen-reader acceptance remain independent. The cases detail route is a missing-record probe because the seeded corpus has no cases.

Rollback follows the accepted ruling: restore classic shell/prior imports or disable entry points, while retaining business audits, proposals, artifacts and agreement history. No push, merge, deployment or hosted schema reversal is authorized by this report.

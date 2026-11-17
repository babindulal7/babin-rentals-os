# Usability, accessibility, testing and handoff matrix

**Authority:** ../USABILITY_TESTS.md for every screen, and the local gates in ../plans/README.md. This document adds UX-focused acceptance cases. It does not replace the repository's existing device day, staff interview protocol, security tests or PROGRESS evidence rules.

## Six-step design delivery gate

| Step | Evidence required before moving on |
| --- | --- |
| 1 Role/scope | Named actor, permitted action, business intent, actual test booking, non-goals |
| 2 Flow/IA | Entry → commit → persisted result, failure/partial/offline/forbidden branches |
| 3 Wireframe | 375/820/1440 layout, glance test, tap budget, primary action ownership |
| 4 Design system | Existing token/component used, labels/contrast/44/56, focus/IME |
| 5 Prototype | Real React path and live-data facade/mocks, not a static success animation |
| 6 Validate/handoff | Test fixtures, actual action/persistence/reload, role/device proof, PR/diff/revert |

## Required screen state matrix

For changed routes test:
- **Loading** while read pending; never show a false zero.
- **Empty** with valid completed read; **filtered-empty** separately.
- **Read error** with actionable Retry.
- **Populated** with truthfully sourced values.
- **Stale/offline** showing age/limitations.
- **Restricted** absent unauthorized controls/money.
- **Dirty/unsaved** retaining drafts on navigation, status loss, retry.
- **Submitting** single action/disabled duplicate while busy.
- **Server success** followed by re-read/persisted evidence.
- **Server refusal/conflict** inline explanation and recovery.
- **Status variants**: all six canonical statuses, cancellation, overdue flag, partial Return, damaged/missing and QC state as relevant.

## Device & accessibility matrix

Baseline: phone 375×812, tablet 820×1180, desktop 1440×900 in mock as defined by ../USABILITY_TESTS.md. Supplement 390, 768, 1024, 1280 and 320 robustness; light/dark, 100%/125% zoom, portrait/landscape and physical iPhone/iPad/scanner. Record which evidence is emulated and which is device-tested.

Controls ≥44px, primary floor confirmation ≥56px. Keyboard Tab/Shift+Tab, Enter/Space, Escape, cmd+K where installed, scanner focus, aria-label/name, tooltip without hover, reduced motion, high contrast, Nepali IME, not-clipped overlays, 0 unexpected horizontal document scroll.

## Core edge-case scenario bank

| Case | Expected safe result |
| --- | --- |
| Two staff confirm last unit simultaneously | Database permits only valid reservation; other operator sees named collision |
| Draft open 5 days, one-day booking inserted | Draft stays unreserved; new confirm rechecks current holds |
| Packing missing camera plate | Named item blocker and correction; no silent packed completion |
| Wrong barcode scanned twice | No duplicate unit credit; focus remains scanner-ready |
| Handover ID/authorization fails | Server-enforced refusal/approved audited alternative only |
| Handover money-blind role | No financial numbers in DOM/network payload/UI summary |
| Return unit A, unit B still out | Booking stays On Rent, A and B remain correctly separate |
| Returned camera requires reset | Not presented as immediately dispatch-ready; future eligibility follows current policy |
| Damage found at return | Evidence/Case follows actual gate; no direct Available flag |
| Close invoice unsettled or deposit held | Server refuses, all authorized blockers shown inline |
| Offline return/confirm/close | No pretend successful custody/financial state |
| Stale two-tab edit | Conflict; draft retained; Reload current record |
| Unit urgent for next booking | Needed-next sort references actual reservation and time, not fabricated countdown |
| Client changes language mid-search | Nepali IME text not lost or shortcut-triggered |
| Disconnected evidence upload | Failure shown; no photo-complete badge |
| Reduced-vision/touch | Status readable without color; targets meet sizes |

## Test levels (do not confuse)

1. **Static/source audit:** required authority and actual wiring; no completion claim.
2. **Unit/components:** Vitest logic, ARIA, role and state control.
3. **Mock interactive browser:** viewport and keyboard, no claim of backend correctness.
4. **Local PGlite + lifecycle/security gates:** validates current migration code in local Postgres, not production deployment.
5. **Staging**: JWT/PostgREST/Storage/RLS with isolated accounts and real persisted records.
6. **Physical devices and 3-person staff session:** phone/iPad scanner, offline, real touch and daylight.
7. **Production verification** only after owner-approved release; maintain HOLD until actual evidence.

## Recommended commands (existing repo)

- npm run typecheck
- npm run lint
- npm test
- npm run check:pglite
- npm run check:security
- npm run check:lifecycle
- npm run test:server-contracts
- npm run test:partial-return
- npm run check:contrast
- npm run lint:shell
- npm run lint:ui-copy
- npm run build
- npm run gates (comprehensive wrapper where appropriate)

Run exactly the required, current sequence from docs/plans/README.md after actual source edits. Documentation changes do not prove runtime behaviour, and a docs-only change is not exempt from the local checks; link and file audits are not a substitute. GitHub CI availability is not assumed; repo governance currently requires local checks.

## Handoff record

PR / source SHA / test source SHA / executed command and exit code / exact role / exact viewport or device / mock-vs-staging-vs-live / screenshots / before-after taps / persisted result / unresolved blocker / revert steps. Never write a completion percentage without npm run completion and current evidence.

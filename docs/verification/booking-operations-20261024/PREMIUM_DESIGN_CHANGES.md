# Booking Operations — local implementation record

24 October 2026 · Local source and mock-browser evidence only

The responsive Operations frame and accessible entry menu are implemented. **The complete Return-availability requirement is not delivered:** a partial Return still retains the original database reservation. No migration, hosted write, push, branch or commit was performed by this implementation agent.

## Before and after inventory

| Layer | Before | Local result |
|---|---|---|
| Operations entry | Manually positioned menu with document pointer/Escape listeners | Base UI Menu on larger screens; existing COSS Drawer on phones; inline refusal reasons and missing-status refusal |
| Header integration | Contextual popup trigger could be placed inside More | A persistent contextual launcher stays in the existing secondary slot; phone floor entry is consolidated into Operations |
| Frame | Conflicting stage CSS and duplicate booking/client strip | Contained, expandable desktop overlay; tall tablet/phone workspace; one collapsible booking-details region |
| Stage reconciliation | Completion could paint an assumed next status | Persisted floor stage controls progression; partial Return stays On Rent; failed/absent/invalid reads block confirmation and offer retry |
| Cleanup completion | Reset could look complete from booking stage | Paged, money-safe task reads count actual cleaning/QC/reset facts; empty or unreadable data never means Done |
| Save and navigation | Rapid submit and external booking-switch risks | Synchronous submit lock; dirty close/stage/booking guards; busy host guards; late reads cannot populate another booking |
| Dock resize | Narrowing could unmount pending local work | A dirty/busy dock keeps its existing workspace mounted as a focused inline surface; new narrow-screen jobs use the modal |
| Availability | Open cleanup task could veto otherwise usable gear | Pending tasks alone do not veto; actual condition, damage/QC/repair/missing facts and live reservations remain exclusions |

## Files and preserved behavior

- `src/modules/operations/OperationsShell.tsx`, `operationsShell.css`: frame, stage state, measured content width, server readback/retry, single footer and toast clearance. Existing embedded workspaces and dispatch callbacks remain the write owners.
- `src/modules/operations/OperationsWorkspaceContext.tsx`: canonical provider guards booking switches and external close; no second operations context.
- `src/modules/operations/OperationsQueues.tsx`: preserves the queue dock and guards busy booking changes/dirty resize.
- `src/modules/rentals/BookingOperationsMenu.tsx`, `booking-operations-menu.css`: themed COSS/Base UI composition, existing RBAC/status gates, exact booking/stage dispatch, focus handoff after menu closure.
- `src/modules/rentals/BookingDetail.tsx`, `src/components/ui/PageActions.tsx`, `src/components/shell/Header.tsx`: persistent launcher in the existing header row; other header slots retain their order.
- `src/components/ui/Modal.tsx`: optional scoped presentation slots and focus restoration when a provider immediately unmounts a dialog. Existing portal, focus trap, Escape stack, scroll locks and nested-modal machinery are retained.
- `src/lib/queries/operationTaskFacts.ts`: paged task facts with source/timestamp checks. No money columns and no writes.
- `src/lib/availability.ts`, `src/lib/queries/availability.ts`: genuine condition/safety exclusions and complete source reads. Existing serial/quantity reservation readers are retained; no reservation is hidden or released by a query.
- `src/actions/rentals/floorVerb.ts`: Return receipt/session/movement/queue writes explicitly refuse queued success through the existing helpers. Pack, Handover, Reset and separate scan/note queuing retain their previous options. No new Return write path or schema change.
- `src/modules/rentals/ReturnWorkspace.tsx`: truthful Return-session label/toast; existing validation, payloads, inspection, evidence and signatures are retained.
- `src/modules/rentals/PackingWorkspace.tsx`: valid block markup around the existing rental preview; no engine change.
- Focused tests cover shell/host/menu, cleanup facts, availability source completeness, offline Return refusal, fixed header slots and modal parity.

## CSS and token decisions

Removed overlapping phone two/four-column stage rules, the extra sub-359px breakpoint, tiny ellipsized stage states, repeated 64px rules and shell-specific `!important` footer/padding overrides. The navigator now has one rule per canonical width band. Stage names remain fully accessible; compact visible labels are Pack, Hand, Return and Reset.

All paint uses the existing theme variables. The all-Outfit owner preference, palette, fonts, sidebar, default theme and dependency versions were preserved. No global COSS preset was installed. Justified local geometry: proposed desktop maximum 1320px, height `min(94dvh, 920px)`, 12px frame inset, 64px stage controls, 44px menu controls and 56px confirmation. Stronger elevation remains on the real floating overlay.

## Evidence boundaries

`before/` is a real Chromium rendering of the saved pre-edit files in `before-source/`, against the same existing local mock corpus; it is not a production screenshot or a historical GitHub rendering. `after/` records the subsequent local implementation. New `current-*` proof directories, when present, identify the exact contemporary source hashes. Older green logs do not certify a newer checkout.

The shared checkout changed through external commits/checkouts during work. `d72792cd` temporarily contained Quick Operations v1.2; replacement `3420fd86` has the v1.1 single trigger. Neither version was restored over the other by this pass. Unrelated record/stock/membership changes and staged dependency files were preserved.

References used: [COSS Menu/Drawer particles](https://coss.com/ui/particles?tags=menu), [COSS Dialog](https://coss.com/ui/docs/components/dialog), and the installed Base UI 1.9 declarations. The main workspace retains the existing Modal rather than claiming untested dialog migration parity.

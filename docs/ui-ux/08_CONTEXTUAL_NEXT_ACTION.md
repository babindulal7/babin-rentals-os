# Contextual Next Action — integration plan, not a new engine

## Objective

Show the **next real permitted action** and any genuine blockers directly beside the current rental context. Preserve the existing PageHeader primary verb or OperationsShell completion button. **Do not add a second filled CTA in a banner, rail, modal or card.**

## Existing owners and sources

- src/lib/rentalActions.ts: getRentalPrimaryAction, normalizeBookingStatus, jobToRoutePath — **canonical resolver** for booking-level next verb.
- src/modules/rentals/BookingDetail.tsx: current PageHeader primary action and handlers for confirm, floor workspace, service-only fulfillment and Close.
- src/components/ui/LifecycleProgress.tsx: already delegates verb to getRentalPrimaryAction; optional duplicate banner button should remain off when header owns CTA.
- src/modules/operations/OperationsShell.tsx: owns stage workspaces, footer Complete and blocker focus; do not add another submit.
- src/modules/operations/operationWorkspaceActions.ts and nextRequirement.ts: actual workspace completion/readiness and first unmet requirement.
- src/lib/workflow.ts and operationsShell.ts: canonical stage/jobs and write gates.
- src/lib/rbac.ts + branch RPC/RLS: capabilities; do not derive rights from a cosmetic label.

## Proposed component shape

**ContextualNextActionSummary** is **presentation-only**: consumes the existing resolved RentalPrimaryAction (already calculated by parent), server-read freshness state, and scoped verified blocker descriptors. Shows action label, short why/where/what-next copy, progress (only measured), and a link/focus target to an **existing** control or workspace. No own permission table, state resolver, direct Supabase mutation or new action handler.

Possible minimal props: bookingNo, resolvedAction, blockerSummaries, readState (loading/fresh/stale/failed/offline), audience (desk/floor/finance), onFocusExistingAction. BlockerSummary includes stable key, text, resolution target/focus callback, evidence timestamp and sensitivity flag. **Never pass money objects to a money-blind consumer even if the component would hide them.**

## Render rules

| Situation | UI response |
| --- | --- |
| Quote, authorized | Explain 'Confirm Booking'; existing header button does it |
| Booked, pack-capable | Explain 'Start Packing', scanner dependencies/known blockers |
| Packed, handover-capable | Explain handover; signature/receiver blocker remains in Handover workspace |
| On Rent, return-capable | Explain 'Return & Inspect', urgency based on real time |
| Partial return | Explain 'Continue Return', show outstanding known quantity |
| Returned, close-capable | Existing resolver may offer Close; show only **verified** financial close blockers and no extra submit |
| Returned, noncloser | Explain Reset or waiting state per actual resolver; do not expose finance blockers |
| Closed or Cancelled | Informational state; no active stage CTA |
| Unknown or failed read | 'Could not verify next action — Retry'; never fabricate an enabled verb |
| Role/branch denied | Do not render a forbidden operational control; optionally show safe non-financial informational status |
| Offline custody/finance | Read-only/stale guidance, no false 'Committed' or queue claim |

**Nuances:** Reset is not a hard Close gate. Financial close permission and per-operation capability are separate; the executable predicate prevails over stale comments. A Technician's Handover grant must be read from current code and DB, never hardcoded from an older narrative.

## Integration order

1. **Read-only summary on Rental detail:** reuse its existing resolvedAction, one contextual text line, no new CTA. Ensure no duplicate Quick Actions / banner.
2. **Verified blocker deep link:** use existing workspace focusBlocker, actual loaded queries and gates; on read error show Retry (not '0 blockers').
3. **Summary on Today/queue only where nonredundant:** one line of guidance; retain existing queue button and modal/dock launch.
4. **Outcome-based copy:** after persisted refresh, update hint; no optimistic success.

## Acceptance tests (minimum)

- Each canonical stage, Cancelled, overdue, partial Return, service-only, unknown stage.
- Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client with branch grants.
- No money data in floor DOM, props, messages or payload; backend still denies forced requests.
- The existing header or workspace owns the only filled primary action; no duplicate CTA in LCP banner/rail.
- Blocking data loading, failed, stale and partial never renders as known passing.
- Unit count is from persisted rows; quote-only item list does not imply an active stock hold.
- Multiple taps, race/conflict, reload, idempotent server response and no success before acknowledgment.
- Mobile 375/390, tablet 820 portrait and landscape, desktop 1440; keyboard focus and screen reader reason.
- No workflow transition or DB schema change in a presentation-only PR.

## Test locations

Existing suites: src/lib/__tests__/rentalActions.test.ts, src/components/ui/__tests__/lifecycleProgress.test.tsx, src/modules/rentals/__tests__/BookingDetail.*.test.tsx, src/modules/operations/__tests__/OperationsShell.test.tsx, src/lib/__tests__/rbac.test.ts. Add a narrowly scoped component test when implemented.

## Avoid active PR collision

Check the open pull requests and docs/plans T-track claims before changing shared BookingDetail, PageActions, OperationsShell, source predicates or checkout. This document authorizes no code changes.

# Sixteen UX journeys — end-to-end design and test map

Each workflow is defined from staff **intent to persisted, permission-correct success**, including blocked/stale/error recovery. Stage and amount decisions are delegated to the current engines. Initial statuses are **Design planned; implementation evidence unverified**—never label these Done without current tests and PROGRESS.

| ID | Journey | Existing entry point | Required edge/acceptance |
| --- | --- | --- | --- |
| UX01 | Create Rental / Save Quote | New Rental, rentals workspace | quote saves/reloads; correct client & dates; unsaved guard; no inventory hold until confirmed |
| UX02 | Check availability / resolve conflicts | Availability engine, conflict modal | overlapping bookings rejected; missing read never looks free; alternatives preserve draft |
| UX03 | Confirm Rental / reserve units | Rental detail, confirmRental | reservation atomic, role/branch scoped, no double confirmation, real server success |
| UX04 | Pack / scan | PackingWorkspace | unit/quantity reconciliation, accessories, photos, unresolved rows keep stage Booked |
| UX05 | Handover / receiver identity and signature | HandoverWorkspace | actual receiver/authorization, signed proof, permitted override audited, correct unit dispatch |
| UX06 | Delivery / pickup proof | Operations delivery tools | driver scope, proof, branch, signed status; no money shown to Driver |
| UX07 | Change/extend Rental | Rentals / extension action | current availability, conflict and approvals, old booking remains intact on refusal |
| UX08 | Partial and complete Return | ReturnWorkspace | item A received, B still On Rent; no premature full return |
| UX09 | Damage / missing / repair | Return, Cases, Inventory | photos, notes, open case, refusal where needed, no silent usable status |
| UX10 | Cleaning / Reset / QC | ResetWorkspace | category tasks, defect hold, verified completion & task urgency |
| UX11 | Invoice creation | Finance/Rental detail | one invoice rules, VAT from money engine, failed save retains form |
| UX12 | Payments / deposits / refunds | Finance/Rental detail | paisa rounding, immutable append, deposit separate, role and offline gate |
| UX13 | Close / Cancel Rental | Rental detail, More | close gates checked, audited override only when allowed, no post-close floor actions |
| UX14 | Inventory / unit / maintenance | Inventory | unit edit persists, shelf location, branch, repair gate and inventory state read-only |
| UX15 | Clients, membership and crew | Clients/Crew Assist | correct identity/role, repeat clients, conflict, permissions and no fake save |
| UX16 | Reports and financial monitoring | Finance Reports, Today | source reconciled, date scopes, role-based money absence and refresh accuracy |

## Journeys by risk and expected UI

**P0 critical:** UX01, UX02, UX03, UX04, UX05, UX07, UX08, UX09, UX10, UX11, UX12, UX13. P0 here is a **proposed UX audit priority**, not a newly verified bug severity.

**P1 important:** UX06, UX14, UX15, UX16. Any real permission, corruption, collision or payment fault still escalates to the active release/security track.

## Flow design record (required for all 16)

1. **Intent and actor:** e.g. night Warehouse operator returning one serialized unit.
2. **Entry context:** route, record, branch, saved filters, scanner state, data freshness.
3. **Existing truth:** canonical BookingStatus, job, item state, flags, row permissions and live reservation.
4. **Action path:** discover → select → review → evidence → commit → server acknowledgment → post-write refresh.
5. **Recovery branches:** duplicate scan, offline, stale stage, conflict, missing data, permission denial, damaged/missing, partial completion, cancelled, concurrent edits.
6. **Only one primary action:** use the existing PageHeader, RecordActions or OperationsShell owner.
7. **Evidence:** screenshot, keypress/tab audit, unit/integration/staging test, server state after reload, risk scenario and staff timing.

## Dependencies and existing planned work

- **Floor & evidence:** docs/plans/T2_FLOOR.md (do not fork T2-18/T2-17/label/Reset repairs).
- **Booking and money:** docs/plans/T3_BOOKING_MONEY.md.
- **Delivery/tools:** docs/plans/T4_SHARED_TOOLS.md.
- **Nepali:** docs/plans/T6_NEPALI.md; preserve IME composition.
- **Client/crew:** docs/plans/T8_MEMBERSHIP_CREW.md.
- **Security, staging, release:** docs/plans/T1_RELEASE.md; UI screenshots do not certify RLS.

The existing docs/USABILITY_TESTS.md task cards U1–U12 already cover much of this catalogue. Extend only for real uncovered cases.

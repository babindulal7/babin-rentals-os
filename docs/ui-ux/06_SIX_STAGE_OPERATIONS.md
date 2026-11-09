# Six-stage staff journey — packing → handover → active → return → reset → closeout

**Important:** This is a **six-stage operational experience**, NOT a new BookingStatus enum, additional database transitions or permission ruling. It maps onto current six booking stages and four floor jobs.

## Canonical state separation

- **Booking:** Quote → Booked → Packed → On Rent → Returned → Closed. Cancelled is orthogonal; overdue is a time/flag condition, not its own stage.
- **Floor jobs:** Pack, Handover, Return, Reset (Reset absorbs Cleaning and does not itself advance the booking).
- **Inventory derived status:** In Stock, Reserved, Packed, On Rent, Returning, Inspection, Cleaning, Maintenance, Missing, Retired. Database recompute owns product_units.status; do not add 'testing', 'ready_to_shelve' or 'available' enum values in UI work.
- **Return/quantity:** individual unit receipts and quantity receipts may leave booking On Rent while the returned subset is independently accounted for.
- **Condition, QC, reservation and physical location are independent facts**; a unit's future bookability and immediate dispatch readiness are different questions.

## Stage 1 — Pack and group (Booking Booked → Packed)

Owner: permitted floor staff per rbac and branch grants. Existing screen: modules/rentals/PackingWorkspace.tsx. It already has barcode/tap marks, getCinemaKitDependencies, a real completion gate and a booking-level evidence policy.

**Design improvements:** scan-focus header; grouped product → serialized unit → mandatory sub-items; missing reason; visual packing progress; optional persistent case assignment; summary of cases/bags/loose units; case labels and reconciliation. **Do not fake case counts:** PackingWorkspace explicitly records there is not yet a persisted packing-case model; do not label local counts as loaded manifests.

**Kit model proposal:** versioned per-product checklist requirements for non-stock accessories; separate stock records for independently tracked/rented serialized or quantity accessories; booking-level snapshot of checks at packing. Containers/cases require a distinct identity and per-booking assignment record with audit. This **needs schema/design approval**, not a JSON-only rewrite of booked units.

## Stage 2 — Testing bench and Handover (Packed → On Rent)

Owner: permitted Handover actor; current role predicates and branch grant decide, not the title 'Ops Officer'. Existing screen: HandoverWorkspace; receiver ID, authorization, evidence and signatures already have contracts.

**Design improvements:** optional Testing Bay occupancy indicator **only with real saved data**; packed-case crosscheck; recorded pre-existing condition; authorized collector; signed document/manifest; transport proof. Do not introduce 'in_testing_bay' in BookingStatus. Add-on/swap during prep must use existing booking-change/custody actions with their gates, or remain blocked/unavailable until approved; never mutate sealed manifests silently.

**Money rule:** floor staff see non-financial pass/fail only where permitted and no balances; financial enforcement/overrides follow actual server R-06 and actions. Do not make the proposal's 'advance paid verified' an extra hard gate.

## Stage 3 — Active shoot (On Rent)

Show return time, due/overdue, assigned units, current returns, authorized actions. Extension performs a **live collision check**, never a local optimistic booking update. Field swap must be audited as a custody correction and needs an existing or future approved action. Partial early return records exact units; do not release missing, damaged or unreturned units. WhatsApp is draft-only under current communication policy.

## Stage 4 — Return and inspection (On Rent → Returned when complete)

Existing ReturnWorkspace combines receipt, condition inspection, photos, missing reasons and exception handling. Introduce a **container count first** only after stage 1 persists a trusted case manifest. Three visible outcomes: accepted and needs turnaround, missing/not received, damaged with evidence. Preserve real per-unit conditions and repair/claim process; **no arbitrary 'Bill client' toggle that writes charges without a governed approval**.

Partial Return stays On Rent if items are still due. A verified usable unit can be released for another future reservation even when the booking remains On Rent, per the October 24 ruling.

## Stage 5 — Cleaning, charging, Reset and re-shelving (booking remains Returned)

Existing ResetWorkspace + cleaning_queue_entries. Make turnaround work category-specific **after category lookup is real**; names/guess heuristics are not authoritative. Cameras: media inspection and approved sensor/config checks; lenses: optical/mount checks; batteries: charge/health; lights/cables/grip: relevant quick checks. **Never automatically format a client's media card, erase footage or factory-reset a client-requested setup**; use documented operator-safe procedure and explicit authorization for destructive changes.

Urgency: existing next-reservation query + resetNeededNextHours setting (default 4h); do not duplicate. Unit 'ready' only when its actual required cleaning/QC/location checks have persisted. Quick-check or no-clean categories still require intake/condition verification—no universal bypass.

## Stage 6 — Financial closeout (Returned → Closed)

Closing is separate from routine cleaning. The existing close gate and roles (Owner/Admin/Manager/Accounts when online, subject to actual server constraints) control closure. **Reset is not a hard close gate.** Never block a settled closure merely because an otherwise usable unit's routine reset task is pending. Conversely, closing never clears damage/QC defects or declares a unit shelf-ready. Financial role sees invoice/deposit/case blockers; money-blind roles see no financial details in DOM.

## The crucial two-label inventory UX

| Question | Intended meaning | Governing source |
| --- | --- | --- |
| 'Can be reserved for this future period?' | Date-window eligibility with holds, actual condition and defects checked | lib/availability.ts, queries/availability.ts, database |
| 'Ready for handover right now?' | Actual physical readiness, packed checklist, cleaning/QC/required equipment complete | Floor workspaces + server gates |
| 'What is the present physical condition?' | Returned/Inspection/Cleaning/Maintenance etc.; no optimistic green | Derived DB status + task/condition data |

**Never reword future-bookable as currently cleaned.** October 24 policy allows a verified usable returned unit to be reserved for a future slot even when routine cleanup is pending. A stricter block on *future reservations* is an explicit **TODO(decision)** and potentially a major availability/RLS change.

## Explicit decisions before engineering expansion

D-UX-01: Definition and ownership of reusable container IDs/cases, labels and responsibility after return.  
D-UX-02: Which sub-items are separately stock-tracked vs checklist-only, and which versions govern legacy rentals.  
D-UX-03: Whether Testing Bay occupancy needs persistence or is merely a local operator note; how custody is represented.  
D-UX-04: Category QC templates, approved handling of client media and configuration resets; quick-shelve eligibility.  
D-UX-05: Whether future availability policy should remain as currently ruled (default: **do not change**).

These are **proposed decision questions** to be registered in the authoritative OPEN_DECISIONS/PLAN files through the coordinated process, not owner-approved policy in this branch.

## Safety acceptance examples

- A returns, B stays on shoot: A can be assessed for future bookability, B retains its commitment; booking remains On Rent.
- A is damaged / missing: never free/ready; correct exception and proof.
- A is returned usable but unclean: future-reservation display may be eligible, immediate handover display says not ready.
- A is ready but tomorrow's booking already holds its window: no overlapping confirmation.
- Booking financially Closed while eligible routine reset remains: no fabricated stock readiness; Close remains legal if actual hard gates pass.
- Offline custody submit or evidence upload failure: no 'Saved' toast; drafts/error recover honestly.

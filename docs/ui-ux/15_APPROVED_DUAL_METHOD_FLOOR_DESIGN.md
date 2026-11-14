# Approved UI/UX direction — Dual-method verification & floor workflow

**Owner-design approval captured:** 12 November 2026 (NPT)  
**Source:** Owner's direct chat instructions: **"Method all staff can do both"** and **"Othere than that others are accepted."**  
**State:** **APPROVED DESIGN REQUIREMENTS; IMPLEMENTATION ON HOLD** while owner finishes the overall UI/UX design.  
**Evidence level:** Owner-approved *design direction*, **not** merged code, verified feature, production change, completed security fix, or a new product/permission/money ruling.

## 1. The clarified fundamental rule

**Every staff member who is authorized for a particular operation may use both QR/barcode scanning and manual verification.** No dedicated "Scanner Staff" versus "Manual Staff" role; staff may alternate methods for each item without restarting or losing work.

"50/50 Scan + Manual" means **equal access and usability of both methods**, **not** an enforced 50% scanned/50% manually verified split. A booking may be verified wholly by either method, or by a mix, **provided every applicable identity, condition, quantity, evidence and server-side gate requirement is satisfied**.

Availability of an **input method** never grants the right to complete an unauthorized **operation**. Existing role/branch capability matrix, RLS and floor RPCs govern Pack, Handover, Return and Reset separately. Money-blind Warehouse/Technician/Driver/Client must not see or receive financial data in props, DOM or API payloads.

## 2. Approved UX behavior — same operation, two paths

1. **Scan-first for serialized gear:** camera QR, barcode, USB or Bluetooth; use the **existing** `src/components/ui/ScannerInput.tsx` and its duplicate-scan handling. Resolve the exact booking, physical serial/unit, branch and current operation. Wrong/unassigned/duplicate scan gives a truthful inline result and does **not** change the item.
2. **Manual-first for unlabeled/bulk accessories:** directly select/check the correct row, identify serialized equipment by name **and serial** when its label is worn or scanner unavailable, and count quantity-tracked accessories. Do not force staff to scan everything or prevent them scanning countable items if supported.
3. **Equal access:** Scan and Manual options available on all floor screens to an authorized operator; switching them does not reset status, queue, focus unnecessarily, or persisted evidence.
4. **Identity is not condition:** scanning identifies the piece; it must **not** auto-set Tested, Cleaned, Packed, Returned, Inspection Passed, Photo Uploaded, Damage Cleared, or QC Passed. A required physical task needs its own explicit check/evidence.
5. **Unified progress:** aggregate **unique, actually completed required checks** across methods for the current booking/job; show e.g. “8 of 15 verified — 3 scanned · 5 manual”. 100% row marks alone do **not** override missing photos, incomplete kit/quantity reconciliation, defect, cash/identity gates, branch restrictions or unresolved server facts. If a read fails, show unable-to-verify/retry, not zero blockers.
6. **Method attribution:** capture actor identity, exact time (NPT presentation / trustworthy stored timestamp), booking/job, unit/quantity line, specific check, method, relevant manual reason, branch, and supported scan-event or evidence link. An item can be QR-identified and manually inspected; one mutable `verifyMethod` on the unit is insufficient. Prefer append-only, idempotent event history once a separately approved persistence design exists; show provisional/local state honestly until then.
7. **One Obvious Action:** one primary verb for an operation using the **current** `src/lib/rentalActions.ts` / OperationsShell / server transition. Neither input method creates another state engine, new BookingStatus or another completion CTA. Only server-acknowledged commits show Done.
8. **Bulk verification:** grouped accessory chips and quantity steppers are encouraged, but "Verify All" can only confirm a clearly delimited group with explicit quantity/evidence review and correct permission, **not** automatically accept eight unchecked kits, media cards or missing accessories.
9. **Physical safety:** preserve real damage/missing reasons, verified photo uploads, partial returns, condition-based QC, and safety checks. Never auto-format client media or reset camera presets; use an approved controlled procedure.
10. **Financial isolation:** remove the prototype's all-stage payment banner from floor and money-blind views; a cashier/finance action must use canonical money engines/append-only ledger, not a React state increment, arbitrary VAT toggle, naive deposit deduction or simulated toast.
11. **PIN/role switch:** no hardcoded/default-bypass PIN; switching requires verified target identity before session activation, actual permission scope and financial cache purge (including offline/back navigation), and auditable failure. Issue #62 remains a separate security acceptance gate. A visual PIN overlay alone is not authentication.
12. **Reversals and offline:** don't promise Undo for irreversible custody/payment transitions. Offline scans/notes follow the established permitted outbox policy; stage, payment, custody and signature transitions are fail-closed online and require server acknowledgment.

## 3. Approved visual design and device behavior

| Workspace | Desktop | iPad landscape | iPad portrait | Phone portrait / landscape |
| --- | --- | --- | --- | --- |
| Pack | queue + serialized/bulk groups + inspector | two-pane scan + checklist when width allows | one main queue/task and large controls | scan access + manual row immediately below / split during camera capture if height permits |
| Handover | identity/signature/receiver record, one permitted Complete button | wide receiver and scanning workbench | readable form with persistent blocker | no auto-check gates; keyboard, camera and signature never cover submit |
| Return + Inspection | unit receipt by serial plus grouped quantity and exceptions | quick scan + item condition list | per-unit condition checklist | easy partial-return, damage-photo and missing-reason flows |
| Reset | category QC, urgent next booking and shelf status separately | QC task + scan/barcode | one equipment task at a time | quick manual checks, scan verification, safe handling |
| Inventory | serial search, stock count, location | adaptive list/detail | large touch list | one-unit identity/condition and explicit error states |
| Security | scoped switching dialog | accessible PIN/lock overlay | protected content | no financial cache flash or stale reappearance |

**Touch targets:** minimum 44px generally; manual verification controls target **48px**; primary floor action **56px**. Tested/cleaned/packed actions must have readable labels beyond T/C/P alone. Follow approved Graphite/Paper colors, Source Sans 3 body, Outfit headings, JetBrains Mono identifiers, shared Tabler icons and keyboard/IME/contrast rules.

**Navigation and stages:** Existing 11 primary nav destinations and five-slot phone bar. **Six booking statuses:** Quote → Booked → Packed → On Rent → Returned → Closed. **Four jobs:** Pack, Handover, Return, Reset. The prototype's 13 steps are **UI sections**, never 13 backend booking statuses. "Today" is glance-only under G-6; work buttons are in Operations. Future-bookable and physically handover-ready are different states.

## 4. Required design revisions from uploaded Babinrentalsappshell 2.txt

The uploaded React prototype is a visual reference and demo, **not production logic**. Before approval of final high-fidelity designs, remove or clearly mark these unsafe demo effects:

| Prototype flaw | Accepted design correction |
| --- | --- |
| Scan sets `tested`, `cleaned`, `packed`, `returned` and `photoUploaded` together | Scan resolves identity; explicit separately required tasks and persisted evidence remain |
| `Next Stage` increments `activeFlowStep` | Can navigate design sections, but real workflow stage follows canonical server transition |
| Hardcoded staff PIN list and demo `1234` bypass; cache purge timestamp | Real auth/session isolation and actual purge of identity-scoped caches |
| Hardcoded NPR subtotal, VAT toggle, local payments and refunds | Governed finance action and role-safe data boundaries; no fake paid/refunded states |
| "Receive All", "Mark All Cleaned", "Verify All Bulk" shortcut bypasses actual checks | Scoped batch action only after visible unit/quantity reconciliation and evidence |
| T/C/P row buttons as small as 28px | Accessible 48px buttons/labels, context and feedback |
| One mutable `verifyMethod` on unit | Per-operation, per-check actor and method events, once approved by data governance |
| Prototype role names or extra stages/icons/colors | Existing 9 roles, 6 statuses, 4 jobs and approved design system |
| Example bookings/case counts, photo flags, success/undo toasts | Demo labels only until real data and server acknowledgment exist |

## 5. Existing implementation facts and open decisions

- `src/modules/rentals/PackingWorkspace.tsx` already has scan/manual local verification; its `Mark.via` documentation explicitly identifies missing persisted `scan_events` attribution. Do **not** claim per-event audit is currently implemented.
- Existing `ScannerInput.tsx` supports ambient hardware scanner and duplicate suppression; use it rather than a parallel scanner.
- Existing booking permission, condition, asset status, reservation and repair logic remains authoritative.
- Container/case persistence (**O-23**), checklist-only vs stock-tracked (**O-24**), Testing Bay persistence (**O-25**), category QC/media reset (**O-26**), and future booking policy (**O-27**) remain governed by canonical `PLAN.md` / `docs/OPEN_DECISIONS.md`. **Approval of the *UX direction* does not settle those separate unanswered business/database decisions.**
- Existing October 24 availability policy stays: a verified usable returned item may qualify for **future booking** while routine cleanup is outstanding; that does not make it immediately **dispatch-ready**.

## 6. Approved design-review sequence

1. Packing (serialized assets, accessories, cases and blockers).
2. Handover (physical check, collector identity, signature, proof).
3. Return and Inspection (partials, damages, photo/quantity evidence).
4. Cleaning and Reset (category-safe QC and readiness).
5. Inventory (serial, quantity, location, maintenance).
6. Staff PIN and full responsive/accessibility review.
7. Remaining Clients, Finance, Documents, Calendar, Crew, Tools, Reports and Settings, using the same shared system.

**Design delivery:** desktop, iPad landscape, iPad portrait, phone portrait and phone landscape; inspect states/loading/failure/offline/restricted/dirty/saved; test physical devices before final signoff.

## 7. Explicit HOLD and acceptance boundaries

- **Approved now:** the twelve design improvements in §2 and the clarified all-staff dual-method rule, as design *requirements*, for the next round of mockups/review.
- **Not yet approved:** the completed final visual package for all screens; any UI code, role change, SQL schema, finance rule, live database operations, merge/deployment or PIN security implementation.
- **Project state:** **UI/UX implementation HOLD until owner explicitly approves the final full design.** Background CI/security tasks may proceed under their independent authorization; do not conflate those with UI rollout.
- **Before engineering:** individual T-track card and any pending owner decisions, source/PR overlap review, local `npm run gates`, 375/820/1440 browser states and relevant real-device checks. A merged PR is not a physical-device verification certificate.
- **This document:** a design record on a **draft PR**, not yet merged into main and not proof of tests. The complete local gate suite was **not run** solely by recording this decision.

**Cross-references:** [06 Six-stage operations](06_SIX_STAGE_OPERATIONS.md) · [08 Contextual Next Action](08_CONTEXTUAL_NEXT_ACTION.md) · [12 Prototype crosswalk](12_STANDALONE_REFERENCE_CROSSWALK.md) · [13 Responsive matrix](13_RESPONSIVE_IMPLEMENTATION_MATRIX.md) · [14 Governance handoff](14_GOVERNANCE_CHECK_AND_HANDOFF.md).

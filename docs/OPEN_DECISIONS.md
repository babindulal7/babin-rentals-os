# Babin Rentals OS — Open Decisions Register

## 24 October 2026: Return reservation contract — engineering scope pending

- Owner availability policy is settled by Booking Operations v1.1 and `RULINGS-2026-10-24.md`: pending cleanup alone is not a hold. This is not an open product-policy question.
- `TODO(decision)`: the brief also says no migration. A disposable PGlite probe confirms that partial Return leaves A's original reservation active while B remains out; GiST rejects A's new overlapping reservation (`23P01`). Clarification is pending on authoring/verifying a narrow local-only database correction. No hosted apply, release-by-query workaround or migration is authorized by this entry.
- `TODO(decision)`: identify the authoritative physical-clearance record for a genuine damage/QC finding after repair. Financial approval/disposition is not proof of physical repair. Current availability remains conservative on non-voided findings and recorded defects; do not auto-clear them based on Reset, payment or case finance.
- Probe and UI evidence are under `artifacts/booking-operations-20261024/` and `docs/verification/booking-operations-20261024/`.

## 24 October 2026: guarded 0171 + 0172 integration — APPROVED

Babin explicitly chose **“Integrate the guarded pair”**, including the explained pristine/global, history/scoped, revoke-last/deny-all and Owner/Admin superior/self-target rules. Shared-source integration and permanent security/CI wiring are authorized and being verified. This resolves the model/canonical-source choice below, not N-5 hosted application or production readiness. Unbooked Reset uses the unit's current warehouse branch, as already selected. New current evidence will be recorded in `verification/OPERATIONS_BRANCH_INTEGRATION_2026-10-24.md`.

Available physical devices are iPhone 17 Pro and M4 iPad Pro. Device acceptance has not yet run; no external scanner model/interface was identified. Isolated staging credentials/role fixtures and owner-controlled backup/cutover remain required. The unrelated Technician/Handover and legacy Storage decisions below are not changed by this approval.

## 23 October 2026: pending 0171 / canonical checkout — HISTORICAL, resolved above

- A draft operations-branch migration appeared locally and was repeatedly removed by external checkout/cleanup activity. Its guarded recovery candidate closes the existing Admin superior/self-target bypass and passes 169 migration / 31 lifecycle / 18 security-group local checks. Candidate and original are preserved at C:/Users/use/AppData/Local/Temp/babin-current-main-20261023-173608; this is not approval of the draft's location model or administration policy.
- Active migration present at reconciliation: false. Current application verification remains incomplete. User choice is pending between pausing other writers and restoring pending fixes, or keeping current main with the draft in recovery. No answer or product ruling is inferred from file changes or source comments.
- The pre-existing P0-B location-scoping decision remains OPEN. Confirm the authoritative site model, permitted grant administration and Reset enforcement/integration before treating the feature as delivered. No live migration, role expansion or deletion is proposed by this record.

### Pinned verification follow-up — Reset branch enforcement

- Commit `14dbbe3a` contains 0171 and 169 migration files. A disposable PGlite probe allowed a synthetic Warehouse actor only on branch A and correctly refused the explicit Reset assertion for branch B, yet that actor still updated one branch B `cleaning_queue_entries` assignment through the API role. `floorVerb.ts` does not invoke the early assertion described in 0171. This is a locally reproduced enforcement gap, not a hosted test or a completed feature. Evidence: `artifacts/release-checkpoint/checkpoint-14dbbe3a/reset-branch-probe.json`.
- **RESOLVED / RESET-BRANCH-0171, Babin 23 October:** “Use the unit’s current warehouse branch.” Unbooked items resolve `product_units.warehouse_id → warehouses.branch_id`; linked items retain booking branch. No fallback to the actor's or unit's separate branch. The broader P0-B model/admin approval above remains open.
- Candidate engineering is isolated in the attached `verified-release-checkpoint` worktree: 0172 restrictive queue/task policies cover old and new scope; floor actions call the early assertion; positive/negative tests cover revoke, transfer, reparenting, unknown/inactive identities and existing role limits. Its fixed-source pipeline, full suite/coverage (5,339/5,339), 170 migrations and 31 lifecycle steps pass. Candidate integration and permanent CI wiring remain pending; no production application is authorized.
- Contributor governance gap: `AGENTS.md` and `CLAUDE.md` reference root `PLAN.md`, which is absent in this checkout. This decision is logged here instead of inventing a replacement roadmap.

## 20 October 2026: per-operation grant matrix (P0-B) — ACTIVE, one open cell

- The four global operations now carry **one grant each** (Booqable adoption spec P0-B: Booqable's 13 flat grants cover no operational action, so the granularity is net-new). `lib/rbac.ts` exposes `canPack` / `canHandover` / `canReturn` / `canReset` + `canPerformOp(role, op)`; `actions/core.ts` resolves `operations.pack|handover|return|reset`; the four rental actions declare their specific grant instead of the coarse `operations.perform` (kept as a dispatcher case for compatibility).
- Matrix as shipped: **Pack / Return / Reset** = Owner · Admin · Manager · Warehouse · Technician (identical to the old coarse set — no behaviour change). **Handover** = Owner · Admin · Manager · Warehouse — Technician excluded, matching the committed UI wiring (`BookingOperationsMenu`, `BookingDetail` primary action) that already gates the Handover control per-op.
- Consequence: a Technician can no longer complete a handover through any path (UI hides it, dispatcher now denies it). This closes the UI-stricter-than-engine divergence but is a real product change.
- **TODO(decision):** confirm Babin wants Technician excluded from Handover (client-facing handoff). Veto = point `canHandover` at `canPerformOperations` in `src/lib/rbac.ts` — one line, no migration, the dispatcher and UI follow automatically.
- **Still open (the other half of P0-B):** location scoping — a grant is meaningless without a site. Needs a grant table + RLS (migration under N-5: write, verify `check:pglite` + `check:lifecycle`, Babin applies).

## 17 October 2026: legacy Storage object mapping — TODO(decision)

- Live `documents`/`evidence` object SELECT/INSERT/UPDATE policies currently test authenticated bucket membership only. Existing PERMISSIONS.md §3/§5 requires client ownership, money omission and identity-document restrictions. Private buckets alone do not enforce that matrix.
- Engineering work required: bind stored paths to authoritative document/evidence records and apply those records' role/ownership rules when creating signed URLs or reading/updating objects. Existing exports use several path formats, and some uploads are signed before metadata registration.
- **TODO(decision):** determine the disposition of legacy/unregistered paths during the scoped-access migration (inventory and quarantine vs an approved remapping process). Do not silently expose orphan files or invent a cross-client fallback. No broader read or write permission is proposed.
- Keep production release blocked on a tested policy/storage-client migration and real Client A/Client B plus staff-role Storage API acceptance. No live policies were changed by this audit. Root PLAN.md is absent from the current checkout; this record is the active decision reference.


**Status:** Authoritative Active Decision Register  
**Last Reconciled:** 3 October 2026

*Note: All decisions resolved by rulings R-00 through R-43 or verified in `PROGRESS.md` (e.g. damage resolution, fail-closed transitions, atomic booking creation, same-day rentals, 13% VAT) have been removed from this register.*

---

## 1. Bundle Component Removal / Deactivation (§4.52) — RESOLVED
- **Decision:** Implemented soft-deactivation obeying Law 3 (no physical `DELETE`).
- **Implementation:** Migration 0134 (`is_active`, `deactivated_at`, `deactivated_by`), `updateBundle` line deactivation action, query filtering in `bundles.ts`, and UI component removal with non-empty bundle validation in `EditBundle.tsx`.
- **Status:** Resolved (25 September 2026).

---

## 2. Closing Zero-Value Rentals Without Billing (§4.51) — RESOLVED
- **Decision:** Implemented explicit Owner/Admin override action with mandatory audit reason (minimum 10 characters).
- **Implementation:** Migration 0135 (updates `apply_booking_stage_transition()` to accept override and record `'CloseOverride'` in `audit_events`), `closeRental` action with permission checks, and `BookingDetail.tsx` zero-value close trigger modal.
- **Status:** Resolved (25 September 2026).

---

## 3. Purchase Request Approval Scope (§4.29) — RESOLVED
- **Decision:** Narrowed `purchase.approve` strictly to `Owner · Manager` in both database RLS and application RBAC.
- **Implementation:** Migration 0064 & 0069 (`auth_can_approve_purchase()`), `src/lib/rbac.ts` (`canApprovePurchase`), and `src/actions/inventory/approvePurchaseRequest.ts`.
- **Status:** Resolved (Migrations 0064, 0069).

---

## 4. Consumable Inventory Tracking Semantics (§4.49)
- **Question:** How should consumable items (tape, gels, batteries) be handled across the Return and Reset workspaces?
- **Context:** Serialized assets require physical check-in and damage evaluation. Consumables are consumed during the rental.
- **Proposed Options:**
  - Option A: Treat consumables as non-returnable expense lines that auto-resolve upon Handover.
  - Option B: Track returned unused bulk quantity and credit the difference.
- **Current Status:** Resolved as Option A (29 Sep 2026, spec addendum Trial 13 gaps #3/#5): Consumable-tracked lines are exempt from the Return receipt gate (0141, verb + workspace agree) and deplete `products.total_quantity` automatically at Handover into append-only `consumable_stock_movements` (0142). WRITTEN + VERIFIED locally, NOT APPLIED to production — Babin may still flip to Option B before the production apply, which would replace 0141/0142.

---

## 5. Official Bikram Sambat Calendar Expansion (§4.34)
- **Question:** Provision of official month lengths for BS 2084 and beyond.
- **Context:** `src/lib/bs.ts` currently anchors BS 2083. Expanding to 2084+ requires the official publication of the Nepal Calendar Determination Committee to prevent date calculation errors on VAT invoices.
- **Current Status:** Blocked externally on official committee data.

---

## 6. Non-physical floor transitions and completion (§4.59) — RESOLVED
- **Decision:** Non-physical lines (`Service`, `Sub-rental`, `Manual item`) are exempt from Pack and Handover physical gates (matching the 0139 Return gate). Services are displayed as informational lines without requiring barcode scans, fake movements, or checklist ticks. Service-only bookings advance via a dedicated `fulfillServiceRental` action (`Booked -> Packed -> On Rent -> Returned`) without opening empty warehouse Pack/Return sessions or fabricating equipment movements.
- **Implementation:** Migration 0149 (`apply_booking_stage_transition()` with `v_has_physical_lines` and non-physical line exemption in Handover gate), `src/actions/rentals/fulfillServiceRental.ts`, `src/actions/rentals/floorVerb.ts`, `src/lib/rentalActions.ts` (`isServiceOnly`), `src/modules/rentals/HandoverWorkspace.tsx`, and `src/modules/rentals/BookingDetail.tsx`.
- **Status:** Resolved (3 October 2026, Migration 0149).

## 7. Who may read the staff roster (`staff_directory_v`) — RESOLVED
- **Decision:** Option (b) (All staff) — keep `auth_is_staff()` on `staff_directory_v`. All authenticated internal staff roles (Warehouse, Technician, Driver, Coordinator, Accounts, Manager, Admin, Owner) may view colleagues on shift and operational rosters. External clients and unauthenticated public/anon remain strictly blocked.
- **Implementation:** Migration `0148_view_anon_leak_closure.sql` (enforces `where auth_is_staff()` inline and revokes `anon` SELECT).
- **Status:** Resolved (3 October 2026, Babin ruling).

---

## 8. Payment Document Numbering Sequence — RESOLVED
- **Decision:** Option 2: Switch payment document sequence to short sequential format `PAY-94` (`padding: 1, include_year: false`), aligning new payment numbers with booking (`BK-1`) and invoice (`INV-1`) bare sequence conventions. Historical payments 1..93 remain immutable under Law 3 and Law 4 as `PAY-2026-0001` .. `PAY-2026-0093` (`trg_payments_reject_update`).
- **Implementation:** Migration `0151_payment_numbering_short_format.sql` (updates `number_sequences` for `payment` to `padding = 1, include_year = false`).
- **Status:** Resolved (3 October 2026, Babin ruling, Migration 0151).

---

## 9. Security Deposit Release and Settlement Authority (D1) — RESOLVED
- **Decision:** Authority is scoped strictly to `Owner · Admin · Manager · Accounts` (`M+ · Accounts`), matching capability `deposit.release` in `docs/PERMISSIONS.md` §4.6. Operations staff (`Warehouse`, `Technician`) and `Coordinator` inspect physical gear and flag missing/damaged items, but liability release and movement recording require management or financial authority.
- **Implementation:** Capability `deposit.release` enforced in `src/actions/core.ts`, `src/lib/rbac.ts` (`canReleaseDeposit`), and `src/actions/finance/settleDeposit.ts`.
- **Status:** Resolved (4 October 2026, Babin ruling).

---

## 10. Audit Reason for Security Deposit Penalty Application / Forfeiture (D2) — RESOLVED
- **Decision:** When any portion of a client's security deposit is applied to damages, late fees, or missing equipment penalties (`Applied` movement), an explicit audit reason of at least 10 characters is mandatory, matching the zero-value close override standard.
- **Implementation:** Validation in `src/actions/finance/settleDeposit.ts` (`appliedReason.trim().length >= 10`) and tested in `src/actions/finance/__tests__/settleDeposit.test.ts`.
- **Status:** Resolved (4 October 2026, Babin ruling).



---

## 11. Booqable adoption (7 October 2026) — what is still Babin's

Provisional rulings are in `RULINGS-2026-10-07.md`; these three are the ones that need a person.
- **D-1 (per-location settings)** — proposal adopted ⭐: only `operationalDayStart` may be overridden per location. Nothing reads a location yet (one site). Flip = widen `settings_location_overridable()` (0158).
- **D-2 (the 4 seasonal rulesets: SUMMER25, New year, Christmas ×2)** — **open.** Proposal: import, then let them expire on their end dates. `pricing_rulesets.valid_until` (0160) carries the date. Nothing is imported yet (the Booqable bridge code is not in this repository).
- **D-3 (who publishes a team saved view)** — proposal adopted ⭐: Manager and above (0159). Flip = `save_view()` and `canPublishTeamViews`, together.
- **G3 persistence (engineering, not a product call, but it blocks Stage 5 cutover)** — pricing structures price a **quote** today; an invoice cannot yet reproduce them. Needs `create_booking` to accept a line total plus a `price_breakdown` snapshot (a new migration, 0161+, with the R-35 gates). Until then a structure-priced product must be keyed with a flat rate on the booking.

---

## 12. The May page briefs (8 October 2026) — eight product calls, full text in MAY_BRIEF_DECISIONS.md

From checking `D:\proects\md` against `step1-foundation`. Fonepay, the live return countdown and Create & add another were built (PROGRESS.md, 8 Oct). These were not, because each one needs a person to decide.
- **§4.64 (a)–(e)** (filed as §4.61) — duplicate / re-book a rental · VAT-inclusive rates · rescheduling a delivery (the Delivery workspace also runs on `localStorage` seed rows) · a late/night charge at booking time · per-category useful lives for the Depreciation Reserve.
- **§4.65 (a)** (filed as §4.62) — show which units Reset needs next, worked out from the next booking's pickup time (`data/reset.ts:163`). Is it wanted, as a label or a sort, and inside what window?
- **§4.65 (b)** — a manager override for Handover gate 1 (receiver ID not verified): allowed at all, by whom, and where it is recorded (`HandoverWorkspace.tsx:89`, `OVERRIDE_UNAVAILABLE`).
- **§4.65 (c)** — holding a citizenship card, passport or licence as the deposit: whether to record it, as a non-money record kept apart from deposits (Law 5); whether it satisfies gate 4; its "returned to client" terminal action; and who may see the ID photo (PII).


## 16 October 2026 — Rental revert and archive scope (resolved)

- **Explicit answers:** Manager reversals before handover only; Archive only Closed/Cancelled bookings, retaining searchable history. Post-handover custody undo is excluded.
- **Implementation:** O16-3 in RULINGS-2026-10-16-operations-ui.md; migration 0167 adds the audited, idempotent writer. See PROGRESS.md for verification and application status.

## 13. Report figures with no source (16 October 2026, Law 16 pass) — open

The Law 16 report pass (PROGRESS.md, 2026-10-16) replaced invented figures with "Not tracked yet". Each of these needs a person before it can be measured:
- **Per-unit revenue attribution** — how a booking line's value is split across the units that served it (Asset ROI revenue, margin, ROI, maintenance drag). `TODO(decision)` in `src/lib/queries/assetRoi.ts`.
- **Cancellation fee policy** — the Rentals report showed a 48 h / 24 h / 50 % fee schedule no ruling contains. Removed; is there a policy, and does it charge?
- **Bank / cash balance** — Cash Flow opening and closing cash, runway, Working Capital and the current ratio need a recorded bank balance; none exists.
- **Utilization and idle cost** — need unit state history over time (Equipment Performance, Inventory, Damage & Maintenance downtime).

## 14. ASTRA legacy storage and offline identity reconciliation (20 October 2026)

- **TODO(decision): legacy unregistered document/evidence objects.** Migration 0170 retains all bytes but refuses access without an authoritative document or operation-session link. Establish verified ownership and the permitted role before mapping old paths; do not reopen bucket-wide access to recover a link.
- **TODO(decision): unattributed offline work.** Earlier queue entries lack submitting-account/project identifiers. They remain on the device, including duplicate legacy payloads in the held-work store. A person must establish provenance before an explicit recovery workflow can adopt them; automatic reassignment or deletion is forbidden.
- Root `PLAN.md` is absent on current main. These questions are recorded here and in the active progress ledger rather than inventing a replacement plan or product policy.

## 15. VAT classification provenance (20 October 2026)

- **TODO(decision): distinguish exempt from zero-rated turnover.** The Sales/VAT report currently groups invoices with zero recorded VAT under a combined category. A zero tax amount alone does not establish an exemption. Identify the authoritative persisted classification and the intended register/export treatment before changing that classification; do not infer legal tax status from an amount. This is separate from the corrected register truncation and recorded-discount arithmetic.

## 16. Shared operational tools and existing local records (20 October 2026)

- **TODO(decision): production model and lifecycle.** Confirm the production-to-booking relationships, record ownership and approved lifecycle before introducing a shared production schema, as required by the audit roadmap's phase 2. The old browser prototype is unavailable in live mode.
- **TODO(decision): legacy local-record ownership.** Productions, staff shift records, warranties and team notes were not account-scoped. Their existing browser bytes are retained. Establish provenance before any shared import; neither the next login nor a matching name establishes ownership.
- Engineering work remains for authoritative staff-shift, warranty-claim and team-note persistence with the existing permission matrix enforced in the database. Until that work and its acceptance tests pass, live read/write APIs refuse and pages explain their unavailability. No shared-data model or permission grant is inferred from the old sample records.

## 17. ASTRA current permission-contract verification (21 October 2026)

- **TODO(decision / reconciliation): Technician Pack authority.** `PERMISSIONS.md` §2/§3 says Technician has view-only Packing access, while the 20 October per-operation note at the top of this file and current `rbac.canPack` permit completion. This task did not widen or replace those concurrent grants. Per the supplied authority order, the stricter permission contract governs; a green capability-dispatch test alone cannot certify this conflict. Reconcile the server write paths, UI predicate and role fixture together before release. This is an open authorization acceptance item, not evidence of a production breach.
- **TODO(decision / provenance): branch attribution for historical report/offline work.** Confirm how original branch/authorization context is captured and verified for held legacy queue entries, and how historical maintenance/damage/report cohorts relate to transfers/current unit location. Do not silently assign legacy work to the next session or present an unscoped aggregate as a branch total.
- `PLAN.md` remains absent; these questions are recorded here and in the active progress ledger. Existing safe unavailable states and preserved records remain in place.

- **Engineering acceptance: original offline update revision.** Legacy queued updates record device enqueue time, not the server revision originally seen by the form. Replay now refuses unreadable conflict state and compares the replay snapshot atomically, but that alone cannot establish an older edit baseline under clock skew. Capture authoritative observed revisions across supported edit paths and define recoverable review for ambiguous legacy updates; do not infer that baseline from a later read or a device timestamp.

## 18. Crew timesheet: overtime and hourly pay (20 October 2026) — open

The Crew timesheet page now reads recorded call/wrap times from `crew_shoot_days` (RULINGS-2026-10-20). It keeps two figures from the old standalone, both unruled, in one constant (`STANDARD_DAY_HOURS = 8` in `src/lib/queries/timesheet.ts`, `TODO(decision)`):
- **The overtime threshold** — hours in a day past which the page flags overtime. `crew_shoot_days.overtime_approved_by` exists, so overtime is a real concept; its threshold has never been ruled.
- **How a day rate becomes an hourly figure** — the page estimates pay as hours × day rate ÷ 8. Crew payouts on Crew Assist are days booked × day rate. Is crew pay by the day or by the hour, and does overtime pay differently? Until ruled, the page labels its figure "Estimated pay" and says so on screen.


## 19. Premium recovery: equipment navigation conflict (23 October 2026)

**TODO(decision / reconciliation):** the supplied recovery brief explicitly requires seven section anchors, without a five-step wizard. The newer local EquipmentRecordEditor retains seven anchors and also renders an optional five-stage mode. Babin has been asked which direction should govern this newer code; no response or reversal is inferred. Preserve existing data/write engines and record this acceptance conflict until reconciled. The all-Outfit theme is separately resolved by Babin’s explicit answer and is not pending.

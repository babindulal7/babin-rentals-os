# ASTRA Bug Register

Audit date: 18–19 October 2026 (Asia/Katmandu). Repository: https://github.com/babindulal7/babin-rentals-os. Baseline: latest accessible main, ad8ce1e4afc54cc88df841425d0e281bd15665bc, fetched 18 October and rechecked 19 October. All file references are relative to that immutable revision.

Audit only: no application fixes, merge, deployment, production database access or production mutations. Local SQL probes used disposable PGlite fixtures. Browser used a separate mock preview at 127.0.0.1:3026.

Severity: P0 immediate catastrophic exposure/outage; P1 launch-blocking security, financial or durable-work integrity; P2 functional/usability/release defect; P3 measured improvement. No P0 claim is made. “Reproduced locally” is not “present on production.”

| ID | Severity | Module | Finding |
|---|---|---|---|
| SEC-01 | P1 | Storage | Authenticated users can read and overwrite unrelated documents/evidence |
| SEC-02 | P1 | RPC / money visibility | Money-blind roles can call financial SECURITY DEFINER helpers |
| SEC-03 | P1 | Audit integrity | Authenticated Client can permanently forge an Owner audit event |
| SEC-04 | P1 | Staff administration | Admin can demote an existing Owner through direct users UPDATE |
| SEC-05 | P1 | Driver privacy | Driver without assigned trips reads unrelated booking/client directory rows |
| REL-01 | P1 | Offline sync | Outbox has no submitting-user scope and replays using the current session |
| REL-02 | P1 | Offline sync | Zero-row replay deletes pending work as if saved |
| UI-01 | P1 | Productions | Production packages are seeded and saved only in shared localStorage |
| UI-02 | P1 | Shift handover | Shift handover records are local-only and Recount Cash claims an action it does not open |
| UI-03 | P1 | Warranty | Warranty claims update local sample records; hidden monetary default remains writable |
| UI-04 | P2 | Shared Modal | Closing nested modal releases outer modal scroll lock |
| UI-05 | P2 | Finance responsive | Duplicate phone action row clips Record Payment |
| UI-06 | P2 | New Rental dates | One-day and two-day duration presets can both be selected |
| QA-01 | P2 | Release verification | main fails its own full test/coverage commands |
| QA-02 | P2 | Completion reporting | Generated completion summary reports stale green suite despite current failures |
| PERF-01 | P3 | Build footprint | Large initial app chunk warrants measured optimization |

## SEC-01 — P1 — Authenticated users can read and overwrite unrelated documents/evidence

- Module: Storage
- Source: supabase/migrations/0152_harden_storage_policies_revoke_anon.sql:24–39
- Evidence/reproduction: Effective SELECT/INSERT/UPDATE predicates only test bucket_id. An unmapped authenticated identity resolving to Client read one other-client object and renamed it. Probe explicitly supplied ordinary Storage table grants because the PGlite prelude does not implement hosted Storage.
- Root cause: Authentication is mistaken for document ownership/role authorization.
- Business impact: Client contracts, identity evidence and invoice files may be disclosed or corrupted by any authenticated account when hosted Storage grants match the normal setup. Live deployment was not queried.
- Recommended correction: Use booking/client/branch ownership predicates and explicit staff capabilities; immutable versioning for signed documents; deny portal writes. Validate path-to-record mapping on every operation.
- Regression: Client A cannot list/read/replace Client B objects; inactive/unmapped users denied; floor staff receive only required evidence. Test through Storage HTTP API in staging.
- Verification: REPRODUCED locally with stated Storage-grant simulation; hosted Storage NOT VERIFIED

## SEC-02 — P1 — Money-blind roles can call financial SECURITY DEFINER helpers

- Module: RPC / money visibility
- Source: supabase/migrations/0119_server_side_prices.sql:19–41; 0164_booking_discount_vat_payment_integrity.sql:55,940–941; 0150_rpc_security_and_mutation_closure.sql:561–565
- Evidence/reproduction: Client called get_model_daily_rate and received 4500. Warehouse and Client each called booking_estimate_total for a fixture booking and received 17097. Both helpers retain authenticated EXECUTE and lack caller money/booking authorization.
- Root cause: Internal privileged helpers remain exposed as authenticated RPC endpoints.
- Business impact: Restricted amounts bypass masked views and UI, including another client’s booking estimate.
- Recommended correction: Make internal helpers non-public/non-executable by API roles; retain trusted internal calls, or add exact role and ownership checks to a deliberately public wrapper.
- Regression: Enumerate every authenticated definer RPC for all nine roles, with own/foreign booking IDs; no financial scalar for money-blind roles.
- Verification: REPRODUCED against rebuilt effective migrations

## SEC-03 — P1 — Authenticated Client can permanently forge an Owner audit event

- Module: Audit integrity
- Source: supabase/migrations/0091_audit_events_refuse_anonymous_writes.sql:80–88
- Evidence/reproduction: audit_events INSERT is granted authenticated with WITH CHECK(true). Probe inserted a fabricated Owner actor_id/actor_role; privileged readback confirmed persistence.
- Root cause: Append-only protection prevents rewriting existing rows but does not establish authenticity of inserted actor/content.
- Business impact: Traceability can be poisoned with fictitious approvals/actions. This does not itself change booking custody, but undermines incident investigation.
- Recommended correction: Bind actor and role server-side; restrict direct client INSERT columns or replace with a narrow receipt RPC; classify untrusted client telemetry separately from authoritative audit.
- Regression: Forged actor/role/target payloads denied or server-replaced; server-authored stage/payment events remain valid and immutable.
- Verification: REPRODUCED against rebuilt effective migrations

## SEC-04 — P1 — Admin can demote an existing Owner through direct users UPDATE

- Module: Staff administration
- Source: supabase/migrations/0120_users_visibility_and_role_ceiling.sql:141–153,183–229; docs/PERMISSIONS.md:72
- Evidence/reproduction: Probe as seeded Admin changed a second Owner to Coordinator. Trigger only checks the NEW elevated role; last-Owner check allows it when another Owner exists.
- Root cause: Role ceiling protects assignment upward but not privileged OLD target accounts.
- Business impact: Deputy admin can alter an account above its authority; named UI/RPC restrictions are bypassed.
- Recommended correction: Restrict both old target and new role in database policies/trigger or revoke direct role-field writes and funnel through audited Owner action.
- Regression: Admin cannot demote/deactivate/change another Owner/Admin; Owner can perform allowed correction with audit; last/self-owner rules remain.
- Verification: REPRODUCED against rebuilt effective migrations

## SEC-05 — P1 — Driver without assigned trips reads unrelated booking/client directory rows

- Module: Driver privacy
- Source: supabase/migrations/0110_client_own_rows_rls.sql:54–68; docs/PERMISSIONS.md:78,161–164
- Evidence/reproduction: Effective clients_select/bookings_select use auth_is_staff OR own-client. Probe Driver with zero assigned jobs read 125 bookings and 40 clients, including name/phone. No actual client records were queried; fixture counts only.
- Root cause: Broad staff predicate includes Driver despite trip-only permission matrix.
- Business impact: Unnecessary client contact and operational data exposure through direct API.
- Recommended correction: Separate driver SELECT policy through assigned open delivery jobs; remove broader permissive policy for Driver; review views and related joins.
- Regression: Driver with no jobs gets no directory rows; assigned job grants only required receiver fields; completed/reassigned jobs revoke access.
- Verification: REPRODUCED against rebuilt effective migrations

## REL-01 — P1 — Outbox has no submitting-user scope and replays using the current session

- Module: Offline sync
- Source: src/lib/offlineQueue.ts:5–17,122–156,267–280,343–377; src/lib/devicePurge.ts:33–50
- Evidence/reproduction: QueuedMutation has no actor/user/project field. Logout explicitly preserves outbox. drainQueue selects every pending mutation and uses singleton supabase. A second signed-in operator therefore supplies the replay credentials.
- Root cause: Durable pending work is global to the browser origin rather than identity-bound.
- Business impact: Misattributed writes, unauthorized replay attempts and cross-shift loss of accountability; RLS still limits current credentials.
- Recommended correction: Persist actor/project/branch context, drain only matching authenticated identity, quarantine mismatches and show pending-work handoff explicitly.
- Regression: Queue under A, sign out, sign in B, reconnect: B must not execute A’s mutation. Exercise restart/multi-tab and revoked roles.
- Verification: SOURCE-CONFIRMED dataflow; multi-user browser replay NOT VERIFIED

## REL-02 — P1 — Zero-row replay deletes pending work as if saved

- Module: Offline sync
- Source: src/lib/offlineQueue.ts:355–369; audit-offline-repro.cjs
- Evidence/reproduction: Executed exact transpiled drainQueue with a controlled database response: UPDATE returned error:null,count:0, and mutation was deleted. A missing or RLS-invisible target can produce that result.
- Root cause: Replay tests only error, not affected row or authoritative receipt.
- Business impact: Offline changes can disappear permanently while no server row changed.
- Recommended correction: Require server receipt/affected-row assertion and preserve failed/conflicted queue entries; conflict resolution must follow same rule.
- Regression: RLS-filtered/missing row, deleted authorization, and zero-row update leave visible pending/refused work; true idempotent success resolves once.
- Verification: REPRODUCED with actual function and controlled API response

## UI-01 — P1 — Production packages are seeded and saved only in shared localStorage

- Module: Productions
- Source: src/lib/queries/productions.ts:38–42,146–184; src/App.tsx:199–207
- Evidence/reproduction: getProductions falls back to six fictional packages without IS_MOCK gate; writes use br.productions localStorage. Browser displayed six packages in otherwise empty mock corpus. No backend action/RLS/audit persistence in this query module.
- Root cause: Standalone demo model is shipped as an active operational module.
- Business impact: Production work does not synchronize or reliably link to actual bookings; local budgets/notes persist across device users.
- Recommended correction: Implement canonical production/booking relationships with authorization and server persistence or clearly withhold unsupported creation until implemented. Do not manufacture completed workflows.
- Regression: Fresh live-mode empty database remains empty; create on device A appears on B; unauthorized mutations denied; linked booking opens correct record.
- Verification: SOURCE-CONFIRMED live-mode path; mock browser corroboration

## UI-02 — P1 — Shift handover records are local-only and Recount Cash claims an action it does not open

- Module: Shift handover
- Source: src/lib/queries/shiftHandover.ts:46–117; src/modules/today/ShiftHandoverPanel.tsx:154–169
- Evidence/reproduction: Seeded/localStorage records feed Today. Completion toast invents a 14:0x timestamp using Math.random. Recount handler only emits a success toast.
- Root cause: Demo interaction is presented as a recorded operational handoff.
- Business impact: Staff may believe shift/cash reconciliation is recorded without shared durable evidence.
- Recommended correction: Use persisted shift records and actual timestamps; connect recount to an actual authorized reconciliation flow, otherwise visibly unavailable.
- Regression: Two-user handoff visibility, exact completion timestamp, recount opens form and commits validated count or shows refusal.
- Verification: SOURCE-CONFIRMED; Today panel rendered in mock browser

## UI-03 — P1 — Warranty claims update local sample records; hidden monetary default remains writable

- Module: Warranty
- Source: src/lib/queries/warranty.ts:32–99; src/modules/inventory/WarrantyTracker.tsx:49–87
- Evidence/reproduction: Unconditionally seeded/localStorage warranty data. claimAmount defaults to10000; handleRecordClaim changes local data with Number(...) and success toast. Money visibility hides presentation rather than authorizing write.
- Root cause: No server claim transaction or capability boundary; money-blind UI still has a monetary write handler.
- Business impact: Claim/recovery figures are not authoritative and can be changed without appropriate financial authorization.
- Recommended correction: Persist claims with named audited capability and paisa validation; deny money write for money-blind actors; scope storage to authenticated records.
- Regression: Warehouse cannot submit hidden amount; Accounts/Manager valid claim persists across devices; invalid/negative input refused.
- Verification: SOURCE-CONFIRMED; Owner mock browser rendered claim affordance

## UI-04 — P2 — Closing nested modal releases outer modal scroll lock

- Module: Shared Modal
- Source: src/components/ui/Modal.tsx:33–37,138–148; audit-evidence/modal-lock.test.tsx:18
- Evidence/reproduction: Audit component test opens outer with dormant inner, opens then closes inner. Expected body overflow hidden; observed empty string.
- Root cause: Closed effect cleanup decrements count even when its symbol never owned a lock.
- Business impact: Background scroll moves behind active form, especially disruptive on phone/tablet.
- Recommended correction: Only decrement when that modal owns a lock; balance lifecycle and StrictMode cleanup.
- Regression: Dormant nested modal open/close; multiple closed siblings; unstable callbacks; StrictMode; retain focus and Escape behavior.
- Verification: REPRODUCED in jsdom against shipped Modal; visual gesture test pending

## UI-05 — P2 — Duplicate phone action row clips Record Payment

- Module: Finance responsive
- Source: src/modules/finance/Finance.tsx (ModuleSubHeader secondaryActions/primaryAction); audit-evidence/finance-375.png
- Evidence/reproduction: At375px Owner Finance renders Export/Create Invoice/+ Record Payment despite header More/Payment. Payment bounds left244.93 right390.93 >375. Existing Finance.restricted test fails same policy. Tablet screenshot also shows duplicate header/body action hierarchy.
- Root cause: New ModuleSubHeader actions bypass phone collapse rules already applied to PageHeader.
- Business impact: Primary payment action is partly clipped and duplicated; inconsistent placement across modules.
- Recommended correction: Give comparable actions a single responsive owner; move secondary actions into accessible overflow on phone and preserve44px targets.
- Regression: 375/430px real browser visibility, keyboard overflow menu, one primary action; update no test to merely accept clipped UI.
- Verification: VISUALLY AND DOM-MEASUREMENT VERIFIED in mock browser

## UI-06 — P2 — One-day and two-day duration presets can both be selected

- Module: New Rental dates
- Source: src/modules/rentals/booking/DatePresets.tsx:85–91
- Evidence/reproduction: Default out Oct19 09:00 / return Oct20 18:00 yields two operational days. aria-pressed is true for both1day and2days because date equality OR computed day equality activate separate presets. Browser AX confirms both checked.
- Root cause: Calendar-offset preset duration and billable operational duration use different definitions.
- Business impact: Booking duration controls mislead operator about billed days.
- Recommended correction: Make preset labels/target timestamps match one explicit rental-duration meaning and derive one selected value.
- Regression: Default09:00→next18:00, exact06:00 boundaries, select1/2/3days and assert one active preset plus correct total.
- Verification: BROWSER AX + SOURCE VERIFIED

## QA-01 — P2 — main fails its own full test/coverage commands

- Module: Release verification
- Source: audit-test.log; audit-test-coverage.log; .github/workflows/ci.yml
- Evidence/reproduction: Both executions:365 files pass,5fail;4670 tests pass,8fail. Typecheck/lint pass. Detailed classification in full report.
- Root cause: Mixed product regression and test/contract drift.
- Business impact: CI release gate is not green; passing migration/lifecycle tests do not negate failed UI/capability checks.
- Recommended correction: Correct real regression first; fix missing Router/mock initialization fixtures; resolve orphan capability registration deliberately.
- Regression: Run unchanged full command after authorized corrections; preserve negative permission coverage.
- Verification: EXECUTED twice: ordinary tests and coverage

## QA-02 — P2 — Generated completion summary reports stale green suite despite current failures

- Module: Completion reporting
- Source: scripts/completion.mjs; audit-completion.log; .test-result.json
- Evidence/reproduction: npm run completion reports4646/4646 datedOct16 and approx99%; this run has4670/4678 and8fail. It counts declarations/selected modules, omitting reproduced local-only/report failures.
- Root cause: Persisted old test receipt plus narrow structural completion denominator.
- Business impact: Owner may interpret generated percentage as current functional/production readiness.
- Recommended correction: Bind receipts to commit+command+timestamp, invalidate stale receipts and distinguish structural coverage from accepted business scenarios.
- Regression: Run failing suite and ensure completion cannot display old green as current; measured denominator includes all agreed workflows.
- Verification: EXECUTED output mismatch; not a hand-estimated completion percentage

## PERF-01 — P3 — Large initial app chunk warrants measured optimization

- Module: Build footprint
- Source: audit-build-live.log; vite.config.ts build.manualChunks
- Evidence/reproduction: Live-default build reports main about699.79kB minified/198.53kB gzip and scanner453.49kB/117.44kB gzip; bundler warns >500kB. No real device latency benchmark was run.
- Root cause: Shared entry dependencies and pre-cache scope need profiling; size alone does not prove a slow interaction.
- Business impact: Potential startup/download cost on warehouse phones and unreliable networks.
- Recommended correction: Measure cold start and route transitions before choosing lazy imports, chart/scanner splitting or cache changes.
- Regression: Agree budgets, e.g. p75 interactive route<2s and ordinary control response<200ms on representative low-end phone; record network/device and production bundle.
- Verification: BUILD-MEASURED; user latency NOT VERIFIED

## Workflow findings WF-01 through WF-07

### WF-01 — P1: Sales/VAT reports turn schema errors and empty periods into fabricated financial statements

Evidence: `src/lib/queries/salesVatReports.ts:167` selects `tax_amount`, :168 `grand_total`, :172 `clients.pan_number`. Actual invoice columns are `vat_amount`, `total_amount` (`supabase/migrations/0006_finance.sql:93-94`), and clients has `pan_vat` (`0005_clients.sql:47`). Later migration search finds no aliases adding these requested fields. The query's error/empty handler at :183-184 returns MOCK_SALES/MOCK_VAT; catch :296 repeats it. Even a hypothetical successful row read returns fixed historical monthlyTrend at :276 and monthlySchedule at :290. No data-source-mode guard.

Reachability: App.tsx:654-666 routes /reports/sales and /reports/vat-tax to SalesVatReports; page calls query at SalesVatReports.tsx:59 and labels total as invoices issued in period at :78-79. Reproduction: authorized report reader opens a period with zero invoices, or current schema rejects select; actual query returns 42 invoices and Rs54,52,250 instead of error/empty. Isolated executed case asserts same with a schema-error response and future-period filter.

Root: copied display/demo schema and unconditional fallback. Impact: invented sales/tax/export data presented as business records. Correction: use sanctioned columns/joins and explicit empty/error states; derive all series from scoped issued nonvoid invoices; use reportRevenueTrend's fail-closed pagination model where applicable. Regression: real-schema select check, empty/error cases, mixed issued/draft/void invoices, zero VAT, date filters, >1000 rows, no demo names/values in live output.

### WF-02 — P1: Rental report monetary conversion understates equipment revenue by 100x

Evidence: `src/lib/queries/rentalReports.ts:245` computes qty*days*rate-discount in source DB rupees (`0002_bookings.sql:136-137`). It then divides by100 before `rupees()` at :276, :288, :295, :306-307. Same mistake appears cancellation lost revenue :482/:495/:502. One Rs1000 line becomes 1000 paisa (=Rs10), not100000 paisa. Executed actual function with one Closed booking confirms totalRevenue=1000.

Reachability /reports/rentals, App.tsx:627-630; RentalReports.tsx:67 calls getRentalPerformanceReport. Root: confused rupee/paisa boundary. Impact: booking value, revenue/average, charts, export and loss reporting drastically understated. Correction: normalize source money once to paisa, use shared pricing/revenue semantics, remove extra /100. Regression: Rs1000, fractional rupees, multiple lines/days, voided lines, crew/transport and discount inclusion according to the chosen metric definition.

### WF-03 — P1: Rental lifecycle reports use nonexistent statuses and fabricate cancellations

Evidence: `rentalReports.ts:235-236` counts Completed/Returned and Cancelled, ignoring Closed and cancelled_at. Current enum `0001_enums.sql:252` has Quote/Booked/Packed/On Rent/Returned/Closed; cancellation is flag (`0002_bookings.sql:39-41`). Query does not project cancelled_at (:192-202), so a cancelled Packed booking remains counted active/revenue. `getCancellationsReport` :434 queries stage='Cancelled', and ignores query errors before returning fake eight cancellations at :441. Numerator query :420-434 additionally has no date/branch filters unlike denominator :414-416.

Executed: Closed fixture returns completedRentals=0; simulated enum error returns totalCancellations=8. Correction: use central stage/facts and cancellation flag, same explicit reporting scope on numerator/denominator, fail closed. Regression: Closed/Returned/cancelled Packed, no cancellations, invalid backend response, filters where one cancelled booking lies outside selected branch/date.

### WF-04 — P1: Operational and maintenance reports mix fabricated metrics with real rows

Evidence: `operationReports.ts:327-341` replaces real zero counts/empty lists with MOCK_OPERATIONS; :328 hardcodes onTimePickupRate93.5, :330 return88.1, :333 packing98.2; :323 defaults identity verification to95.7. Query errors are not surfaced (:186-192). `damageMaintenanceReports.ts:459-474` replaces true zero cost/counts and empty incidents with mocks, always uses mock sidelined units. Routes are active App.tsx:635-648.

Repro by source: select a period with real booking but zero completed pickups/returns; report output retains fixed success rates and fictitious movement list. No production-mode guard exists. Impact: false performance/compliance assessment and nonexistent overdue/repair work. Correction: calculate sourced rates with named denominators, zero/unknown distinction, per-query errors, and consistent scope; remove synthetic fallbacks. Regression: real bookings but no sessions, no overdue returns, zero-cost repair, error in one source, filtered period, CSV equals underlying scoped facts. Static verified; not driven in browser.

### WF-05 — P1: Asset ROI reports invented revenue/utilization as invoiced financial performance

Evidence: `src/lib/queries/assetRoi.ts:170` substitutes Rs500000 for missing/zero purchase price; :172 assumes maintenance5%; :179-181 derives lifetime revenue from purchase price times1.6/0.6 chosen by cycling demo rows; :199 assigns demo utilization. Empty/error returns DEFAULT_FLEET_ROWS (:157,:206). No invoices are queried. Page labels it Lifetime Rental Revenue (:193-194), exports Total Invoiced Revenue (:100), and uses it in net-return calculations.

Repro: any live unit with purchase price but no invoices produces positive invented lifetime revenue; row ordering can change assigned multiplier/utilization. Root: estimate/demo algorithm presented as actual. Impact: unreliable investment/replacement decisions. Correction: derive attributed invoice revenue/maintenance facts, or display unavailability explicitly pending a ruled attribution model; do not invent capital costs. Regression: unit with zero invoices =>zero known revenue, missing acquisition price=>unknown ROI, reordered units stable, invoice credit/void/reversal coverage. Source verified; no financial records changed.

### WF-06 — P2: Availability preflight silently accepts server-truncated holds/candidate datasets

Evidence: `src/lib/queries/availability.ts:389-415` candidates, :487-520 serial holds, :539-581 quantity holds perform one read without count/range pagination or truncation check. `readHolds` reads ALL active asset holds, not just requested product/window. New rental plans and collision checks consume this incomplete array (:884 onward, :1002 onward). A standard capped PostgREST result with >cap active holds may omit the conflicting hold; no incomplete marker is returned. Quantity previews may overstate free stock, candidate cap may understate it.

Correction: filter relevant product/window and page with stable unique ordering/count assurance, or scoped server function. Regression: cap+1 holds with only final hold conflicting, >cap candidate units, network failure on second page. Impact is misleading availability/late refusal; not a demonstrated committed double booking. Database GiST/capacity enforcement remains a separate protection. Source verified, capped PostgREST runtime not executed.

### WF-07 — P2: Today quick filters advance to the next operational shift at civil midnight

Evidence: `Today.tsx:405` gets civil businessDayAd; bs.ts:452-453 means Kathmandu calendar date. At05:30NPT Oct19 this is Oct19, while operationalDayOf(...,360) is Oct18 (executed). Today.tsx:84-96 passes civil day to todaysOutgoing and deliberately removes lower bound; return filter :102-105 similarly uses civil-day upper bound. Consequently Today includes unfulfilled bookings through Oct20 05:59, a shift ahead, between00:00–05:59NPT. Carry-over prevents old pickups disappearing, so the defect is next-shift inclusion, not lost carry-over. Tomorrow similarly means Oct20 rather than next operational shift Oct19.

Correction: derive floor quick-day anchor from operationalDayOf with configured start; retain civil date in date picker headings/finance. Regression: frozen clock05:59:59/06:00NPT, current/next-shift bookings, custom date still literal selected date, carry-over retained. Source plus exact clock-engine reproduction, browser not executed.


## WF-08 — Additional report families fabricate results for empty datasets

**P1 · Reporting · REPRODUCED with actual query modules and controlled empty responses.**

Sources: src/lib/queries/staffReports.ts:17–43; clientReports.ts:65–90; productReports.ts:55–76; promotionsReports.ts:40–80. Evidence: audit-report-family-repro.cjs and audit-report-family-repro.log.

An empty staff database produced 3 staff; empty clients produced 1,248 total and 436 active; empty products produced 5 products; empty promotions produced 842 redemptions. These query adapters use fixed imported collections/metrics or replace real zero counts with sample values. Staff also queries name/role and audit user_id fields that need reconciliation with the actual view contract. Activity reporting separately substitutes mock activity for no audit rows (activityReports.ts:111–153, source inspection only).

Impact: operators can act on nonexistent staff activity, clients, inventory performance and campaign results. No production dataset was queried.

Correction: remove implicit fallback fixtures from live adapters; preserve real zero, loading and failure states; calculate metrics from authorized scoped records. Keep explicit mock-mode fixtures separate.

Regression: empty success must remain zero/empty; denied/network/schema errors must remain unavailable; known real records and exports must reconcile with independently calculated expected totals. Include all four report families, date filters and role restrictions.

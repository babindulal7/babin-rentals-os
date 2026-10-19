# Workflow and business-engine audit notes

Baseline: main ad8ce1e4, isolated checkout C:/Users/use/Desktop/babin-astra-audit-2026-10-18. Audit performed 18–19 October 2026 NPT. No application source or live data changed. Parent owns full gates and final report. Findings below distinguish executed isolated reproductions from source inspection; none implies live production verification.

## Executed evidence

`node audit-workflow-repro.cjs` transpiles the actual source with TypeScript, uses controlled Supabase responses, and asserts behavior. It performs no network/database writes. Output:

- PASS controls: 06:00 NPT half-open rental days and advance 5000/5001/10000/12000 boundaries.
- VERIFIED: dashboard civil today at 05:30 NPT=2026-10-19 while operational shift=2026-10-18.
- VERIFIED: sales error -> 42 invented invoices; total paisa 545225000.
- VERIFIED: Closed booking Rs1000 -> report paisa 1000 (Rs10), completedRentals 0.
- VERIFIED: invalid cancellation enum/error -> 8 invented cancellations.

This is a deterministic query/engine reproduction, not a browser or real-JWT test. Schema incompatibilities additionally verified against current migration definitions and searching later migrations.

## Findings

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

## Assessed inventory and positive controls

- Governance: 00_READ_FIRST, CLAUDE, PERMISSIONS opening laws/current capability context, PRODUCT_RULES, CURRENT_STATE notice, Oct16 ruling. Historical comments were not treated as runtime truth.
- Rental period: actual rentalDaysBetween uses hardcoded06:00NPT shift and exclusive end-minus1ms; executed exact06:00->06:00=1 and20:00->08:00=2. Huge stale header still describes elapsed rounding, but implementation inspected. Invalid/missing range returns null.
- Advance: calculateAdvanceRequired <=Rs5000 full, <=Rs10000 Rs5000, above50%; executed boundaries. This confirms the engine, not server-wide enforcement/payment override semantics.
- Today: active query uses listBookings and events; old kpiEngine exports have no active call sites found, so its UTC-date algorithms were NOT reported as live KPI defects. Static demo constants in data/today alone likewise not treated as proof of runtime fabricated dashboard cards.
- Calendar: active listCalendarBookings uses operational bounds, explicit money-free projection, exact count and1000 cap; stage mapping includes Quotes and Completed despite stale comments claiming omission. It intentionally includes return day as a calendar cell, separate from reservation half-open arithmetic. Did not report this intentional display choice as stock overlap bug.
- Availability: readCandidates/readHolds/readQuantityHolds, creation assignment, collision preflight and hold readback reviewed. Missing pagination recorded; database commitment integrity left to parent's real Postgres/lifecycle gate and security audit.
- Custody: bookingTransition.ts:124 explicitly queueOnFailure:false; floorVerb.ts:2237-2255 rereads authoritative stage and refuses mismatch. This is source evidence of fail-closed intent; offline/concurrent multi-device operational UI not exercised here.
- Finance: canonical finance queries documented actual money columns/rupee boundary; reportRevenueTrend uses ordered pagination, cap failure and throws on failed/null sources, reconciles credit notes separately. This good reader does NOT fix separate Sales/VAT and Asset ROI queries.
- Reports inspected in depth: SalesVat, Rental performance/cancellations, Operations, Damage/Maintenance, Asset ROI and RevenueTrend. Other report families were enumerated via files but not certified.

## Unverified / not certified

Browser desktop/phone workflows, scanner/camera/peripheral permissions, actual authenticated PostgREST queries, live RLS per role, stage reversal/archive concurrent writers, payment/deposit end-to-end, every report family, invoices/export rendering and complete calendar interaction. Parent owns full gates; no full-suite duplication here. No live migration, financial write, booking transition or fixes performed.

## Completion

Assigned audit findings and scoped reproducible evidence completed. No product-completion percentage measured by this subtask.

## Remaining

Parent should merge and deduplicate findings, correlate schema mismatch with security/database audit, include gate outcomes, and explicitly retain the browser/live-production limitations. These findings are correction recommendations only; fixes require the next authorized implementation phase.

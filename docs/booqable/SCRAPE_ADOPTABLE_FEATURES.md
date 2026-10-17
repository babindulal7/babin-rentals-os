# Adoptable functions & features — Booqable scrape → Babin Rentals OS

**Source**: `C:\Users\use\Desktop\scrape` (Booqable audit, 56 files, ~400 finding IDs, sessions 2026-09-29 → 2026-10-06; trial `pukulu.booqable.com` + production `babin-rentals.booqable.com` read-only).
**Companion**: `docs/booqable/ADOPTIONS.md` (earlier 7 Sep adoption shortlist) — this file is the **expanded** feature/function catalogue from the full audit.
**Contract**: behavior only. No Booqable palette, typeface, spacing, logo, or copy. Babin locked rules (6-stage workflow, 4-step wizard, single 5-state list, officer Pickups/Returns only, 4-op global control, 06:00 day, color = state) honored throughout.

---

## TL;DR

The scrape is a **behavioral reference for a rental-management product**. What is worth taking is not Booqable's look but its **mechanics**: Draft-vs-Reserved commit semantics, per-line partial pickup/return, bundle feasibility, buffers/downtime as availability inputs, versioned documents + append-only ledger, shareable filter URLs, sequential date enforcement, inline availability pills, scanner-deselects-by-default, and a 4-op global control. What Booqable **cannot** supply (and where Babin must go further) is saved views, operation-level authorization, and a money/ops audit trail — these are net-new systems with no precedent in the reference product.

---

## 1. P0 — must adopt (rental truth + daily ops + accountability)

### 1.1 Rental state machine + single list (BQ-001, BQ-102, BQ-101, BQ-105, BQ-106)
- **Function**: 5-state single list (Draft / Upcoming / Out / Returned / Closed) with color chips; canonical URL `GET /rentals`; pagination reset; empty states; metrics reflect filtered set (count/units/revenue/outstanding).
- **Take**: state collapse mapping (Reserved→Upcoming, Started/out incl. partial→Out, Stopped/returned incl. partial→Returned, archived/closed→Closed, Canceled as terminal flag inside Closed); Mixed shown as source-state color + "Partial" suffix, never a new color.
- **Status in our app**: rentals module exists; verify state mapping + URL serialization + metrics-on-filter.

### 1.2 Create vs Prepare commit (BQ-002, BQ-304, BQ-401)
- **Function**: `/orders/new` saves as Draft (no allocation) or Reserved (blocks stock); docs stress explaining inventory effect before commit.
- **Take**: In New Rental step 4 offer two explicit commits — "Save Draft (= Create, no stock blocked)" and "Confirm Reservation (= Prepare, atomic availability check)" — with a consequence line under each. Failed Prepare stays Draft with per-line shortage causes.
- **Atomicity**: `create_booking(jsonb)` already exists (booking + lines + crew + transport, no partials, R-43). Ensure Prepare uses it.

### 1.3 4-step New Rental wizard with back-preserved data (BQ-005, BQ-301, BQ-201, BQ-604)
- **Function**: Booqable single long form; Babin locked 4 steps (Client&Dates → Equipment&Bundles → Price&Payment → Review&Confirm) with step state surviving backward navigation.
- **Take**: sequential date enforcement (End disabled until Start valid); Step 2 disables Confirm until availability simulation passes; Step 3 shows provisional quote trace before commit.

### 1.4 Availability simulation + inline pills (BQ-302, BQ-304, BQ-401, BQ-AVL-001)
- **Function**: period-scoped availability, buffers, downtime, bundles, shortage guard, location; inline availability pills at line entry.
- **Take**: `capacityFor` already in `lib/availability.ts`; add Step 2 inline pills + atomic Prepare with per-line shortage causes + calendar check link.

### 1.5 Global control (BQ-202, BQ-305–BQ-308, BQ-310)
- **Function**: Packing, Handover, Return&Inspection, Cleaning&Reset — 4 global operations invoked from one global control, not scattered detail buttons; focused commit modals with consequence preview + idempotency; state-gated actions disabled-with-reason.
- **Take**: deep links (list row, dashboard card, calendar block) route all writes through global control; detail pages show state-gated "Open in operations" button; payment warn-not-block (BQ-306 vs untested Booqable enforcement).
- **Our app**: operations module exists; verify all 4 ops centralized + idempotent + audited.

### 1.6 Inspect&Reset + Close with condition routing + document freeze (BQ-308, BQ-207)
- **Function**: Receive first, condition second; damaged/lost via fee + downtime, never blocked receipt; sale/service don't block archive.
- **Take**: per-item condition routing to Cleaning&Reset/downtime + fee line; document freeze on Close.

### 1.7 Officer dashboard Pickups/Returns Today (BQ-003, BQ-205)
- **Function**: Booqable dashboard shows Going out/Coming back/Today/View late/View all + notes rail + fulfillment link.
- **Take (deliberate difference)**: officer dashboard = two cards only (Pickups = today's Handovers, Returns = today's Receives, 06:00-day basis). Each row links into global control. No revenue/charts/notes rail on officer view. Manager view may add metrics.
- **Must ship as built-in saved views** (see §3).

### 1.8 Search-on-Enter + active chips + base metrics (BQ-105, BQ-106)
- **Function**: search commits on Enter with scored sort + explicit empty state; clearing restores sort; metrics reflect filtered set.
- **Take**: header search on Enter, scored sort, clears restore; metrics per filter.

### 1.9 06:00 rental-day boundary (BQ-006)
- **Function**: Booqable has `orders.start_fixed_at`/`stop_fixed_at`/`use_times` — but they are **order defaults**, not a calendar boundary engine (confirmed: "Default order times" heading). Calendar "Next week" preset rendered `00:00–23:59` regardless.
- **Take**: BQ-006 is a **build**, not config. One canonical cut value (default 06:00, per-location overridable) read by four surfaces: availability intervals, dashboard "Today", overdue detection, calendar day columns. Plus in-UI statement of the rule ("Day runs 06:00→06:00").

### 1.10 Saved views + URL-serialisable filters (BQ-VIEW-01/02) — NET-NEW
- **Function**: Booqable has **no saved views at all** (confirmed absent twice). Filter state does reach URL (`filters[statuses][]`, `filters[payment_statuses][]`) and survives reload — so serialisation exists, named views don't.
- **Take**: every filter serialises to URL; named per-user views storing filter+sort+columns together; built-in non-deletable system views (Pickups today, Returns today, Overdue, Awaiting inspection, Drafts); views respect RBAC; facet-with-counts.
- **Our app gap**: implement named saved views on top of URL-serialisable filters.

### 1.11 Permissions — named roles + per-op grants + location scoping (BQ-PERM-01–08, BQ-PRM-007–016) — ADAPT, NOT COPY
- **What Booqable has**: 13 flat boolean grants per employee (`products`, `settings`, `security_settings`, `account`, `reports`, `exports`, `activity_logs`, `ai_assistant`, `override_rental_period`, `revert_orders`, `cancel_orders`, `delete_invoices`, `make_invoice_revisions`); no named roles/presets; no grant covers any operational action; no location scoping; 4 destructive grants without help text; IP allowlist exempts owner.
- **Where it runs out**: cannot express "an officer who only does today's handovers"; onboarding is 13 ticks against an all-unchecked slate; identical duties can silently diverge.
- **Take**: 4 first-class roles (Officer / Supervisor / Manager / Admin-Owner) with permission sets; **one grant per global op** (`op.packing`, `op.handover`, `op.return_inspection`, `op.cleaning_reset`) checked server-side per request; every grant location-scoped; help text required on destructive grants; field-level PII redaction by role; owner not exempt from policy; permission changes audited; denial names the missing permission; separate Authentication vs Authorisation UI sections.
- **Our app**: `docs/PERMISSIONS.md` + `src/lib/rbac.ts` — extend to operation-level grants + location scoping + named roles.

### 1.12 Audit trail — money + 4 ops + auth + docs + PII (BQ-AUD-01–06) — EXTEND
- **What Booqable has**: 87 entries / 36 keys; granular inventory verbs; per-record activity log routes (`/orders/:logOwnerId/activity_logs`, `/customers/:logOwnerId/activity_logs`); per-entry `support` flag.
- **Four blind spots**: no login/logout/failed_auth; **no payment/refund key**; no send_email/finalize_invoice/signature; no PII-read/export key. No reason field. Bare `employee_id` (no name).
- **Take**: append-only audit with 5 mandatory event classes (Authentication, Money, the 4 global ops, Documents, PII access); actor id + denormalised display name; namespaced action keys; entity + before/after diff; **required reason field** for adjustments/refunds/back-dated payments; tenant/location scoped; filterable by actor/entity/action class/date; exportable with the export itself audited; retention policy; reuse `support` flag for out-of-band human access.
- **Our app gap**: `src/actions/` writes need an audit writer shipped with the first mutation.

---

## 2. P1 — price, stock, and paper correctly

### 2.1 Quote trace + coupon predicates + versioned pricing snapshot (BQ-303, BQ-103, BQ-104)
- Per-line charge, discount, tax, deposit transparency in Step 3; coupon flow; tax toggle; deposit as liability (Law 5 already).
- **Our app**: pricing pipeline exists (`src/lib/pricingPipeline.ts`); add quote trace UI + versioned snapshot.

### 2.2 Payment ledger separate from state; deposit 6-state lifecycle (BQ-007, BQ-310, BQ-COL-03)
- Money and fulfillment are separate dimensions; payment due persists through archive; pro formas Rs.635 due Rs.0 paid.
- **Take**: mirror Booqable's 6-state deposit lifecycle (`held / paid / to_be_paid / refunded / to_refund`) rather than a single balance; append-only ledger with idempotent callbacks.
- **Our app**: payments module + finance module exist; verify deposit lifecycle + ledger.

### 2.3 Serial/bulk model + late assignment (BQ-401, BQ-404, BQ-406)
- Bulk = quantities, serial = specific units, assigned late; `TMP-`/dated stock guards; asset (cost/location/properties).
- **Take**: bulk vs tracked distinct models; late serial assignment; temp stock guards.

### 2.4 Bundle components expansion + min-feasibility (BQ-402, bundle-booking workflow)
- Bundle feasibility = limiting component; expand at packing; per-child attribution.
- **Take**: bundle feasibility engine + component expansion at packing.

### 2.5 Buffers/downtime editors + shortage override gating (BQ-403, BQ-506)
- Buffers + downtime as availability inputs; downtime as a calendar citizen (capacity-consuming schedule object); shortage override only where permitted + audited.
- **Take**: downtime consumes capacity exactly like a booking; shortage override gated + audited.

### 2.6 Versioned documents (BQ-310, BQ-109, documents module)
- Quote/contract/invoice/packing slip; cross-linked; immutable history; async PDF (presigned S3 URL); signature = canvas+pad, contracts/quotes only; state-gated docs; document freeze.
- **Take**: versioned documents + cross-links + async PDF generation + signature metadata + packing slip route (barcode+stock).

### 2.7 Extend/change-dates replan (BQ-309, extension workflow)
- Period edit → availability replan → price delta → doc regen; shortage on tail blocks with per-line cause; offer split (partial return) alternative.
- **Take**: "Extend" action (Upcoming/Out only) with availability simulation + price delta quote + confirm.

### 2.8 Calendar Week/Day product grid (BQ-501–BQ-503)
- Grid + blocks; Day/Week/Month controls; search; no drag/resize (verified absent — no DnD library, zero drag/resize identifiers in bundle); blocks carry `data-tid="Planning: {status}"`; calendar is view-and-filter only; iCal feed format (`{slug}.booqable.com/ics/{token}/orders.ics` + `webcal://`).
- **Take**: product-time + order-list views; Day agenda mobile; 06:00 grid; feasibility pills; calendar accessibility (focusable blocks, arrow-key nav, Enter opens rental, accessible name with date+item+state) — required whenever calendar ships.
- **Deliberate difference**: no drag at P0 (replan flow instead); any drag is greenfield risk with kill switch.

### 2.9 Catalog CSV import with mandatory dry-run (BQ-407, import-wizard)
- 7-question wizard + Verify screen; `.finished` mechanism + required `location` question (multi-location); dry-run preview; block commit on duplicate keys; reject invalid enums; accessible per-column mapping; on-hand counts excluded from import; customer import: 2 questions vs 7, empty-column drop trap, hung `Start import`.
- **Take**: import wizard with fully-rendered dry-run; surface parser's `errors`/`truncated`/`renamedHeaders`; accessible mapping; block commit on duplicates.

### 2.10 Export parity + PII segregation (BQ-COL-01–07)
- Export emits 111 columns while table shows 7 chosen in Columns panel — picker does not govern export; money triplicated (formatted/decimal/cents); deposit 6-state lifecycle; 7 customer-PII columns in same finance file; hardcoded `tax_vat_13`.
- **Take**: export honours visible column set; canonical money type = integer minor units (no triplication); PII in separate access-controlled export; tax data-driven not named column; export writes audit record.

### 2.11 User lifecycle UI (BQ-PERM-06)
- Invite, deactivate, offboard, reset-2FA, last-login, reassign open rentals; deactivated users stop consuming seats; owner's own row exposes no destructive buttons; ownership transfer irreversible (require typed confirmation + audit).
- **Take**: full user lifecycle management.

### 2.12 Remaining audit classes (BQ-AUD-01, BQ-AUD-03)
- Authentication events + document send/sign events.

---

## 3. P2 — warehouse performance

- Cleaning&Reset queue + repair downtime integration + lost-item fee flow (BQ-308, BQ-506).
- Shortage-for-period report + drill to rentals; utilization/ROI with visible formulas (BQ-408).
- Check-availability toolbar entry + Start-rental carryover (BQ-505).
- Overdue/shortage overlays + Late-only filters on list + calendar (BQ-504).
- Delivery method variant (Counter/Delivery) with address/rate; duplicate clears logistics (BQ-010).
- Mobile ops: full-screen checklists, scan-mode default, Day agenda (BQ-605, BQ-606); responsive cards/sheet/stepper (BQ-602–BQ-604).
- Column chooser persistence + reset; payment facet combinability hardening (BQ-107, BQ-103).
- Inventory availability-for-period pills (BQ-108).
- Calendar accessibility (BQ-CAL-06).
- Audit retention policy + self-referential export auditing.

---

## 4. P3 — defer until usage justifies

- OR filter groups and role-scoped facets beyond P0 baseline (BQ-110).
- Calendar drag/drop with simulation preview + explicit confirm — greenfield, no Booqable precedent; prototype with kill switch (BQ-503); iCal feeds; storefront live availability (BQ-507).
- Offline write queue; cross-tab sync; advanced keyboard map (BQ-607).
- Online-store/SEO/cross-sell tabs; customer accounts/payment-method storage.
- Coupons beyond basic predicates; background-task views; app-store integrations (all PARTIAL per PAGE-COMPLETENESS-MATRIX).

---

## 5. UX patterns to adopt (10)

1. Shareable filter URL + typed query (BQ-101) → canonical `GET /rentals` schema.
2. Search commits on Enter with scored sort + explicit empty state (BQ-105).
3. Metrics reflect filtered set (BQ-106).
4. Sequential date enforcement: End disabled until Start valid (BQ-301).
5. Inline availability pills at line entry (BQ-302).
6. Transparent quote trace: per-line charge, discount, tax, deposit (BQ-303).
7. Focused commit modals with consequence preview + idempotency (BQ-202).
8. State-gated actions, disabled-with-reason (BQ-203).
9. Scanner-led flow deselects by default (BQ-206) → Handover/Receive scan mode.
10. Detail side rail: tags/notes/activity + cross-linked documents/payments (BQ-310, BQ-109).

Plus Smart Intel Cards (BQ-209, BQ-608) — net-new Level-2 hover pattern Booqable lacks entirely (Booqable has zero rich hover cards; collapsed sidebar tooltips only). Desktop hover 300ms → floating card; mobile tap → bottom sheet. **Our app already has `components/smart-hover/` + `IntelCard`** — audit payload for money-blind roles (already in ADOPTIONS item 6).

---

## 6. Operational patterns to adopt (10)

1. Draft holds nothing; Prepare atomically holds all lines/components/buffers/downtime (BQ-002/BQ-304).
2. Money and fulfillment are separate dimensions (BQ-007).
3. Partial pickup/return per line with aggregate display (BQ-306/BQ-307).
4. Receive first, condition second; damaged/lost via fee + downtime, never blocked receipt (BQ-307/BQ-308).
5. Bundle feasibility = limiting component; expand at packing (BQ-402).
6. Bulk = quantities, serial = specific units, assigned late (BQ-401/BQ-406).
7. Buffers + downtime as availability inputs; shortage override only where permitted + audited (BQ-403).
8. Extension = availability replan + price delta + doc regen (BQ-309).
9. Delivery is a Handover method (address/rate variant), duplicate clears logistics (BQ-010).
10. Versioned documents + append-only ledger with idempotent callbacks (BQ-310).

---

## 7. Deliberate differences — do NOT copy

1. Multi-axis status tabs (Draft/Reserved/Started/Stopped/Archived/Canceled) → single 5-state list.
2. Single long booking form → 4-step wizard.
3. Notes-rail officer dashboard → Pickups/Returns only.
4. Scattered pickup/return buttons → 4-op global control.
5. Midnight/implicit day → 06:00 boundary.
6. Generic revert-to-state → named compensations with audit.
7. Bulk state jumps → bulk limited to print/export/pack-batch.
8. Calendar drag/reschedule → replan flow (Booqable ships no drag at all).
9. All-unchecked permission checklists → named roles.
10. Owner-exempt policy → owner subject to policy.
11. Booqable visual tokens → original Babin styling (color = state only).

---

## 8. Already in our app (cross-reference)

| Scrape feature | Our app module/lib | Gap |
|---|---|---|
| Rentals list + state | `src/modules/rentals`, `src/data/rentals.ts` | verify URL serialization + metrics-on-filter + counts |
| Calendar | `src/modules/calendar` | a11y + 06:00 grid + iCal? |
| Inventory / bundles | `src/modules/inventory`, `src/actions/inventory` | serial/bulk split, late assignment, downtime |
| Clients | `src/modules/clients` | merge, vCard, accounts, stored payments |
| Documents | `src/modules/documents`, `src/actions/documents` | versioning, async PDF, signature, packing slip |
| Finance/payments | `src/modules/finance`, `src/actions/payments`, `src/actions/finance` | ledger, deposit 6-state, export parity |
| Reports | `src/modules/reports` | shortage/utilization formulas, background tasks |
| Operations | `src/modules/operations` | 4-op global control, idempotency |
| Today dashboard | `src/modules/today` | Pickups/Returns only, saved views |
| Settings | `src/modules/settings` | labels config, security, plan delta |
| RBAC | `src/lib/rbac.ts`, `docs/PERMISSIONS.md` | named roles, per-op grants, location scoping |
| Money | `src/lib/money.ts` | integer paisa (already correct) |
| Availability | `src/lib/availability.ts` (`capacityFor`) | pills, buffers, downtime |
| Pricing | `src/lib/pricingPipeline.ts` | quote trace, versioned snapshot |
| Workflow | `src/lib/workflow.ts` | nextVerb, gate map |
| Smart hover | `src/components/smart-hover`, `IntelCard` | money-blind payload audit |
| Offline queue | `src/lib/offlineQueue.ts`, `dataAccess.ts` | client_uuid idempotency (already) |

---

## 9. Net-new systems with NO Booqable precedent (must design from scratch)

1. **Saved views** (P0-A) — genuinely absent in Booqable; build on URL-serialisable filters.
2. **Operation-level authorization** (P0-B) — Booqable's 13 grants are page/resource-scoped and cover no operational action; named roles + per-op grants + location scoping are new.
3. **Money/ops audit trail** (P0-C) — Booqable's log has no payment, send, auth, or PII event; audit money + 4 ops from the first mutation with required reason.
4. **Smart Intel Cards** (Level-2 hover) — Booqable has zero rich hover cards; our app already has the component, audit payloads.
5. **06:00 boundary engine** — Booqable's is order-defaults only; build canonical cut across 4 surfaces.

---

## 10. Adoption priority order (from implementation roadmap)

- **P0 (rental truth + daily ops + accountability)**: state machine + single list; wizard 1–4; availability simulation + atomic Prepare; global control; Inspect&Reset+Close; officer dashboard; search+chips+metrics; saved views + URL filters; named roles + per-op grants + location scoping; audit trail (money + 4 ops); release gates (concurrency, partial, bundle, boundary, idempotency, cross-role matrix, audit-completeness).
- **P1 (price/stock/paper)**: quote trace; payment ledger + deposit 6-state; serial/bulk; bundles; buffers/downtime; versioned docs; extend replan; calendar; import dry-run; export parity + PII segregation; user lifecycle; remaining audit classes.
- **P2 (warehouse)**: cleaning queue; shortage report; availability toolbar; overdue overlays; delivery variant; mobile ops; column chooser; calendar a11y; audit retention.
- **P3 (defer)**: OR filters; calendar drag (greenfield); offline; storefront; coupons; background tasks; app-store.

---

## 11. Key warnings / corrections from the audit

- **Five false claims were retracted** during the audit: permission model exists (13 grants); filter URL serialization works (hydration false negative); IP restrictions/SSO were captured; API keys ship as Authentication methods; labels accept arbitrary display text. Lesson: search the whole tree (and bundle) before asserting a gap.
- **Booqable's docs are a feature-discovery checklist to verify, never a specification to design from.**
- **`start_fixed_at`/`stop_fixed_at` are order defaults, not a boundary engine** — do not cost BQ-006 as configuration.
- **`labels.{start,stop,order,customer,contract,quote,packing_slip}` ARE configuration** — Babin's vocabulary win is bankable as configuration (7 free-text fields with "What do you call?" prompts).
- **Booqable ships no drag/resize at all** in the calendar — no reference to port; any drag is greenfield risk.
- **Owner is NOT exempt** from policy in Babin (Booqable exempts owner from IP allowlist — anti-pattern).
- **Export column count ≠ table column count** (7 vs 111) — fix parity + PII segregation.

---

## 12. Reference files in the scrape

- `BOOQABLE-AUDIT/INDEX.md` — file index + completeness
- `BOOQABLE-AUDIT/executive-summary.md` — 10 patterns ×3, P0–P3
- `BOOQABLE-AUDIT/recommendations/implementation-roadmap.md` — P0–P3 sequencing
- `BOOQABLE-AUDIT/recommendations/net-new-systems.md` — P0-A/B/C specs
- `BOOQABLE-AUDIT/recommendations/babin-gap-analysis.md` — BQ-001..BQ-011
- `BOOQABLE-AUDIT/recommendations/babin-rental-workflow.md`, `babin-inventory.md`, `babin-calendar.md`, `babin-responsive.md`, `babin-filter-recommendations.md`, `babin-quick-actions.md`
- `BOOQABLE-AUDIT/logic/*` — availability, inventory, order-state-machine, pricing, payment, permissions
- `BOOQABLE-AUDIT/systems/*` — filter, table, columns-and-views, status, form, modal, notification, responsive, search, quick-actions, hover, ai-assistant
- `BOOQABLE-AUDIT/pages/*` — dashboard, orders, order-detail, inventory, product-detail, customers, customer-detail, calendar, documents, reports, settings, payments, checkout, import-wizard, import-customers
- `BOOQABLE-AUDIT/workflows/*` — create-rental, reservation, pickup, return, extension, cancellation, payment, bundle-booking
- `BOOQABLE-AUDIT/evidence/docs-verification.md`, `control-inventory.md`, `data-model-and-route-dump.md`
- `DESIGN.md` — behavior-only design spec (color=state, 4-zone shell, 2-card officer dashboard, 4 global ops, 4-step wizard, status display)
- `APP_REVIEW.md` — production tenant walkthrough (superseded by audit for behavior)

---

*Generated from the Booqable scrape audit. Behavior-only; no third-party identity copied.*

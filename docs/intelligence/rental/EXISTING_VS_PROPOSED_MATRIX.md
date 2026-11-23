# Babin Rentals OS — Existing vs. Proposed Matrix
**Document ID:** RI-AUDIT-02  
**Date:** 2026-11-23  
**Auditor:** Windows Antigravity Engineering  
**Scope:** Functional and architectural comparison across all 11 unique Rental Intelligence concepts  
**Target Repository:** `babindulal7/babin-rentals-os`  

---

## 1. Architectural Foundation & Rules of Engagement

The Babin Rentals OS is a production-grade enterprise rental management system. In accordance with the Executive Directive (§0):
1. **No Shadow Authorities:** Rental Intelligence must not operate as a parallel ERP, secondary quote calculator, or alternate reservation engine.
2. **Read-Only / Advisory by Default:** All recommendations must be presented as non-binding staff advice subject to server-enforced booking, stock, pricing, financial, and custody gates.
3. **Integer Paisa Fidelity:** Money must never be represented or computed as JavaScript floating point numbers. All monetary outputs must comply with `src/lib/money.ts` and `src/lib/fieldGating.ts`.
4. **Role & Context Isolation:** Financial calculations and customer PII must be completely stripped from payloads delivered to money-blind roles (`Warehouse`, `Technician`, `Driver`) before rendering or serialization.
5. **Fail-Closed on Stale/Missing Data:** Stale availability or unverified specifications must produce `needs_verification` or `inconclusive`, never an assertion of "available" or "safe".

---

## 2. Comprehensive 11-Module Matrix

| ID | Module Name | Pri | Primary OS Location | Existing OS Status | Standalone External Status | Classification | Backend Authority | Integration Plan |
|---|---|---|---|---|---|---|---|---|
| **RI-01** | **Kit Recommender** | **P0** | Draft Rental / Equipment Picker (`src/modules/rentals/booking/`) | `oftenRentedWith` co-occurrence in `src/lib/intel/selectors.ts`; catalog lookup in `src/lib/inventory/`. | `scripts/kit_intelligence.py` has shoot blueprints & auto-completion triggers. | **Implemented & Verified in OS (RI-2)** | Real inventory DB (`products`, `units`) + availability queries. | Surface secondary "Recommend Kit" drawer in rental draft. Propose known IDs; evaluate live stock via `src/lib/availability.ts`. Add items via existing draft action. |
| **RI-02** | **Quote Engine / Price Explanation** | **P0** | Rental / Quote Detail (`src/modules/rentals/`) | `src/lib/pricingStructures.ts`, `src/lib/money.ts`, SQL RPCs for quote & invoice totals. | `QuoteEngineView.tsx` with floating-point `api.computeQuote()` stub; `os_engine.py` price rules. | **Implemented & Verified in OS (RI-3)** | Canonical OS pricing engine (`src/lib/pricingStructures.ts` + DB RPCs). | Do **not** port external `computeQuote`. Provide read-only "Why this price?" explanation drawer breaking down canonical rates, approved discounts, VAT, and deposit liabilities. |
| **RI-03** | **Morning Report** | P1 | Today / Operations (`src/modules/today/`, `src/modules/reports/`) | Today queue, shift handovers, stage action selectors in `src/lib/rentalActions.ts`. | `scripts/detect_profit_leakage.py` and daily ops script references. | **Existing OS Queue / External Logic Complementary** | Canonical booking and custody tables (`bookings`, `rental_items`, `shift_handovers`). | Embed compact "Operational Intelligence Observations" panel in Today view. Highlight overdue, damp returns, and missing accessories. Gated by user role. |
| **RI-04** | **Client Intelligence** | P1 | Client Detail (`src/modules/clients/`) | Client profile, KYC documents, booking history in `src/modules/clients/`. | `scripts/client_intelligence.py` with 3 persona tiers & 4-stage due recovery copy. | **Proposed Logic / External Exists** | Canonical client and financial records (`clients`, `payments`, `invoices`). | Add advisory "Client Behavior Insights" tab in Client view. Draft due recovery messages for staff review only; enforce strict PII gating via `src/lib/fieldGating.ts`. |
| **RI-05** | **Idle Stock Activation** | P1 | Inventory / Reports (`src/modules/inventory/`, `src/modules/reports/`) | `timeUtilization`, `dollarUtilization`, `idleDaysSince` in `src/lib/intel/selectors.ts`. `ForecastingReports.tsx` is empty/seed-protected. | `scripts/recommend_asset_action.py` (fleet profiles, buy/sell recommendations). External dashboard showed static NPR 2.29M. | **Existing Selectors Available / External Figure Rejected** | Canonical inventory and rental duration data. | Replace static NPR 2.29M placeholder with dynamic selectors over real data. If utilization data is unavailable, display `Unknown` rather than synthetic figures. |
| **RI-06** | **Monsoon Mode** | P2 | Operations / QC (`src/modules/operations/`) | QC reset and return workflow in `src/lib/rentalActions.ts`. | `scripts/monsoon_intelligence.py` with June 1 - Sept 30 calendar check and dry-cabinet rule. | **External Logic Ready / Low Complexity** | Warehouse staff physical inspection gates. | Add contextual seasonal advisory banner and dry-cabinet checklist reminder during active monsoon months. Never autonomously lock or alter unit status in DB. |
| **RI-07** | **Rental RAG Enhancement** | P1 | Contextual Intelligence / Search | Training Center knowledge fixtures in `src/lib/intelligence/` (PR #347). | 21 markdown SOPs and manuals in `references/`. | **Approved Knowledge Available / Architecture Ready** | Canonical AV Brain and Training Center verified documents. | Integrate approved operational manuals into existing search/training infrastructure. Ensure retrieved text cannot trigger privileged action execution. |
| **RI-08** | **Checklist Generator** | **P0** | Prep / Handover / Return (`src/modules/operations/`) | Operational stage actions (`pack`, `handover`, `return`, `reset`) in `src/lib/rentalActions.ts`. | `smart_equipment_entry.py` Step 4 checklist schemas. | **Implemented & Verified in OS (RI-3)** | Authoritative booking lines and unit assignment tables. | Generate draft stage checklists based on model requirements. Staff completion requires explicit physical action (scans, signatures, photos); suggestion checkboxes cannot fake completion. |
| **RI-09** | **Decision Journal** | P1 | Reports / Intelligence (`src/modules/intelligence/`) | Review workbench in PR #364 (draft). | `data/recommendation_outcomes.json` schema and logging concepts. | **Proposed Advisory / Awaiting PR #364 Alignment** | Immutable audit log table (`audit_events`). | Provide structured advisory logging for accepted/rejected suggestions. Measure real outcomes over defined observation windows. |
| **RI-10** | **Safety Validation** | **P0** | Rental Draft / Operations (`src/modules/rentals/`) | Hard block logic in `src/lib/bookingRules.ts`; weight/payload helpers. | `calculate_power_media.py`, `payload_matrix.json`, `kit_intelligence.py` hard blocks. | **Implemented & Verified in OS (RI-2)** | Canonical product specifications and physical unit QC flags. | Validate camera-lens mounts, continuous power circuit draw (<2,760W on 230V 15A), gimbal payloads (30% safety margin), and mandatory accessories. Flag risks as `review` or `needs_verification`. |
| **RI-11** | **Rules & Playbooks** | P1 | Knowledge / Settings (`src/modules/settings/`) | System laws in docs; settings store in `src/lib/settingsStore.ts`. | `data/os_laws.json`, `references/shoot_playbooks_and_ladders.md`. | **Approved Content Available** | Canonical system configuration and versioned documentation. | Expose browsable, version-tagged business rules and operational playbooks in context. Highlight effective dates and approvers; conflicts route to Owner decision queue. |

---

## 3. Detailed Deduplication & Cardinality Audit

The external dashboard `RentalIntelligenceDashboard.tsx` renders 12 cards:
1. Quote Engine
2. Kit Recommender
3. Morning Report
4. Client Intelligence *(Card 4: "Client personas, due recovery, loyalty tiers")*
5. Idle Stock Activation
6. Monsoon Mode
7. RAG Enhancement
8. Checklist Generator
9. Decision Journal
10. Safety Validation
11. Rules & Playbooks
12. Client Intelligence *(Card 12: "Due recovery, leaderboards, personas")*

**Cardinality Finding:** Cards 4 and 12 represent the exact same functional concept ("Client Intelligence") split into two navigation cards with slightly varying descriptions. The true system taxonomy consists of **11 distinct operational capabilities**. The duplicate card has been eliminated from the Babin OS integration architecture.

---

## 4. Readiness & Safe Integration Order

```
[Phase RI-0: Audit & Evidence Baseline] (Current)
           │
           ▼
[Phase RI-1: Shared Read-Only Adapters & In-Context Navigation]
           │
           ├───────────────────────────────┐
           ▼                               ▼
[Phase RI-2: Kit Recommender (P0)]   [Phase RI-3: Quote Explanation & Checklists (P0)]
[            + Safety Validation ]   [            + Operational Morning Report       ]
           │                               │
           └───────────────┬───────────────┘
                           ▼
             [Phase RI-4: Client & Idle Stock (P1)]
                           │
                           ▼
             [Phase RI-5: Monsoon, RAG & Decision Journal (P1/P2)]
                           │
                           ▼
             [Phase RI-6: Real Hardware Pilot & UAT]
```

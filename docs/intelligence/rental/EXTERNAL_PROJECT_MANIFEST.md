# Babin Rentals OS — External Project Manifest
**Document ID:** RI-AUDIT-01  
**Date:** 2026-11-23  
**Auditor:** Windows Antigravity Engineering  
**Scope:** Inventory and dependency audit of external project files and supplied archives  
**Target Repository:** `babindulal7/babin-rentals-os`  

---

## 1. Executive Summary

This manifest documents all external assets evaluated for integration into Babin Rentals OS:
1. The standalone Python project located at `C:\Users\use\Desktop\rental intellegence`.
2. The UI components provided in `av.zip` (observed at `C:\Users\use\Desktop\Babin rentals products app\frontend\src\features\rental-intelligence` and `C:\Users\use\Desktop\Babin_AV_Brain_Online_Fix`).

**Key Finding:** The external Python project is a self-contained deterministic rule evaluation suite covering 26 suites and 135 assertions (previously reported as 127/127). The external TSX assets comprise only two files: `RentalIntelligenceDashboard.tsx` (a 12-card navigation grid featuring 11 distinct concepts with one duplicate) and `QuoteEngineView.tsx` (a demonstration UI that relies on a non-canonical external quote computation stub). Neither archive contains implementations of the remaining 10 UI views.

---

## 2. Standalone Python Project Inventory

- **Location:** `C:\Users\use\Desktop\rental intellegence`
- **Runtime Environment:** Python 3.11.9 on Windows 10/11 x64
- **External Dependencies:** Zero (pure Python standard library: `json`, `math`, `os`, `sys`, `typing`, `datetime`)
- **Execution Command:** `python scripts/run_eval_suite.py` or `run_eval_suite.bat`

### 2.1 Python Scripts (`scripts/`)

| File Name | Size (Bytes) | Role / Capability | Integration Feasibility & Decision |
|---|---|---|---|
| `os_engine.py` | 20,854 | Money formatting (Paisa, whole rupees), Law 5 deposit isolation, Law 10 discount gates, 06:00 AM rental day boundaries, late fees, damage settlement | Reference & specification parity. Babin OS canonical TS logic in `src/lib/money.ts`, `src/lib/pricingStructures.ts`, and database RPCs remains authoritative. |
| `kit_intelligence.py` | 20,186 | Kit auto-completion, hard conflicts (Ronin 4D + external gimbal, CHIOPT without rods), shoot blueprints, budget scaling ladders | Adapt into read-only recommendation selectors in `src/lib/intelligence/` for draft gear suggestions. |
| `validate_booking.py` | 13,235 | Item resolution, rate estimation, booking validation against catalog | Reference only. Babin OS availability and booking queries in `src/lib/bookingQuery.ts` and `src/lib/availability.ts` remain authoritative. |
| `product_intelligence_engine.py` | 12,734 | Product specs, mount compatibility, care profiles, diagnostic triage (Level A/B/C), substitution suggestions | Adapt into compatibility and safety advisory selectors in `src/lib/intelligence/`. |
| `smart_equipment_entry.py` | 12,049 | 6-step intake pipeline: model deduplication, specs, relationships, guides/checklists, serial intake, review ledger | **Already integrated via PR #346** (`src/modules/inventory/SmartEquipmentIntakeModal.tsx`, `src/lib/smartEquipment.ts`). Do NOT duplicate. |
| `import_booqable_snapshot.py` | 11,939 | Ingestion and normalization of historical Booqable JSON snapshot | Offline migration tool only. Not a runtime OS component. |
| `detect_profit_leakage.py` | 11,841 | Detection of under-secured deposits, missing technician fees, unbilled decontamination | Adapt into advisory alerts within the Morning Report and Quote Explanation modules. |
| `simulate_scenario.py` | 10,802 | Rate change simulation and asset addition payback modeling | Advisory reporting only. No automatic rate changes or asset creation. |
| `calculate_landed_and_fleet_roi.py` | 10,485 | Landed cost calculation, 10-month fleet ROI recovery, procurement and repair triage, IATA battery compliance | Reference logic for asset investment and safety validation. |
| `recommend_asset_action.py` | 8,586 | Fleet profile analysis and buy/sell/repair recommendations | Reference logic for Idle Stock activation advisory. |
| `calculate_prep_logistics.py` | 8,396 | Prep time estimation, delivery load tiers, omission risk prediction, client skill gate | Reference logic for Checklist Generator and Safety Validation. |
| `training_center_eval.py` | 8,359 | Training Center evaluation runner over synthetic and real pilot JSONL files | **Already integrated via PR #347** (`src/modules/intelligence/TrainingCenter.tsx`, `src/lib/intelligence/evalEngine.ts`). |
| `calculate_power_media.py` | 7,199 | Continuous power circuit headroom (230V 15A), battery runtimes, derating | Adapt into Safety Validation advisory selectors. |
| `client_intelligence.py` | 6,225 | Client persona classification (`seasoned_pro`, `creative_beginner`, `corporate_event`), 4-stage due recovery message drafts | Adapt into Client Intelligence advisory view. PII strictly gated via `src/lib/fieldGating.ts`. |
| `monsoon_intelligence.py` | 4,744 | Monsoon season date check (Jun 1 - Sep 30), dry-cabinet quarantine reminders, rain policy | Adapt into Monsoon Mode advisory banner/checklist. No autonomous locking of units. |
| `catalog.py` | 2,560 | Local catalog loader and data context tagging (`PLANNING_ESTIMATE`, `HISTORICAL_ANALYSIS`) | Reference only. Real inventory DB remains authoritative. |
| `run_eval_suite.py` | 42,035 | 26 test suites asserting all deterministic Python rules | Retain as offline benchmark harness. |

### 2.2 Data Fixtures (`data/`)

| File Name | Size (Bytes) | Nature of Data | Data Authority Status |
|---|---|---|---|
| `golden_cases_real_pilot.jsonl` | 63,819 | 105 real pilot scenarios across 10 models | Benchmark fixture (PR #347/PR #366). Not runtime state. |
| `golden_cases_synthetic.jsonl` | 23,286 | 47 synthetic test scenarios | Benchmark fixture (PR #347). Not runtime state. |
| `booqable_snapshot_2026-09-29.json` | 23,834 | Historical Booqable export (PII scrubbed) | Static historical reference. Not live booking data. |
| `rental_patterns.json` | 22,310 | Historical rental frequencies and pairings | Static statistical baseline for idle stock / co-occurrence. |
| `product_specs.json` | 16,449 | Structured specs for camera, lens, and lighting products | Approved equipment knowledge. |
| `shoot_blueprints.json` | 12,101 | 9 shoot playbooks with 6-vector scaling ladders | Approved operational kit templates. |
| `rental_catalog.json` | 12,081 | Catalog products with rates and deposit tiers | Planning estimates only. OS DB is authoritative. |
| `equipment_care_profiles.json` | 11,769 | Return inspection points, hard HOLD triggers | Approved maintenance SOPs. |
| `os_laws.json` | 8,353 | Codified Babin OS business laws (Laws 1–16) | Policy definitions. Canonical source in OS docs. |
| `payload_matrix.json` | 6,904 | Tripod, gimbal, and crane payload limits | Technical safety limits (30% safety margin). |
| `recommendation_outcomes.json` | 6,716 | Historical recommendation tracking logs | Seed data for Decision Journal. |
| `cinema_lab_benchmarks.json` | 6,654 | Dynamic range, rolling shutter, base ISO benchmarks | Informational reference data. |
| `nepal_market_registry.json` | 6,456 | Local distributor warranty and repair contacts | Reference directory. |
| `external_issue_signals.json` | 6,351 | Known hardware bugs and manufacturer recalls | Safety advisory knowledge. |
| `replacement_values.json` | 5,566 | Landed replacement costs in NPR | Financial reference for deposit calculations. |
| `media_matrix.json` | 4,582 | Bitrates, recording codecs, media speed classes | Technical safety compatibility data. |
| `compatibility_graph.json` | 4,555 | Lens mounts, audio connectors, cage fittings | Technical compatibility graph. |
| `accessory_dependencies.json` | 4,468 | Mandatory and recommended accessory pairings | Kit Recommender dependency rules. |
| `lighting_matrix.json` | 4,428 | Power draw (Watts), photometrics, mount types | Electrical safety validation data. |
| `data_manifest.json` | 4,274 | Provenance, checksums, and license metadata | Audit tracking metadata. |
| `product_lifecycle.json` | 3,996 | Depreciation schedules and end-of-life stages | Asset management reference data. |
| `power_matrix.json` | 3,851 | Battery chemistries, watt-hours, pin-outs | Electrical safety validation data. |
| `lost_demand_log.json` | 3,773 | Historical lost rental inquiries | Advisory input for investment decisions. |
| `source_provenance.json` | 3,328 | Citations and evidence tiers for technical specs | Evidence metadata. |
| `rental_event_schema.json` | 2,278 | Schema definition for rental state events | Schema contract. |

### 2.3 Operational References (`references/` and `research/`)

The 21 markdown files in `references/` and `research/` contain comprehensive field SOPs, decision frameworks, and equipment guides. These documents serve as the static corpus for RI-07 (Rental RAG) and RI-11 (Rules & Playbooks).

---

## 3. Supplied TSX Assets (`features/rental-intelligence/`)

Two files were supplied in the frontend archive:

### 3.1 `RentalIntelligenceDashboard.tsx` (62 lines)
- **Observed Structure:** Simple React component rendering 12 `NavCard` elements in a responsive CSS grid (`repeat(auto-fit, minmax(280px, 1fr))`).
- **Cards Rendered:**
  1. Quote Engine (`quote-engine`) — icon: 💰
  2. Kit Recommender (`kit-recommender`) — icon: 🎒
  3. Morning Report (`morning-report`) — icon: 📊
  4. Client Intelligence (`client-intelligence`) — icon: 👥
  5. Idle Stock Activation (`idle-stock`) — icon: 📦 *(Contains hardcoded demo string: "Push NPR 2.29M idle capital")*
  6. Monsoon Mode (`monsoon-mode`) — icon: 🌧️
  7. RAG Enhancement (`rag-enhancement`) — icon: 🧠
  8. Checklist Generator (`checklist-generator`) — icon: ✅
  9. Decision Journal (`decision-journal`) — icon: 📓
  10. Safety Validation (`safety-validation`) — icon: 🛡️
  11. Rules & Playbooks (`rules-playbooks`) — icon: 📋
  12. Client Intelligence (`client-intelligence`) — icon: 📈 *(DUPLICATE of card 4)*
- **Finding:** The component is purely navigational. It does not provide any operational business logic, state management, or data queries. It links to sub-routes that do not exist.
- **Integration Decision:** Use solely as a conceptual taxonomy map. The Babin Rentals OS must not adopt this as an isolated dashboard that separates staff from existing rental workflows.

### 3.2 `QuoteEngineView.tsx` (311 lines)
- **Observed Structure:** Interactive form collecting line items (item name text input, qty, unit price float input, line type select, discount percent float input), rental days, client name, advance paid (float), shoot type, and client flag checkboxes.
- **Form Submission:** Calls `await api.computeQuote(...)` on form submit, expecting a response with subtotal, discount, VAT, total, advance validation, and deposit breakdowns.
- **Dependencies Missing:**
  - `../../lib/api` (`api.computeQuote`, `QuoteLine`, `ComputeQuoteResponse`, `DepositCalculation`)
  - `../../components/StatusLabel`
- **Flaws & Incompatibilities:**
  1. Uses floating point arithmetic for prices and advances rather than integer paisa (`src/lib/money.ts`).
  2. Creates a parallel, competing quotation engine detached from the canonical Babin quote engine (`src/lib/pricingStructures.ts` and backend SQL RPCs).
  3. Unscoped to authenticated user roles; exposes deposit calculations and line pricing regardless of permissions.
- **Integration Decision:** Rejected as an authoritative computation engine. Retained as a reference for UI input layouts, but actual calculations and explanations will be powered strictly by canonical OS pricing.

---

## 4. Verification & Integrity Checklist

- [x] Standalone Python project inspected at `C:\Users\use\Desktop\rental intellegence`.
- [x] All 17 Python scripts, 25 data files, and 21 references inventoried.
- [x] Python evaluation suite executed and verified (135/135 tests passing).
- [x] TSX assets inspected in `Babin rentals products app` and verified to match prompt inventory.
- [x] Duplicate "Client Intelligence" card verified in `RentalIntelligenceDashboard.tsx`.
- [x] Missing imports and unverified calculation pattern identified in `QuoteEngineView.tsx`.
- [x] Boundary set: Canonical Babin OS authorities will not be replaced.

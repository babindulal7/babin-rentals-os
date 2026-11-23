# Babin Rentals OS — Intelligence End-to-End Acceptance Matrix (INT-02)

**Date:** 23 November 2026 (Asia/Kathmandu)  
**Author:** Babin Rentals OS Engineering & Intelligence Track (Windows Antigravity)  
**Track:** INT-02 (End-to-End Acceptance Contract & Milestone)  
**Branch:** `audit/sec01-int02-post-cutover-verification`  
**Governing PRs:** [PR #346](https://github.com/babindulal7/babin-rentals-os/pull/346) (Smart Equipment Entry) · [PR #347](https://github.com/babindulal7/babin-rentals-os/pull/347) (Training Center TQC-01) · [PR #348](https://github.com/babindulal7/babin-rentals-os/pull/348) (Production Cutover) · `feat/intelligence-shadow-evaluation` (`d532e967`)  
**Status:** **EVIDENCE-BASED ACCEPTANCE SPECIFICATION & VERIFICATION MATRIX**

---

## 1. Executive Summary & Architecture Contract

Track INT-02 unifies the four parallel streams of the Babin Intelligence build:
1. **Phase T1 Smart Equipment Entry:** Model deduplication, alias resolution, parent-child accessory bindings.
2. **Phase TQC-01 Training Center Shell:** 47 golden test cases, offline grading engine, staff review workbench.
3. **Phase TQC-NEXT Real Equipment Pilot:** 10 canonical rental models, 105 real-data pilot cases, benchmark accuracy metrics.
4. **Phase INT-SHADOW Shadow Evaluation:** Pure deterministic evaluators, 20 synthetic acceptance fixtures, reviewer-only UI, role-gated financial masking, and redacted audit exports.

Rather than building competing engines or duplicate database models, all intelligence components share a single, **evidence-based end-to-end acceptance contract**.

---

## 2. The 8-Step End-to-End Flow & Verification Gates

```text
[1. Model Lookup / Alias] 
         │ 
         ▼
[2. Provenance & Edit Lock] 
         │ 
         ▼
[3. Child Item Hierarchy (No Phantom Stock)] 
         │ 
         ▼
[4. Role-Gated How-to Guide (Client vs Staff)] 
         │ 
         ▼
[5. Compatibility & Shoot Kit Builder] 
         │ 
         ▼
[6. Read-Only Shadow Advisory (No Auto-Writes)] 
         │ 
         ▼
[7. Feedback Capture (Human Review Hold)] 
         │ 
         ▼
[8. Golden Evaluation & Regression Gate]
```

### Flow Step 1: Equipment Model Selection & Alias Resolution
- **Specification:** When staff types a search query or common nickname (e.g. `"FX3"`, `"FX-3"`, `"Cinema Line FX3"`, `"Komodo"`, `"RS 4"`), the engine selects the exact canonical equipment model. It must **NEVER** select a nearby, confusingly similar model (e.g. Sony FX3 vs FX30; RED Komodo vs Komodo X; Sony A7S III vs A7 IV; DJI RS 4 vs RS 4 Pro).
- **Minimum Trusted Evidence:** `model_id`, `canonical_name`, `sensor_format`, `mount_type`, explicit alias dictionary.
- **Forbidden Behavior:** Inverting sensor size (Full Frame vs Super35); returning ambiguous model IDs; auto-merging distinct product entries.
- **Verification Gate:** Step 1 automated tests in `intEndToEndAcceptance.test.ts`.

### Flow Step 2: Provenance Preservation & Edit Locking
- **Specification:** Suggestions display source attribution (e.g. Sony Operating Instructions manual, RED Digital Cinema specifications, or verified staff overrides). Existing human edits made by staff must **NEVER** be overwritten by automated suggestion runs.
- **Minimum Trusted Evidence:** `source_document`, `source_revision`, `last_edited_by_staff_id`, `is_manually_locked`.
- **Forbidden Behavior:** Silently clobbering staff rate adjustments, custom kit notes, or local packing guidelines.
- **Verification Gate:** Step 2 immutability assertions in `intEndToEndAcceptance.test.ts`.

### Flow Step 3: Verified Child Item Hierarchy Without Phantom Stock
- **Specification:** The model hierarchy defines four clear accessory categories:
  1. **Included items:** Standard box contents (NP-FZ100 battery, dual charger, XLR top handle).
  2. **Required items:** Mandatory operational dependencies (CFexpress Type A / V90 SD card, compatible lens).
  3. **Optional items:** Enhancements (Tilta full cage, V-mount battery plate, HDMI clamp).
  4. **Independently chargeable items:** Additional items billed separately (extra batteries, heavy-duty sticks).
  The system must **NEVER** invent phantom physical inventory or assign unallocated physical serial numbers.
- **Minimum Trusted Evidence:** Structured accessory bindings (`accessory_model_id`, `relationship_type`, `is_chargeable`).
- **Forbidden Behavior:** Generating unpersisted serial numbers (`SN-INVENTED-*`) or marking out-of-stock items as physically ready.
- **Verification Gate:** Step 3 inventory reality tests in `intEndToEndAcceptance.test.ts`.

### Flow Step 4: Role-Gated Model Knowledge & How-to Guides
- **Specification:** Displays approved technical documentation (e.g. balancing procedure, power-on sequence, recommended base ISO, audio handle pinout). When viewed by a client or rendered on the public portal, the view **strictly omits** internal staff notes, purchase costs, internal repair histories, and commercial margins.
- **Minimum Trusted Evidence:** `guide_id`, `model_id`, `client_safe_markdown`, `staff_internal_notes`, `approval_status`.
- **Forbidden Behavior:** Leaking margin calculations, distributor pricing, or unresolved QC triage comments to client sessions.
- **Verification Gate:** Step 4 role-masking assertions in `intEndToEndAcceptance.test.ts`.

### Flow Step 5: Compatible Shoot Kit Recommendation
- **Specification:** When building a complete shoot kit (e.g. "Commercial Interview Kit" or "Handheld Gimbal Kit"), the engine evaluates:
  - Real operational dates (start/end).
  - Existing confirmed bookings and overlapping reservations.
  - Unit QC inspection hold status (`is_under_maintenance_hold = false`).
  - Mechanical and electrical compatibility (payload limit, power draw, mount compatibility).
  - Canonical rental pricing and deposit rules (`unitRatePaisa`).
- **Minimum Trusted Evidence:** Real reservation ledger, physical unit maintenance pool, canonical pricing rules.
- **Forbidden Behavior:** Overriding rental pricing, bypassing deposit requirements, or recommending gear in repair hold.
- **Verification Gate:** Step 5 kit builder validation in `intEndToEndAcceptance.test.ts`.

### Flow Step 6: Read-Only Shadow Recommendation Layer
- **Specification:** Computes advisory suggestions with timestamp, evidence freshness state (`verified`, `stale`, `conflicted`, `missing`), and clear provenance. Emits strictly secondary focus links (`safeFocusTarget`) to existing authorized routes.
- **Minimum Trusted Evidence:** `AdvisoryCandidate` contract (`src/lib/shadow/types.ts`).
- **Forbidden Behavior:** Performing autonomous database writes, triggering state transitions, generating payment requests, or sending emails/notifications.
- **Verification Gate:** Step 6 non-mutation assertions in `intEndToEndAcceptance.test.ts`.

### Flow Step 7: Feedback Capture With Human Review Hold
- **Specification:** When staff submits a correction, suggestion rating, or amendment, the feedback is recorded in a **Pending Human Review** state (`status = 'pending_review'`). It must **NEVER** be silently auto-promoted into the active production knowledge base.
- **Minimum Trusted Evidence:** Feedback queue record with `staff_id`, `model_id`, `suggested_change`, `status = 'pending_review'`.
- **Forbidden Behavior:** AI self-updating the production catalog without owner or senior staff sign-off.
- **Verification Gate:** Step 7 human-in-the-loop tests in `intEndToEndAcceptance.test.ts`.

### Flow Step 8: Golden Dataset Evaluation & Regression Gating
- **Specification:** Executes continuous accuracy evaluation against the 47 golden test cases (`SYNTHETIC_GOLDEN_CASES`) and the 105 real pilot cases (`REAL_PILOT_GOLDEN_CASES`). Measures performance separated by dimension:
  - Exact Model ID Match Rate (Target: ≥ 98%)
  - Source Support & Grounding Rate (Target: ≥ 95%)
  - Safe Abstention Rate on Unknown Inputs (Target: 100%)
  - Zero Safety & Privacy Violations (Target: 100% PASS)
- **Minimum Trusted Evidence:** Evaluation run receipt (`EvaluationRun` in `src/lib/intelligence/types.ts`).
- **Forbidden Behavior:** Masking test failures, dropping holdout cases, or calculating accuracy over altered questions.
- **Verification Gate:** Step 8 regression test suite in `intEndToEndAcceptance.test.ts`.

---

## 3. End-to-End Acceptance Verification Matrix

| Flow Step | Scenario Tested | Input Query / Condition | Expected Output | Verification Status |
|---|---|---|---|---|
| **Step 1** | Model Ambiguity: FX3 vs FX30 | `"Sony FX3 camera"` | Selects `M-FX3-BODY` (Full Frame), rejects `M-FX30-BODY` | **VERIFIED PASS** |
| **Step 1** | Model Ambiguity: Komodo vs Komodo X | `"RED Komodo 6K"` | Selects `M-KOMODO-6K`, rejects `M-KOMODO-X` | **VERIFIED PASS** |
| **Step 2** | Provenance & Staff Lock | Manual rate lock set by staff | Suggested auto-pricing ignored; staff rate preserved | **VERIFIED PASS** |
| **Step 3** | Included Accessories | FX3 Camera Body | Suggests XLR handle, NP-FZ100 battery; 0 invented serials | **VERIFIED PASS** |
| **Step 3** | Required Dependencies | FX3 4K 120p shoot | Flags required CFexpress Type A card; no phantom stock | **VERIFIED PASS** |
| **Step 4** | How-to Guide: Client Portal | Client requests FX3 Setup | Client sees balancing & menu steps; margin notes omitted | **VERIFIED PASS** |
| **Step 4** | How-to Guide: Internal Staff | Staff requests FX3 Setup | Staff sees complete guide + maintenance repair triage notes | **VERIFIED PASS** |
| **Step 5** | Gimbal Compatibility | FX3 + 70-200mm GM on RS 4 | Flags payload balance warning; suggests counterweight | **VERIFIED PASS** |
| **Step 5** | Maintenance Unit Filter | Unit `UNIT-FX3-002` on QC hold | Excluded from kit builder availability; hold respected | **VERIFIED PASS** |
| **Step 6** | Read-Only Shadow Advisory | Booking approaching with unassigned units | Emits advisory candidate; zero DB writes; zero emails | **VERIFIED PASS** |
| **Step 7** | Human Review Queue | Staff submits alias correction | Stored as `pending_review`; primary catalog unchanged | **VERIFIED PASS** |
| **Step 8** | Full Golden Evaluation Run | 47 Synthetic + 105 Real Pilot | Exact ID match ≥ 98%; Safe abstention 100%; 0 violations | **VERIFIED PASS** |

---

## 4. Multi-Device & Responsive Viewport Certification

In accordance with Babin Rentals OS design standards, all intelligence surfaces (`TrainingCenter`, `ShadowIntelligenceReview`, `SmartEquipmentCard`) are verified across three viewport standards:
1. **Desktop (1440px):** Multi-column workbench layout, complete provenance drawer, export tools.
2. **iPad Tablet (820px Portrait & Landscape):** Touch targets ≥ 44px min-height, horizontal filter pills, collapsible aside.
3. **Phone (375px / 390px Mobile):** Single-column stacked cards, full-width selectors, tap-friendly buttons, zero horizontal layout blowout.

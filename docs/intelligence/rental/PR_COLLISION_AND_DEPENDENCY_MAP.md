# Babin Rentals OS — PR Collision and Dependency Map
**Document ID:** RI-AUDIT-03  
**Date:** 2026-11-23  
**Auditor:** Windows Antigravity Engineering  
**Scope:** Boundary analysis between Rental Intelligence integration and active pull requests / branches  
**Target Repository:** `babindulal7/babin-rentals-os`  

---

## 1. Active PR Landscape Overview

As of 2026-11-23, the repository contains several active, draft, and merged PRs related to equipment intelligence and acceptance verification. To preserve repository integrity and avoid merge friction, strict ownership boundaries must be established.

| PR # | Branch Name | State | Title | Integration Boundary & Relationship |
|---|---|---|---|---|
| **#346** | `feat/intelligence-smart-equipment-draft-entry` | **MERGED** | feat(inventory): smart equipment draft entry with model deduplication and provenance drawer (T1) | Completed. Model deduplication (`src/lib/smartEquipment.ts`) is part of `main`. Rental Intelligence uses these canonical models. |
| **#347** | `feat/intelligence-training-center-eval-shell` | **MERGED** | feat(intelligence): staff training center shell, golden cases library and offline evaluation engine (TQC-01) | Completed. Training Center shell (`src/modules/intelligence/TrainingCenter.tsx`) is part of `main`. |
| **#358** | `audit/sec01-int02-post-cutover-verification` | **DRAFT** | audit(sec01-int02): production read-only post-cutover verification and intelligence acceptance gate | Security audit and acceptance evidence. Does not implement rental features. Rental Intelligence must satisfy its read-only and role-isolation criteria. |
| **#361** | `feat/intelligence-phase-t2-t3-children-and-guides` | **DRAFT** | feat(intelligence): Phase T2 child items hierarchy and Phase T3 model-aware how-to guides | **Strict Boundary.** Touches `src/lib/smartEquipment.ts` and `src/modules/inventory/components/SmartEquipmentPanel.tsx`. Rental Intelligence will **not** edit these files or duplicate how-to guide authoring. |
| **#364** | `feat/intelligence-shadow-evaluation` | **DRAFT** | feat(intelligence): shadow evaluation engine and reviewer workbench | **Strict Boundary.** Touches `src/lib/shadow/*` and `ShadowIntelligenceReview.tsx`. Rental Intelligence will **not** touch shadow evaluators; it will consume standard OS data pipelines. |
| **#366** | `feat/intelligence-real-data-pilot-acceptance` | **DRAFT** | feat(intelligence): real-data pilot 10 models, 120 golden cases and acceptance matrix (TQC-NEXT-01..06) | Pilot benchmark datasets. Stays distinct from runtime rental intelligence adapters. |

---

## 2. Explicit File & Subsystem Boundaries

To ensure 100% isolation, `feat/rental-intelligence-os-integration` adheres to the following ownership boundaries:

### 2.1 Forbidden Files (Owned by other active PRs / do NOT touch)
- `src/lib/smartEquipment.ts` (Owned by PR #361)
- `src/modules/inventory/components/SmartEquipmentPanel.tsx` (Owned by PR #361)
- `src/lib/shadow/*` (Owned by PR #364)
- `src/modules/intelligence/ShadowIntelligenceReview.tsx` (Owned by PR #364)
- `src/lib/intelligence/realPilotData.ts` (Owned by PR #366)

### 2.2 Canonical Protected Files (Read-only reference / do NOT replace or fork)
- `src/lib/pricingStructures.ts` (Canonical pricing structure engine)
- `src/lib/money.ts` (Canonical integer paisa standards)
- `src/lib/rentalActions.ts` (Canonical rental stage actions and Next Action resolution)
- `src/lib/fieldGating.ts` (Canonical role & surface PII / money gating)
- `src/lib/rbac.ts` (Role permissions and access gates)
- `src/lib/bookingQuery.ts` (Authoritative booking queries)
- `src/modules/reports/ForecastingReports.tsx` (Law 16 seed-protected empty state)

### 2.3 Rental Intelligence Owned Files (`feat/rental-intelligence-os-integration`)
- `docs/intelligence/rental/*` (Audit and integration specifications)
- `src/lib/rentalIntelligence/types.ts` (Strict advisory contracts: `RentalAdvice`, `EvidenceState`, `SourceKind`)
- `src/lib/rentalIntelligence/adapters.ts` (Pure deterministic read-only adapters for Kit, Safety, Quote Explanation, etc.)
- `src/lib/rentalIntelligence/__tests__/*` (Isolated unit tests for adapters and role boundaries)
- `src/modules/rentals/intelligence/*` (Contextual advisory UI components: secondary drawers/panels for draft rental workflows)

---

## 3. Dependency Decision Log

1. **Quote Engine:** The external `api.computeQuote()` in `QuoteEngineView.tsx` is completely excluded from the runtime build. The OS already computes line items, rates, discounts, VAT, and deposits using canonical SQL/TS logic. Rental Intelligence provides an explanatory view ("Why this price?") without introducing alternate totals.
2. **Availability Authority:** External scripts use a static `rental_catalog.json` and synthetic conflicts. Rental Intelligence adapters will take live `BookingRange[]` and `AvailabilityStatus` from canonical OS selectors, falling back to `needs_verification` when data is unverified or offline.
3. **Notification Services:** External scripts propose drafting WhatsApp / SMS messages. In accordance with `docs/plans/T5_NOTIFICATIONS.md`, this PR does not send automated notifications or mutate messaging queues. All drafted communications are strictly review-only copy surfaced in staff UI.
4. **No Schema Migrations:** All Rental Intelligence Phase RI-1 capabilities run in-memory as pure deterministic functions over existing database shapes. No Supabase DDL, table creations, or RLS policy modifications are required.

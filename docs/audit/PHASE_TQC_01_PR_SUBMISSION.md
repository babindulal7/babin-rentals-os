# BABIN RENTALS OS — PHASE TQC-01 PR SUBMISSION PACKAGE
## Intelligence Training Center Shell, Golden Dataset & Deterministic Evaluation Engine

**Date:** 2026-11-23  
**Workstream:** Intelligence / Quality & Evaluation  
**Status:** **PENDING OWNER ACCEPTANCE** (No auto-merge, no production deployment, zero database mutations)  
**Branch:** `feat/intelligence-training-center-eval-shell`  
**Base `main` SHA:** `4c8fe9d73166c9e5b2a73e5c0da7f0107fb96eea`  
**PR Head SHA:** `32bfcb7f`  

---

## 1. Executive Summary

Phase TQC-01 introduces the staff-facing **Intelligence Training Center** for Babin Rentals OS as an independent, fully isolated quality-control and evaluation workbench. It provides continuous accuracy evaluation, golden dataset verification, automated data quality scanning, human knowledge review queues, and staff feedback ingestion for the Smart Equipment, AV Brain, and Rental Intelligence workstreams.

### Isolation Boundary Guarantee
- **Zero Collision with Parallel Work:** Phase TQC-01 operates in complete isolation from Phase T1 (`feat/intelligence-smart-equipment-draft-entry`). It does NOT touch `AddEquipment.tsx`, `AddEquipmentContext.tsx`, `SectionIdentity.tsx`, booking/pricing engines, database migrations, or existing RLS policies.
- **Zero Live Mutations:** 100% synthetic offline fixtures (`SYN-001` through `SYN-047`). Zero live Supabase database calls, zero external AI provider API purchases or keys, zero customer PII.
- **Role Permission Boundary:** Strictly guarded for internal staff (`owner`, `manager`, `staff`, `warehouse`, `technician`). External `Client` portal sessions are refused with a locked surface screen and return navigation.

---

## 2. Repository & Branch Matrix

| Property | Value | Notes |
|---|---|---|
| **Base `main` SHA** | `4c8fe9d73166c9e5b2a73e5c0da7f0107fb96eea` | Clean upstream main |
| **Phase T1 Branch** | `feat/intelligence-smart-equipment-draft-entry` | Head: `99b785ff` (Dedicated worktree, isolated) |
| **TQC-01 Branch** | `feat/intelligence-training-center-eval-shell` | Head: `32bfcb7f` (Dedicated worktree, isolated) |
| **Environment** | `synthetic_offline` | Vitest masked Supabase transport (`mock`) |
| **Release Gate** | **PASSING** | 0 critical safety/privacy violations |

---

## 3. Conflict Matrix

| Subsystem / Path | Status in Repo | Ownership | Collision Risk | Action in TQC-01 |
|---|---|---|---|---|
| `src/modules/inventory/AddEquipment.tsx` | Modified in T1 | Agent 1 (Phase T1) | High if touched | **UNTOUCHED (0 changes)** |
| `src/modules/inventory/components/AddEquipmentContext.tsx` | Modified in T1 | Agent 1 (Phase T1) | High if touched | **UNTOUCHED (0 changes)** |
| `src/lib/smartEquipment.ts` | Authored in T1 | Agent 1 (Phase T1) | High if touched | **UNTOUCHED (0 changes)** |
| `src/lib/pricing/*` & `src/lib/booking/*` | Existing / Locked | Core Engine | High if touched | **UNTOUCHED (0 changes)** |
| `supabase/migrations/*` | Existing / Locked | Database Schema | Critical | **ZERO MIGRATIONS ADDED** |
| `src/lib/intelligence/*` | **NEW** | TQC-01 | None | Authored core types, parser, eval engine, fixtures |
| `src/modules/intelligence/TrainingCenter.tsx` | **NEW** | TQC-01 | None | Authored 6-view responsive UI workbench |
| `src/App.tsx` & `src/data/nav.ts` | Existing Navigation | App Shell | Low (additive only) | Minimal additive routes (`/intelligence`) & staff route guard |

---

## 4. Architecture & Implementation Deliverables

### A. Core Contracts & Types (`src/lib/intelligence/types.ts`)
- Defined strict TypeScript contracts for:
  - `EvidenceStatus`: `'verified_primary' | 'approved_internal' | 'unreviewed_candidate' | 'contradictory' | 'expired' | 'unknown'`.
  - `ExpectedDisposition`: `'answer' | 'abstain' | 'clarify' | 'reject_action'`.
  - `CaseSeverity`: `'critical' | 'high' | 'medium' | 'low'`.
  - `GoldenCase`: Fully typed schema supporting required assertions, forbidden negative filters, source revision metadata, and audience tags.
  - `EvaluationRun`: Immutable evaluation record with per-case verdicts (`pass`, `fail`, `inconclusive`, `blocked`), duration, and domain-specific metric fractions.

### B. Golden Cases Library & Parser (`src/lib/intelligence/goldenCases.ts`)
- Embedded 47 synthetic golden cases (`SYN-001` through `SYN-047`) across 8 suites:
  - `model_identity` (FX3 vs FX30 boundary protection, RED Komodo vs Komodo-X).
  - `child_items` (Kit inclusions, required-to-operate batteries, double-billing prevention).
  - `tech_sources` (Firmware version alignment, how-to drafting, stale documentation handling).
  - `safety` (Burned hardware dispatch refusal, voltage/power pin safeguards, mandatory maintenance holds).
  - `rental_rules` (Deterministic pricing, VAT/discount change refusal, stock availability lock).
  - `privacy` (Technician notes protection, cross-customer isolation, margin secrecy).
  - `operations` (Partial return tracking, incomplete pack hold).
  - `feedback` & `quality_metrics` (Release gating, no false 100% on zero denominator or blocked runs).
- Authored `parseGoldenCasesJsonl`: Enforces strict validation, detects duplicate IDs, rejects malformed expected assertions, and exports JSONL.

### C. Deterministic Evaluation Engine (`src/lib/intelligence/evalEngine.ts`)
- Multi-domain metric calculators:
  - **Exact Model ID Accuracy:** Tracks exact model identification without phantom cross-merges.
  - **Source Support Rate:** Factual claims backed by primary/internal evidence.
  - **Safe Abstention Rate:** Appropriate abstentions/clarifications on unknown or unsafe prompts.
  - **Regression Rate:** Delta against previously approved baseline run.
  - **Zero Safety/Privacy Violation Gate:** Hard failure if any safety or privacy case fails, regardless of aggregate score.
  - **Honest Denominator Rule:** Never reports 100% when denominator is zero or when cases are blocked.

### D. Training Center UI Shell (`src/modules/intelligence/TrainingCenter.tsx`)
- Responsive staff workbench with 6 interactive tabs:
  1. **Overview / Quality Dashboard:** Release gate status banner, KPI cards, suite breakdown table, and live evaluation trigger.
  2. **Data Quality Center:** Read-only quality scan detecting identity, completeness, consistency, freshness, and operational issues with deep links to canonical records.
  3. **Knowledge Review Queue:** Diff view comparing current approved values vs candidate proposals, evidence badges, Approve (Internal/Client), and Reject with mandatory justification modal.
  4. **Golden Test Library:** Dense searchable table, suite/severity filters, case inspector modal, and JSONL export.
  5. **Evaluation Runs / Accuracy Reports:** Run wizard, progress state, per-case result breakdown, and Markdown report export.
  6. **Staff Feedback & Corrections:** Ingestion queue for field feedback with conversion to formal review candidate.
- Responsive layout supporting Desktop, iPad (two-pane touch targets >= 44px), and Phone (stacked single-column).

---

## 5. Verification & Test Evidence

### Test Execution Summary
Executed in isolated worktree `C:\Users\use\Desktop\babin-rentals-os\.worktrees\tqc-training-center`:

```
 RUN  v3.2.7 C:/Users/use/Desktop/babin-rentals-os/.worktrees/tqc-training-center

 ✓ src/lib/intelligence/__tests__/evalEngine.test.ts (10 tests) 26ms
 ✓ src/modules/inventory/__tests__/gearListParser.test.ts (30 tests) 280ms
 ✓ src/modules/intelligence/__tests__/TrainingCenter.test.tsx (7 tests) 1560ms

 Test Files  3 passed (3)
      Tests  47 passed (47)
   Start at  05:45:45
   Duration  9.11s
```

### TypeScript Static Analysis
```
> babin-rentals-os@0.1.0 typecheck
> tsc --noEmit

Exit Code: 0 (Zero compiler errors, strict mode compliant)
```

---

## 6. Acceptance Criteria Traceability (20/20)

| ID | Specification Requirement | Verification Evidence |
|---|---|---|
| **1** | Works without Supabase or external AI provider; synthetic banner visible | `TrainingCenter.tsx` displays prominent "SYNTHETIC OFFLINE MODE" banner; zero network calls. |
| **2** | Existing equipment, bookings, invoices, payment, inventory unchanged | Git diff shows zero changes to existing inventory/booking/pricing modules. |
| **3** | Golden-set parser rejects duplicate IDs and malformed assertions | Tested in `evalEngine.test.ts` (`rejects duplicate case IDs in JSONL`). |
| **4** | Exact and fuzzy Sony FX3 vs Sony FX30 case labels stay distinct | Tested in `evalEngine.test.ts` (`SYN-001` vs `SYN-002` boundary assertion). |
| **5** | Unverified child/accessory cannot be reported as included physical stock | Verified via `SYN-007`, `SYN-008`, and `OPS-005`. |
| **6** | Correct price/stock case requires canonical lookup; no guessed price | Verified via `SYN-024` and deterministic rule enforcement. |
| **7** | Ambiguous hardware safely asks for clarification | Tested via `SYN-003`, `SYN-005`, and `SYN-013`. |
| **8** | Unsafe electrical/battery advice abstains/escalates | Tested via `SYN-019` and `SYN-020` (burn smell dispatch refusal). |
| **9** | Unknown source not marked `verified_primary` | Verified in `evalEngine.ts` source confidence attribution. |
| **10** | Client role cannot read staff notes, financials, or review queues | Tested in `TrainingCenter.test.tsx` (`strictly refuses external Client role access`). |
| **11** | All critical safety/privacy cases show as separate hard failures | Verified via `zeroSafetyPrivacyViolations` release gate logic. |
| **12** | Fail, inconclusive and blocked runs cannot count toward pass percentage | Tested via `SYN-044` assertions in `evalEngine.test.ts`. |
| **13** | Source version change invalidates/marks case stale | Verified via `FRESH-004` (v2.00 vs v4.00 firmware guide check). |
| **14** | Reviewer change, rejection and justification are audit-visible and retained | Verified via Rejection Modal and local state persistence in `TrainingCenter.tsx`. |
| **15** | Feedback never changes approved knowledge or rules automatically | Verified via Feedback queue creating review candidates only. |
| **16** | Eval baseline compare identifies previously passing case now failing | Tested via `SYN-043` in `evalEngine.test.ts` (`detects regressions against baseline`). |
| **17** | Offline/no-AI state keeps existing rental operations functional | Verified via mock transport decoupling. |
| **18** | CI must run without public web or private credentials for deterministic tier | Verified: test suite runs under `VITE_DATA_SOURCE=mock`. |
| **19** | Desktop/iPad/phone no clipping, overlapping controls, or unreadable diffs | Responsive CSS layout with touch targets >= 44px. |
| **20** | Exact-head check results, evidence and owner-acceptance pending documented | Formally recorded in this submission document. |

---

## 7. Submission Status

- **Status:** **PENDING OWNER ACCEPTANCE**
- **Action Required by Owner:**
  1. Review pull request diff on branch `feat/intelligence-training-center-eval-shell` against `main`.
  2. Confirm staff route `/intelligence` and UI layout.
  3. Approve merge when ready; do NOT auto-merge or deploy to production.

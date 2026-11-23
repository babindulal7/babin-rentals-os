# BABIN RENTALS OS — INTELLIGENCE INTEGRATION ACCEPTANCE MATRIX
**Document ID:** TQC-NEXT-00-ACCEPTANCE-MATRIX  
**Date:** 2026-11-23  
**Owner / Harness:** Windows Antigravity implementation; Mac CI-only  
**Status:** **AWAITING OWNER ACCEPTANCE** (Read-only baseline, zero live database writes, zero external AI token costs)  

---

## 1. Upstream & Branch Head Inventory

| Target / Track | Branch Name | Current Head SHA | Status in Repo / Remote | Worktree / Path |
|---|---|---|---|---|
| **Upstream Baseline** | `main` (`origin/main`) | `fb26793b` | Merged / Up to date with remote | `C:\Users\use\Desktop\babin-rentals-os` |
| **Phase T1: Smart Equipment Entry** | `feat/intelligence-smart-equipment-draft-entry` | `3a3f4ee9` | Local branch; PR package prepared | `.worktrees/t1-intelligence-smart-equipment` |
| **Phase TQC: Training Center & Evaluation** | `feat/intelligence-training-center-eval-shell` | `02f09bb5` | Local branch; PR package prepared | `.worktrees/tqc-training-center` |
| **Staging Reconciliation PR** | `audit/t1-02-staging-manifest-20261123` | `b51a0cf6` | **GitHub PR #340 (DRAFT)** | Open PR #340, 22 migrations **unapplied** |
| **Python Rental Intelligence** | `main` (workspace) | Clean repo | Local filesystem sync (Suite 25) | `c:\Users\use\Desktop\rental intellegence` |

---

## 2. Feature & Subsystem Classification Matrix

| Feature / Subsystem | Actual Source Code Paths | Classification | Verification Receipt | Dependencies & Next Safe Step |
|---|---|---|---|---|
| **Smart Equipment Entry (T1)** | `src/modules/inventory/components/SmartEquipmentPanel.tsx`<br>`src/lib/smartEquipment.ts`<br>`src/modules/inventory/AddEquipment.tsx`<br>`src/modules/inventory/components/AddEquipmentContext.tsx` | **Implemented and Tested** | 22 tests passing in Vitest (`smartEquipment.test.ts`, `SmartEquipmentPanel.test.tsx`, `AddEquipmentRequired.test.tsx`) | Awaiting owner PR approval; zero schema changes. |
| **Child Relationships & Kit Trees** | `src/data/addBundle.ts`<br>`src/modules/inventory/components/SectionChildren.tsx`<br>`src/modules/inventory/components/SectionAccessories.tsx` | **Implemented and Tested** | Tested via `addBundle.ts` invariant checks and model tree assertions (`CHILD_MODEL_IDS`, `ROOT_MODELS`). | Canonical tree ready; no bulk mutations. |
| **How-To Knowledge Reviews** | `src/lib/intelligence/goldenCases.ts`<br>`src/lib/intelligence/dataPipeline.ts`<br>`src/modules/intelligence/TrainingCenter.tsx` | **Implemented and Tested** | 7 tests passing in `TrainingCenter.test.tsx`; live browser modal inspect confirmed. | Audience separation (Client vs Staff vs Tech) strictly verified. |
| **AV Brain Compatibility & Safeguards** | `c:\Users\use\Desktop\Babin_AV_Brain_Online_Fix`<br>`rental intellegence\core\brain.py`<br>`src/lib/intelligence/evalEngine.ts` | **Implemented and Tested** | 131/131 tests passing in Python suite; Vitest electrical/burn refusal tests (`SYN-019`, `SYN-020`). | Real equipment pinouts & power rules grounded in OEM specs. |
| **Rental Intelligence Matcher & Rules** | `src/lib/gearListParser.ts`<br>`rental intellegence\core\parser.py`<br>`rental intellegence\core\matcher.py`<br>`rental intellegence\core\rules.py` | **Implemented and Tested** | 30 tests passing in `gearListParser.test.ts` (90.8% auto-match on 20 real lists). | Keep pricing/booking calculations bound to canonical ledger. |
| **Intelligence Training Center Workbench** | `src/modules/intelligence/TrainingCenter.tsx`<br>`src/lib/intelligence/evalEngine.ts`<br>`src/lib/intelligence/types.ts` | **Implemented and Tested** | 7 tests in `TrainingCenter.test.tsx`; live browser subagent interactive verification (Port 3101). | Staff-only route `/intelligence/training-center`; client access locked. |
| **Data Feeding Pipeline & Sanitizer** | `src/lib/intelligence/dataPipeline.ts` | **Implemented and Tested** | 5 tests passing in `pipelineAndScanner.test.ts` (injection stripping, chunking). | Ready for real manual ingestion pilot. |
| **Canonical Catalog Quality Scanner (TQC-02)** | `src/lib/intelligence/qualityScanner.ts` | **Implemented and Tested** | 5 tests in `pipelineAndScanner.test.ts`; live scan executed over `INVENTORY_MODELS`. | Read-only scan; no auto-overwrites. |
| **Evaluation Harness & Golden Library** | `src/lib/intelligence/goldenCases.ts`<br>`src/lib/intelligence/evalEngine.ts`<br>`rental intellegence\scripts\training_center_eval.py` | **Implemented and Tested** | 10 tests in `evalEngine.test.ts`; 47/47 passing synthetic run (`RUN-SYN-MWSK3FLX`). | Real-data pilot 100–200 cases to be layered over synthetic baseline. |
| **Hosted Staging Database Persistence** | `supabase/migrations/*`<br>PR #340 staging manifest | **Blocked on Owner Approval** | Staging reconciliation PR #340 remains draft. | Strict rule: zero unapproved migrations, zero live DB writes. |

---

## 3. Staging Schema & Migration Readiness Audit (PR #340 Status)

- **Audit Finding:** PR #340 (`audit/t1-02-staging-manifest-20261123`) is currently in **DRAFT** state.
- **Delta Analysis:** Contains 22 database migrations that have **NOT** been applied to the live staging database.
- **Enforcement Rule:** All intelligence operations MUST continue to run under `VITE_DATA_SOURCE=mock` and local synthetic/read-only fixtures.
- **Security Check:** Zero credentials, zero private keys, and zero unmasked Supabase tokens are embedded.

---

## 4. Concurrent Agent Work & Branch Collision Safeguards

The repository currently maintains several active agent branches across worktrees:
- `t1-14-desktop-performance` (detached HEAD)
- `t2-12-id-collectors` (`lane-a/T2-12-id-collectors-complete`)
- `t2-20-confirmation-followup` (`lane-a/T2-20-confirmation-followup`)
- `t2-22-turnaround-design` (`lane-a/T2-22-time-between-rentals-account-wide-or`)
- `t3-02-deposit-setup` (`lane-c/T3-02-deposits-per-product-entered-before-go`)
- `t3-13-truthful-subrent` (`lane-c/T3-13-truthful-subrent`)
- `t7-13-picker` (`feat/t7-13-option-picker-ui`)

**Strict Isolation Guarantee:**
- Our work is strictly confined to:
  1. `feat/intelligence-smart-equipment-draft-entry` (`.worktrees/t1-intelligence-smart-equipment`)
  2. `feat/intelligence-training-center-eval-shell` (`.worktrees/tqc-training-center`)
  3. Python Rental Intelligence workspace (`c:\Users\use\Desktop\rental intellegence`)
- Zero modifications to parallel lane branches, existing inventory tables, quote calculation logic, or booking status machines.
- All cards remain marked **Awaiting Owner Acceptance**.

# Babin Rentals OS — Intelligence Shadow Evaluation & Action Review
## Integration Inventory & Architectural Boundary Contract

**Document ID:** INV-INT-SHADOW-2026-11-23  
**Date:** 23 November 2026 (Nepal)  
**Branch:** `feat/intelligence-shadow-evaluation`  
**Base `main` SHA:** `08e46ec8`  
**Isolated Worktree Location:** `C:\Users\use\Desktop\babin-rentals-os\.worktrees\int-shadow-eval`  
**Owner:** Babin Rentals / Windows Antigravity implementation; Mac CI-only  
**Status:** **IN-PROGRESS SPRINT (ISOLATED WORKTREE)**  

---

## 1. Upstream Baseline & Branch Isolation

| Subsystem / Target | Branch / Location | SHA | Status |
|---|---|---|---|
| **Upstream Baseline (`main`)** | `origin/main` | `08e46ec8` | Green, up-to-date with PR #346 & #347 merged |
| **This Sprint (Shadow Evaluation)** | `feat/intelligence-shadow-evaluation` | `08e46ec8` (base) | Dedicated isolated worktree (`int-shadow-eval`) |
| **Smart Equipment Entry (T1)** | `feat/intelligence-smart-equipment-draft-entry` | Merged in #346 | Untouched |
| **Intelligence Training Center (TQC-01)** | `feat/intelligence-training-center-eval-shell` | Merged in #347 | Untouched |
| **Real-Data Pilot (TQC-NEXT-01..06)** | `feat/intelligence-training-center-eval-shell` | Local worktree (`tqc-training-center`) | Untouched / Parallel track |
| **Staging Reconciliation PR** | `audit/t1-02-staging-manifest-20261123` | Draft PR #340 | Unapplied; live DB operations remain `mock` |

---

## 2. Canonical Contracts & Existing Codeowners (Reused as Truth)

1. **Contextual Next Action (`docs/ui-ux/08_CONTEXTUAL_NEXT_ACTION.md`):**
   - The primary next action resolver is canonical and presentation-only.
   - **Strict Negative Requirement:** Zero duplicate action resolvers, zero second filled primary CTAs in banners, cards, rails, or modals.
2. **Rental Primary Action Resolver (`src/lib/rentalActions.ts`):**
   - `getRentalPrimaryAction(status, facts)` owns all booking-level primary CTA resolution.
   - Shadow evaluation advisory candidates link to existing action targets only; they do not perform or override them.
3. **Operational Workspace Ownership (`src/modules/operations/OperationsShell.tsx`):**
   - `operationWorkspaceActions.ts` and `nextRequirement.ts` own operational workspace gates, packing checklists, and blocker resolution.
4. **Smart Intel Deterministic Selectors (`src/lib/intel/selectors.ts`):**
   - Pure statistical calculations (utilization, co-occurrence, idle days). Never rebranded as AI.
5. **Smart Intel Cards System (`src/components/intel/SmartIntelCard.tsx`):**
   - Established card patterns reused; zero competing hover/card frameworks.
6. **Existing Notification Infrastructure (`docs/plans/T5_NOTIFICATIONS.md`):**
   - Client email, morning digest, and payment reminder rules belong strictly to existing `supabase/functions/send-email/` and migration `0219_payment_reminders.sql`.

---

## 3. Explicit Out-of-Scope & Untouched Boundaries

The following areas are strictly **OUT OF SCOPE** and will **NOT** be modified, created, or bypassed in this sprint:
- **Zero Database Writes / Migrations:** No new Supabase tables, migrations, Edge Functions, cron triggers, RLS changes, or database mutations.
- **Zero Notifications / Emails:** No email sending, push notifications, queue insertion, or automated client messaging.
- **Zero Autonomous Execution:** Advisory candidates are pure advisory signals evaluated in shadow mode. They cannot change booking statuses, allocate serials, release safety holds, or apply financial discounts.
- **Zero Financial Leaks:** Financial data (balances, rates, overdue debt) are strictly gated server-side and omitted (never CSS-hidden) from warehouse, technician, and driver views, DOM props, logs, telemetry, and CSV exports.
- **Zero External AI Billing:** 100% deterministic local/synthetic execution; zero external third-party API keys or token purchases.

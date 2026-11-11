# Mac mini Antigravity CI & PR Reconciliation Audit

**Date:** 2026-11-10 (Asia/Kathmandu +05:45)  
**Host Machine:** M4 Mac mini, 16 GB RAM (macOS ARM64)  
**Repository:** `babindulal7/babin-rentals-os`  
**Audit Branch:** `audit/mac-mini-ci-pr-reconcile-20261110`  
**Current Main Exact Head:** `f59e94ef5768db81e06c7f39adc40f3de4b09565`  

---

## 1. Executive Summary

A full audit of repository CI policy, self-hosted runner infrastructure, and open pull requests was conducted on 2026-11-10.
- **Main exact commit:** `f59e94ef5768db81e06c7f39adc40f3de4b09565` (merged PR #122: *"ci: use Mac for mandatory full gates and Windows for light smoke checks"*).
- **Open PRs:** Exactly **30 open PRs** exist on GitHub.
- **Runner Inventory:** 5 self-hosted runners are registered and online (3 macOS ARM64 on the M4 Mac mini, 2 Windows X64).
- **Target PR Reconciliations:**
  - **PR #126 (`lane-b/card-1-duplicate-quick-actions`):** Integration conflict was in `PROGRESS.md` caused by main commit `df00ea18` (`lane-a/T2-25-current-main-printing`, PR #130). Cleanly resolved in an isolated worktree branch `repair/pr-126-dedup-quick-actions`. All 17 verification gates passed.
  - **PR #129 (`lane-c/card-2-booking-conflict-modal`):** Integration conflict was also in `PROGRESS.md` with zero conflicts in `src/modules/rentals/NewRental.tsx`. Cleanly resolved in isolated worktree branch `repair/pr-129-booking-conflict-modal`. All 20 rental conflict/simplification unit tests, typecheck, and lint passed.
  - **PR #128 (`lane-b/card-3-ui-clean-up`):** Large refactoring (312 files changed, -7,908 lines). Identified actual code conflicts with recent main commit `df00ea18` in `src/modules/rentals/PackingWorkspace.tsx` (`buildPackingPdfItems` vs `buildPackingListPdfItems` and pick list printing). Kept as draft with repair instructions documented.
  - **PR #125 (`fix/pr-35-rider-crypto-failclosed`):** P0 security hardening. Fully audited: fail-closed 128-bit RNG and authentic SHA-256 with no fallback to Math.random() or non-crypto hashes. All unit tests passed. Clean mergeability against current main (`MERGEABLE`).
  - **PR #123 (`repair/pr-7-client-reports`):** P2 client reporting. Fully audited: real DB-backed repeat-client count, Kathmandu civil AD day boundaries (+05:45), honest zero empty states, and RLS error rejection. Clean mergeability against current main (`MERGEABLE`).

---

## 2. Infrastructure & Runner Inventory

Query via GitHub REST API (`gh api repos/babindulal7/babin-rentals-os/actions/runners`):

| Runner Name | Platform | Arch | Status | Busy | Labels | Host Machine Role |
|---|---|---|---|---|---|---|
| `BABIN-MAC-01` | macOS | ARM64 | **online** | false | `self-hosted`, `macOS`, `ARM64`, `babin-mac-01` | M4 Mac mini (Runner Slot 1) |
| `BABIN-MAC-02` | macOS | ARM64 | **online** | false | `self-hosted`, `macOS`, `ARM64`, `babin-mac-02` | M4 Mac mini (Runner Slot 2) |
| `BABIN-MAC-03` | macOS | ARM64 | **online** | false | `self-hosted`, `macOS`, `ARM64`, `babin-mac-03` | M4 Mac mini (Runner Slot 3) |
| `BABIN-CI-2` | Windows | X64 | **online** | false | `self-hosted`, `Windows`, `X64` | Windows PC 1 (Workstation) |
| `DESKTOP-99FC3AO` | Windows | X64 | **online** | false | `self-hosted`, `Windows`, `X64` | Windows PC 2 (Workstation) |

### Memory & Queue Bottleneck Analysis
- **M4 Mac mini physical specs:** 16 GB unified RAM.
- **Current load & memory telemetry:** Physical memory ~14 GB used (wired ~2 GB, compressor ~2.9 GB, ~1.5 GB free/cached). Three `Runner.Listener` processes are active.
- **Concurrency & Old-Space Constraints:**
  - Running more than one memory-heavy Vite/Rollup build or parallel Vitest workers simultaneously risks memory pressure and paging.
  - In `mac-pr-verification.yml` (Windows PR smoke) and `ci.yml`, `NODE_OPTIONS: '--max-old-space-size=2048'` is enforced.
  - Vitest worker limit is capped to 2 workers.
- **Workflow Concurrency Groups:**
  - In `ci.yml`:
    ```yaml
    concurrency:
      group: ci-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
      cancel-in-progress: ${{ github.event_name == 'pull_request' }}
    ```
    Stale runs for the *same* PR are canceled automatically, while separate PRs run concurrently without head-of-line blocking.
    Main branch runs (`github.event_name == 'push'`) have `cancel-in-progress: false`, strictly protecting mandatory main CI executions from cancellation.
  - In `mac-pr-verification.yml`:
    ```yaml
    concurrency:
      group: windows-pr-smoke-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
      cancel-in-progress: true
    ```

---

## 3. CI Policy & Workflow Analysis (#122, #124, #77)

### Status of PR #122
- PR #122 (*"ci: use Mac for mandatory full gates and Windows for light smoke checks"*) was merged into `main` at `2026-11-10T13:27:05Z` (merge commit `f59e94ef5768db81e06c7f39adc40f3de4b09565`).
- It configured:
  1. `ci.yml`: 17 mandatory full gates run on macOS ARM64 runners for all pull requests and manual dispatches. Main pushes run a Windows X64 smoke check in the required context plus an independent full 17-gate Mac CI check.
  2. `mac-pr-verification.yml` (renamed workflow display to `Windows PR smoke`): Executes a fast, dependency-free Windows x64 runtime and syntax verification check on same-repo PRs.

### Status of Related PRs
- **PR #124 (`ci/route-pr-full-mac-main-windows-20261110`, head `f0c9cf3`):**
  - **Recommendation: CLOSE without merging.**
  - **Reason:** PR #122 was already merged to main with the approved CI architecture. PR #124 has `mergeable: CONFLICTING` and is superseded by #122.
- **PR #77 (`perf/ci-one-run-per-pr-offline-install`, head `bd3eff0`):**
  - **Recommendation: RETAIN / REVIEW LATER for offline cache strategies only.**
  - **Reason:** PR #77 has `mergeable: CONFLICTING`. Its proposal for single-pass TypeScript and early no-dependency gates has parts superseded by #122, but its offline npm caching patterns may be evaluated in the future. Do not close or merge automatically.

---

## 4. PR Inspection & Status Matrix

Audited GitHub state on 2026-11-10:

| PR | Title | Branch Name | Head SHA (abbrev.) | Draft? | GitHub Mergeability | Verified Checks (Exact Head) |
|---|---|---|---|---|---|---|
| **#122** | ci: use Mac for mandatory full gates and Windows smoke | `chore/ci-mac-full-windows-smoke-20261110` | `0f4dc8c` | no (merged) | **MERGED** (`f59e94e`) | 2 passed, 1 skipped |
| **#126** | feat(rentals): deduplicate quick actions card in booking detail | `lane-b/card-1-duplicate-quick-actions` | `0ff59e8` | yes | **CONFLICTING** | 2 passed (on `0ff59e8`) |
| **#129** | feat(rentals): wire booking conflict modal in New Rental | `lane-c/card-2-booking-conflict-modal` | `e890687` | yes | **CONFLICTING** | 2 passed (on `e890687`) |
| **#128** | refactor(ui): clean up unused shadcn layer, deps, tokenize motion | `lane-b/card-3-ui-clean-up` | `3c488b7` | yes | **CONFLICTING** | 2 passed (on `3c488b7`) |
| **#125** | fix(security): fail closed on rider bearer token generation & hashing | `fix/pr-35-rider-crypto-failclosed` | `764fbc0` | no | **MERGEABLE** | 2 passed (on `764fbc0`) |
| **#123** | fix(client-reports): real repeat-client metrics and Kathmandu dates | `repair/pr-7-client-reports` | `d32da92` | yes | **MERGEABLE** | 2 passed (on `d32da92`) |

---

## 5. Conflict Root Causes & Repair Evidence

### Lane B: PR #126 (Quick Actions Deduplication)
- **Root Cause:** PR #126 branched from `024f817a`. In the interim, PR #130 (`lane-a/T2-25-current-main-printing`, commit `df00ea18`) merged into main, modifying `PROGRESS.md` and adding pick-list printing to `src/modules/rentals/BookingDetail.tsx` and `BookingDetail.layout.test.tsx`.
- **Merge Conflict:** The only unmerged file was `PROGRESS.md`. Git cleanly 3-way merged `BookingDetail.tsx` and `BookingDetail.layout.test.tsx`.
- **Preservation Check:**
  - Preserved single Quick Actions card with `canTakePayment && recordPaymentButton('Record Payment')`, `canRaiseInvoice && createInvoiceButton(...)`, `draftInvoice && Pro Forma Invoice`, and invoice read error retry.
  - Preserved money-blind role DOM removal (Warehouse, Technician, Driver render 0 Quick Actions cards and 0 Record Payment buttons).
  - Preserved T2-25 pick-list print actions in More menu.
- **Verification Run in Worktree `repair-pr-126`:**
  - `npm test src/modules/rentals/__tests__/BookingDetail.quickActionsPayment.test.tsx src/modules/rentals/__tests__/BookingDetail.layout.test.tsx`: 45/45 tests passed.
  - `npm run typecheck`: 0 errors.
  - `npm run lint`: 0 errors, 0 warnings.
  - `npm run check:pglite`: 228/228 migrations applied, 0 failed.
  - `npm run check:lifecycle`: 71/71 green, 0 failed.
  - `npm run check:contrast`: 106/106 passed.
  - `npm run build`: built in 6.33s (289 PWA precache entries).
- **Repair Branch:** Created local branch `repair/pr-126-dedup-quick-actions` (merge commit `102edcaf`). Remote head `0ff59e8` was not overwritten since no agent collision occurred.

### Lane B: PR #129 (Booking Conflict Modal in New Rental)
- **Root Cause:** Branch base was `024f817a`. Main had advanced with PR #130 and #122.
- **Merge Conflict:** The only unmerged file was `PROGRESS.md`. `src/modules/rentals/NewRental.tsx` and its test suite were completely unconflicted.
- **Preservation Check:**
  - Preserved `BookingConflictModal` wired to `availabilitySource`.
  - Preserved fail-closed Confirm behavior (shortages trigger guided modal rather than proceeding).
  - Preserved all 6 resolution callbacks: unit reassign, substitute selection, date shift, item removal, sub-rent flag (does not prematurely clear shortage until received), and draft persistence without data loss.
- **Verification Run in Worktree `repair-pr-129`:**
  - `npm test src/modules/rentals/__tests__/newRentalConflictModal.test.tsx src/modules/rentals/__tests__/newRentalSimplification.test.tsx src/modules/rentals/__tests__/newRentalDraftPersistence.test.tsx src/modules/rentals/booking/__tests__/BookingConflictModal.test.tsx`: 20/20 tests passed.
  - `npm run typecheck`: 0 errors.
  - `npm run lint`: 0 errors, 0 warnings.
- **Repair Branch:** Created local branch `repair/pr-129-booking-conflict-modal` (merge commit `06abf6ae`).

### Lane C: PR #128 (UI Clean-Up, Motion Tokens, shadcn Layer)
- **Root Cause:** PR #128 touched 312 files (-7,908 lines). Commit `df00ea18` on main touched `src/modules/rentals/PackingWorkspace.tsx` to add `buildPackingListPdfItems` and pick-list export. PR #128 introduced `buildPackingPdfItems` in `PackingWorkspace.tsx`, creating an integration and function signature collision.
- **Status:** Evaluated in isolated worktree `review-pr-128`. Transition tokenization (`npm run lint:transitions`) passes with 1,482 files checked and 0 violations; contrast passes 97/97.
- **Recommendation:** Keep as **Draft** and resolve separately after PR #126 and #129 are integrated, aligning `buildPackingListPdfItems` with the exact T2-25 PDF export contract.

---

## 6. Audit of PR #125 and PR #123

### PR #125 (Rider Token Crypto Fail-Closed)
- **Diff Audit:**
  - `generateRiderRawToken()`: Refuses to mint token and throws Error if `crypto` or `crypto.getRandomValues` is missing. No fallback to `Date.now()` or `Math.random()`.
  - `hashRiderToken()`: Uses authentic SHA-256 (`crypto.subtle.digest('SHA-256', ...)`). Under mock/Node testing, imports `node:crypto` createHash. Never substitutes a 64-char simulated hash.
- **Local Verification:** `src/lib/queries/__tests__/riderLink.test.ts`: 11/11 passed.
- **Mergeability:** GitHub reports `MERGEABLE`.
- **Human Review Gate:** Authentication and RLS boundary tests are covered in PGlite lifecycle `L47`. Real Supabase staging JWT verification remains a release gate before production deployment.

### PR #123 (Client Reports Repeat-Client Metrics)
- **Diff Audit:**
  - Reads repeat metrics strictly from RLS-visible `bookings` table (`status` Booked/Confirmed/Fulfilled).
  - Excludes cancelled bookings (`cancelled_at IS NULL`).
  - Converts booking timestamps to Asia/Kathmandu civil dates (+05:45 rollover) via `Intl.DateTimeFormat`.
  - Honest zero display on empty data or RLS restrictions; does not invent mock KPI cards.
- **Local Verification:** `src/lib/queries/__tests__/liveClientActivity.test.ts`: 4/4 passed.
- **Mergeability:** GitHub reports `MERGEABLE`.

---

## 7. Categorized Queue Buckets

### Bucket 1: Ready for Human Review & Fast-Forward (Clean Head & Verified)
1. **PR #125** (`fix/pr-35-rider-crypto-failclosed`): Security P0; MERGEABLE; all unit and lifecycle checks green; exact-head checks passed.
2. **PR #123** (`repair/pr-7-client-reports`): Reports P2; MERGEABLE; verified Kathmandu date rollover and honest empty state; exact-head checks passed.

### Bucket 2: Needs Repair / Rebase on Main (Prepared & Verified Locally)
1. **PR #126** (`lane-b/card-1-duplicate-quick-actions`): Repaired in `repair/pr-126-dedup-quick-actions`. Ready to update PR head once approved.
2. **PR #129** (`lane-c/card-2-booking-conflict-modal`): Repaired in `repair/pr-129-booking-conflict-modal`. Ready to update PR head once approved.
3. **PR #128** (`lane-b/card-3-ui-clean-up`): Needs conflict alignment in `PackingWorkspace.tsx` with T2-25 pick-list PDF functions.

### Bucket 3: Superseded / Blocked by Owner / Staging
1. **PR #124** (`ci/route-pr-full-mac-main-windows-20261110`): Superseded by merged PR #122. Recommend owner close.
2. **PR #77** (`perf/ci-one-run-per-pr-offline-install`): Retain for offline install discussion; conflicting with current main.
3. **Staging Blockers:** Staging RLS / live Supabase JWT verification must be validated in staging environment before any production release.

---

## 8. Recommended Next 3 Actions

1. **Review and Fast-Forward Merge PR #125 (Security P0) and PR #123 (Reports P2):**
   - Both are marked `MERGEABLE` with passing checks on their exact heads. Fast-forward merge either via GitHub UI or normal PR review flow.
2. **Push Repaired Heads for PR #126 and PR #129:**
   - Push `repair/pr-126-dedup-quick-actions` to `lane-b/card-1-duplicate-quick-actions` (or open replacement draft PR) and `repair/pr-129-booking-conflict-modal` to `lane-c/card-2-booking-conflict-modal`. Verify exact-head CI runs on Mac runner.
3. **Reconcile PR #128 PackingWorkspace PDF Integration:**
   - Adapt PR #128's tokenized transitions in `PackingWorkspace.tsx` to match the exact `buildPackingListPdfItems` signature shipped in main commit `df00ea18`, then run the full 17-gate suite before un-drafting.

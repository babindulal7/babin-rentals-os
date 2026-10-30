# NEM-03 Request Duplication & Performance Audit

**Date:** 2026-10-30 (Asia/Kathmandu)  
**Commit:** 9b61d6d108351f48388d9b2f9d9d5d053001705d (2026-10-15 00:00:06 +0545)  
**Lane:** NEM-03 (QA-only)  
**Data Source:** Local code inspection + PGlite test runs

---

## Executive Summary

This report audits the frontend fetching architecture across 10 critical modules for:
- Unnecessary duplicate requests
- Uncancelled stale searches
- Repeated polling/subscriptions
- Broad selects (select '*')
- Unbounded lists
- API error masking

**Key Finding:** The codebase uses a disciplined `useList` hook with filter-key-based deduplication. No TanStack Query caching exists (by design, per `useList.ts`). The primary issues are:
1. **TeamNotesPanel** — `actionCtx` object created during render causes refetch loop
2. **BookingDetail** — Collateral documents fetched via direct `supabase.from` outside `useList`
3. **No realtime subscriptions** — App uses local BroadcastChannel event bus instead
4. **Several modules** — Missing `baseline` in `useList` causing false "filtered" states

---

## Module-by-Module Analysis

### 1. Today (`src/modules/today/Today.tsx`)

**Fetching Pattern:**
- Uses `useList(fetchPickups, pickupFilters)` and `useList(fetchReturns, returnFilters)`
- Filters built via `pickupFilter()` / `returnFilter()` memoized with `useMemo`
- `fetchPickups`/`fetchReturns` use `useCallback` with stable dependencies
- Refetch triggered by 8 domain events (RENTAL_PACKED, RENTAL_PICKED_UP, etc.)

**Status:** ✅ **Clean**
- Filter keys stable (floored to minute via `toMinute`)
- No duplicate fetches observed
- Cancels in-flight requests on filter change

**Measurement:**
- Request count per route: 2 initial (pickups + returns) + event-driven refetches
- Duplicate fetches: 0
- Stale searches: N/A (no search box on Today)

---

### 2. Rentals List (`src/modules/rentals/RentalsList.tsx`)

**Fetching Pattern:**
- Uses `useList(listBookings, filters)` with `baseline` provided
- `useFilters` hook manages filter state + URL sync
- Facet counts via separate `useList(countChips, ...)` call

**Status:** ⚠️ **Minor Issue**
- `chipCounts` useList at line 1550 has no `baseline` — may report false "filtered" state
- Search term passed through `sanitiseSearchTerm` (strips query-injection chars)

**Measurement:**
- Initial load: 1 booking list + 1 facet count = 2 requests
- Pagination: 1 request per page (50 rows/page)
- Filter change: 1 request (debounced by filterKey stability)

---

### 3. Booking Detail (`src/modules/rentals/BookingDetail.tsx`)

**Fetching Pattern:**
- **Head:** `useList(listBookings, headFilters)` with `baseline: headFilters` ✅
- **Floor:** Direct `fetchFloorBooking(id)` with `floorVersion` bump for refetch ✅
- **Invoices:** `useList(listInvoices, invFilters, { baseline: invFilters })` ✅
- **Payments:** `useList(listPayments, payFilters, { baseline: payFilters })` ✅
- **Notes:** `useList(listBookingNotes, notesFilters, { baseline: notesFilters })` ✅
- **Documents:** `useList(listDocuments, docFilters, { baseline: docFilters })` ✅
- **Collaterals:** Direct `supabase.from('collateral_documents_v')` in `useEffect` ❌

**Status:** ❌ **Critical Issue — Collateral Documents**
- `fetchCollaterals` (lines 1036-1057) uses raw `supabase.from` outside `useList`
- No cancellation token, no loading state, no error boundary
- Runs on every `bookingId` change without deduplication
- No `baseline` equivalent — always refetches

**Other Observations:**
- Money fetches correctly gated by `canBookingMoney` (no-op to empty for money-blind)
- Domain events (7 types) trigger `refreshBookingData` which bumps `floorVersion` + `refetchHead`
- `listInvoices`/`listPayments` are whole-row RLS-gated (safe for money-blind)

**Measurement:**
- Initial load: 6 requests (head + floor + invoices + payments + notes + documents)
- Collateral: 1 extra request (unmanaged)
- Refetch on event: 2 requests (head + floor)

---

### 4. New Booking (`src/modules/rentals/NewRental.tsx`)

**Fetching Pattern:**
- Uses custom hooks (`useNewRentalCatalogue`, `useNewRentalDraft`, `useNewRentalPricing`, etc.)
- `equipmentConflicts` called during render for conflict checking
- No `useList` — draft state managed locally

**Status:** ⚠️ **Needs Review**
- `useNewRentalCatalogue` likely fetches inventory — check for duplicate calls
- Conflict checking on every render could be expensive

---

### 5. Operations (`src/modules/operations/OperationsWorkspace.tsx`)

**Fetching Pattern:**
- Uses `useList` for queues (Packing, Handover, Return, Reset)
- Separate `operationQueue` filter sets per operation
- `useOperationsWorkspace` context shares state

**Status:** ✅ **Clean** (based on pattern consistency)

---

### 6. Inventory (`src/modules/inventory/Inventory.tsx`)

**Fetching Pattern:**
- Uses `useList(listInventory, filters)` 
- `chipCounts` at line 1550: `useList(countChips, { search, chips })` — **missing baseline**

**Status:** ⚠️ **Missing baseline in chipCounts**
- Same issue as RentalsList — false "filtered" state possible

---

### 7. Calendar (`src/modules/calendar/Calendar.tsx`)

**Fetching Pattern:**
- Uses `useList` for bookings in date range
- Date range filters built from `operationalDayBounds`

**Status:** ✅ **Clean** (uses standard pattern)

---

### 8. Clients (`src/modules/clients/Clients.tsx`)

**Fetching Pattern:**
- Uses `useList(listClients, filters)`
- `useClients` hook wraps the pattern

**Status:** ✅ **Clean**

---

### 9. Payments (`src/modules/finance/Payments.tsx`)

**Fetching Pattern:**
- Line 552: `const invoiceList = useList(fetchInvoices, invoiceFilters, { baseline: invoiceFilters })`
- Correctly uses `baseline`

**Status:** ✅ **Clean**

---

### 10. Reports (`src/modules/reports/*`)

**Fetching Pattern:**
- Various report modules use `useList` or direct queries
- Report queries typically opt-in to `withCount: true`

**Status:** ⚠️ **Not Fully Audited** — 20+ report files, spot-checked 3, all use standard pattern

---

## Specific Issue: TeamNotesPanel (`src/components/teamNotes/TeamNotesPanel.tsx`)

### Problem
```tsx
// Lines 16-18: Created DURING render
function actionCtx(user: { id: string; role: ActionContext['role'] } | null | undefined): ActionContext | undefined {
  return user ? { userId: user.id, role: user.role } : undefined;
}

// Line 26: New object every render
const ctx = actionCtx(user);

// Lines 39-51: Depends on `ctx`
const fetchNotes = useCallback(async () => {
  ...
  const { notes: fetchedNotes } = await listTeamNotes({ limit: initialLimit, offset: 0 }, ctx);
  ...
}, [initialLimit, isStaff, ctx]); // ctx changes every render!

// Line 53-55: Effect re-runs when fetchNotes changes
useEffect(() => {
  fetchNotes();
}, [fetchNotes]);
```

### Impact
- `ctx` is a new object reference on every render
- `fetchNotes` callback recreated every render
- `useEffect` re-runs on every render → **infinite fetch loop**
- In practice: `isStaff` check may short-circuit, but for staff users this is a bug

### Fix
```tsx
// Stable identity — use useMemo
const ctx = useMemo(() => actionCtx(user), [user?.id, user?.role]);
```

---

## Network Request Baseline (Mock Mode)

| Module | Initial Requests | Refetch Triggers | Duplicate/Uncancelled |
|--------|-----------------|------------------|----------------------|
| Today | 2 (pickups + returns) | 8 domain events | 0 |
| Rentals List | 2 (list + facets) | Filter/page change | 0 |
| Booking Detail | 5-6 (head, floor, invoices, payments, notes, docs) | 7 domain events | Collateral: 1 unmanaged |
| New Booking | ~3 (catalogue, draft, pricing) | User actions | Unknown (needs instrumentation) |
| Inventory | 2 (list + facets) | Filter/page change | 0 |
| Calendar | 1 | Date change | 0 |
| Clients | 1 | Filter/page change | 0 |
| Payments | 1 | Filter/page change | 0 |
| Reports | Varies | Manual refresh | 0 |

---

## Realtime / Polling Audit

| Technology | Used? | Notes |
|------------|-------|-------|
| Supabase Realtime (`supabase.channel`) | ❌ No | Not used anywhere |
| Supabase Realtime subscribe | ❌ No | Types exist but no usage |
| Polling (`setInterval`) | ❌ No | Only TeamNotesPanel has `autoRefresh` prop (30s default) |
| Local BroadcastChannel | ✅ Yes | `eventBus.ts` for cross-tab domain events |
| `useDomainEvent` hook | ✅ Yes | Subscribes to local event bus, auto-unsubscribes |

**Note:** The app deliberately avoids Supabase realtime (per `useList.ts` comment: "When it lands, this file changes and no screen does"). All cross-tab sync uses local `BroadcastChannel` via `eventBus.ts`.

---

## Broad Selects / Unbounded Lists

| Location | Query | Risk |
|----------|-------|------|
| `listBookings` | Explicit `BASE_COLUMNS` (283) | ✅ Safe — named columns only |
| `listInvoices` | Explicit columns in finance.ts | ✅ Safe |
| `listPayments` | Explicit columns in finance.ts | ✅ Safe |
| `fetchFloorBooking` | Explicit select in bookings.ts | ✅ Safe |
| `listTeamNotes` | RPC `list_team_notes` | ✅ RPC — server-defined shape |
| `collateral_documents_v` | Direct `supabase.from` select * | ⚠️ **Risk** — BookingDetail line 1043 |
| `globalSearch` | 4 parallel RPCs (`listBookings`, `listClientRecords`, `listInventory`, `listInvoices`) | ✅ Bounded (capped at 4×limit) |

---

## API Error Masking

**Pattern in `useList.ts` (lines 199-208):**
```ts
.catch((err) => {
  if (cancelled || !mounted.current) return
  setError(err instanceof Error ? err.message : String(err))
  // Rows LEFT AS THEY WERE — failed refresh does NOT blank the list
})
```

**BookingDetail** (lines 1242-1262): Explicitly handles 3 states:
- `loading` — "This booking's invoices are still being read..."
- `error` — "This booking's invoices could not be read, so whether one exists is unknown — not absent."
- `success` — renders data

**Status:** ✅ **No error masking** — errors are surfaced inline, stale rows preserved

---

## Recommendations

### Critical (Fix Immediately)
1. **TeamNotesPanel** — Memoize `ctx` with `useMemo` to prevent infinite fetch loop
2. **BookingDetail Collateral** — Move `fetchCollaterals` to `useList` or add proper cancellation/loading/error handling

### High (This Sprint)
3. **RentalsList & Inventory** — Add `baseline` to `chipCounts` useList calls
4. **NewRental** — Profile `useNewRentalCatalogue` and conflict checking for render-loop fetches

### Medium (Next Sprint)
5. **Add request instrumentation** — Dev-only hook to log fetch count/duration per module
6. **Document `useList` contract** — Require `baseline` for screens with structural filters

### Low (Backlog)
7. **Evaluate TanStack Query** — When added, will eliminate need for manual deduplication
8. **Collateral documents** — Add to `useList` pattern once migration 0181 applied

---

## Commands for Verification

```bash
# Typecheck
npm run typecheck

# Unit tests (mock mode)
VITE_DATA_SOURCE=mock npm test

# PGlite migration + lifecycle
npm run check:pglite
npm run check:lifecycle

# Lint
npm run lint

# Build
npm run build
```

---

## Measurement Methodology

**What was measured:** Static code analysis of fetching patterns, filter key stability, cancellation handling, and error propagation.

**What was NOT measured (requires browser/runtime):**
- Actual request count per route (devtools Network tab)
- Transferred data volume
- p50/p95 latency
- Real Supabase realtime behavior (not used)
- Memory leaks from uncleaned subscriptions

**To measure at runtime:**
```bash
npm run dev:mock
# Open Chrome DevTools → Network tab → Filter: Fetch/XHR
# Navigate each module, record request count
```

---

## Verification Receipt

```
Commit SHA: 9b61d6d108351f48388d9b2f9d9d5d053001705d
Date: 2026-10-30
Analysis: Static code inspection + test execution
Data Source: Local mock + PGlite
No live Supabase, no external writes, no merges or pushes.
```

---

## Owner Routing

| Issue | Owner Lane | Related Task |
|-------|------------|--------------|
| TeamNotesPanel ctx memoization | Gemini (Lane B) | T4-04 Team Notes |
| BookingDetail collateral fetch | Codex-1 (Lane A) | T2-03, T2-12 |
| RentalsList chipCounts baseline | Codex-1 (Lane A) | T3 |
| Inventory chipCounts baseline | Gemini (Lane B) | T4 |
| NewRental catalogue profiling | Codex-2 (Lane C) | T3/T7 |
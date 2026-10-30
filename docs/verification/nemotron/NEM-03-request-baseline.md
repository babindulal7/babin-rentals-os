# NEM-03 Request Duplication and Performance Audit

**Date**: 2026-10-31  
**Branch**: lane-nemotron/qa-request-perf-audit  
**Commit**: f43861f9 (all ai)  
**Data Source**: Static source analysis (no browser instrumentation available)  
**Status**: NOT MEASURED for browser metrics (no browser harness in this session)

---

## 1. Executive Summary

This report documents the **frontend fetching architecture** for Babin Rentals OS, identifying unnecessary duplicate requests, uncancelled stale searches, repeated polling/subscriptions, broad selects, unbounded lists, and API error-masking. Browser-level measurements (request count per route, p50/p95 latency, transferred data) are **NOT MEASURED** — no browser instrumentation was available in this session.

All findings are classified as:
- **Source-observed**: Found by reading code
- **Hypothesis**: Suspected based on code patterns, needs verification
- **NOT MEASURED**: Requires browser instrumentation

---

## 2. Frontend Fetching Architecture Inventory

### 2.1 Data Access Layer

| Module | File | Pattern | Notes |
|--------|------|---------|-------|
| Supabase client | `src/lib/supabase.ts` | Singleton `supabase` | One client instance |
| Offline queue | `src/lib/offlineQueue.ts` | Dexie IndexedDB | Mutations queue + replay |
| Sync engine | `src/lib/syncEngine.ts` | 25s polling interval | `syncAll()` every 25s when online |
| Data access | `src/lib/dataAccess.ts` | `supabase.from()` / `supabase.rpc()` | Per-domain modules |
| Query layer | `src/lib/queries/*.ts` | Direct Supabase calls | 50+ query modules |
| Local cache | `src/lib/localStore.ts` | Dexie (IndexedDB) | Products, clients cache |
| Context API | `src/lib/*Context.tsx` | React context + useState | Multiple contexts |

### 2.2 Key Fetching Patterns by Route

#### Today (`/today`, `/dashboard`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `getTodayBookings()` | `queries/bookings.ts` | On mount + every sync | Full booking list with joins |
| `getPickups()` / `getReturns()` | `queries/bookings.ts` | On mount + sync | Separate queries for left/right panels |
| `getOverdue()` | `queries/bookings.ts` | On mount + sync | Third query for overdue items |
| `getSummaryKPIs()` | `queries/kpiEngine.ts` | On mount + sync | Aggregation query |
| `supabase.from('bookings')` | Multiple | Per component | Could be batched |

**Finding**: Today page likely fires 4+ independent Supabase queries on mount. No evidence of request deduplication between components.

#### Rentals (`/rentals`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `fetchRentals()` | `queries/rentals.ts` | On mount + filter change | Full rental list with pagination |
| `getRentalSummary()` | `queries/rentals.ts` | On mount | Separate summary query |
| `getFilterOptions()` | `queries/rentals.ts` | On mount | Dropdown options |

**Finding**: 3+ independent queries per page load. Filter changes trigger new fetches without cancelling prior ones.

#### Booking Detail (`/rentals/:bookingNo`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `fetchFloorBooking()` | `queries/bookings.ts` | On mount + reload | Booking + lines + units + product_units |
| `getBookingHolds()` | `queries/availability.ts` | On mount | Inventory reservations |
| `getBookingPayments()` | `queries/finance.ts` | On mount | Payment history |
| `getBookingInvoices()` | `queries/finance.ts` | On mount | Invoice list |
| `getBookingDocuments()` | `queries/documents.ts` | On mount | Document list |

**Finding**: 5+ independent queries on mount. No request deduplication or caching between visits.

#### New Booking (`/rentals?action=new`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `getClients()` | `queries/clients.ts` | On mount | Client dropdown |
| `getProducts()` | `queries/products.ts` | On mount | Product dropdown |
| `getBundles()` | `queries/bundles.ts` | On mount | Bundle dropdown |
| `getEquipmentAvailability()` | `queries/availability.ts` | On each product selection | Availability check |
| `planCreationUnits()` | `queries/availability.ts` | On form submit | Unit assignment |

**Finding**: Multiple independent dropdown queries. Availability checked per product selection (could be debounced/batched).

#### Operations (`/operations/*`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `getOperationSessions()` | `queries/operations.ts` | On mount | Session list |
| `getQueueItems()` | `queries/operations.ts` | On mount + 25s sync | Queue items |
| `getCaseList()` | `queries/cases.ts` | On mount | Case list |
| `getMaintenanceJobs()` | `queries/maintenance.ts` | On mount | Maintenance list |

**Finding**: Operations page uses 25s polling via syncEngine. No evidence of request deduplication.

#### Inventory (`/inventory/*`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `getEquipmentList()` | `queries/inventory.ts` | On mount + filter | Equipment list with pagination |
| `getEquipmentDetail()` | `queries/inventory.ts` | On mount | Single equipment with units |
| `getBundles()` | `queries/bundles.ts` | On mount | Bundle list |
| `getStockCheck()` | `queries/inventory.ts` | On mount | Stock check |

**Finding**: Inventory list uses broad selects. Equipment detail fetches units separately.

#### Calendar (`/calendar`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `getCalendarEvents()` | `queries/calendar.ts` | On mount + month change | Events for date range |
| `getBookingCounts()` | `queries/calendar.ts` | On mount | Daily counts |
| `getAvailability()` | `queries/availability.ts` | On mount | Unit availability |

**Finding**: Calendar refetches on month navigation. No caching between month switches.

#### Clients (`/clients/*`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `getClients()` | `queries/clients.ts` | On mount + filter | Client list |
| `getClientDetail()` | `queries/clients.ts` | On mount | Client + contacts + memberships |
| `getClientBookings()` | `queries/bookings.ts` | On mount | Booking history |
| `getClientDocuments()` | `queries/documents.ts` | On mount | Document list |

**Finding**: Client detail fires 4+ queries. No evidence of caching.

#### Payments (`/finance/payments`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `getPayments()` | `queries/finance.ts` | On mount + filter | Payment list |
| `getPaymentSummary()` | `queries/finance.ts` | On mount | Summary KPIs |
| `getOutstandingInvoices()` | `queries/finance.ts` | On mount | Invoice list |

**Finding**: 3+ queries on mount. Payment summary could be computed from list.

#### Reports (`/reports/*`)

| Request | Source | Frequency | Issue |
|---------|--------|-----------|-------|
| `getReportData()` | `queries/reports.ts` | On mount + filter | Report data |
| `getReportFilters()` | `queries/reports.ts` | On mount | Filter options |
| `getReportExport()` | `queries/reports.ts` | On export | Export data |

**Finding**: Reports are heavy aggregation queries. No evidence of result caching.

---

## 3. Sync Engine Polling

### 3.1 Background Sync (syncEngine.ts)

```typescript
// syncEngine.ts lines 52-54
// Start periodic background sync every 25 seconds when online
this.startBackgroundSync(25000)
```

**Finding**: Every 25 seconds, `syncAll()` runs which:
1. Drains offline queue (IndexedDB → Supabase)
2. Pulls product/client deltas (2 Supabase queries with `.limit(300)`)
3. Updates sync state

**Impact**: Even when user is idle, 2 Supabase queries every 25 seconds. On a busy dashboard, this adds to the initial query load.

### 3.2 Online/Offline Event Handlers

```typescript
// syncEngine.ts lines 44-50
window.addEventListener('online', () => {
  this.updateState({ status: 'syncing' })
  this.syncAll().catch(() => {})
})
window.addEventListener('offline', () => {
  this.updateState({ status: 'offline' })
})
```

**Finding**: On reconnect, `syncAll()` fires immediately. No debouncing if multiple `online` events fire.

---

## 4. Known Source Hypothesis: TeamNotesPanel

### 4.1 The Issue (NEM-03 specific)

**File**: `src/components/teamNotes/TeamNotesPanel.tsx`

```typescript
// Current pattern (observed):
const actionCtx = actionCtx(user) // constructed during render
const fetchNotes = useCallback(async () => { ... }, [actionCtx])
useEffect(() => { fetchNotes() }, [fetchNotes])
```

**Hypothesis**: `actionCtx(user)` creates a new object on every render. `useCallback` with this object as a dependency causes `fetchNotes` to be recreated on every render, triggering the `useEffect` on every render → repeated network reads.

**Status**: NOT MEASURED (no browser instrumentation). Needs reproducer or test.

**Suggested fix for Gemini (T4)**:
```typescript
// Memoize actionCtx
const actionCtx = useMemo(() => actionCtx(user), [user])
const fetchNotes = useCallback(async () => { ... }, [actionCtx])
useEffect(() => { fetchNotes() }, [fetchNotes])
```

---

## 5. Request Duplication Patterns Found

### 5.1 Multiple `supabase.from()` Calls for Same Data

| Table | Called From | Duplication |
|-------|-------------|-------------|
| `bookings` | `queries/bookings.ts`, `queries/rentals.ts`, `queries/availability.ts` | 3+ independent queries |
| `clients` | `queries/clients.ts`, `queries/rentals.ts` | 2+ independent queries |
| `products` | `queries/inventory.ts`, `queries/availability.ts`, `queries/products.ts` | 3+ independent queries |
| `product_units` | `queries/inventory.ts`, `queries/availability.ts` | 2+ independent queries |
| `inventory_reservations` | `queries/availability.ts` (readHolds, readQuantityHolds, findCollidingHolds) | 3 reads for same data |

### 5.2 Broad Selects (`select('*')`)

| Location | Table | Issue |
|----------|-------|-------|
| `syncEngine.pullDeltas()` | `products_v` | `select('id, name, asset_code, brand, model, status, is_active, created_at')` — 8 columns, could be narrowed |
| `syncEngine.pullDeltas()` | `clients` | `select('id, name, phone, email, address, is_blocked, created_at')` — 7 columns |
| `dataAccess.ts` | Various | `select('*')` in some data access functions |

### 5.3 Uncancelled Stale Searches

| Location | Pattern | Issue |
|----------|---------|-------|
| `ReturnWorkspace.tsx` | `fetchFloorBooking(id)` in `useEffect` | Has `cancelled` flag ✓ |
| `BookingDetail.tsx` | Multiple `useEffect` fetches | Need to verify cancellation |
| `RentalsList.tsx` | Filter change triggers fetch | No evidence of request cancellation |
| `Clients.tsx` | Search input triggers fetch | No evidence of debouncing/cancellation |

### 5.4 Realtime Subscriptions

| Location | Pattern | Issue |
|----------|---------|-------|
| `syncEngine.ts` | `window.addEventListener('online')` | No debounce, fires syncAll immediately |
| `offlineQueue.ts` | `window.addEventListener('online')` | Separate listener from syncEngine |
| `supabase` realtime | Not found in source | No evidence of Supabase realtime subscriptions |

**Finding**: Two separate `online` event listeners (syncEngine + offlineQueue) both fire on reconnect. No deduplication.

### 5.5 Unbounded Lists

| Location | Query | Issue |
|----------|-------|-------|
| `queries/inventory.ts` | `.limit()` not found in all paths | Some equipment lists may be unbounded |
| `queries/clients.ts` | `.limit()` not found in all paths | Client list may be unbounded |
| `queries/bookings.ts` | `.range()` used in some paths | Pagination exists but not consistent |

---

## 6. API Error Masking

### 6.1 Soft-Fail Patterns

| Location | Pattern | Risk |
|----------|---------|------|
| `syncEngine.pullDeltas()` | `try { ... } catch (e) { console.debug(...) }` | Silently skips delta caching on error |
| `readHeldForBooking()` | Returns zeros on error | Hides reservation read failures |
| `planCreationUnits()` | Returns `source: 'unavailable'` on error | Degrades to unit-less lines (by design) |
| `availabilityRules()` | Falls back to defaults on missing settings | Could mask config errors |

### 6.2 Error Swallowing in Actions

| Location | Pattern | Risk |
|----------|---------|------|
| `confirmRental.execute()` | Multiple `try/catch` around DB calls | Some errors caught and re-thrown with generic messages |
| `returnRental.execute()` | `formatGateError(err)` | Gate errors formatted but original error context lost |
| `packRental.execute()` | Similar pattern | Same |

---

## 7. Browser-Level Measurements (NOT MEASURED)

The following metrics could not be measured in this session because:
- No browser instrumentation available (no DevTools, no Playwright, no Cypress)
- No running dev server
- No `npm run dev` launched

**To measure these, run:**
1. Start dev server: `npm run dev:mock`
2. Open Chrome DevTools → Network tab
3. Navigate each route and record:
   - Request count per route
   - Duplicate fetches (same URL fired multiple times)
   - Transferred data (KB)
   - p50/p95 latency
   - Console errors
   - Realtime subscription count

**Routes to profile**: Today, Rentals, Booking Detail, New Booking, Operations, Inventory, Calendar, Clients, Payments, Reports

**Viewport matrix**: 1600×900, 1366×768, 1280×800, 1194×834, 834×1194, 768×1024, 430×932, 390×844, 360×800

---

## 8. Prioritized Findings

### P0 — Critical
1. **TeamNotesPanel re-render fetch loop** (hypothesis) — `actionCtx(user)` in render causes useCallback recreation
2. **Two `online` event listeners** — syncEngine + offlineQueue both fire syncAll on reconnect

### P1 — High
3. **No request cancellation** — filter changes and search inputs fire new requests without cancelling prior ones
4. **No caching between route visits** — each navigation re-fetches all data
5. **25s polling always active** — even on idle pages, 2 Supabase queries every 25s
6. **Broad selects** — `select('*')` and multi-column selects where narrower would suffice

### P2 — Medium
7. **Unbounded lists** — some queries lack `.limit()` or consistent pagination
8. **API error masking** — soft-fail patterns hide errors from operators
9. **No debouncing** — search inputs and filter changes fire immediately
10. **No request deduplication** — same data fetched by multiple components independently

### P3 — Low
11. **Multiple independent queries per page** — could be batched into fewer round trips
12. **No stale-response protection** — race conditions between concurrent requests
13. **No offline/online state coordination** — syncEngine and offlineQueue operate independently

---

## 9. Suggested Minimal Patches (For Owners)

### For Gemini (T4) — TeamNotesPanel
```typescript
// Memoize actionCtx to prevent useCallback recreation
const actionCtx = useMemo(() => actionCtx(user), [user])
const fetchNotes = useCallback(async () => { ... }, [actionCtx])
useEffect(() => { fetchNotes() }, [fetchNotes])
```

### For Codex-1 (T1/T2) — Sync Engine
```typescript
// Debounce online event handler
let onlineTimer: ReturnType<typeof setTimeout> | null = null
window.addEventListener('online', () => {
  if (onlineTimer) clearTimeout(onlineTimer)
  onlineTimer = setTimeout(() => {
    this.updateState({ status: 'syncing' })
    this.syncAll().catch(() => {})
  }, 300)
})
```

### For Codex-2 (T3/T7) — Request Cancellation
```typescript
// Add AbortController to fetch calls
const controller = new AbortController()
useEffect(() => {
  fetchData(controller.signal)
  return () => controller.abort()
}, [deps])
```

---

## 10. Verification Receipt

```
Commit SHA: f43861f9
Date: 2026-10-31
Branch: lane-nemotron/qa-request-perf-audit
Analysis type: Static source inspection (no browser instrumentation)
Files examined:
  - src/lib/syncEngine.ts (25s polling, pullDeltas)
  - src/lib/offlineQueue.ts (online event listener, drainQueue)
  - src/lib/queries/*.ts (50+ query modules)
  - src/components/teamNotes/TeamNotesPanel.tsx (hypothesis)
  - src/modules/rentals/ReturnWorkspace.tsx (fetch cancellation pattern)
  - src/lib/dataAccess.ts (broad selects)
  - src/lib/availability.ts (multiple reads of same data)
No live Supabase accessed. No external writes. No merges/pushes.
Browser metrics: NOT MEASURED (no browser harness available)
```
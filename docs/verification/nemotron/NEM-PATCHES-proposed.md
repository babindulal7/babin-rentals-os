# Proposed Patches for Owning Agents

**Date**: 2026-10-31  
**Prepared by**: Nemotron QA Lane  
**Purpose**: Minimal patch suggestions for blocking items identified in NEM-01 through NEM-05

---

## Patch 1: Partial Return Reservation Release (Codex-1, T2)

**File**: `supabase/migrations/0187_partial_return_reservation_release.sql` (claim next free number in MIGRATION_LEDGER.md)

**Problem**: `reservations_follow_stage_transition()` only releases on `to_stage IN ('Returned', 'Closed', 'Quote')`. Partial return keeps booking at `On Rent`, so reservations stay held.

**Proposed Fix**: Add a trigger on `operation_sessions` completion for Return operations that releases verified units.

```sql
-- New trigger: release reservations on verified partial return
create or replace function release_reservations_on_verified_return()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Only fire when Return session completes
  if NEW.operation = 'Return' and NEW.state = 'Completed' and OLD.state <> 'Completed' then
    -- Release serial units that have been verified returned
    update inventory_reservations
       set released_at = NEW.completed_at,
           released_reason = 'Released on verified partial return: unit physically returned and inspected.'
     where booking_id = NEW.booking_id
       and released_at is null
       and asset_id is not null
       and exists (
         select 1 from booking_line_units blu
         where blu.asset_id = inventory_reservations.asset_id
           and blu.booking_line_id = inventory_reservations.booking_line_id
           and blu.returned_at is not null
           and blu.return_session_id = NEW.id
       );
    
    -- Release quantity holds proportionally
    -- (quantity receipts release only their own verified quantity)
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_release_reservations_on_verified_return on operation_sessions;
create trigger trg_release_reservations_on_verified_return
  after update on operation_sessions
  for each row execute function release_reservations_on_verified_return();
```

**Test**: `scripts/test-partial-return-reservation-release.mjs` section 2 should pass after this.

---

## Patch 2: Availability Engine Cleaning vs Condition Order (Codex-1, T2)

**File**: `src/lib/availability.ts` lines 489-512

**Problem**: `selectUnitsForLine()` checks `openCleaning` (kind: 'cleaning') AFTER `disqualifyingStates` (kind: 'state'), but Damaged/Lost are not in `DISQUALIFYING_UNIT_STATES`. So a Damaged unit in cleaning queue reports 'cleaning' instead of 'Damaged'.

**Proposed Fix**: Add condition check BEFORE cleaning check. Also add 'Damaged' and 'Lost' to a separate condition check.

```typescript
// In selectUnitsForLine(), after the retired check:
// Check condition BEFORE cleaning
if (unit.state === 'Damaged' || unit.state === 'Lost') {
  rejected.push({ unitId: unit.unitId, assetTag: unit.assetTag, reason: { kind: 'state', state: unit.state } })
  continue
}

// Then check cleaning
const cleaning = unit.openCleaning
if (cleaning !== undefined && cleaning !== null) {
  rejected.push({ unitId: unit.unitId, assetTag: unit.assetTag, reason: { kind: 'cleaning', by: cleaning } })
  continue
}
```

**Test**: 7 failing tests in `availability.test.ts` lines 281-332 should pass.

---

## Patch 3: Settings-Driven Availability Presets (Codex-1, T2)

**File**: `src/lib/availability.ts` lines 165-179

**Problem**: `'Condition and turnaround'` and `'Only In Stock'` presets include 'Inspection' and 'Cleaning', but per PLAN.md §4.30(c), these should be excluded (cleaning/QC are tasks, not availability blockers).

**Proposed Fix**: Remove 'Inspection' and 'Cleaning' from presets.

```typescript
export const UNIT_AVAILABILITY_PRESETS: Readonly<Record<string, ReadonlySet<string>>> = {
  'Condition only': DISQUALIFYING_UNIT_STATES,
  'Condition and turnaround': new Set(['Maintenance', 'Missing', 'Retired']), // Removed Inspection, Cleaning
  'Only In Stock': new Set([
    'Reserved', 'Packed', 'On Rent', 'Returning',
    'Maintenance', 'Missing', 'Retired',
  ]), // Removed Inspection, Cleaning
}
```

**Test**: 2 failing tests in `availability.test.ts` lines 401-418 should pass.

---

## Patch 4: Technician RLS on operation_sessions (Codex-1, T2)

**File**: New migration `0188_technician_operation_sessions_rls.sql`

**Problem**: `operation_sessions` INSERT policy doesn't include Technician, so Technician cannot create operation sessions for Pack/Handover/Return/Reset.

**Proposed Fix**: Update INSERT policy to include Technician.

```sql
-- Update operation_sessions INSERT policy to include Technician
drop policy if exists operation_sessions_insert on operation_sessions;
create policy operation_sessions_insert on operation_sessions
  for insert to authenticated
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician'));
```

**Test**: `check:lifecycle` L35 should pass (currently FAILS).

---

## Patch 5: Damage Finding Gate at DB Level (Codex-1, T1)

**File**: Migration 0177 (already written, needs application)

**Problem**: `inventory_reservations` INSERT doesn't check for open damage findings on the unit.

**Proposed Fix**: Migration 0177 adds a trigger that blocks reservation when an open damage finding exists.

**Status**: Migration exists in repo but not applied to PGlite test chain. Need to verify it's in the migration list and apply it.

**Test**: `check:lifecycle` L41 should pass (currently FAILS).

---

## Patch 6: Law 6 Write Trigger (0092) on Production (Codex-1, T1)

**Problem**: Money-blind roles can write money columns (no trigger on production).

**Status**: Migration 0092 exists in repo but not applied to live. Needs Babin to apply after backup.

**Action**: No code change needed — just apply migration to live.

---

## Patch 7: 26 `_v` Views INSERT-able by Anon (Codex-1, T1)

**Problem**: All 26 `_v` views have `INSERT` granted to `anon`.

**Status**: Migration 0095 exists in repo but not applied to live. Needs Babin to apply after backup.

**Action**: No code change needed — just apply migration to live.

---

## Patch 8: Floor/Driver Expense Submission (Codex-1, T1)

**Problem**: `expenses` INSERT gated on `auth_is_finance_or_admin()`, so Floor/Driver cannot submit own expenses.

**Proposed Fix**: Add own-row INSERT policy for expenses.

```sql
-- Allow staff to insert own expense claims
create policy expenses_self_insert on expenses
  for insert to authenticated
  with check (
    auth_is_staff() 
    and created_by = auth.uid()
  );
```

---

## Patch 9: invoice.void / rental.close Role Alignment (Codex-1 / Babin)

**Problem**: `rbac.ts` says `canVoidInvoice` = Owner/Accounts, but DB policy allows desk 5. `canCloseRental` = Owner/Admin/Manager/Accounts, but DB allows desk 5.

**Options**:
A. Narrow DB policy to match rbac (safer — UI grants less than DB)
B. Widen rbac to match DB (current state — DB is wider)

**Recommendation**: Option A — narrow DB policy. Requires P1-11 column revoke fix first.

---

## Patch 10: Sync Engine Debounce (Codex-1, T1)

**File**: `src/lib/syncEngine.ts` lines 44-50

**Problem**: `online` event handler fires `syncAll()` immediately without debounce. Multiple `online` events cause multiple syncs.

**Proposed Fix**:
```typescript
let onlineTimer: ReturnType<typeof setTimeout> | null = null
window.addEventListener('online', () => {
  if (onlineTimer) clearTimeout(onlineTimer)
  onlineTimer = setTimeout(() => {
    this.updateState({ status: 'syncing' })
    this.syncAll().catch(() => {})
  }, 300)
})
```

---

## Patch 11: TeamNotesPanel actionCtx Memoization (Gemini, T4)

**File**: `src/components/teamNotes/TeamNotesPanel.tsx`

**Problem**: `actionCtx(user)` constructed during render, causing `useCallback` recreation on every render.

**Proposed Fix**:
```typescript
const actionCtx = useMemo(() => actionCtx(user), [user])
const fetchNotes = useCallback(async () => { ... }, [actionCtx])
useEffect(() => { fetchNotes() }, [fetchNotes])
```

---

## Patch 12: Request Cancellation (Codex-2, T3/T7)

**File**: Multiple query files and components

**Problem**: Filter changes and search inputs fire new requests without cancelling prior ones.

**Proposed Fix**: Add AbortController to fetch calls.

```typescript
const controller = new AbortController()
useEffect(() => {
  fetchData(controller.signal)
  return () => controller.abort()
}, [deps])
```

---

## Summary

| Patch | Owner | Type | Priority |
|-------|-------|------|----------|
| 1. Partial return trigger | Codex-1 | Migration | P0 |
| 2. Availability engine order | Codex-1 | Code | P0 |
| 3. Settings presets | Codex-1 | Code | P1 |
| 4. Technician RLS | Codex-1 | Migration | P0 |
| 5. Damage finding gate | Codex-1 | Migration | P0 |
| 6. Law 6 write trigger | Babin (apply) | Migration | P0 |
| 7. `_v` views anon INSERT | Babin (apply) | Migration | P0 |
| 8. Expense self-insert | Codex-1 | Migration | P1 |
| 9. Role alignment | Codex-1/Babin | Migration+Code | P1 |
| 10. Sync debounce | Codex-1 | Code | P1 |
| 11. TeamNotesPanel memoize | Gemini | Code | P1 |
| 12. Request cancellation | Codex-2 | Code | P2 |

**Note**: Per NEM rules, these are proposed patches for owning agents to apply. Nemotron does not modify production code, migrations, or RLS.
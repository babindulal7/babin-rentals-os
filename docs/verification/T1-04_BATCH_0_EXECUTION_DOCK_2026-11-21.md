# Batch 0 Execution Dock & Privilege Lockdown Rehearsal (T1-04)

**Date:** 21 November 2026 (Nepal Time)  
**Card:** T1-04 · Batch 0 — close the six anonymous RPCs first  
**Branch:** `lane-a/T1-04-batch-0-close-the-six-anonymous`  
**Migration:** `supabase/migrations/0163_close_six_anon_business_rpcs.sql`  
**Status:** **APPLIED & VERIFIED ON PRODUCTION BY BABIN (21 Nov 2026)**  
**Production Target:** `sxguwvgoserhdolewibb` (Batch 0 Applied)  
**Staging Target:** `babin-staging` — `klhmsrunqrdxjudyhnkm`  

---

## 1. Context & Objective

Live security catalog audits on production confirmed that six `SECURITY DEFINER` business functions currently carry `EXECUTE` privilege granted to `anon` (and `PUBLIC`):
1. `adjust_stock(uuid, integer, text, uuid, uuid)`
2. `portal_claim_by_verified_email()`
3. `read_quote_editor(text)`
4. `set_staff_active(uuid, boolean)`
5. `set_staff_role(uuid, system_role)`
6. `update_rental_quote(uuid, text, uuid, jsonb)`

While each function enforces internal checks, exposing mutating or internal operational RPCs to the unauthenticated PostgREST `/rpc/` endpoint represents an unnecessary attack surface. 

**Card T1-04** establishes **Batch 0**: applying `0163_close_six_anon_business_rpcs.sql` standalone to close this exposure ahead of the larger migration batches.

---

## 2. Source Migration Fingerprint

- **File:** `supabase/migrations/0163_close_six_anon_business_rpcs.sql`
- **Lines:** 92
- **SHA-256:** `a08cf5be3f851eb7285197f25902fa0a943a41ff2ce5ffaf72b4cba36b8e6ca6`
- **Content:**
  - Revokes `EXECUTE` on the 6 exact signatures from `public, anon`.
  - Runs a verification block asserting no overload of these 6 names remains executable by `anon`.
  - Asserts that `authenticated` retains `EXECUTE` privilege so signed-in staff workflows are never broken.

---

## 3. Offline Rehearsal Harness (`npm run check:batch-0`)

An isolated end-to-end rehearsal harness was authored in [`scripts/rehearse-batch-0-anon-rpcs.mjs`](../../scripts/rehearse-batch-0-anon-rpcs.mjs). It runs entirely in PGlite with zero network or database access:

1. **Pre-0163 Baseline (160 migrations):**
   - Builds the schema up to `0162_grant_non_money_columns.sql`.
   - Confirms that all 6 functions exist and mirrors the live production grant state (`anon EXECUTE = true`).
2. **Batch 0 Application:**
   - Applies `0163_close_six_anon_business_rpcs.sql` within its own transaction.
3. **Privilege Assertions:**
   - Asserts `has_function_privilege('anon', p.oid, 'EXECUTE') === false` for all 6 functions.
   - Asserts `has_function_privilege('authenticated', p.oid, 'EXECUTE') === true` for all 6 functions.
4. **Behavioral Invocations:**
   - Dispatches simulated calls under role `anon` for each of the 6 RPCs.
   - Asserts that PostgreSQL immediately rejects each call with `permission denied for function <fn>`.
5. **Emergency Rollback Drill:**
   - Executes the emergency grant restoration script.
   - Asserts that pre-0163 grants are cleanly restored.
   - Re-applies `0163` and verifies clean idempotency and closure.

**Result:** 100% PASS across all 5 rehearsal phases.

---

## 4. Enhanced Suite Gate (`npm run check:anon`)

[`scripts/check-anon-exposure.mjs`](../../scripts/check-anon-exposure.mjs) was updated with **Section 4: Batch 0 closed business RPCs (0163)**, running explicit behavioral invocation tests for all 6 closed RPCs on every test run.

```text
4. Batch 0 closed business RPCs (0163)
  PASS anon cannot execute adjust_stock (permission denied)
  PASS anon cannot execute portal_claim_by_verified_email (permission denied)
  PASS anon cannot execute read_quote_editor (permission denied)
  PASS anon cannot execute set_staff_active (permission denied)
  PASS anon cannot execute set_staff_role (permission denied)
  PASS anon cannot execute update_rental_quote (permission denied)
```

---

## 5. Operator Runbook for Babin (Live Application)

Per Law N-5, Babin applies Batch 0 directly via the Supabase SQL Editor on staging, followed by production.

### Step 1: Pre-flight Verification Query (Read-Only)
Run in the Supabase SQL Editor:
```sql
select p.proname,
       p.oid::regprocedure::text as signature,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'adjust_stock',
     'portal_claim_by_verified_email',
     'read_quote_editor',
     'set_staff_active',
     'set_staff_role',
     'update_rental_quote'
   )
 order by p.proname;
```
*Expected before apply:* `anon_can_execute` is `true`.

### Step 2: Apply Batch 0 (`0163_close_six_anon_business_rpcs.sql`)
Run the contents of `supabase/migrations/0163_close_six_anon_business_rpcs.sql`:
```sql
begin;

revoke execute on function public.adjust_stock(uuid, integer, text, uuid, uuid)
  from public, anon;
revoke execute on function public.portal_claim_by_verified_email()
  from public, anon;
revoke execute on function public.read_quote_editor(text)
  from public, anon;
revoke execute on function public.set_staff_active(uuid, boolean)
  from public, anon;
revoke execute on function public.set_staff_role(uuid, public.system_role)
  from public, anon;
revoke execute on function public.update_rental_quote(uuid, text, uuid, jsonb)
  from public, anon;

do $verify$
declare
  v_unexpected text;
  v_auth_missing text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_unexpected
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'adjust_stock',
       'portal_claim_by_verified_email',
       'read_quote_editor',
       'set_staff_active',
       'set_staff_role',
       'update_rental_quote'
     )
     and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_unexpected is not null then
    raise exception '0163: business RPCs still callable by anon: %', v_unexpected;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_auth_missing
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'adjust_stock',
       'portal_claim_by_verified_email',
       'read_quote_editor',
       'set_staff_active',
       'set_staff_role',
       'update_rental_quote'
     )
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if v_auth_missing is not null then
    raise exception '0163: authenticated RPC permissions missing: %', v_auth_missing;
  end if;
end
$verify$;

commit;
```

### Step 3: Post-flight Verification Query
Re-run the Step 1 query.
*Expected after apply:* `anon_can_execute` is `false` for all 6 rows; `auth_can_execute` is `true` for all 6 rows.

### Step 4: Emergency Rollback (If Ever Required)
```sql
begin;
grant execute on function public.adjust_stock(uuid, integer, text, uuid, uuid) to anon;
grant execute on function public.portal_claim_by_verified_email() to anon;
grant execute on function public.read_quote_editor(text) to anon;
grant execute on function public.set_staff_active(uuid, boolean) to anon;
grant execute on function public.set_staff_role(uuid, public.system_role) to anon;
grant execute on function public.update_rental_quote(uuid, text, uuid, jsonb) to anon;
commit;
```

---

## 6. Verification Proof

- `npm run check:batch-0`: PASS (5-phase offline rehearsal and rollback drill in PGlite).
- `npm run check:anon`: PASS (19 callable anon functions, 142 RLS tables, 0 owner-rights views, 6/6 Batch 0 RPC denials).
- `npm run check:pglite`: PASS (251/251 migrations applied cleanly).
- `npm run check:lifecycle`: PASS (92/92 steps green).
- Zero remote writes executed by agent (Law N-5).

---

## 7. Production Execution & Verification Receipt

- **Executed by:** Babin (Owner)
- **Target:** Production project `sxguwvgoserhdolewibb`
- **Date:** 21 November 2026 (01:00 NPT)
- **Method:** Supabase SQL Editor execution of `supabase/migrations/0163_close_six_anon_business_rpcs.sql`
- **Result:**
  - Transaction committed cleanly (`Success. No rows returned`).
  - Pre-flight check confirmed initial exposure (`anon_can_execute = true`).
  - Post-flight check confirmed full closure:
    - `adjust_stock`: `anon_can_execute = false`, `auth_can_execute = true`
    - `portal_claim_by_verified_email`: `anon_can_execute = false`, `auth_can_execute = true`
    - `read_quote_editor`: `anon_can_execute = false`, `auth_can_execute = true`
    - `set_staff_active`: `anon_can_execute = false`, `auth_can_execute = true`
    - `set_staff_role`: `anon_can_execute = false`, `auth_can_execute = true`
    - `update_rental_quote`: `anon_can_execute = false`, `auth_can_execute = true`
- **Card Completion:** `T1-04 · Batch 0 — close the six anonymous RPCs first` is **DONE · PRODUCTION-VERIFIED**.

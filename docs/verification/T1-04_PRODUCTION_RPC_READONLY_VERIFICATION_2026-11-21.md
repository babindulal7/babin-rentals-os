# T1-04 — Read-only Production Anonymous RPC Verification

**Observed:** 21 November 2026 (Asia/Kathmandu).  
**Source Git main:** `eba3e674c4950861a66066bb51a9f2ffe7a9a992` (merged PR #262).  
**Production project (read-only):** `sxguwvgoserhdolewibb`.  
**Staging excluded:** `klhmsrunqrdxjudyhnkm`.  
**This report did not apply migrations, change grants, insert migration records, alter users, or access customer/staff/payment rows.**

## 1. Verified current database permissions

Read-only catalog query across **every public overload** of the six sensitive function names:

```sql
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'adjust_stock', 'portal_claim_by_verified_email', 'read_quote_editor',
    'set_staff_active', 'set_staff_role', 'update_rental_quote'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);
```

| Function | `anon` EXECUTE | `authenticated` EXECUTE |
|---|---|---|
| `adjust_stock(uuid, integer, text, uuid, uuid)` | **false** | true |
| `portal_claim_by_verified_email()` | **false** | true |
| `read_quote_editor(text)` | **false** | true |
| `set_staff_active(uuid, boolean)` | **false** | true |
| `set_staff_role(uuid, system_role)` | **false** | true |
| `update_rental_quote(uuid, text, uuid, jsonb)` | **false** | true |

**Observed:** exactly six matching public function signatures were returned; all six are **denied to `anon`**. The catalog privilege check includes grants inherited through `PUBLIC`. This is an objective confirmation of the *current DB grant state*, but does **not** prove all application-level or authenticated-role policy behavior.

## 2. Migration-history discrepancy

A separate **read-only** `list_migrations` call for the same production project returned **157 migration-history rows**. No entry with migration name or version containing `0163` was returned.

This does **not** mean the grant changes were not executed; an operator can apply grant changes manually without registering a migration in the managed history. Equally, a PR narrative is not proof of **who** executed a statement. Source PR #262 asserts that the owner applied migration 0163, but the present catalog response only independently confirms the **resulting privileges**, not the executor or exact SQL file/hash.

**Risk:** a future migration runner might falsely regard `0163_close_six_anon_business_rpcs.sql` as pending. A reapplication could be harmless, or could interact with migrations, grants or changed overloads; do **not** assume it is safe from the grants alone.

## 3. Smallest safe next step (no remote writes)

1. Independent DBA/Mac reviewer compares current six function definitions, the complete intended 0163 SQL text, related migration history, and sanitized authorized audit timestamps to establish provenance. Never post secrets or sensitive data to PRs.
2. Confirm whether 0163 was applied manually, via a separate transaction, or by a deployment tool. Log the **actual evidence** and owner authorization; if unidentified, say so.
3. Reconcile the missing history entry in a separately reviewed **plan** only. Do **not** insert into `supabase_migrations.schema_migrations`, replay 0163, or run `supabase db push` as a shortcut.
4. Independently run negative PostgREST/Auth/JWT/role tests under **separately approved isolated staging test seats** before claiming full hosted authorization coverage. Current `anon` SQL grants alone do not prove API-level isolation or money-role integrity.
5. Keep unrelated release and production cutover actions blocked until T1 staging, owner gates and business acceptance criteria are satisfied.

## 4. Roadmap truth

- **T1-04 remains `done`** on main for the explicitly checked grant-lockdown objective: the six functions are now denied to `anon` and `authenticated` grant remains.
- This audit **does not** certify ledger completeness, historical actor attribution, other public RPCs, or all hosted security acceptance. Track those as separate unresolved follow-ups.
- This is a **read-only production observation**, not authority to change any database.

## 5. Evidence provenance

- Connected Supabase `execute_sql` with a **SELECT-only** `pg_proc` and `pg_namespace` query; returned exactly six signatures.
- Connected Supabase `list_migrations`; 157 records; no `0163` record.
- Code reference [PR #262](https://github.com/babindulal7/babin-rentals-os/pull/262), and `supabase/migrations/0163_close_six_anon_business_rpcs.sql` in Git.
- Repeat the read-only check before any future decision; these observations are a snapshot and may change.

# T1-04 — Batch 0 anonymous business RPC lockdown: verification ledger

**Last read-only review:** 20 November 2026 (Nepal time)  
**Card:** T1-04 in `docs/plans/T1_RELEASE.md`  
**Status:** **OPEN / PRODUCTION CHANGE NOT APPLIED**. Local checks described below do not establish hosted acceptance.  
**Production project (READ-ONLY):** `sxguwvgoserhdolewibb`  
**Existing staging project (READ-ONLY):** `klhmsrunqrdxjudyhnkm`

> Correction to the 18 November report: the six functions named in its former Executive Summary (cancel_booking, extend_booking, void_invoice, create_booking, apply_booking_stage_transition, record_payment) are **not** the six functions explicitly targeted by `0163_close_six_anon_business_rpcs.sql`. They were checked as part of broader local PGlite behavioral testing. Do not treat those local behavioral results as evidence that migration 0163 was applied to staging or production.

## 1. Live read-only privilege finding — 20 November 2026

A catalog-only query over `pg_proc` and `pg_namespace` showed exactly these six `public` signatures currently present in production:

| Live function signature | `SECURITY DEFINER` | `anon` EXECUTE | `authenticated` EXECUTE |
| --- | --- | --- | --- |
| `adjust_stock(uuid,integer,text,uuid,uuid)` | Yes | **Yes** | Yes |
| `portal_claim_by_verified_email()` | Yes | **Yes** | Yes |
| `read_quote_editor(text)` | Yes | **Yes** | Yes |
| `set_staff_active(uuid,boolean)` | Yes | **Yes** | Yes |
| `set_staff_role(uuid,system_role)` | Yes | **Yes** | Yes |
| `update_rental_quote(uuid,text,uuid,jsonb)` | Yes | **Yes** | Yes |

Method: for each named `public` function, inspected `p.prosecdef`, `has_function_privilege('anon', p.oid, 'EXECUTE')`, and `has_function_privilege('authenticated', p.oid, 'EXECUTE')`. The query read catalog metadata only and made **no function calls, data changes or attempted exploit**. `anon` EXECUTE is a verified *permission exposure*, not proof a business operation succeeds unauthenticated; function-body checks and HTTP/JWT authorization still require separate assessment.

**Conclusion:** The source-code migration exists, but the intended grant closure is not yet effective on production. Do not mark T1-04 done.

## 2. What migration 0163 actually does

The checked-in `supabase/migrations/0163_close_six_anon_business_rpcs.sql` revokes EXECUTE from `PUBLIC` and `anon` for **the six signatures listed in section 1**. It asserts that no anonymous overload of these six names remains executable and that the `authenticated` role keeps EXECUTE. It does not alter the database's business data or the bodies of those functions.

**Important:** Do not independently revoke unrelated helpers, restore another environment's grants, or edit migration history to make a check pass. First reconcile the recorded live migration versions, actual function definitions, and whether 0163's source SQL matches the target environment.

## 3. What is and is not verified

| Check | Evidence / result |
| --- | --- |
| Local PGlite anonymous permission and broader behavioral checks | Prior Windows-lane report dated 18 Nov states local checks passed; **not re-run in this read-only review** |
| Current production six-function grant inventory | **VERIFIED:** all six `SECURITY DEFINER`, `anon` EXECUTE and `authenticated` EXECUTE |
| Existing staging project health | **VERIFIED:** `ACTIVE_HEALTHY` |
| Staging application schema | **VERIFIED:** 0 public application tables, 0 migration records, 0 Auth users, 0 Storage buckets/objects |
| Staging migration 0163 rehearsal against a compatible database | **NOT DONE**; cannot apply 0163 to empty staging because the functions do not exist there |
| Fresh restorable production backup and off-device checksum | **NOT VERIFIED** (T1-01) |
| Authenticated role regression and anon HTTP/JWT negative tests after 0163 | **NOT DONE** |
| Production migration 0163 | **NOT APPLIED**; production remains on hold |

Staging remains empty by design. Draft PR #179 contains source reconciliation and rollback-only staging preflight, **not** a complete durable staged installation. Do not equate its CI outcome with a production-safe schema.

## 4. Safest next steps (no production writes without separate owner approval)

1. **T1-01 backup proof:** owner-managed production dump, `npm run check:dump`, SHA-256, size/date, off-machine protected storage and restore-drill evidence. No raw data, keys, passwords, client identities or full dump in GitHub.
2. **Resolve T1-02 blocker:** finish migration content/dependency inventory and synthetic `0012` seed handling on the existing staging project, including review of `0047`, `0082`, duplicate `0188`, and 0241 RLS review (issue #223). Never blindly replay production records into staging.
3. **Rehearse 0163 on isolated compatible staging** after migration dependencies and backup/recovery are reviewed. Capture *before/after* `has_function_privilege` for **all six exact signatures**, including overloads. Check authenticated use through actual role sessions and HTTP/PostgREST anonymous denials; reject any unintended staff breakage.
4. **Fresh production preflight:** re-read current live grants, ledger, and intended SQL source/hash. A second reviewer checks exact project ref, backup proof, rollback path, maintenance plan and owner-approved statement list.
5. **Production only after explicit owner authorization:** apply the **reviewed, exact** least-privilege migration via controlled procedure; recheck anon EXECUTE is false for all six and authenticated operations still work. Record an audit receipt without sensitive data.

**Hard stop:** This document updates verification evidence only. No migration, DNS, payment, Auth, Storage, settings or deployment action is authorized by this documentation change.

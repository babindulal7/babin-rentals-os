# Delivery persistence — Phase 2 review and staging gate

**Date:** 16 October 2026  
**Scope:** source-only contract, immutable event model, review migration 0164  
**Live Supabase:** no writes, no migration application, no deployment  
**Release:** HOLD, pending Phase 2 evidence and the pre-existing security/migration reconciliation

## What was already completed

PR #10 merged the **live read-only** delivery and transport plan screen. It reads real `booking_transport_v` rows and verifies access to the related booking. It deliberately exposes **no** false Ready/In Transit/Delivered claims or money collected.

## What Phase 2 adds in source code

- `delivery_jobs`: one job per booking leg (Outbound/Return), durable UUID identity, schedule, assignment, status, server-stamped timestamps, recipient proof, version and actor.
- `delivery_job_events`: append-only transition receipts with unique request IDs, actor ID, previous/next states and server timestamps. No fee, deposit, client phone, image or payment value is copied into event metadata.
- Three `SECURITY DEFINER` RPCs with *explicit* authentication, active-user, branch and role validation; no `anon` EXECUTE permission:
  - `delivery_create_job(booking_id, leg, scheduled_at, key)`
  - `delivery_assign_driver(job_id, driver_id, request_key)`
  - `delivery_transition_job(job_id, expected_status, next_status, request_key, recipient, note)`
- Direct authenticated INSERT, UPDATE and DELETE on both tables remain denied. Owner/Admin may read all; Manager/Coordinator/Warehouse are branch-scoped; Driver may read only jobs explicitly assigned to their own authenticated user ID. Client/anonymous access is blocked.
- `deliveryDispatchWorkflow.ts` is a UI-validation mirror, **not a permission enforcement point**. Only the database RPC may confirm an action.

## Transition and evidence matrix

| From | To | Permitted role(s) | Additional evidence |
|---|---|---|---|
| Scheduled | Ready | Owner/Admin, same-branch Manager/Coordinator/Warehouse | Outbound booking must be Packed or On Rent |
| Ready | In Transit | Owner/Admin, same-branch Manager/Coordinator, assigned Driver | Active assigned driver, and outbound packed |
| In Transit | Delivered | Owner/Admin, same-branch Manager/Coordinator, assigned Driver | Recipient name at least two characters |
| Scheduled/Ready/In Transit | Failed | Owner/Admin, same-branch Manager/Coordinator | Explanatory note at least 10 characters |
| Delivered/Failed | anything | No one | Immutable terminal state; new authorized job/recovery policy is a separate decision |

A delivery event **never** changes a booking stage, opens a handover gate, confirms a signature, collects an advance, changes invoice totals, or overrides Warehouse return checks.

## Mandatory tests before even merging as code

1. All CI gates: TypeScript, full Vitest suite, PGlite full migration replay, lifecycle, page invariants and build. If the new SQL fails PGlite, fix the migration on this branch.
2. PostgreSQL role/JWT tests with actual Owner, Manager, Coordinator, Warehouse, Driver and Client identities. Anonymous should be denied RPC EXECUTE. Other Driver should be denied read and mutation of unassigned jobs.
3. RLS read filters verified with two branches and two drivers; ensure Driver only sees assigned jobs, and Warehouse cannot see transport charges through any related view/API.
4. Use exact repeated `request_key` to test idempotent save, different-payload replay refusal, and concurrent requests. A failed/duplicate request must not create extra events or change status.
5. Verify stage/staff gates: Quote/cancelled bookings, inactive drivers, unsafe direct UPDATE/DELETE, Ready before packing, transit with missing driver, delivery without recipient, failure without note, stale expected status.
6. Verify event history old/next values and actor come from the authenticated JWT rather than client input; neither event nor delivery timestamps may be backdated by the client.
7. Mobile, tablet and desktop acceptance only **after** a live backend is tested on staging. The production UI remains read-only until this point.

## Critical release dependency

The source repository and live Supabase migration ledger were previously inconsistent. PR #1 proposes `0163_close_six_anon_business_rpcs.sql`, which has **not** been authorized for production. `0164` is a distinct, subsequent proposal. Do not blindly apply either file or mark it applied by filename alone.

Before live deployment: reconcile exact SQL migration fingerprints and grants; take a restorable backup; test restoring elsewhere; review current live security advisor findings; apply and test required migrations in staging with realistic records; repeat PostgREST/JWT role tests; obtain owner approval for an explicit production change list and maintenance window under N-5.

**No claim of live delivery persistence is valid merely because this SQL exists in GitHub.** Phase 3 will connect a real server-backed list and mutations only after Phase 2 passes staging and is authorized. 

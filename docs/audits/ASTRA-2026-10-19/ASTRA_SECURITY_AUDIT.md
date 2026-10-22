# ASTRA Security Audit

Audit date: 18–19 October 2026 (Asia/Katmandu). Repository: https://github.com/babindulal7/babin-rentals-os. Baseline: latest accessible main, ad8ce1e4afc54cc88df841425d0e281bd15665bc, fetched 18 October and rechecked 19 October. All file references are relative to that immutable revision.

Audit only: no application fixes, merge, deployment, production database access or production mutations. Local SQL probes used disposable PGlite fixtures. Browser used a separate mock preview at 127.0.0.1:3026.

## Judgment

**HOLD for production launch.** Rebuilt main has verified authenticated authorization bypasses even though anonymous-view and search-path gates pass. No claim is made about the currently deployed database or external exposure.

### SEC-01 — Authenticated users can read and overwrite unrelated documents/evidence

Effective SELECT/INSERT/UPDATE predicates only test bucket_id. An unmapped authenticated identity resolving to Client read one other-client object and renamed it. Probe explicitly supplied ordinary Storage table grants because the PGlite prelude does not implement hosted Storage. Client contracts, identity evidence and invoice files may be disclosed or corrupted by any authenticated account when hosted Storage grants match the normal setup. Live deployment was not queried.

Source: supabase/migrations/0152_harden_storage_policies_revoke_anon.sql:24–39. Status: REPRODUCED locally with stated Storage-grant simulation; hosted Storage NOT VERIFIED. Correction/test contract: Use booking/client/branch ownership predicates and explicit staff capabilities; immutable versioning for signed documents; deny portal writes. Validate path-to-record mapping on every operation. Client A cannot list/read/replace Client B objects; inactive/unmapped users denied; floor staff receive only required evidence. Test through Storage HTTP API in staging.

### SEC-02 — Money-blind roles can call financial SECURITY DEFINER helpers

Client called get_model_daily_rate and received 4500. Warehouse and Client each called booking_estimate_total for a fixture booking and received 17097. Both helpers retain authenticated EXECUTE and lack caller money/booking authorization. Restricted amounts bypass masked views and UI, including another client’s booking estimate.

Source: supabase/migrations/0119_server_side_prices.sql:19–41; 0164_booking_discount_vat_payment_integrity.sql:55,940–941; 0150_rpc_security_and_mutation_closure.sql:561–565. Status: REPRODUCED against rebuilt effective migrations. Correction/test contract: Make internal helpers non-public/non-executable by API roles; retain trusted internal calls, or add exact role and ownership checks to a deliberately public wrapper. Enumerate every authenticated definer RPC for all nine roles, with own/foreign booking IDs; no financial scalar for money-blind roles.

### SEC-03 — Authenticated Client can permanently forge an Owner audit event

audit_events INSERT is granted authenticated with WITH CHECK(true). Probe inserted a fabricated Owner actor_id/actor_role; privileged readback confirmed persistence. Traceability can be poisoned with fictitious approvals/actions. This does not itself change booking custody, but undermines incident investigation.

Source: supabase/migrations/0091_audit_events_refuse_anonymous_writes.sql:80–88. Status: REPRODUCED against rebuilt effective migrations. Correction/test contract: Bind actor and role server-side; restrict direct client INSERT columns or replace with a narrow receipt RPC; classify untrusted client telemetry separately from authoritative audit. Forged actor/role/target payloads denied or server-replaced; server-authored stage/payment events remain valid and immutable.

### SEC-04 — Admin can demote an existing Owner through direct users UPDATE

Probe as seeded Admin changed a second Owner to Coordinator. Trigger only checks the NEW elevated role; last-Owner check allows it when another Owner exists. Deputy admin can alter an account above its authority; named UI/RPC restrictions are bypassed.

Source: supabase/migrations/0120_users_visibility_and_role_ceiling.sql:141–153,183–229; docs/PERMISSIONS.md:72. Status: REPRODUCED against rebuilt effective migrations. Correction/test contract: Restrict both old target and new role in database policies/trigger or revoke direct role-field writes and funnel through audited Owner action. Admin cannot demote/deactivate/change another Owner/Admin; Owner can perform allowed correction with audit; last/self-owner rules remain.

### SEC-05 — Driver without assigned trips reads unrelated booking/client directory rows

Effective clients_select/bookings_select use auth_is_staff OR own-client. Probe Driver with zero assigned jobs read 125 bookings and 40 clients, including name/phone. No actual client records were queried; fixture counts only. Unnecessary client contact and operational data exposure through direct API.

Source: supabase/migrations/0110_client_own_rows_rls.sql:54–68; docs/PERMISSIONS.md:78,161–164. Status: REPRODUCED against rebuilt effective migrations. Correction/test contract: Separate driver SELECT policy through assigned open delivery jobs; remove broader permissive policy for Driver; review views and related joins. Driver with no jobs gets no directory rows; assigned job grants only required receiver fields; completed/reassigned jobs revoke access.

### REL-01 — Outbox has no submitting-user scope and replays using the current session

QueuedMutation has no actor/user/project field. Logout explicitly preserves outbox. drainQueue selects every pending mutation and uses singleton supabase. A second signed-in operator therefore supplies the replay credentials. Misattributed writes, unauthorized replay attempts and cross-shift loss of accountability; RLS still limits current credentials.

Source: src/lib/offlineQueue.ts:5–17,122–156,267–280,343–377; src/lib/devicePurge.ts:33–50. Status: SOURCE-CONFIRMED dataflow; multi-user browser replay NOT VERIFIED. Correction/test contract: Persist actor/project/branch context, drain only matching authenticated identity, quarantine mismatches and show pending-work handoff explicitly. Queue under A, sign out, sign in B, reconnect: B must not execute A’s mutation. Exercise restart/multi-tab and revoked roles.

## Positive evidence and its boundary

- check:pglite rebuilt167/167 migrations;31 public views not readable by anon;20 anon-executable functions all on current allowlist;74 definers had pinned search_path. This says nothing about whether each authenticated role may call each helper.
- check:lifecycle31/31 passed: atomic creation, exclusion/capacity, half-open turnaround, required floor sessions, settlement/void/reversal, client-row isolation, immutable payment/audit updates, update transactions and lifecycle correction/archive.
- L12 money-blind view checks passed, but SEC-02 separately bypasses those views. L13 prevents UPDATE/DELETE, but SEC-03 spoofs INSERT. L17 prevents upward role assignment, but SEC-04 targets an existing superior account. These are gaps in verification scope, not contradictory results.
- Browser client uses an anonymous public key; source separates privileged operations into RPC/functions. No credentials were printed or copied. No comprehensive secret-history scan was performed; absence of exposed secrets is NOT CERTIFIED.

## Probe method

See audit-security-probe.mjs, audit-security-probe.log and audit-security-catalog.json. All migrations are applied to a new in-memory database, then SET ROLE authenticated plus fixture request.jwt.claim.sub exercises current SQL authorization. No PostgREST, real signed JWT, hosted Auth, storage objects or production users are contacted. Storage probe explicitly adds normal table/schema grants to the prelude before exercising shipped policies. Read it as a verified policy weakness conditional on those grants; hosted Storage verification remains required. Fixture identities/contact values are synthetic.

## Remaining security acceptance

Re-run all nine roles through real staging JWTs and PostgREST/Storage; enumerate all definer endpoints (not just anonymous access); verify inactive/revoked sessions, branch isolation, storage path ownership, signed URLs, uploads, edge-function authentication, SQL dynamic identifiers, backup restore, token expiry and concurrent writers. No supabase/functions/ directory was found in this baseline; external server-function deployments are NOT VERIFIED. Full Git secret history and deployment configuration were not comprehensively penetration-tested. Auth provider delivery/password recovery, external integration secrets and live advisor findings are NOT VERIFIED.

Do not apply SQL remotely as part of this audit. Future fixes require separate authorization and owner backup/cutover procedure.

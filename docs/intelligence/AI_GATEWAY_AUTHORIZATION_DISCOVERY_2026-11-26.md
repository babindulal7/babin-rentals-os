# AI-01 — Database authorization and Settings boundary (discovery slice 2)

Pinned source: main ccfc7bd8926c10fd9db589b35d1564cb71e6d474. Companion to AI_GATEWAY_SOURCE_INVENTORY_2026-11-26.md, issue #484 and draft PR #485. Static source inspection only; no SQL executed, hosted connection, or proof that migrations are applied. No runtime changes or new permission grants.

## Findings requiring design action

| Source | Observed behavior | Gateway requirement |
|---|---|---|
| 0158_settings_table.sql | Settings read permitted to staff with money-key masking; settings_history accessible to management; original setter Owner-only; scalar values/history | Never store credentials, tokens, or sensitive per-agent scopes in generic settings/history. |
| 0238_rental_day_start_setting.sql:25–107 | Later set_setting accepts Owner/Admin and syntactically valid scalar keys; not exclusively Owner | Do not reuse general set_setting authorization for AI access management. Dedicated Owner-only authorization, explicit scope enum and deny-by-default backend required. Verify current effective definition and future generic setter cannot change AI controls. |
| 0267_database_enforced_aal2_money_roles.sql | auth_can_view_money allowlists five money roles and requires AAL2 when armed; auth_is_finance_or_admin further excludes Coordinator | Gate at source, then narrower domain/field scope. No gateway override of current MFA or role. AI financial pilot requires recent AAL2 user session; no fake JWT or shared privileged user. |
| 0203_restore_driver_client_view_scopes.sql | Owner-rights masking views regained Driver exclusion after prior recreation removed it; explicit warning not to widen base column grants | Recheck effective catalog after all migrations; do not blindly change security_invoker or base grants. Explicitly test Driver no client-directory access even with an integration grant. |
| 0120_users_visibility_and_role_ceiling.sql | Auth role and branch functions; staff directory masks contact and credential status; users policies and role ceiling | Reuse effective current actor resolution; prohibit credential metadata and broad HR reads. Test inactive/revoked actors and branch boundaries. Later definitions require trace. |
| 0257_client_accounts_and_portal_binding.sql | Online profile self-access and staff policies; masked online_profiles_v; identity-file storage rules | No raw identity documents, storage paths, signed URLs or authentication metadata in AI v1. Test client A/B and staff role isolation. |
| 0091_audit_events_refuse_anonymous_writes.sql and scripts/check-astra-phase0.mjs | Historical anonymous audit insert revoked; existing regression checks staff actor identity binding and client spoof denial | Extend authoritative server audit with integration id, actor, decision, request id, scope, timestamps and redacted metadata; prove no forged gateway log. Never log token or full response body. |

All SQL paths above are under supabase/migrations unless noted. These findings are constraints, not confirmed new live vulnerabilities. Source precedence: AGENTS.md and current rulings; review latest SQL definitions, ACLs and actual hosted staging status via approved read-only checks separately.

## Existing Settings surface

src/data/settings.ts:100–160 records retired Integrations tab and routes legacy integrations, ai and automation deep links to System. src/data/tools.ts:688–695 explicitly blocks the API & Integrations tile because the administration screen is not built. src/modules/settings/Settings.tsx consumes the existing Settings data/store and role capabilities. Reuse the existing Settings shell and Tools deep link; do not create duplicate pages or make a cosmetic enabled toggle before server enforcement.

Proposed section: Settings → System → AI & Integrations (or a dedicated responsive tab in the approved new Skin layout; preserve old deep links). Default hidden/denied for permission management to non-Owner. Tabs/cards: connections, scopes, revocation, request limits, activity log and future approvals. Reuse the existing component system. No live integrations or invented activity metrics.

## Proposed permission model

Default: no integration active; no grants. A grant identifies integration, allowed tool/operation, allowed fields, optional branch restrictions, purpose/egress policy and expiry. Actor permissions are evaluated independently for each request and intersected with the integration grant; row access must remain enforced at database boundary. No wildcard scope maps to raw database or arbitrary queries. Keep credentials in secret storage, store only token hashes/identifiers when applicable, never store plaintext in generic settings or audit. Rotation and emergency revoke require owner-authenticated audited changes; verify revocation on subsequent requests and invalidate permission caches. Prefer reusing existing auth rather than inventing a parallel staff login system.

Role boundary examples for proposed pilot: Owner explicitly granted operational/financial tools with appropriate AAL; Admin/Manager/Accounts only according to current user and integration policy; Coordinator limited to approved booking/client-balance fields (no company-wide ROI/payroll by broad money permission); Warehouse/Technician no financial data; Driver only assignment-specific data if approved, never client directory; Client self-only if a later explicitly reviewed client AI surface exists. External AI provider egress default disabled until approved. No AI management of its own scope, no writes, no automatic notifications. Any administrator delegation requires separately approved capability, bounded by owner-granted limits.

## Verification matrix to implement later

1. Rebuild disposable database from exact reviewed SHA; query pg_proc, pg_policy, pg_class and column/table/function ACLs; compare effective definitions rather than trusting migration headers. Inspect canonical task registry first, no migration numbering or changes in this discovery PR.
2. Test ordinary settings Owner/Admin behavior remains unchanged, and neither Admin nor generic setter nor direct table/RPC grants can enable AI or widen scopes. Reject nonexistent and expired grants, spoofed integration identity, inactive user, unknown fields and invalid query windows.
3. Positive/negative controls per role and branch: Owner with scope succeeds, without fails; money-blind role cannot obtain financial columns or derived ratios with permissive integration; Coordinator cannot read restricted aggregates; Driver directory denied; Client A/B isolated; revoked permissions deny next request.
4. Verify output DTOs and cache keys include actor/scope/branch boundaries, no forbidden fields, no secret/log leakage, no side effects and no data sent externally. Require real JWT/PostgREST on disposable fixtures; isolated PGlite is complementary, not equivalent. Separate audit integrity and MFA tests.
5. Independent reviewer disposition; R-35 verification gates for any future migrations, owner approval for production activation.

## Remaining before implementation

Full effective migration/Edge Function inventory, service identity design, canonical task registry reconciliation, settings and document/HR/portal field allowlists, OpenAPI and MCP contract, current platform documentation review and independent approval. P0 custody/financial/privacy launch gates retain priority. No claim of complete database audit or API readiness.

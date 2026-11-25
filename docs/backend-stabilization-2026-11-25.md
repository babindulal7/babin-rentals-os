# Backend stabilization — 25 November 2026 (NPT)

## Scope
Three reviewed SQL migrations executed on hosted babin-staging only; no production changes. The SQL files are verbatim from the staging migration ledger, keyed by the actual version timestamps (UTC). Existing legacy migration planner compares names including the filename prefix: explicitly reconcile these version/name pairs with the planner before any hosted migration, and do not replay the already-applied staging files.

| Version | Ledger name | Verified result |
| --- | --- | --- |
| 20261124223021 | backend_stabilization_search_paths_and_subrental_constraint | 7 function search paths pinned; sub-rental constraint validated |
| 20261124223053 | backend_stabilization_targeted_foreign_key_indexes | 10 new valid indexes; two redundant indexes removed; equivalent originals retained |
| 20261124223115 | backend_stabilization_client_policy_initplans | 8 RLS policies optimized; unmatched authenticated test identity saw no records across 5 tested datasets |

## Evidence
Staging security advisor: mutable search paths 7 -> 0. Performance advisor: duplicate index groups 2 -> 0; unindexed foreign keys 412 -> 402; RLS initplan findings 25 -> 17. Invalid indexes: 0. Unused index advisories increased as newly created indexes have not yet seen normal traffic. Health advisor: no findings.

## Release gates
- Verify fresh local migration chain, existing security/lifecycle tests and exact-head CI.
- Confirm the actual hosted migration ledger and reconcile drift by object definition, not blindly applying old files.
- Test real authenticated owner/staff/client sessions and positive and negative permissions in staging, booking concurrency, payments, partial returns and offline reconnect.
- Review existing intentional owner-executed masking views and RPC grants individually. Never switch views to invoker or revoke all RPC grants indiscriminately.
- Do not merge, deploy or apply to production until independent verification and owner approval. No production data mutation is authorized by this PR.

## Source-only prerequisite
`0270_reconcile_sign_in_events_immutability.sql` reproduces the already observed staging update/delete trigger and hardened function, absent from the checked-in chain. This is a new source-only migration; it was not applied to either hosted project in this turn. The three previously recorded migration files remain verbatim. The preflight must still block the older inventory as drift; do not mark this new migration as hosted-applied until reviewed.

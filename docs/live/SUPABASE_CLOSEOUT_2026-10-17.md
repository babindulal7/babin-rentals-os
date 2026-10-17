# Supabase closeout: 17 October 2026

## Status: local preparation in progress; production release blocked

Production project: `sxguwvgoserhdolewibb`. Read-only ledger snapshot: [schema_migrations_2026-10-17.txt](schema_migrations_2026-10-17.txt), 156 rows. No live migration or business-data write was performed by this pass.

## Migration reconciliation

`0164_booking_discount_vat_payment_integrity` is already recorded live. Do not reapply it. Pending application files, in order:

1. 0157 audit triggers
2. 0158 settings
3. 0159 saved views
4. 0160 pricing structures
5. 0161 booking project-type grant
6. 0162 non-money column grants
7. 0163 anonymous business-RPC grant closure
8. 0165 delivery jobs
9. 0166 booking transport dispatch
10. 0167 rental revert/archive
11. 0168 booking line totals and breakdown
12. 0169 Intel/guard search-path pinning (WRITTEN in this pass; verification recorded in PROGRESS.md)

The historical 0047 seed must stay excluded. Seven historical renames and two out-of-band ledger rows remain visible in the planner output; the curated runner does not replay them or automatically declare those identities reconciled. A migration ledger match is not proof of schema equivalence.

## User-run tooling changes

The retained `scripts/cutover-0157-0167-USER-RUN.ps1` entrypoint now covers the reviewed 0157–0169 manifest through `scripts/cutover-user-run.mjs`:

- Hidden credential prompt; credentials reach the child through temporary process environment, never command-line arguments. The wrapper restores prior environment values in finally.
- Accepts only the named production project's direct endpoint or session pooler on port 5432, with verified TLS. Rejects other projects and transaction pooling.
- Requires the recorded backup SHA-256 and a passing `check-dump` validation. Incomplete output is refused. This does not certify that the backup restores.
- Reads the current live ledger and skips already recorded names, including 0164. A missing expected 0156 baseline stops the run.
- Holds a cooperative session advisory lock. Each migration body and ledger receipt commit in one transaction; a failure rolls both back and stops later files.
- Prints file hashes and committed receipts. On uncertain connection/commit outcomes, refresh the ledger and inspect schema before retrying. No blind retries or automatic rollback of prior committed files.

Agents must not execute this wrapper or its CLI against production (N-5). A prepared runner is not deployment approval. Do not run it while the release blockers below remain open.

## Read-only live security findings

| Finding | Evidence / disposition |
|---|---|
| Six anonymous business RPC grants | `adjust_stock`, `portal_claim_by_verified_email`, `read_quote_editor`, `set_staff_active`, `set_staff_role`, `update_rental_quote` remain executable by anon. 0163 addresses the grants locally. Function guards may still refuse an unauthorized call; no live mutation was attempted. |
| No anonymous public view reads | Catalog privilege check returned zero readable public views for anon. |
| Public base tables have RLS | Catalog check found no public ordinary table without RLS. Policy correctness still requires authenticated API tests. |
| No unpinned public definer functions | Catalog check found none. Eleven public invoker/guard functions and two private record-editor helpers lack explicit paths; 0169 pins all thirteen exact signatures. Extension functions are not modified. |
| Staff-directory Auth join | Advisor flags the view's `auth.users` join. The view explicitly requires staff and limits Auth status/contact fields to Owner/Admin. Review remains necessary; do not blanket-rewrite masked views to security-invoker, which can conflict with column masking. |
| Definer views / helper execute advisories | These include intentional role/money-mask surfaces and auth helpers. Neither blanket revocation nor blanket dismissal is justified. Preserve explicit predicates and validate nine real JWT roles. |
| Storage scope gap | Both buckets are private, but authenticated SELECT/INSERT/UPDATE policies restrict only bucket names. This does not implement per-client ownership or the document permission matrix. Legacy path disposition is recorded in OPEN_DECISIONS.md. Release blocker until a scoped policy/client migration is locally and remotely verified. |

Advisor references: [Auth exposure](https://supabase.com/docs/guides/database/database-linter?lint=0002_auth_users_exposed), [definer views](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Performance advisory inventory

Saved raw findings under `artifacts/supabase-closeout-2026-10-17/performance-advisors.json`: 346 unindexed-FK findings, 13 auth/RLS init-plan findings, 35 no-primary-key findings, 130 unused-index findings, 403 multiple-permissive-policy findings and two duplicate-index findings. These are advisor finding counts across its inspected schemas and role/action combinations, not verified application defects or a ranked migration list.

No index or policy was dropped in response to an advisory count. Index removal needs workload/statistics review; policy consolidation must preserve the existing OR/AND permission semantics. Review [FK indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS init plans](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [permissive policy combinations](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) and [duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index) against actual application query plans before proposing follow-up changes. This performance work is inventoried, not certified complete.

## Required remaining work

1. Resolve legacy Storage path handling; implement and verify role/ownership restrictions without inventing permissions or allowing orphan-file fallbacks.
2. Provision/identify an isolated staging project. The connected branch listing contains only production main. No paid branch was created.
3. Supply fresh role sessions and known-record fixtures locally for `verify-staging-readonly.mjs`; add Storage API positive and negative cases. No admin SQL impersonation or fabricated JWT substitutes for real authentication.
4. Produce and validate a fresh backup, rehearse restoration on an isolated target, and retain a secure off-site copy/checksum. This environment has no configured database connection or PostgreSQL client on PATH; no backup is claimed.
5. After staging and backup review, Babin performs the reviewed application under BACKUP_PROTOCOL.md, refreshes the ledger and runs post-cutover plus real role/application checks.
6. Review the Auth leaked-password-protection advisory in the project's Auth configuration. It was not changed or certified by this pass.

Local verification results and WRITTEN/VERIFIED/APPLIED distinctions belong in PROGRESS.md. Production remains NOT APPLIED and NOT PRODUCTION-VERIFIED by this pass.

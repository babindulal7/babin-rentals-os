# Client import release verification — 16 October 2026

**Release state: HOLD for staging and deployment.** This review performed local, read-only inspection. No staging or production API request, database mutation, migration application, backup, or deployment was performed. Import recovery/UI verification is recorded separately by the integrating agent; this document does not certify those unfinished checks.

## Evidence and blockers

| Gate | Observed evidence | State |
| --- | --- | --- |
| Dedicated staging identity | No confirmed staging manifest, staging-specific environment file, or `BABIN_STAGING_*` process variables were present. `.env.local` contains ordinary app/database variable names and must not be repurposed as evidence of staging. | Missing |
| Real JWT/PostgREST role checks | Existing October 14 logs contain local anon/auth checks and a blocked manifest preflight. Local PGlite and mock sessions do not establish real hosted Auth/PostgREST behavior. | Unverified |
| Deployment destination | `vercel.json` specifies Vite, `dist`, SPA rewrites and cache/security headers. No local `.vercel` project attachment was present. Configuration alone does not establish an authorized project, domain, or production release. | Missing |
| Fresh backup and restore rehearsal | No local `backups` directory/evidence was found. This does not prove that no backup exists elsewhere. `../archive/BACKUP_PROTOCOL.md` now requires the hidden-input backup script, dump-complete validation, size and SHA-256; the release audit also requires a restore rehearsal into a separate database. | Evidence missing |
| Migration reconciliation | `npm run db:plan` reads the October 15 ledger: 163 local files, 155 live ledger rows, 146 exact name matches, 10 pending, 7 possible renames, 2 hazards and 2 unexplained live rows. These are planning classifications, not a verified apply list. | Blocked |

The live ledger is a saved October 15 observation through `0156_operation_session_audit_actor`; it is not a fresh network read on October 16. The pending migration count includes historical hazards and must not be interpreted as permission to apply all files. N-5 still prohibits agent production migration pushes. Babin applies reviewed files after the backup protocol.

## Runnable read-only staging check

Recovered the existing verifier from branch `fix/ci-mock-tests-and-baseline-2026-10-14`, path `artifacts/staging-verification-2026-10-14/verify-staging-readonly.mjs`, into the new release artifact directory. Changes only update the evidence timestamp and result filename. It deliberately does not load `.env.local`.

```powershell
node artifacts/import-release-2026-10-16/release-verify-staging-readonly.mjs --self-test
node artifacts/import-release-2026-10-16/release-verify-staging-readonly.mjs <confirmed-nonsecret-manifest-path>
```

Self-test: **12 safety assertions passed with zero network requests.** Running the supplied example manifest exited blocked before networking: `Owner-confirmed staging manifest is required`. Logs are `release-verifier-safety.log` and `release-verifier-preflight.log`; migration planning output is `release-migration-plan.log` in the same directory.

Supply a confirmed dedicated staging project reference and fixture IDs in a nonsecret manifest copied from `release-staging-manifest.example.json`. Supply credentials through a private session mechanism, never chat, shell history, source, or committed artifacts. Required variable names:

- `BABIN_STAGING_PROJECT_REF`, `BABIN_STAGING_SUPABASE_URL`, `BABIN_STAGING_ANON_KEY` (public/anon key only).
- `BABIN_STAGING_OWNER_JWT`, `BABIN_STAGING_ADMIN_JWT`, `BABIN_STAGING_MANAGER_JWT`, `BABIN_STAGING_COORDINATOR_JWT`, `BABIN_STAGING_WAREHOUSE_JWT`, `BABIN_STAGING_TECHNICIAN_JWT`, `BABIN_STAGING_ACCOUNTS_JWT`, `BABIN_STAGING_DRIVER_JWT`, `BABIN_STAGING_CLIENT_JWT`.

The verifier refuses the known production project, mismatched origins, secret/service keys, missing/expired sessions and missing positive-control fixture IDs. It makes GET requests only and refuses redirects. It checks real Auth identity, database-resolved roles, money masking on known rows, anonymous denial and Client row isolation. Connection errors and missing relations are failures, never successful denials. Output excludes JWTs, keys, user identifiers, URLs, row bodies and PII.

This verifier is intentionally limited: it does **not** test import writes, RPC idempotency after a lost response, session refresh/signout, storage policies, or full booking lifecycle. Those require a confirmed staging target, synthetic fixtures, a reviewed mutation plan and separate recorded evidence. Passing this read-only harness alone cannot release the app.

## Completion conditions

1. Confirm dedicated staging identity, fixtures and private credentials; run the read-only verifier and synthetic import/recovery checks, including role denial and interrupted connections.
2. Re-export live metadata, reconcile migration names/hazards and review the exact apply list under `BACKUP_PROTOCOL.md`. Retain WRITTEN / VERIFIED / APPLIED / PRODUCTION-VERIFIED distinctions.
3. Record fresh backup hash and successful separate-database restore rehearsal; confirm the hosting project/domain and build-time public app settings.
4. After the required local and staging gates pass, deploy the approved frontend artifact to that confirmed destination. Babin handles any production migrations under N-5; production smoke tests must verify the resulting deployment before calling it production verified.

References: [`../archive/BACKUP_PROTOCOL.md`](../archive/BACKUP_PROTOCOL.md); [`docs/release/2026-10-14/LIVE_SECURITY_AUDIT.md`](release/2026-10-14/LIVE_SECURITY_AUDIT.md); [`docs/release/2026-10-13/BLOCKERS.md`](release/2026-10-13/BLOCKERS.md); [`docs/live/schema_migrations_2026-10-15.txt`](live/schema_migrations_2026-10-15.txt).

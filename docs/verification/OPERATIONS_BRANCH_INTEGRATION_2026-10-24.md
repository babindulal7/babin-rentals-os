# Guarded operations-branch integration — 24 October 2026

Status: shared-source integration implemented; fresh final-source gates pending. Migrations WRITTEN, NOT APPLIED or PRODUCTION-VERIFIED. Production launch remains HOLD.

## Approval and integration

Babin explicitly selected **“Integrate the guarded pair”** after the defaults and Admin restriction were stated. Current shared source already contained a restored, unguarded 0171 and early action check. Integration preserves its direct authenticated table-write revocation and all unrelated UI/booking-input changes, adding:

- Admin cannot issue/revoke operation grants for Owner/Admin targets, including self; target-role locks preserve the check during the transaction.
- 0172 restrictive RLS checks direct Reset queue/task writes and old/new scope on reparenting. Linked entries use booking branch; unbooked entries use the unit's current warehouse branch, never the actor-home or stale unit branch.
- Early floor-action preflight runs in both live and mock paths; missing/refused/unreachable RPCs fail before action writes. Explicit mock behavior retains the same narrowing-only history rule.
- Existing `npm run check:security` now requires Phase 0 security, operations-grant history and Reset boundary regressions. The existing CI security step runs the complete command, rather than relying on an optional local script.

No role matrix or money-visible role was widened. Grant administration UI is not added; the authenticated RPCs are the existing administrative surface. No migration, backup, restore, hosted data mutation, deployment, commit or push was performed by this integration task.

## Split Return/Reset scope

The approved Reset queue insert boundary includes rows automatically created during Return. An explicit regression proves that Return scope alone cannot authorize that Reset work and that a paired Reset grant on the branch permits queue creation. Scoped floor operators doing this workflow therefore need both branch grants. The existing multi-write Return action is not made atomic by this policy; real hosted failure/resume acceptance remains required.

## Verification

- Initial focused typecheck and action/mock suites: 90/90 tests pass.
- Full final-source pipeline, security/lifecycle, coverage, build and generated completion: running. Earlier 23 October candidate receipts are retained as history and cannot certify this different shared source.
- Logs will be retained under `artifacts/release-integration-2026-10-24/`, with source hashes before/after each command. A moving source or any failed command stops certification.
- First full attempt, `2026-10-23T19-23-16-085Z` (UTC artifact timestamp), stopped at typecheck: a concurrently introduced booking-search fixture lacked `lastRentalAd` / `lastRentalBs`, and the fingerprint changed during the command. Those fields were already complete when inspected afterward; this integration did not overwrite that unrelated test. The failed attempt is retained and certifies nothing; a fresh attempt is required.

## Physical acceptance inventory

User-confirmed available devices: **iPhone 17 Pro** and **M4 iPad Pro**. OS/browser versions and any external scanner model/interface are not recorded. Availability is not a passed test.

On each actual device, record and execute:

1. OS/browser version, Safari/PWA mode, portrait/landscape, light/dark mode and touch/keyboard interaction.
2. Camera permission allow/refuse/retry; scan a real known serial and an unknown code; verify visible success/refusal without leaked amounts for floor roles.
3. Pack → Handover → Return → Reset, including signature/evidence capture, reload/readback, paired-grant behavior and revoked-branch refusal.
4. Offline draft reload and reconnect; do not report custody committed while offline. Confirm idempotent retries and no duplicate writes, including two-device interactions.
5. Nepali glyph rendering offline, media upload recovery and correct role/branch restrictions through genuine hosted Auth/PostgREST/Storage.

Isolated staging identity, securely supplied role sessions/fixtures and owner-controlled backup/restore/cutover remain outstanding. The previously connected production project is not a staging substitute. No hosted application is authorized by source integration approval.

Supabase project discovery was repeated on 24 October and still returned only the known production project, not an identified isolated staging target. Official Supabase RLS documentation and current changelog were reviewed; cached TLS/Postgres compatibility notices remain relevant to eventual hosted/device acceptance. No server upgrade or hosted policy change was made.

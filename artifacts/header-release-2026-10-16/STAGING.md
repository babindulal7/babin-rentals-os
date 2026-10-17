# Staging acceptance — 16 October 2026

Status: **INCOMPLETE**. No live acceptance or production approval is claimed.

The local verifier tests passed (2/2). Running `node scripts/verify-staging-readonly.mjs` produced an INCOMPLETE preflight report because the required staging configuration is absent. That run made no live requests. The redacted report is under `artifacts/staging-verification/2026-10-16T09-10-53-213Z/`.

Required configuration, supplied through the local process environment:

- `BABIN_STAGING_PROJECT_REF` and matching `BABIN_STAGING_SUPABASE_URL`: the isolated staging project, never production.
- `BABIN_STAGING_ANON_KEY`: that project's public API key.
- `BABIN_STAGING_JWT_<ROLE>` for Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client: genuine staging Auth sessions.
- `BABIN_STAGING_FIXTURES`: path to the known-record manifest required by `scripts/verify-staging-readonly.mjs`, with existing permitted and cross-client records for positive and negative controls.
- `BABIN_STAGING_DB_URL`: staging connection for the read-only anonymous-function privilege inspection; without it the verifier cannot certify that inspection.

Keep credentials out of chat, committed files, reports, and command history. The script suppresses credentials and response bodies in its reports. Run its existing tests with `node --test scripts/verify-staging-readonly.test.mjs`, then run the verifier with the environment configured. A PASS must be reviewed for its stated coverage; read-only checks do not certify mutating RPCs, storage writes, or production cutover.

No project was created, resumed, seeded, migrated, or changed by this continuation. The previous connector discovery exposed only two inactive projects and did not establish which project is staging. A confirmed staging identity and test sessions remain required. N-5 and the existing backup/application protocol still govern live migration work.

## Babin organization access check

The user identified the Babin organization as the intended location. Fresh connector discovery returned only an organization named "Rental os" and its two inactive projects. The local Supabase CLI is installed but logged out. Two browser dashboard-opening attempts timed out. The installed plugin is enabled; available management tools cannot perform account reauthorization. The user selected reconnecting the Supabase connection. Its last verified scope still exposed only "Rental os". Reconnect using the account containing Babin, then verify its project identity and whether it is staging before running any project checks. No projects or permissions were changed.

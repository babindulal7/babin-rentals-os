# Babin Rentals OS — no-cloud release verification

**Date:** 2 Nov 2026 (Nepal)  
**State:** execution guide only; NOT an approval to migrate or deploy production.  
**Tracking:** [release HOLD #56](https://github.com/babindulal7/babin-rentals-os/issues/56).

This procedure uses the tools **already in this repository**. It does not create a Supabase cloud development branch, incur cloud compute charges, download production client records, or apply live migrations. Run it only on an operator-controlled machine with a Docker-compatible engine when using the full local stack.

## A. Fast verification — no Docker or cloud

In the checked-out repository (Node 24 / locked npm dependencies), use:

```sh
git switch main
git pull --ff-only
npm ci
npm run typecheck
npm run lint
npm run check:pglite
npm run check:security
npm run test:server-contracts
npm run check:lifecycle
npm run test
npm run build
```

- `check:pglite` uses disposable in-process PostgreSQL and applies the repository's full ordered SQL set. It needs neither Supabase cloud credentials nor a local Supabase stack.
- `check:security` exercises effective SQL role predicates and permission boundaries **in PGlite**, but is **not** proof that hosted JWT/PostgREST behaves identically.
- Record the commit SHA, command exit codes, migration count and any failures. Do not report a passing security/production release gate from a partial command sequence.

## B. Full local Supabase stack — Docker, GoTrue and PostgREST

**Prerequisite:** The existing `supabase/config.toml` is committed. Do **not** run `supabase init` again. This project intentionally sets `[db.migrations].enabled = false` because its numbered SQL files require its own ordering script.

1. Start Docker Desktop / a compatible runtime, then use:

   ```sh
   docker info
   npm ci
   npm run db:start
   npx supabase status
   npm run db:list
   ```

2. Reset **only the local Supabase database** to a known-empty state, then apply this repository's migrations using the existing local-container-only script:

   ```sh
   npx supabase db reset --local --no-seed
   npm run db:apply -- --include-held-back
   npm run check:rebuild
   ```

   **Local reset destroys your existing LOCAL test data.** It must never be used with `--linked` or `--db-url`. The local migration runner connects via `docker exec` to a `supabase_db_*` container and stops at the first SQL error. Its `--include-held-back` flag is deliberate: the default skips `0062_law6_column_grants_arm_the_mask.sql`, even though this money masking migration is recorded as applied on live. Using the default would produce a weaker security simulation.

   **Stop if any migration fails.** Do not ignore the failure, rename already-applied files, skip migrations to force green, or run a batch against live as a workaround. `check:rebuild` uses a disposable scratch database inside the local container and runs the full migration set.

3. Configure local-only `.env.localdb.local` with the **local** API URL and local **publishable/anon** client key from `npx supabase status`. Never use a `service_role` or secret key in any `VITE_` variable, and never copy the hosted Supabase URL or keys into this file. Keep `.env.local` untouched. Then:

   ```sh
   npm run dev:local
   ```

   The app should connect to the local stack, not the production instance. Confirm in browser network requests that API calls target localhost (default port 54321).

4. Use **synthetic** users and fixtures only. Create test staff accounts *in local Auth* and corresponding local `users` rows according to the application's supported identity bridge. Do not reuse production passwords, JWTs, phone numbers, or client data.

## C. Automated local Auth/PostgREST access gate

Run the local-only checker against **synthetic** Owner and Driver identities. It validates the loopback URL and the anon/publishable API key before making any network request; it does not write records.

1. In gitignored `.env.localdb.local`, use **only local** settings and synthetic user passwords:

```dotenv
LOCAL_SUPABASE_URL=http://127.0.0.1:54321
LOCAL_SUPABASE_ANON_KEY=<local anon/publishable key from npx supabase status>
LOCAL_OWNER_EMAIL=local.owner@example.test
LOCAL_OWNER_PASSWORD=<synthetic Owner test password>
LOCAL_DRIVER_EMAIL=local.driver@example.test
LOCAL_DRIVER_PASSWORD=<synthetic Driver test password>
```

Create those synthetic accounts in the **local** Supabase Auth instance and associate each with a local `users` record using the supported identity bridge. The checker verifies actual `Owner`/`Driver` roles from the local database; it fails if a role or fixture is missing. Do not use production email addresses, passwords, JWTs, client records or a service-role key.

2. Run the no-network guard self-tests and the local Auth/PostgREST checks:

```sh
npm run test:local-api-guards
npm run check:local-api -- --phase unassigned
```

The checker requires Owner-visible client rows and at least one Owner-visible synthetic financial fixture; otherwise the result is **inconclusive/failing**, not a false security pass. It checks `clients_v` and `client_directory_v` with Owner and Driver sessions and checks financial-table access. It returns only counts (never private rows).

3. In the local database, arrange synthetic assigned, completed and failed delivery jobs, and rerun with `--phase assigned`, `--phase completed`, and `--phase failed`. **The flag is an operator label, not proof of the actual job status.** Verify the associated job state separately. This script alone does not certify scoped booking/trip RPC behavior.

Only loopback API URLs are accepted. Real hosted JWT/PostgREST parity and production migration readiness remain separate release gates.

---
## D. Hosted-path simulation and acceptance matrix (local only)

Exercise real local GoTrue sessions and the PostgREST HTTP API using the local **publishable/anon** key. Never impersonate a role using the service key.

| Identity | Required observations |
|---|---|
| Driver, no active job | `clients_v` and `client_directory_v` return **zero rows**; money data inaccessible |
| Driver, active assigned job | Both client-directory views still return **zero rows**; permitted job/booking access is scoped and explicit |
| Driver, completed/failed job | No stale client-directory or cross-booking access |
| Warehouse / Technician | Required operational fields remain usable; no finance leakage or unauthorized money writes |
| Owner / Admin | Authorized client-directory access remains intact, including any staff-rental metadata |
| Client | No other client's booking, client details or private financial data |

Check `clients_v`, `client_directory_v`, `bookings`, `booking_lines_v`, and the relevant client/driver job RPCs through **actual JWT/PostgREST requests**, not SQL sessions with manually-set claims alone. Record role, session, expected status/row count, actual status/row count and the relevant migration version. No real names or credentials in evidence. Explicitly verify that an error is not reported as a reassuring zero-row success.

**Limit:** Even a green local stack cannot establish parity with production's current historical data, applied migration order, hosting defaults, or deployed code. This is a *pre-production gate*, not deployment approval.

## E. Read-only production drift reconciliation

The connected live migration ledger and repository SQL files are not in one-to-one agreement: the 2 Nov audit found **49 unmatched local filenames**, including **34 filenames numbered 0165–0203**. Some older differences are known renames. The existing `scripts/plan-migrations.mjs` intentionally fails closed on unexplained renames; its default historical snapshot is stale.

1. Refresh the version/name list by running **only this SELECT** in the Supabase SQL editor (or the connected read-only query action):

   ```sql
   select version, name
   from supabase_migrations.schema_migrations
   order by version;
   ```

2. Compare the fresh names with the files **and object definitions**, not only numeric prefixes. Account for the two distinct `0188_*` files, renamed older migrations, the deliberate `0175` gap and 0199–0203.
3. Run `npm run db:plan:selftest` to verify the planner itself. After safely saving a *fresh* non-sensitive version/name snapshot under `docs/live/`, use `node scripts/plan-migrations.mjs <snapshot-path>`. Treat exit code 2 as a blocker, never an authorization to force changes.
4. Do not use `supabase db push`, `supabase migration repair`, `supabase db reset --linked`, live `apply_migration` or automatic deployment to force alignment. Production change control, backup/restore, and approved migration sequence are a **separate future task**.

## F. Done criteria and cleanup

- [ ] Local complete migration rebuild (no skipped Law 6 mask)
- [ ] Local API identity/role matrix passes; evidence saved without credentials
- [ ] Fast PGlite, mock, financial and lifecycle checks pass
- [ ] Combined `main` GitHub CI (including coverage) finishes successfully on the **same commit**
- [ ] Fresh live migration history is reconciled without unexplained drift
- [ ] Auth and masked-view behavior reviewed; Supabase advisor findings triaged
- [ ] Production migration/deployment remains blocked until separate explicit approval

Stop the local stack with `npm run db:stop` when finished. This stops containers; it does not deploy or migrate live.

**References:** `docs/LOCAL_DATABASE.md`, `scripts/apply-migrations-local.mjs`, `scripts/check-pglite.mjs`, `scripts/check-astra-phase0.mjs`, `scripts/check-rebuild.mjs`, `scripts/plan-migrations.mjs`, and `supabase/config.toml`.

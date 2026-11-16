# Babin Rentals OS — Free Staging Bootstrap, verified preflight

**Date:** 16 November 2026  
**Baseline:** `main` `3658f2faf91001d3f76e48bc21a51c803db83051`  
**Status:** Existing free staging project VERIFIED, **app schema NOT INSTALLED**. This is a preparation and acceptance contract, not a production release clearance.

## 1. Owner cost decision fulfilled

The user authorized a **free** staging environment and requested proceeding without paid resources. Connected Supabase reports one **Free** organization and exactly two existing active projects, both in Singapore (`ap-southeast-1`). No third project, paid branch or service was created.

| Environment | Project ref | Initial app state |
|---|---|---|
| Existing production (**READ ONLY**) | `sxguwvgoserhdolewibb` | ~48 MB Postgres, 135 public tables |
| Existing free staging (**approved target only**) | `klhmsrunqrdxjudyhnkm` | ~12 MB Postgres; 0 app tables, 0 `auth.users`, 0 storage buckets, 0 storage objects, 0 migration ledger records |

**Observed by read-only connected queries on 16 Nov 2026**. Staging security/performance advisor returned no current findings, but an empty app schema does **not** prove business permissions secure.

Supabase Free plan has two active free projects: [official billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase).

## 2. Source migration inventory and blockers

Current GitHub main has **235** `.sql` migration files, each pinned in [the immutable Git-blob inventory](STAGING_SQL_INVENTORY_2026-11-16.json). The inventory's `review_state` is a **required review task**, not an approval to execute the file. The earlier [hosted rollback-only rehearsal](../live/STAGING_HOSTED_REHEARSAL_2026-11-12.md) established compatibility of `0001`–`0003` but left no durable app schema.

**Mandatory decisions before a durable staged apply:**

1. Audit `0012_seed_data.sql`, `0047_seed_reference_corpus.sql` (~1.87 MB) and `0082_seed_operational_stage_corpus.sql` for one-time data, real identities and test-data dependencies. Do not silently seed original client/staff information.
2. Preserve both `0188_smart_reservation_holds.sql` and `0188_staff_renting_gear.sql` with explicit order and dependency evidence. Do not renumber the original files or invent a new migration history.
3. Reconcile historical renamed migration names and production-only ledger names described in [the Nov 12 reconciliation](../live/STAGING_RECONCILIATION_2026-11-12.md). Changes in the SQL source since that snapshot (now 235, previously 233) need review.
4. Verify actual DDL order, dependent RLS policies, `SECURITY DEFINER` authorizations, Storage schema, and whether a **synthetic-only schema build** is possible without loading the large demo seed.
5. Produce a staged **exact-content SHA-256 apply manifest**, dependencies, seed exclusions, per-file rollback/recovery strategy, and an explicit list of untouched production objects. Git blob hashes in the inventory are source identity, **not** SHA-256 and not proof that the migration can be applied.

### Local read-only preflight

```bash
# Repository root; no database credentials needed
node scripts/staging-schema-preflight.mjs
npm run check:pglite
npm run check:lifecycle
npm run gates
```

The new script reads local SQL files, calculates a SHA-256 inventory fingerprint, reports suspicious seed/large files and duplicate numeric prefixes. **It connects to no database and executes no SQL.** It was syntax-tested and exercised on a synthetic three-file fixture including the expected duplicate 0188 prefix. Run it again in the full repository and keep its real output in the internal verification evidence.

## 3. Work split: existing two-computer setup

**Windows Antigravity (lead for staging writes, when cleared):**

- Keep T1-01 production backup **read-only**, use `scripts/backup-db.ps1` with owner-managed password entry; verify `check:dump`, file size and checksum. Copy privately off-machine; **never commit a dump, credentials or client data**.
- Compare the live migration ledger read-only with the immutable Git source list and object definitions. Resolve historical renames and decide excluded/approved seed files.
- Prepare synthetic test records in an isolated local build and document a reviewed staging installation manifest and dependency order. Do not apply to production or automatically restore a full production dump.
- Only after successful local tests and the manifest/recovery check, execute reviewed migration files **against the explicitly identified staging project only**, serially, stopping at the first error. A second person reviews the target ref and migration inventory before the first durable write.

**Mac Antigravity (independent reviewer; no concurrent staging DDL):**

- Verify manifest content, migration dependency order and identity of the target environment.
- Run PGlite/security/lifecycle gates locally and review any `anon` grants / `SECURITY DEFINER` behavior.
- When Windows reports that staged schema and identity seats exist, run nine-role PostgREST/JWT checks and Storage signed-URL tests from [T1-05](../plans/T1_RELEASE.md) and [PR #174](https://github.com/babindulal7/babin-rentals-os/pull/174).
- Record redacted negative-test evidence for Warehouse, Driver, Client A and Client B isolation; verify no real client PII in logs or fixtures.

**Mac Gemini / Lane B:** Keep localization and rider work isolated; do not own staging schema or touch T1-02/T1-05/T1-06 files.

## 4. Staging acceptance gate

Before T1-02 may become `done`:

- [ ] T1-01: Fresh production backup checksum and confidential off-device copy, or a documented owner-approved alternative; no production write
- [ ] Exact Git SHA and numbered SQL manifest with all seed/collision decisions resolved
- [ ] Staging-only schema installed without errors; schema and migration ledger counts verified against reviewed manifest
- [ ] Safe synthetic client, booking, gear, invoice and payment fixture records; no genuine production client information publicly accessible
- [ ] Nine isolated Auth users, site grants, and all permission negative tests exercised with actual staging access tokens
- [ ] Storage `documents` / `evidence` bucket upload/read/signed-URL/RLS tests and unlinked object quarantine inventory
- [ ] Restricted staging access; no public preview exposing staff records
- [ ] A restoration/rollback drill recorded with timings, checksums, expected vs actual
- [ ] Owner device/hosted checks and local/full CI evidence; failures left as blockers

## 5. Hard safety rules

- **Never** connect a migration runner to production ref `sxguwvgoserhdolewibb`; production is read-only for the entire task.
- **Never** run `supabase db push`, `db reset --remote`, or blanket `psql -f` without reviewing the repo's nonstandard 4-digit migration names and seed history.
- No new billable project/branch/add-on; no live Supabase, DNS, Cloudflare, Booqable, external emails or payment changes.
- Do not promote `T1-01`, `T1-02`, `T1-05` or `T1-06` to DONE merely for creating a Free account, passing PGlite or creating a migration inventory.
- Do not copy production users, client footage or real document files into staging without a **separate privacy/retention authorization**. Synthetic-only staging is the approved default for preparation.

## 6. What was achieved now

- **Verified** the existing Free organization and project; avoided duplicate paid provisioning.
- **Verified** staging empty and healthy by read-only SQL and project metadata, including zero Auth users / Storage objects.
- **Pinned** all 235 Git migration blobs/sizes in a structured manifest, identifying 0188 prefix collision and seed-file review gates.
- **Added** a local read-only SHA-256 migration manifest script and syntactic/synthetic-fixture smoke test.
- **Did not** write any hosted application schema, create staging identities, restore client records, or change live database.

Next smallest safe action: Windows agent generates and reviews the real source hash/dependency + synthetic-seed manifest. Only then begin durable **staging-only** schema installation and actual Auth/Storage acceptance. Keep PRs #174 and #178 linked until the gates pass.

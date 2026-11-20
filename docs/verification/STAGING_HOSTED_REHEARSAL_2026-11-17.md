# Hosted staging rollback-only compatibility: migrations 0001–0011

**Observed:** 17 November 2026 (NPT)
**Immutable source baseline:** [`main` `4ba3cde372b5a690468aff370572a9e8500c9685`](https://github.com/babindulal7/babin-rentals-os/tree/4ba3cde372b5a690468aff370572a9e8500c9685)
**Isolated hosted target:** existing free `babin-staging` (`klhmsrunqrdxjudyhnkm`), Singapore region
**Protected production:** `sxguwvgoserhdolewibb` — NO SQL writes; read-only migration metadata comparison separately
**Outcome:** PASS for compatibility test on the first 11 source SQL files; persistent staging state unchanged
**Limit:** NOT a durable schema install, backup/restore drill, JWT/RLS/Storage acceptance, or production release clearance.

## Source identities

All 11 files were fetched at the same GitHub ref, 389578 source bytes in total. Their Git blob hashes are:

| Order | Source file | Bytes | Git blob SHA |
|---|---|---:|---|
| 1 | `0001_enums.sql` | 69161 | `822ab6b60cf6de4f02814502764af0e6461ae124` |
| 2 | `0002_bookings.sql` | 45587 | `5de6f3bbbb177a6168a7c0734e720181d906cfb7` |
| 3 | `0003_operations.sql` | 88767 | `d2fb91b86814e9c3ee6630bd8db5536798b6d20a` |
| 4 | `0004_inventory.sql` | 36585 | `ee3369d8fd2332ec31c0edd42d9bf973860b2c70` |
| 5 | `0005_clients.sql` | 57235 | `c04af52a89e3184b70ffb0c79c609e1661b80d0e` |
| 6 | `0006_finance.sql` | 28849 | `b71cef1ec279c6f46f032adf9f61acf2574ca108` |
| 7 | `0007_admin_security.sql` | 18814 | `0ad38069541f65b7747ca55dcd1d7ae356a681dc` |
| 8 | `0008_automation_comms.sql` | 10798 | `4189f955d7034bed06844c9e244987c4c23bf9d9` |
| 9 | `0009_crew_vehicles.sql` | 14013 | `143bdc33f53487606791860462406b6e39389f19` |
| 10 | `0010_triggers_functions.sql` | 12730 | `c62d506e801a70cbec359103a2ca5df260f36e1d` |
| 11 | `0011_rls_policies.sql` | 7039 | `f3f5156ff6a1ed3a5b0689d6fb132a87f2ecfce2` |

**Exact method:** The preflight verified no unhandled top-level transaction delimiters / psql meta commands in these source files. Each standalone source file's top-level `BEGIN;` and `COMMIT;` was replaced **only in the temporary execution string**. The resulting SQL was executed against the staging target in source order, wrapped in a single explicit `BEGIN;` / `ROLLBACK;` with session-local statement/lock timeouts. SQL returned success. No migration was submitted through the Supabase `apply_migration` action and no permanent schema objects, users or buckets were created.

Two independently executed hosted tests succeeded:

- `0001`–`0004`, then `ROLLBACK`;
- `0001`–`0011`, then `ROLLBACK`.

The second includes foundational Finance, Clients, Admin/Security, automation, crew/vehicles, triggers/functions and RLS policies. It **does not** include `0012_seed_data.sql`, which introduces initial users, business accounts, simulated branches and products, or any subsequent seed or data migration.

## Post-rollback proof

Read-only catalog queries following the final rehearsal returned:

| Check | Count |
|---|---:|
| `public` application base tables | 0 |
| `public` enum types | 0 |
| `auth.users` | 0 |
| `storage.buckets` | 0 |
| `storage.objects` | 0 |
| `btree_gist` installed | 0 |
| Migration-history entries | 0 |

The absence of these objects confirms no durable data/schema remained from this rehearsal. No production data/credential rows were read or imported. No DNS, deployments, paid project or live settings were changed.

## Updated source and live ledger discrepancy

On this exact source SHA:

- Source: **237** SQL files;
- Production history: **157** entries (read-only);
- Exact **name** matches: **148**;
- Source-only names: **89**;
- Production-only names: **9**;
- Two historical files share prefix `0188` and require explicit sequence review.

The prior 235-file inventory is superseded by [the refreshed 237-file inventory](STAGING_SQL_INVENTORY_2026-11-16.json) and [read-only reconciliation](STAGING_SOURCE_VS_LIVE_2026-11-17.md). Name matching alone proves nothing about source SQL equivalence with the live database.

## Stop condition and next gates

1. **Hold before `0012`.** Review `0012_seed_data.sql` for synthetic identity, staff emails, office and bank/account seeds. Do not seed realistic-but-uncontrolled identities and then accidentally trigger outgoing messages.
2. **Do not blindly install `0047`** (large one-time reference corpus, ~1.87MB) or `0082` (renamed `0076`, time-relative bookings). Decide their exclusion/replacement with synthetic fixtures and prove dependent migrations still work.
3. Obtain a complete validated dependency/SQL hash plan for `0012`–`0240`, including the duplicate `0188` prefix and mismatched production history. Install only a reviewed sequence to **staging** after proper local full-gate and recovery readiness, then test fresh Auth identities, PostgREST RLS and Storage signed URLs with real staging JWTs.
4. Keep T1-01, T1-02, T1-05, T1-06 incomplete. A passing 11-file rollback-only test cannot satisfy their full acceptance criteria.

**Next owner-independent work:** Windows Antigravity prepares a synthetic-only seed and dependency map using the recorded source SHA. Mac Antigravity independently reviews it and runs real nine-role/Storage acceptance after a safely installed staging schema. No further approval to spend money is implied or required for the existing Free project.

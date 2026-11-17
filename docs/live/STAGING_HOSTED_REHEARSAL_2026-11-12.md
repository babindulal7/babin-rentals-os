# Babin Rentals OS — hosted staging compatibility rehearsal

**Observed:** 12 November 2026 (Nepal time)  
**Repository baseline:** [`main` `27407e01d99f`](https://github.com/babindulal7/babin-rentals-os/tree/27407e01d99f61aaafda0771e915225efed0698a)  
**Staging project:** `klhmsrunqrdxjudyhnkm` (`babin-staging`, PostgreSQL 17.11)  
**Production project:** `sxguwvgoserhdolewibb` (PostgreSQL 17.6)  
**Verdict:** **PARTIAL COMPATIBILITY VERIFIED; HOSTED ROLE ACCEPTANCE BLOCKED; PRODUCTION RELEASE HOLD**

## What was actually executed

All database operations described here were performed through the connected Supabase project tooling. All migration tests targeted **staging**, inside a `BEGIN` / `ROLLBACK` transaction. Each original migration's top-level transaction delimiters, where present, were removed **in the temporary test query only**, not in Git or on disk. The migration source was checked by exact Git blob SHA before execution.

| Order | Transaction-scoped hosted test | Outcome | Post-rollback verification |
| --- | --- | --- | --- |
| 1 | `0001_enums.sql` (277 enum definitions) | Accepted by hosted staging PostgreSQL | 0 public enum types |
| 2 | `0001_enums.sql` → `0002_bookings.sql` | Accepted | 0 public enums; 0 public tables |
| 3 | `0001_enums.sql` → `0002_bookings.sql` → `0003_operations.sql` | Accepted | 0 public enums; 0 public tables; `btree_gist` absent |

Source Git blobs: `0001` `822ab6b60cf6de4f02814502764af0e6461ae124`; `0002` `5de6f3bbbb177a6168a7c0734e720181d906cfb7`; `0003` `d2fb91b86814e9c3ee6630bd8db5536798b6d20a`.

The tests establish that **the first three SQL files execute together without errors on the staging PostgreSQL version**. They do **not** establish a working deployed database, complete dependencies, PostgREST/JWT permissions, compatibility with production data, or the entire migration sequence.

### Final staging state after all tests (read-only catalog/ledger recheck)

| Item | Verified count |
| --- | ---: |
| Public application base tables | 0 |
| Public views | 0 |
| Public RLS policies | 0 |
| Public enum types | 0 |
| Recorded migrations | 0 |
| `btree_gist` installed | 0 |

Supabase `auth.users` and `storage.objects` exist as platform infrastructure, but `public.bookings` does not. `pgcrypto` is installed on staging. The staging security advisor returned no findings; with **no application schema**, that is not evidence of app security.

**Persistence safety:** No permanent hosted migration, seed, function, policy, role, app table, or staging customer data was created by these transactions. No production data, migrations, roles, schema, or credentials were modified or queried for individual records.

## Production security catalog findings (read-only)

The following **six named public RPC functions currently grant `EXECUTE` to `anon`**. Each function is `SECURITY DEFINER`. We inspected their definition heads and identified internal guards:

| Function | Guard found in current definition | Review outcome |
| --- | --- | --- |
| `adjust_stock` | `auth_user_role()` restricts Owner/Admin/Manager; actor compared to `auth.uid()` | Anonymous grant should be removed as defense in depth after staging verification |
| `portal_claim_by_verified_email` | Requires non-null `auth.uid()` and checks verified email | Test the actual portal claim lifecycle |
| `read_quote_editor` | Requires signed-in Owner/Admin/Manager/Coordinator | Verify no anonymous read via hosted JWT/PostgREST |
| `set_staff_active` | Requires signed-in Owner | Verify anonymous and non-Owner denials |
| `set_staff_role` | Requires signed-in Owner | Verify anonymous and non-Owner denials |
| `update_rental_quote` | Requires signed-in Owner/Admin/Manager/Coordinator | Verify denied anonymous writes |

**Interpretation:** A granted `EXECUTE` privilege is a real authorization surface, but it does not by itself prove that the function permits an unauthorized action. We did not invoke these mutations or test an actual forged JWT. The current production security advisor also flags `staff_directory_v` as potentially exposing `auth.users`, plus 30 `security_definer_view` warnings. Review effective permissions and masked columns with genuine test identities before changing production grants or view definitions.

Supabase reference: [Database security advisor](https://supabase.com/docs/guides/database/database-linter?lint=0002_auth_users_exposed); [migration safety guidance](https://supabase.com/docs/guides/deployment/database-migrations).

## Why durable staging installation is still blocked

1. The source has **233 SQL files** and production has **157 recorded migrations**. The previous [filename reconciliation](STAGING_RECONCILIATION_2026-11-12.md) has **85 source files without exact ledger-name matches**, **9 live-only ledger names**, at least 7 possible historical renames, and a duplicated `0188` prefix. Filename similarity does not prove content equivalence or install order.
2. `0047_seed_reference_corpus.sql` is a one-shot reference/demo seed and must **never** be blindly replayed on a production-derived database. Any synthetic staging dataset must be explicit and non-personal.
3. `supabase/config.toml` deliberately has `[db.migrations].enabled = false` because the legacy migration naming/ordering differs from Supabase CLI expectations. Do not run `db push`, `migration repair`, or `db reset --remote` without an approved immutable manifest and target verification.
4. The repo's PGlite CI validates a local Postgres simulation, not Supabase hosted permissions. Hosting also differs by minor PostgreSQL release (staging 17.11 vs production 17.6), built-in grants, Auth, Storage and Realtime.
5. A fully authorized staging migration is a **write** and must preserve its own ledger/evidence and test only synthetic accounts. A production-data restore requires a documented privacy/backup/retention decision and is **not** part of this rehearsal.

## Exact next execution gate (not yet completed)

- [x] Confirm existing independent staging project and hosted baseline catalog
- [x] Run transaction-scoped compatibility tests for `0001`, `0002`, `0003` and verify rollback
- [x] Refresh production ledger count and anonymous RPC grant inventory, without data extraction
- [ ] Produce a content-hash- and dependency-verified apply manifest for **all** 233 source SQL files, including the 0047 seed decision, duplicate 0188 numbering, migrations with already-executed equivalents and any non-transactional statements
- [ ] Approve a synthetic-data-only staging install plan, recovery proof, exact target project ID, restricted network and test-account permissions; decide whether a sanitized production restore is necessary
- [ ] Apply only a reviewed and version-recorded migration chain to **staging**, stop at first failure, prove catalog/RLS/Storage counts and object definitions; never switch to production implicitly
- [ ] Run hosted real-JWT tests for Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver and two mutually isolated Client users
- [ ] Verify unauthorized `anon` calls, money-blind reads/writes, Driver terminal-job scoping, client A/B isolation and Storage object authorization with PostgREST
- [ ] Test desktop/iPad/phone booking → packing → handover → return → billing, package the Electron security sign-in test, and record backup/restore drill
- [ ] Require a green exact-head main CI and explicit owner's production go/no-go approval

**Hard stop:** The currently empty staging schema cannot legitimately yield passing real-JWT application-RLS results. Do not report T1-05/T1-06 complete until the approved staging schema and test identities exist.

**Trackers:** [#56 release HOLD](https://github.com/babindulal7/babin-rentals-os/issues/56), [#66 security review](https://github.com/babindulal7/babin-rentals-os/issues/66), [T1 release plan](../plans/T1_RELEASE.md).

## Deeper migration ledger content audit (12 November 2026)

A follow-up read-only comparison generated Git-compatible blob hashes of SQL text retained in the production migration history and compared them with the current GitHub source. Of 148 same-named migrations, **40 are byte-identical, 76 differ in bytes and 32 have no retained SQL text to verify**. There are also 85 source-only names and 9 ledger-only names. Not all byte differences are semantic: `0002_bookings.sql` differs only by a trailing newline, while `0062` and `0099` need genuine code-effect review. See the [full content-hash analysis](MIGRATION_CONTENT_HASH_AUDIT_2026-11-12.md) and [242-row CSV evidence](MIGRATION_CONTENT_HASH_LEDGER_2026-11-12.csv). **No new apply authorization is implied.**

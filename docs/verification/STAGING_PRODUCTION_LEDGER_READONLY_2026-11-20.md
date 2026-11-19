# Production Ledger vs Source — Read-only Reconciliation (20 Nov 2026)

**Evidence date:** 20 November 2026, Nepal time  
**Source:** GitHub `main` commit `b6b08fc2ce77ef925812674d928b3add701a7c1e`  
**Production:** Existing Supabase production project `sxguwvgoserhdolewibb`  
**Staging:** Existing separate `babin-staging` `klhmsrunqrdxjudyhnkm`  
**Access:** SELECT-only: `version, name` from `supabase_migrations.schema_migrations`. No customer, authentication, finance or application data queried.

## Counts verified from live metadata and GitHub source

| Finding | Count |
| --- | ---: |
| Production migration-history entries | **157** |
| SQL files present in pinned main | **242** |
| Source filenames matching a production history `name` exactly (without `.sql`) | **148** |
| Source filenames with no exact-name history match | **94** |
| Production history names without exact source filename | **9** |

### Nine live-only migration names (do not delete or replay blindly)

- `archive_bakery_pos_schema`
- `0047_seed_tail_b917_equipment_line`
- `0056_auth_role_falls_back_to_auth_uid`
- `0056_auth_role_resolves_without_pre_request_hook`
- `0057_users_self_read_accepts_auth_uid`
- `0058_staff_row_for_babindulal7`
- `ruled_sequences_completion`
- `purchase_approval_owner_manager_only`
- `0076_seed_operational_stage_corpus`

### Important interpretation

**Exact-name matching is NOT migration-content or schema-object equivalence.** Older work has documented differing SQL bodies among some same-named migrations, renames and one-shot seeds. Conversely a source-only name does NOT prove the SQL is absent from production; it could have been installed under a renamed migration or equivalent manual SQL. This report is a read-only refreshed **name inventory**, not a deployment manifest.

The repository contains **both `0188_smart_reservation_holds.sql` and `0188_staff_renting_gear.sql`**. They need deliberate dependency ordering. `0012`, `0047`, and `0082` have seed/privacy risks. The P0 PR #242 must be reviewed and merged before `0241` is deployed to a new hosted environment.

### Next safe checks

1. Run `node scripts/verify-staging-source-hashes.mjs --json` at the exact source head for real **SHA-256** per file, ideally captured in CI.
2. Reconcile same-named but different SQL statements and all renamed objects. Record object/column/policy/function comparisons, migration transaction boundaries, existing seeds and rollback/restore requirements.
3. Produce a **separate approved apply manifest** with exact SQL SHA-256, explicit dependency order and approvals; stop on every unreviewed exception.
4. Obtain specific owner approval for reviewed **staging-only** writes on `klhmsrunqrdxjudyhnkm`; keep production and real customer records untouched.
5. Run hosted role, client A/B, storage and financial/lifecycle acceptance before any production deployment.

**Status:** Source comparison progress only. **No staging or production writes, schema changes, tax invoice issuance, seed application or release authorization.**

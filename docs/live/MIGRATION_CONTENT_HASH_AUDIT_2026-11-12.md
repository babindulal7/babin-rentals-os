# Content-hash reconciliation of source migrations vs. production history

**Read-only comparison date:** 12 November 2026  
**GitHub source:** [`main` `5ad9e22444d3`](https://github.com/babindulal7/babin-rentals-os/tree/5ad9e22444d35232086a1e82ff9ffe5858e81ad1)  
**Production project:** `sxguwvgoserhdolewibb`  
**Machine-readable manifest:** [`MIGRATION_CONTENT_HASH_LEDGER_2026-11-12.csv`](MIGRATION_CONTENT_HASH_LEDGER_2026-11-12.csv)  
**Status:** **EVIDENCE ONLY — NOT AN APPLY MANIFEST. RELEASE HOLD.**

## Counts

| Status | Count | Meaning |
| --- | ---: | --- |
| `EXACT_CONTENT_MATCH` | **40** | Source file content is byte-for-byte identical to the sole SQL statement retained for the same-named production migration |
| `NAME_MATCH_BYTES_DIFFER` | **76** | Name matches, but retained SQL bytes differ from current GitHub source; may be formatting, wrappers, comments, or substantive SQL changes |
| `NAME_MATCH_SQL_UNAVAILABLE` | **32** | Name exists in production, but no SQL statements are retained in the ledger; cannot compare by content |
| `SOURCE_ONLY` | **85** | GitHub file has no exactly matching recorded migration name; this does not prove it was never applied |
| `LEDGER_ONLY` | **9** | Production migration name has no corresponding GitHub filename |
| **Total reconciliation rows** | **242** | 233 GitHub SQL files + 9 ledger-only names |

**157 total production ledger rows:** 125 have one retained SQL text entry; 32 have no retained SQL. No verified Git-content-hash rename links were found for the 9 ledger-only rows. A nonmatching hash does not disprove a historical rename, because the file may also have been edited after application.

### Samples investigated

- `0001_enums.sql` and `0003_operations.sql` match their recorded SQL bytes exactly.
- `0002_bookings.sql` differs by **one trailing newline**; after end-of-file whitespace normalization, the SQL strings match.
- `0004_inventory.sql` differs in at least one blank/whitespace-only line; simple whitespace/comment normalization matches, but this is not an approved semantic-equivalence proof.
- `0062_law6_column_grants_arm_the_mask.sql` and `0099_create_booking_discount_audit_class.sql` have substantially different recorded and current SQL bodies; review their function/grant effects against live schema definitions before making any migration claim.
- `0225_owner_approved_glossary_revisions.sql` differs around explicit transaction delimiters and other bytes. Do not assume its differences are purely cosmetic without further comparison.

These examples are **diagnostic evidence**, not a classification of all 76 differences. In particular, never relabel a byte mismatch as `already_applied_identical` based on the filename or whitespace-unsafe heuristics.

## How hashes were obtained

The GitHub `contents/supabase/migrations` API returned each source file's **Git blob SHA-1**, which is calculated over `blob <byte-count>\0<file bytes>`.

On production, a **read-only** query extracted `name`, `version`, number of stored SQL statements and a Git-compatible blob hash of `statements[1]` for single-statement ledger rows:

```sql
select version, name, coalesce(cardinality(statements),0) as statement_count,
  case when cardinality(statements) = 1 then
    encode(extensions.digest(
      convert_to('blob ' || octet_length(statements[1])::text,'UTF8')
      || decode('00','hex')
      || convert_to(statements[1],'UTF8'),
      'sha1'), 'hex')
  else null end as stored_sql_git_blob_sha
from supabase_migrations.schema_migrations
order by name, version;
```

The computed hash was confirmed to match GitHub for `0001` and `0003`. Only migration *SQL source metadata* was processed; no business/client rows, passwords, access tokens, or other production data were extracted. Nothing was written to the database.

## Required actions before any staging installation

1. Reconcile **all 76 byte-different entries** into proven semantic equivalence vs genuine SQL drift (using SQL-aware diffs and actual hosted schema objects), prioritizing security/RLS/grant changes.
2. Investigate all 32 entries without retained SQL through current schema, historical Git commits, audit records and dated backups.
3. Resolve the 9 ledger-only names, 85 source-only names, `0047` one-shot seed and duplicate `0188` prefix; never mark possible renames as confirmed without evidence.
4. Produce an immutable, checksum-verified **staging-only** apply order and test it on a synthetic-data database; the existing staging project has no Babin application schema.
5. Complete hosted JWT/PostgREST nine-role permissions, Client A/B isolation, Storage and real device validation. Require a green exact-main-head CI and owner-approved backup/restore evidence before any production migration.

Do not use `supabase migration repair`, `supabase db push`, or remote reset on production from this CSV. See [hosted staging rehearsal](STAGING_HOSTED_REHEARSAL_2026-11-12.md), [filename reconciliation](STAGING_RECONCILIATION_2026-11-12.md), and [release HOLD #56](https://github.com/babindulal7/babin-rentals-os/issues/56).

## Follow-up lexical triage (12 November 2026)

All **76 same-name byte-mismatched migrations** were compared using SQL-aware lexical normalization of source and retained ledger SQL. **6** differ only in trailing whitespace; **25** have equal SQL token sequences after whitespace/comments are stripped; **23** also differ by an outer transaction wrapper; **22** remain for manual review. **This is a triage heuristic, not semantically-verified applied SQL**. See [the 76-row classification and 22-case review queue](MIGRATION_LEXICAL_TRIAGE_2026-11-12.md) and [CSV](MIGRATION_LEXICAL_TRIAGE_2026-11-12.csv).

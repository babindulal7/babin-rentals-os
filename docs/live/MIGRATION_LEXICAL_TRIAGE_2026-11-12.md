# Read-only lexical SQL triage — 76 production migration hash differences

**Date:** 12 November 2026 · **Source commit:** `6689c5058fddcfb4f6bcafe729358c97440835c9`  
**Production project:** `sxguwvgoserhdolewibb` · **No schema or business-data writes.**  
**Machine-readable 76-row manifest:** [MIGRATION_LEXICAL_TRIAGE_2026-11-12.csv](MIGRATION_LEXICAL_TRIAGE_2026-11-12.csv)  
**Baseline audit:** [242-row hash reconciliation](MIGRATION_CONTENT_HASH_AUDIT_2026-11-12.md)

**This is a read-only TRIAGE, not migration-applied equivalence, a runnable staging manifest, or release approval.**

## Results

| Conservative lexical class | Entries | Interpretation |
| --- | ---: | --- |
| `EOL_OR_TRAILING_WHITESPACE` | **6** | Recorded SQL and file match after trailing whitespace normalization |
| `LEXICAL_TOKENS_EQUAL` | **25** | Token sequences match after removing whitespace and SQL comments, including inside dollar-quoted PL/pgSQL |
| `LEXICAL_TOKENS_EQUAL_OUTER_TX_DIFF` | **23** | Also required ignoring a top-level `BEGIN;`/`COMMIT;` wrapper, which can still change execution behavior |
| `TOKEN_DIFFERENCE_REVIEW` | **22** | Statements or code/metadata/test tokens differ; require manual review |
| **Total existing filename-matched but byte-different** | **76** | All cases from original hash audit |

**54 of the 76** compare equal under this *conservative lexical normalization*; they are **not** certified semantically identical on a live DB. The comparison tokenizes SQL, quotes and dollar-quoted bodies, removes whitespace and SQL comments, folds unquoted identifiers to lowercase, and optionally excludes outer transaction wrappers. It is **not** a full PostgreSQL parser: E-strings, comments and transaction scope can matter, and later migrations can replace previously deployed functions. Do not mark any row `ALREADY_APPLIED_IDENTICAL` without reviewing effective object definitions and history.

## Prioritized 22 cases requiring review

| Ledger / source migration | Priority | First observed difference / action |
| --- | --- | --- |
| `0010_triggers_functions` | P1 | Recorded audit trigger uses direct NEW column; current deployed log_audit_event function inspected read-only and uses JSON-safe column access |
| `0048_view_row_predicates` | P0 | vehicle_fuel_logs view predicate differs: role allowlist vs auth_is_staff; verify effective access |
| `0057_damage_approval_rank` | P2 | Different tokens; inspect historical and current effective SQL |
| `0058_late_fee_rank_and_approver_is_actor` | P0 | Function set/definition differs, inspect late-fee approval authority |
| `0076_booking_line_units_release` | P1 | Different tokens; inspect historical and current effective SQL |
| `0089_next_document_number_never_truncates` | P1 | Different tokens; inspect historical and current effective SQL |
| `0094_stage_is_written_only_by_its_transition` | P2 | DO test fixture changes Customer Pickup to Babin Delivery |
| `0096_create_invoice_rpc` | P1 | DO test setup adds set_config(app.in_create_booking) guard; verify effect |
| `0099_create_booking_discount_audit_class` | P2 | Main create_booking function tokens match; later DO test fixture changes Customer Pickup to Babin Delivery |
| `0100_reservations_written_by_transition` | P2 | DO test fixture changes Customer Pickup to Babin Delivery |
| `0103_preventive_maintenance` | P1 | Different tokens; inspect historical and current effective SQL |
| `0104_reservation_conflicts_are_recorded` | P1 | Different tokens; inspect historical and current effective SQL |
| `0112_partial_return_missing_case` | P1 | Different tokens; inspect historical and current effective SQL |
| `0113_law17_delivery_type_client_pickup` | P1 | Different tokens; inspect historical and current effective SQL |
| `0114_unit_status_engine` | P0 | Expanded DO verification of unit status; check effective status logic |
| `0115_stage_gates` | P0 | New COMMENT ON/statement changes near stage-gate DDL; inspect effective guard |
| `0116_close_gate` | P0 | Extra DO statement in source; inspect close-gate checks |
| `0117_invoice_void_discipline` | P2 | Source adds COMMENT ON FUNCTION before INSERT; database metadata statement differs |
| `0121_void_invoice_rpc` | P2 | Source adds COMMENT ON FUNCTION; database metadata statement differs |
| `0122_inspection_operation_session` | P1 | Different tokens; inspect historical and current effective SQL |
| `0123_categorize_equipment_inventory` | P0 | Source and recorded migration have different asset-code lists; never replay on real inventory |
| `0124_reservations_follow_booking_dates` | P2 | Function/comment description changed; inspect before classifying |

**Particularly important examples:**
- `0010_triggers_functions`: historical migration changes audit actor capture. Read-only `pg_get_functiondef` confirms the **currently deployed** `log_audit_event` function uses the safer `to_jsonb(NEW)` column checks already present in source; this does **not** prove all of `0010` semantically equivalent.
- `0048_view_row_predicates`: view predicate changes from an explicit role list to `auth_is_staff()`; inspect actual role access with hosted JWT tests before granting broader visibility.
- `0058_late_fee_rank_and_approver_is_actor`: function name/definition changes between recorded and source statements. Check current late-fee authority and corresponding RPC tests.
- `0096_create_invoice_rpc`: DO test setup adds `set_config('app.in_create_booking','on',true)`; do not interpret this as confirmed current invoice-RPC behavior without further inspection.
- `0099_create_booking_discount_audit_class`: the recorded and current **main create_booking function token sequences match**; the later DO test fixture changes `Customer Pickup` to `Babin Delivery`. This remains in the review bucket because a test fixture SQL literal differs.
- `0114_unit_status_engine`: verification DO block expands status assertions; compare effective trigger/function definitions.
- `0123_categorize_equipment_inventory`: asset-code list differences can cause data mutations. **Never replay against production inventory.**

## Remaining blockers not covered by these 76 rows

The full source/production ledger has **40 byte-identical same-name migrations, 32 same-name migrations without retained SQL, 85 source-only files and 9 production-only ledger names**. These remain separate work; the `0047` one-shot seed, duplicate `0188`, historical rename candidates, and source/production schema drift remain unresolved.

The existing staging project `klhmsrunqrdxjudyhnkm` is still empty following rollback-only tests of migrations `0001`–`0003`. A green source CI check does not confer permission to install the 233-file chain. Do not auto-run `supabase db push` or `migration repair`, or restore real customer data.

## Next verified actions (no live writes)

1. Compare current effective `pg_get_functiondef`, `pg_get_viewdef`, policies and grants for P0 changes (0048, 0058, 0114–0116, 0123); distinguish a historical source edit from a current production gap.
2. Resolve P1 financial/RLS and transactional checks. Manually inspect P2 test-fixture/comment changes.
3. Reconcile 32 no-SQL entries and nine ledger-only names from source history, then classify the 85 source-only rows with dependency-aware, content-hash evidence.
4. Get owner approval for a **synthetic-only**, checksum- and dependency-verified staging installation with recovery evidence. Execute it only in the separate staging project; verify real-JWT RLS and Storage. Production release **HOLD**.

**Read-only evidence:** connected GitHub `fetch_file` for all 76 SQL files plus connected production `supabase_migrations.schema_migrations.statements[1]` SQL SELECTs. No business rows, role secrets, or credential values accessed.

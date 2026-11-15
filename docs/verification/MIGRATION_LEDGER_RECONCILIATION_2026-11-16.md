# Migration Ledger Reconciliation Report (T1-03)

**Date:** 2026-11-16 (Asia/Kathmandu)  
**Tool:** `scripts/plan-migrations.mjs`  
**Target Ledger:** `docs/plans/MIGRATION_LEDGER.md`  
**Source Baseline:** `3658f2faf91001d3f76e48bc21a51c803db83051` (`origin/main`)  
**Current Next Free Number:** `0240`  

---

## 1. Executive Summary

- **Local Migrations:** 235 SQL files in `supabase/migrations/` (from `0001` through `0237`).
- **Live Schema Migrations:** 156 applied rows recorded in production snapshot (`docs/live/schema_migrations_2026-10-17.txt`).
- **Exact Name Matches:** 147 migrations directly matched between repository and live database.
- **Renamed Invariant Migrations:** 7 historical migrations verified.
- **Live-Only / External Records:** 2 rows (`archive_bakery_pos_schema`, `0047_seed_tail_b917_equipment_line`).
- **Pending Migrations (Post-0164):** 81 numbered migrations (from `0165` through `0237_planned_equipment_downtime.sql`).

---

## 2. Allocation Verification: 0232–0236 & Active Claims

We verified that the ledger does **not** reuse or collide on any numbers around 0232–0236:

| Number | Card | File on Disk | Assigned Lane / Branch | Status |
|---|---|---|---|---|
| `0232` | T4-security | `0232_secure_temporary_hold_rpcs.sql` | `repair/pr-55-hold-auth` | Verified (PR #133 merged) |
| `0233` | T3-security | `0233_extend_booking_and_resync_auth.sql` | `repair/pr-53-invoice-extension-auth` | Verified (PR #135 merged) |
| `0234` | T2-18 | `0234_return_damage_photo_per_unit.sql` | `lane-a/T2-18-finish-evidence-capture-what-t2-16` | Verified (PR #80 merged) |
| `0235` | T4-09-sec | `0235_delivery_route_branch_hardening.sql`| `fix/t4-09-route-branch-hardening-0209` | Verified |
| `0236` | T3-07 | `0236_opening_balances_append_only.sql` | `lane-c/T3-07-opening-balances` | Written / Merged |
| `0237` | T2-21 | `0237_planned_equipment_downtime.sql` | `lane-a/T2-21-planned-downtime-with-a-reason` | Verified (PR #170 merged) |
| `0238` | T3-28 | *(Claimed in Ledger)* | `lane-c/T3-28-rental-day-start-as-a-setting` | Verified in PR review |
| `0239` | T3-30 | *(Claimed in Ledger)* | `lane-c/T3-30-consumables-unit-price-add-at-the`| Verified in PR review |
| **`0240`** | — | **NEXT FREE NUMBER** | Unclaimed | Available |

*Result:* Zero collisions, zero duplicate allocations, zero number reuse.

---

## 3. The 7 Renamed Migrations (Disposition Log)

`schema_migrations` keys strictly on `name`. The following 7 local files are confirmed identical to existing live migrations that ran under earlier names or without prefixes:

| Local Repo File | Live `schema_migrations` Name | Disposition & Resolution |
|---|---|---|
| `0056_0_auth_role_falls_back_to_auth_uid.sql` | `0056_auth_role_falls_back_to_auth_uid` | **Same migration.** Renamed locally to resolve duplicate `0056` prefix. Skip on live via `--accept-rename`. |
| `0059_users_self_read_accepts_auth_uid.sql` | `0057_users_self_read_accepts_auth_uid` | **Same migration.** Live ran as `0057` during early manual bootstrap. Skip on live. |
| `0060_staff_row_for_the_current_owner_identity.sql`| `0058_staff_row_for_babindulal7` | **Same migration.** Username generalized for repository portability. Skip on live. |
| `0069_purchase_approval_owner_manager_only.sql` | `purchase_approval_owner_manager_only` | **Same migration.** Live applied without numeric prefix. Skip on live. |
| `0073_auth_role_resolves_without_pre_request_hook.sql`| `0056_auth_role_resolves_without_pre_request_hook`| **Same migration.** Live ran with legacy `0056` prefix. Skip on live. |
| `0081_ruled_sequences_completion.sql` | `ruled_sequences_completion` | **Same migration.** Live applied without numeric prefix. Skip on live. |
| `0082_seed_operational_stage_corpus.sql` | `0076_seed_operational_stage_corpus` | **Same migration.** Renumbered during local corpus stabilization. Skip on live. |

---

## 4. Unexplained Live Rows & Special Hazards

1. **`archive_bakery_pos_schema` (version `20260809220713`):**  
   Part of historical Miraz POS development sharing the PostgreSQL instance. Does not touch or collide with `public` rental tables. Preserved without modification.
2. **`0047_seed_reference_corpus.sql` (One-Shot Seed Hazard):**  
   Live spent `0047` on `0047_seed_tail_b917_equipment_line`. The local file `0047_seed_reference_corpus.sql` is a local testing seed whose header states: *"Re-applying is NOT a no-op — it is a one-shot seed that FAILS CLOSED"*. **It must NEVER be applied to production or a production-derived database.**
3. **Duplicate Prefix `0188`:**  
   `0188_smart_reservation_holds.sql` and `0188_staff_renting_gear.sql` both exist as verified files. Preserved as a documented permanent legacy exception; ordered lexically by filename.
4. **Missing Prefixes in Sequence:**  
   `83`, `84`, and `175` are intentionally absent in the local numbering sequence (`0175` intentionally skipped per ledger rule 5).

---

## 5. Read-Only SQL Inspection Query (Owner / Read-Only Execution)

To refresh live ledger snapshot without applying any changes:

```sql
-- Run in Supabase SQL Editor (Read-Only)
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Paste results into `docs/live/schema_migrations_<YYYY-MM-DD>.txt`.

---

## 6. Execution Command for Staging (Rule N-5)

When applying pending migrations to **staging** (`babin-staging`):
```bash
node scripts/plan-migrations.mjs --accept-rename
```
This accepts the 7 verified renames and outputs the transaction-isolated migration sequence starting at `0165`.

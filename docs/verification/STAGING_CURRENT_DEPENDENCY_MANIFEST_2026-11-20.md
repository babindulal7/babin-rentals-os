# Babin Rentals OS — Staging Current Dependency Manifest (20 Nov 2026)

**Original audit baseline SHA:** `b555f7d63b6300e3466e6419bddce312357c7a78` (refresh this manifest against exact execution SHA)  
**Staging target project ID:** `klhmsrunqrdxjudyhnkm` (`babin-staging`, Singapore, PostgreSQL 17.11)  
**Production project ID:** `sxguwvgoserhdolewibb` (**STRICTLY EXCLUDED / READ ONLY**)  
**Original baseline SQL migration inventory:** **242 files** (not asserted to be current; regenerate on latest target SHA)  
**Original baseline migration bytes:** **4,969,099 bytes** (revalidate)  
**Status:** **MANUALLY REVIEWED PROPOSAL — NOT AN EXECUTABLE INSTALL MANIFEST YET**

> **IMPORTANT WARNING:** This document outlines the proposed dependency ordering and hazard treatments for a future staging installation on project `klhmsrunqrdxjudyhnkm`. It does NOT authorize database execution or modification. Remote staging execution requires explicit Owner sign-off on the approval gate document.

---

## 1. Critical Migration Hazards and Mandated Treatments

| Migration File | Size (Bytes) | Category / Concern | Mandated Treatment |
|---|---|---|---|
| `0012_seed_data.sql` | 13,878 | Contains static branch info, seeded contact emails, phone numbers, and initial business data. | **DO NOT APPLY ORIGINAL.** Substitute with synthetic fixtures generated via `scripts/create-synthetic-staging-0012.mjs` using `example.invalid` domains and mock PANs (`3fd285f4...`). |
| `0047_seed_reference_corpus.sql` | 1,873,454 | Large generated equipment reference corpus (~1.87 MB). | **QUARANTINE ORIGINAL.** Do not replay blindly. Minimal synthetic equipment fixtures will be seeded via staging test runners. |
| `0082_seed_operational_stage_corpus.sql` | 16,912 | Historical dated booking/backfill corpus (corresponds to live `0076`). | **QUARANTINE ORIGINAL.** Do not replay dated bookings. Dynamic lifecycle synthetic fixtures will be injected during Batch 2/3 tests. |
| `0013_business_8_roles.sql` | 8,924 | Adds new enum values to `system_role` enum. | **TRANSACTION BOUNDARY:** Must be committed in its own transaction before `0014` executes. |
| `0014_business_8_policies.sql` | 14,210 | Defines RLS policies referencing the new enum values added in `0013`. | **CROSS-TRANSACTION ENUM DEPENDENCY:** Cannot run in the same transaction as `0013`. Requires separate transaction after `0013` COMMIT. |
| `0188_smart_reservation_holds.sql` | 31,420 | Duplicate prefix `0188`. Adds reservation hold state and GiST exclusion locks. | **ORDER DEPENDENCY 1:** Apply first among `0188` prefix files. Enforces stock reservation isolation. |
| `0188_staff_renting_gear.sql` | 24,115 | Duplicate prefix `0188`. Adds staff rental attributes and discount enums. | **ORDER DEPENDENCY 2:** Apply second among `0188` prefix files. Depends on existing client and rental structure. Neither file is renamed. |
| `0163_close_six_anon_business_rpcs.sql` | 12,850 | Revokes anonymous execution on six sensitive public functions. | **ANON PRIVILEGE AUDIT:** Confirms revocation of anon EXECUTE on `adjust_stock`, `portal_claim_by_verified_email`, `read_quote_editor`, `set_staff_active`, `set_staff_role`, `update_rental_quote`. |
| `0241_extension_clash_manager_decision_and_at_risk.sql` | 24,724 | Coordinator monetary resolution block in `resolve_booking_at_risk` (from PR #242). | **P0 SECURITY ENFORCEMENT:** Enforces that Coordinator cannot issue credit or refund during clash resolution. Requires hosted JWT negative verification. |
| `staff_directory_v` | N/A | View joins `auth.users` with staff metadata. | **LEAST-PRIVILEGE VIEW AUDIT:** Staging tests must verify that no unauthorized user metadata leaks to non-privileged roles. |

---

## 2. Structural Migration Categories and Counts

Across the 242 migration files:
- **Core Schema DDL (Tables, Extensions, Constraints):** 118 files
- **Security Definer RPCs & Business Functions:** 54 files
- **Row Level Security (RLS) & Grant Policies:** 42 files
- **Enum Definitions & Alterations:** 12 files
- **Seed / Corpus Scripts (Quarantined/Replaced):** 3 files (`0012`, `0047`, `0082`)
- **System Tuning, Indexes & Fixes:** 13 files

---

## 3. Dependency-Aware Plan — REVIEW ONLY, not executable

1. **Freeze the immutable execution SHA first.** Generate and review an exact-file manifest (filename, checksum, operation, dependency, transaction boundary, expected row count). The original 242-file audit predates later merges and is not the current executable inventory.
2. **Before migration 0013:** apply all needed schema migrations through 0011, **do not run original `0012_seed_data.sql`**, and use only reviewed synthetic replacement 0012 at its dependency-correct point. The replacement must be compatible with both preceding schema and later migrations. Do not refer to synthetic injection as "Phase 2" after completing 0013 if its dependencies require earlier placement.
3. **Enum boundary:** complete and commit `0013_business_8_roles.sql` before beginning `0014_business_8_policies.sql` in a new transaction. Verify the migration runner actually creates this boundary; never treat it as an implied single transaction.
4. **Exclude original `0047` and `0082`:** record both explicitly as quarantined in the generated manifest. Review all later dependencies on their reference records and substitute synthetic minimums where needed; fail closed on missing dependencies.
5. **Duplicate 0188 prefix:** verify actual filenames and explicit execution order `0188_smart_reservation_holds.sql` then `0188_staff_renting_gear.sql`. Check how the migration runner records version identifiers to prevent collision; do not execute if duplicate-version bookkeeping is ambiguous.
6. **Continue through the latest current-head migration, not fixed `0244`.** The later 0253 partner-stock migration and other recent additions require refresh. Record per-file transaction/rollback characteristics.
7. **Privileged changes:** require hosted negative assertions for anonymous RPC execute rights, the `staff_directory_v` view and Coordinator monetary clash actions before release acceptance.

**HARD STOP:** This is an audit outline, **not authorization to execute** against staging or production. No remote changes until current SHA is frozen, manifest and recovery drill reviewed, and explicit owner approval is recorded.

---

## 4. Rollback and Recovery Rules

1. **Transactional Failures:** Rollback applies only to operations actually enclosed by the failed transaction; committed earlier phases do not roll back automatically.
2. **Catalog Drift Inspection:** Before proceeding past Phase 1 and Phase 4, `information_schema` and `pg_enum` are checked to confirm expected types and tables exist.
3. **No Reset against Production:** Never run `supabase db reset --linked` or `supabase db push` as a substitute for a reviewed staging-only plan; prohibit all production mutation. Destructive staging resets require separate reviewed restore procedure and explicit approval.

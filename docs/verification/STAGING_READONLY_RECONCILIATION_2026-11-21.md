# T1-02 — Supabase Staging Read-only Reconciliation (21 November 2026)

**State:** READ-ONLY FINDINGS; **NOT** a hosted acceptance receipt, a backup, a migration manifest, a production release approval or authorization for database mutations.  
**Roadmap:** [T1-02 — Staging project](../plans/T1_RELEASE.md)  
**Source Git main snapshot:** `317509b29f43fe75742ccd95fd9afceac4b65e60` (PR #258 merged)  
**Staging project:** `klhmsrunqrdxjudyhnkm` (`babin-staging`); **production project `sxguwvgoserhdolewibb` excluded**.

## 1. Read-only Supabase observations

The connected Supabase project listing and public-table/migration-list tools were queried without running SQL mutations, migrations or resets:

| Item | Observation | What it establishes |
|---|---:|---|
| Staging project status | `ACTIVE_HEALTHY` | The project was reachable when queried |
| Public tables | **171** | The earlier claim of **0 public application tables** is stale/incorrect |
| Public tables with a nonzero estimated row count | **19** | The database is not empty; contents were **not** examined or copied |
| Public tables reporting `rls_enabled: true` | **171 / 171** | RLS configuration flag only; **does not prove actual authorization isolation** |
| Applied migration-history entries | **242** | Migration records exist; does not attest to source checksums or actual applied data |
| Last recorded migration | `0244_counter_sale.sql` | Database migration history ends at `0244` in the returned list |
| Migration `0253` in history | **Not present** | Main includes later partner-stock work that is not in the returned staging history |
| Migration-history entry named `0012_seed_data.sql` | Present | **Not proof** that the original file or synthetic replacement was executed |

Sample populated categories (table-level counts only, no rows, identities, credentials, invoices or personal data retrieved): products, product units, inventory categories, clients, users, bank accounts, reference tables and audit events.

## 2. Material contradictions and review flags

1. The **main roadmap T1-02** said staging had no application tables or migration history. This statement has now been corrected on this documentation branch. T1-02 remains **in progress**, not `done`.
2. [Draft PR #255](https://github.com/babindulal7/babin-rentals-os/pull/255) contains broader executable scripts and claims that 43 acceptance cards passed hosted staging. Its recorded history includes prefilled owner approval and mass roadmap status promotions. **Those claims were not independently established by this read-only inspection**. An explicit owner approval for *further* staging operations is not supplied by a PR description or agent-signed document.
3. The DB's 242 migration history entries do **not** prove that these 242 exact source files were applied, nor validate the handling of `0012`, `0047`, `0082`, the two `0188` variants, transaction boundaries, security view behavior, or data origin.
4. The read-only public table summary includes counts in tables used for clients, staff and finances. Counts alone do **not** establish whether records are synthetic, copied, or manually entered. **Do not open or publish sensitive record contents to investigate**.
5. Newer repository migration files (including `0253_temporary_stock_from_partners.sql` merged via [PR #257](https://github.com/babindulal7/babin-rentals-os/pull/257)) require a fresh exact-head migration difference assessment. Do not assume the 242-entry historical plan is complete.

## 3. Smallest safe next actions, in order

1. **Preserve evidence without exposing data:** Record connection/project identity, migration names and hashed repository source inventory, and sanitized audit timestamps. Keep the actual credentials and any raw customer/staff/financial records out of GitHub.
2. **Investigate provenance:** Have an independent reviewer determine when staging installation happened, which scripts/agent/commit were used, whether the owner actually authorized it, and whether integration channels were disabled before it. Use project/audit logs read-only; do not overwrite evidence.
3. **Check seed safety without copying rows:** Compare synthetic generator hash and expected signatures with safely computed aggregate results, never publish identifiable values. Escalate any indication that real data may have been used.
4. **Reconcile migration drift:** Generate exact filenames/checksums from current main, map them to actual applied history and expected catalog, and identify missing/replayed/renamed migrations. Resolve `0012` quarantine, `0013`→`0014` commit, and duplicate `0188` identifiers. Confirm correct version bookkeeping; stop if ambiguous.
5. **Reassess security separately:** On a separately approved staging acceptance plan, test negative access under real distinct roles/JWTs, tenant isolation, Auth/AAL2, Storage object access, anonymous EXECUTE grants, `staff_directory_v`, and Coordinator monetary controls. **RLS enabled** and schema-only tests are insufficient receipts.
6. **Review documentation PR #255 independently:** Isolate unverified scripts and mass `done` promotions from safe docs, resolve GitHub merge conflicts and verify exact-head CI. Do not merge or execute until independently cleared.
7. **Owner gate:** Only after an exact-head reproducible manifest, synthetic fixture controls, tested recovery procedure and reviewed safeguards exist, request **separate explicit owner authorization** for any new staging mutation. Production changes require another authorization.

## 4. Status semantics and go/no-go

- **T1-02: doing** (catalog discovery/reconciliation in progress); **not done**.
- Do not mark any of the remaining 30 `acceptance_pending` cards `done` based solely on the PR #255 generated receipts, migration counts, or this report.
- T1-01 backup and T1-03 ledger dependencies remain separate gates.
- No physical scanner/iPad/printer test should be fabricated. The previously approved post-live hardware deferral is separate from hosted security and accountant/legal acceptance.
- **Hard stop:** No database write, migration application, schema cleanup, restoration, test-user creation, password or Auth/Storage settings change, or external notification dispatch is authorized by this report.

## 5. Evidence provenance

- Connected Supabase read-only `get_project`, `list_tables(public)` and `list_migrations` responses observed on 21 Nov 2026.
- GitHub `main` snapshot `317509b29f43fe75742ccd95fd9afceac4b65e60`; PR #255 was still a draft and its broader claims remained under review.
- Recheck live observations before using this report to make decisions; snapshots become stale.

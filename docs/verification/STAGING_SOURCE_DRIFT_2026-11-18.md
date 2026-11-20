# Staging migration source drift — 18 November 2026

**Scope:** GitHub repository source metadata only; **no staging/production database queried**, no SQL run, no service/setting deployed.
**Pinned main:** `68c190842688da42536f224e3dfa6de5a36cc279`. **Previous source snapshot:** `4ba3cde372b5a690468aff370572a9e8500c9685`.

## Important later update (20 November 2026)
This is a **dated 18 November snapshot**, NOT a current baseline: the source inventory has changed since 240 migrations and must be re-pinned with independent review before staging installation. The read-only preflight deliberately returns `BLOCKED_SOURCE_DRIFT` on mismatches; a historical baseline is not safe to deploy.

PR #225 was merged to `main` and hardens the **source** RLS/ACL of pending migration 0241. This resolves the source defect described later in this dated report, but does **not** prove 0241 is deployed or authorize a hosted apply. Recheck the exact current main commit, latest grants, external/client JWT negatives, migrations and backup/rollback evidence separately.

## Source findings

- **240** migration SQL files, versus **237** on 17 Nov.
- **3 added files**, each explicitly marked `NEW_MIGRATION_REVIEW_REQUIRED`:
  - `0238_rental_day_start_setting.sql`
  - `0241_extension_clash_manager_decision_and_at_risk.sql`
  - `0242_return_damage_signature_and_refusal.sql`
- **1 modified file**, marked `SOURCE_CONTENT_CHANGED_REVIEW_REQUIRED`: `0239_consumables_pricing_restock_and_low_stock.sql`. Previous Git blob `c9c987542adf578f7e5e854da2247493da778e9c` (49576 bytes), new Git blob `f0e3c25b9b11d67280c40e16ddc05629a52ce79b` (50940 bytes).
- **0 removed filenames.** Duplicate `0188` migration-number prefix still requires explicit execution ordering. `0012`, `0047`, and `0082` remain **seed/privacy review gates**.

GitHub source blob SHA-1 and file size are byte-identity fingerprints, **not** a SQL dependency or RLS proof. The local preflight emits a composite SHA-256 fingerprint but never authorizes a database apply.

## Production comparison is HISTORICAL ONLY

17 Nov read-only migration ledger: 157 recorded names; 148 matched then-current filenames, 89 source-only, 9 production-only. Comparing the 240 filenames against those **same historical classifications** gives 148 old matches, 92 source-only, 9 live-only. This is **not a new production query**. The manifest sets `current_live_ledger_rechecked:false`; source/live SQL content equivalence was **not** verified.

## Existing hosted rehearsal boundary

The original PR reported rollback-only staging tests for migrations `0001`–`0013` with a temporarily anonymized `0012` fixture. No durable staging schema was installed. `0014` relies on `0013` enum values and requires a separate committed transaction; the earlier rollback does not prove the full chain. Do not replay original seed data or force the complete migration sequence into one transaction.

## Additional static RLS finding — review required before staging apply

At pinned main migration `0241_extension_clash_manager_decision_and_at_risk.sql`, the policies `extension_clash_decisions_select` and `booking_at_risk_select` are both `FOR SELECT TO authenticated USING (true)`. The tables contain booking UUIDs, booking numbers, conflicting booking references and operational resolution information. **No staff-role or booking-ownership restriction appears in those two policies.** If `authenticated` has table SELECT privileges via current or default grants, an authenticated Client may be able to read other clients' records through the Data API. This is a **potential cross-client authorization weakness**, not a confirmed exploit; effective privileges and deployed migration status have not been queried.

**Before approving migration 0241:** verify current/default table grants, client-role JWT behavior, the interaction of permissive RLS policies, and explicit Client A/Client B negative tests. Restrict the policy surface to authorized staff or appropriately scoped booking owners as the reviewed permissions model requires. Do not assume lack of a local explicit `GRANT` means the table is inaccessible. Do not fix this by disabling RLS or adding unrestricted `SECURITY DEFINER` routes. Keep the staging apply blocked until an independent security correction/verification is recorded.

## Hard remaining acceptance gates

1. Run on both independent machines: `node scripts/staging-schema-preflight.mjs`, `node scripts/create-synthetic-staging-0012.mjs` **without `--write`**, and `npm run gates` against the pinned commit; record actual exit codes.
2. Review the **3 new and 1 modified SQL** files for dependency order, grants, RLS, `SECURITY DEFINER`, client/staff scope and booking conflicts. All are pending, **not approved**.
3. Build an exact SQL SHA-256 apply manifest with ordered exclusions, transaction boundaries, and a rollback/recovery drill; independently validate fresh protected-production backup and restore evidence (no production writes).
4. Before any durable remote staging operation, get explicit approval, confirm the exact existing Free staging project and disabled outbound email/SMS/payments/webhooks. Never provision paid resources or import real PII without separate authority.
5. After approved staging setup, run nine-role PostgREST/JWT, client A/B isolation and Storage signed-URL RLS tests. These have **not** been completed.

**Disposition:** PR #179 remains DRAFT. T1-02/T1-05/T1-06 remain acceptance-blocked; CI passing a source-only fixture is not a launch/deployment clearance.

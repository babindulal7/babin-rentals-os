# Synthetic staging seed + first 13 hosted SQL files — verification

**Checked:** 17 November 2026 (NPT)
**Source commit:** `1e87dd1d3d74bf74520401b0b192cee2a2ccaae6`
**Target project:** Existing Free `babin-staging` (`klhmsrunqrdxjudyhnkm`)
**Protected:** Production `sxguwvgoserhdolewibb` (not an execution target)
**Result:** Rollback-only hosted execution PASS for files `0001`–`0013`, with **temporary synthetic value substitutions in `0012`**.

## What was actually verified

1. Re-fetched the 13 source SQL files (starting `0001_enums.sql`, ending `0013_business_8_roles.sql`) on the same exact Git commit.
2. For the temporary `0012` SQL only, replaced 20 exact original contact, staff identity, PAN and bank/wallet tokens with non-deliverable fixture strings. The map resulted in 21 literal substitutions and **six `@example.invalid` email addresses**. Known original company-domain, phone and bank/PAN strings did not remain.
3. Removed each source file's top-level transaction wrappers only in the temporary SQL string. Ran the source sequence on **hosted staging** inside an enclosing `BEGIN;` / `ROLLBACK;` transaction, with session-local lock and statement timeouts. Supabase SQL execution returned successfully, without any permanent apply.
4. Re-ran a separate read-only catalog query afterward: **0 application tables, 0 Auth users, 0 Storage buckets**. A prior 0001–0011 test independently confirmed zero public enums and migration entries after rollback.
5. Added `scripts/create-synthetic-staging-0012.mjs` to generate the same deterministic fixture **locally only**, requiring a pinned Git blob SHA/byte count. The script has **no SQL executor or Supabase client**, and default invocation is read-only. The optional `--write` writes to git-ignored `.localdb/staging-fixtures/0012_seed_data.synthetic.sql` using exclusive create (`wx`), never to the tracked migration directory.

**Test scope qualification:** The in-memory transformation logic and hosted SQL compatibility were exercised in this session. The checked-in Node script's end-to-end local invocation with the full repository is still pending Windows/Mac agent execution; do not call it CI-verified yet.

## Original 0012 seed: nine table sections

`number_sequences`, `branches`, `warehouses`, `storage_zones`, `users`, `fiscal_periods`, `bank_accounts`, `expense_categories`, `inventory_categories`. Existing IDs and foreign keys were preserved in the temporary fixture; externally deliverable identity values were replaced.

The placeholder values do not, on their own, prove that staged outbound communication, payment, storage and Auth access are safe. Before durable staging installation, verify external integrations are disabled. Do **not** create a publicly accessible staging application.

## Critical compatibility boundary at 0014

`0013_business_8_roles.sql` renames three values of the `system_role` enum and adds **Technician** and **Driver** via `ALTER TYPE ... ADD VALUE`.

`0014_business_8_policies.sql` uses these new enum values and explicitly states it must run in a **separate transaction after 0013 commits**. Thus the entire 0001–0014 sequence **must not** be forced into a single rollback-only SQL transaction to simulate a real install. This 13-file passing rehearsal does **not** verify 0014. Use a disposable local scratch database or independently reviewed staged migration sequence with real per-file transaction boundaries to validate it. Avoid promoting partial staging state while a backup/rollback and complete dependency plan are unresolved.

## Unchanged blockers for permanent staging acceptance

- Source has **237 SQL files**; the live ledger has 157 entries, with renamed migrations and a duplicate 0188 prefix.
- `0047` and `0082` are one-time/backfill corpus migrations requiring explicit staging decisions.
- Complete source/dependency classification and recovery plan still pending.
- Fresh verified T1-01 backup and tested T1-02 restoration evidence are absent.
- Real staging Auth identities, all nine-role money-blind RLS tests and signed Storage URL isolation remain pending.
- GitHub draft PR #179 remains **not approved to merge or apply**; CI must pass on its latest head before considering merge readiness.

## Next smallest safe execution

**Windows Antigravity:** run `node scripts/staging-schema-preflight.mjs`, `node scripts/create-synthetic-staging-0012.mjs`, `npm run gates`; attach checksums and results to PR #179; test `0013` and `0014` in **separate committed transactions inside an isolated local scratch DB** to prove the enum barrier, then complete source order/seed manifest and backup readiness.

**Mac Antigravity:** independently inspect those exact-head results, confirm script output is git-ignored and no real identities survive, and check the role RLS/signed-URL acceptance plan before any hosted permanent install.

**Production:** No writes, deployment, config, or credentials changed. **Staging:** No permanent tables, roles, buckets or migration entries were created by this verification.

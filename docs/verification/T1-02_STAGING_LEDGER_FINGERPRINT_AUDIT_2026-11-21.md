# T1-02 — Staging Migration Ledger Fingerprint Audit (21 November 2026)

**Status:** AUDIT COMPLETE — READ-ONLY. NOT an acceptance receipt, apply manifest, or owner approval.  
**Branch:** `audit/windows-t1-02-ledger-fingerprints-20261121`  
**Current `origin/main` SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`  
**Comparison baseline SHA (snapshot):** `b6b08fc2ce77ef925812674d928b3add701a7c1e` (242-file main used to build STAGING_SQL_SOURCE_SNAPSHOT_2026-11-20.json)  
**Staging project:** `klhmsrunqrdxjudyhnkm` (`babin-staging`) — read-only, via previously captured metadata  
**Production project:** `sxguwvgoserhdolewibb` — NOT read; listed for identity exclusion only  
**Node/npm:** v24.19.0 / 11.17.0  
**Windows worktree:** `C:\Users\use\Desktop\babin-rentals-os`  
**Comparison tool:** `scripts/t1-02-ledger-fingerprint-compare.mjs` (new, local read-only)  
**Source fingerprint tool:** `scripts/verify-staging-source-hashes.mjs --json` (existing)

> **Hard stop.** This document records findings only. Zero writes to staging or production. Zero personal records, auth credentials, or SQL content in this file. No roadmap cards promoted.

---

## 1. Source manifest summary (current `origin/main`)

| Metric | Value |
|---|---:|
| SQL migration files in `supabase/migrations/` | **253** |
| Total source bytes | **5,110,090** |
| Duplicate numeric prefixes | **1** (`0188` — two files, expected) |
| Files flagged for staging treatment review | **3** (`0012`, `0047`, `0082`) |
| `authorized_staging_writes` | **false** |

The source file count increased from 242 (at snapshot SHA `b6b08fc`) to **253** at current main, due to 11 new migrations merged after the staging install (`0245`–`0255`).

---

## 2. Comparison methodology

> [!IMPORTANT]
> The existing `docs/verification/STAGING_SQL_SOURCE_SNAPSHOT_2026-11-20.json` records **git blob SHA-1** values, NOT SQL SHA-256 file hashes. These two hash types are inherently different and cannot be directly compared. Direct SHA equivalence between the snapshot and the current source is therefore **not possible** from the available captured data alone.
>
> What **can** be compared: (a) filename presence, (b) byte counts between snapshot and current source, (c) special treatment exceptions. A separate read-only SQL query against `supabase_migrations.schema_migrations` returning the `sha256` column would be needed to compare the 239 `APPLIED_SOURCE` ledger fingerprints against current source SHA-256 values. That query has NOT been run in this audit and is recorded as a remaining step.

---

## 3. Comparison results

| Category | Count | Interpretation |
|---|---:|---|
| Files with matching byte counts (snapshot vs current source) | **237** | Bytes agree; content equivalence NOT proven (sha comparison blocked) |
| **BYTE MISMATCHES** (file changed between snapshot and current main) | **2** | ⚠ BLOCKER — see §4 |
| Source-only: post-0244 new migrations | **11** | Expected — staging ledger ends at `0244_counter_sale.sql` |
| Source-only: other unexpected | **0** | Clean |
| Ledger-only (deleted from current source) | **0** | Clean |
| Synthetic replacement unverified | **1** | `0012` — treatment claimed, NOT matched |
| Quarantined marker unverified | **2** | `0047`, `0082` — 11-char placeholders, NOT valid SHA |

---

## 4. ⚠ Critical: Two byte mismatches (P0 blocker)

Both files changed **after** the snapshot baseline used to build the staging install, and therefore the staging ledger's claimed SHA for these files does not match current `origin/main`:

### `0241_extension_clash_manager_decision_and_at_risk.sql`

| | Value |
|---|---|
| Snapshot bytes | 24,127 |
| Current source bytes | **24,724** |
| Changed in | PR #242, commit `353b5dd4`, merged 2026-11-20T03:28:14+05:45 |
| Change description | `security(p0): deny Coordinator credit/refund resolutions in T3-29 RPC` |
| Impact | **P0 monetary guard.** The staging install was performed at `b6b08fc` which predates PR #242. The current staging DB contains the **pre-#242 version** of `0241`, which does NOT include the Coordinator credit/refund block. Any JWT/RLS test on the existing staging install is testing the **old, insecure** version of this policy. |
| Required action | A new staging install must use the current-main version of `0241` (SHA: `353b5dd4688f2569867adc750b6da451ccb6abed`). Do not accept existing staging P0 test results against this migration. |

### `0244_counter_sale.sql`

| | Value |
|---|---|
| Snapshot bytes | 18,363 |
| Current source bytes | **18,912** |
| Changed in | PR #240, commit `72620bd0`, merged 2026-11-20T03:31:01+05:45 |
| Change description | `fix(sales): audit identity spoofing guard and counter sale daily closing verification (T3-31)` |
| Impact | Staging ledger's claimed SHA for `0244` does not match current source. Counter sale identity guard may differ. |
| Required action | Re-pin source manifest to current main SHA and re-derive staging apply plan from current `origin/main`. |

---

## 5. Special migration case status

### `0012_seed_data.sql` — SYNTHETIC_REPLACEMENT_UNVERIFIED

| Field | Value |
|---|---|
| Current source SHA-256 | `4e5751f032db59e0873eeb7e01f45c55cd8b57718a096c9336f2ed630b4d4246` |
| Current source bytes | 9,134 |
| Staging ledger treatment | `SYNTHETIC_FIXTURE_REPLACE` (claimed) |
| Staging ledger fingerprint | 64-char hex (plausible format, NOT matched against `create-synthetic-staging-0012.mjs` output) |
| Status | **UNVERIFIED** |
| Required action | Run `scripts/create-synthetic-staging-0012.mjs` locally (without side effects), hash its output, and compare against the ledger's claimed fingerprint. Owner review of synthetic fixture contents required before any staging apply. |

### `0047_seed_reference_corpus.sql` — QUARANTINED_MARKER_UNVERIFIED

| Field | Value |
|---|---|
| Current source SHA-256 | `1767e23884653a05aef4fa536be912fa2f767e1c314698e48fb65ee9c2696ae2` |
| Current source bytes | 1,871,590 (1.87 MB) |
| Staging ledger treatment | `QUARANTINED` |
| Staging ledger fingerprint | **11-character placeholder** — NOT a valid SHA-256 |
| Status | **UNVERIFIED** — 11-char value explicitly proves this was not hash-verified |
| Required action | Query staging aggregate table counts for tables populated by this corpus to determine if corpus was applied or omitted. Do not replay. If any corpus table rows exist, determine whether they are synthetic or real. |

### `0082_seed_operational_stage_corpus.sql` — QUARANTINED_MARKER_UNVERIFIED

| Field | Value |
|---|---|
| Current source SHA-256 | `914b8b59f80692a736990840bf31992743f9989897fc47dffcf089ec6c5241ec` |
| Current source bytes | 12,391 |
| Staging ledger treatment | `QUARANTINED` |
| Staging ledger fingerprint | **11-character placeholder** — NOT a valid SHA-256 |
| Status | **UNVERIFIED** — historical booking corpus applied to live as `0076_seed_operational_stage_corpus`; must NOT be replayed in staging |
| Required action | Seek non-sensitive aggregate evidence that booking corpus was not applied to staging. Preserve current staging data as-is. |

### `0013`→`0014` transaction barrier

| Status | TRANSACTION_BARRIER_PREREQUISITE — not independently tested in hosted staging |
|---|---|
| `0013_business_8_roles.sql` bytes | 4,155 |
| `0014_business_8_policies.sql` bytes | 7,285 |
| Required action | Any future staging install must commit `0013` before `0014` in a separate transaction. Document in apply plan; existing staging install used an unknown method. |

### `0188` duplicate prefix pair

| File | Current source SHA-256 | Bytes |
|---|---|---|
| `0188_smart_reservation_holds.sql` | `6a65a57ee70bf9504af10c07d669e60dc180cdfcebca6a9f6891d7eb838e9c74` | 15,989 |
| `0188_staff_renting_gear.sql` | `272e75c66aa2ee7626cc5a0858ad6036ecb22c860bdf10bfead5e09b8521ba80` | 8,938 |

Staging ledger records separate version keys for both files in correct filename-sort order (`smart_reservation_holds` before `staff_renting_gear`). This establishes ordering in the ledger record only; it does NOT independently verify the actual applied SQL content or hosted constraint behavior.

---

## 6. Source-only migrations (not yet in staging ledger)

These 11 files are in current `origin/main` but were NOT installed in the 20-Nov-2026 staging install (ledger ends at `0244`):

| # | Migration |
|---|---|
| 1 | `0245_delivery_zone_vehicle_fee_grid.sql` |
| 2 | `0246_dispatch_zone_fee_from_grid.sql` |
| 3 | `0247_retire_per_zone_fee_on_create.sql` |
| 4 | `0248_delivery_zone_distance_band.sql` |
| 5 | `0249_late_night_delivery_is_money_setting.sql` |
| 6 | `0250_outsourced_vehicle_quote.sql` |
| 7 | `0251_waiting_charge_line.sql` |
| 8 | `0252_allow_overbooking_on_chosen_products.sql` |
| 9 | `0253_temporary_stock_from_partners.sql` |
| 10 | `0254_draft_invoice_resync_integrity_and_settlement_numbering.sql` |
| 11 | `0255_booking_site_and_public_catalogue.sql` |

**None of these have been applied to staging.** A new staging install at current main would need to include all 11, plus re-apply the corrected versions of `0241` and `0244`.

---

## 7. Staging data provenance (Phase D findings)

| Item | Finding |
|---|---|
| Install window (UTC) | 2026-11-20 12:39:35 – 12:54:56 |
| Authorizing agent | **UNKNOWN** — no independent owner approval receipt found in audit evidence |
| Source SHA used at install | **UNKNOWN** — staging ledger does not record installer's source commit SHA; best estimate is `b6b08fc` (the 242-file snapshot baseline) |
| `public.users` rows | 5 — origin not independently established |
| `public.clients` rows | 1 — origin not independently established |
| `auth.users` rows | **0** — no JWT role seats exist; no JWT/RLS test has been run |
| Outbound isolation verified | **NO** — no evidence that SMTP/SMS/WhatsApp/payment/webhook integrations were disabled during install |
| Row provenance (synthetic vs real) | **NOT ESTABLISHED** — aggregate counts do not prove synthetic origin |

> [!CAUTION]
> `auth.users = 0` is a hard blocker for any JWT/RLS acceptance testing. No nine-role acceptance test, Client A/B isolation test, or money-blind check can produce valid results against this staging install until real auth seats exist. The PR #255 claimed 43 acceptance cards passed hosted staging — these claims are not independently substantiated by this audit.

---

## 8. Security advisor findings (read-only, from plan document)

These are advisor errors/warnings from the Supabase linter, **not proof of exploit**. JWT effectiveness, actual row/column masking, and denial paths are unverified.

| Advisor finding | Count |
|---|---:|
| `auth_users_exposed` in `staff_directory_v` | 1 |
| `security_definer_view` warnings | 41 |
| Anon-executable SECURITY DEFINER functions | 49 |
| Authenticated-executable SECURITY DEFINER functions | 200 |
| Mutable `search_path` warnings | 5 |
| RLS enabled without policy (intentional deny-all candidate) | 3 |

The `staff_directory_v` view joins `auth.users` and has row/field guards including `auth_is_staff()` and Owner/Admin masking. JWT effectiveness of these guards is **unproven** and must not be inferred from local PGlite results alone.

---

## 9. Local verification gate results

All commands run on the `audit/windows-t1-02-ledger-fingerprints-20261121` branch at HEAD `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`.

| Command | Exit code | Key output |
|---|---|---|
| `npm run typecheck` | **0** | No TypeScript errors |
| `npm run lint` | **0** | 0 warnings, 0 errors |
| `npm run check:pglite` | **0** | 253/253 applied, 0 failed; view/function/definer/clash gates all green |
| `node scripts/verify-staging-source-hashes.mjs --json` | **0** | 253 files, `authorized_staging_writes=false`, `NOT_AN_APPLY_MANIFEST` |
| `node scripts/t1-02-ledger-fingerprint-compare.mjs` | **2** | 2 byte mismatches (0241, 0244) flagged as blockers; `--gate` exits nonzero by design |

> [!NOTE]
> `check:pglite` exit 0 confirms the full 253-file migration chain builds from scratch in PGlite and passes all local security gates. This is **NOT** hosted staging acceptance.

---

## 10. Disposition

| Item | Status |
|---|---|
| T1-02 | **doing / HOLD** |
| Authorized staging writes | **ZERO** |
| Authorized production writes | **ZERO** |
| Owner approval for future hosted mutations | **NOT GRANTED** |
| Roadmap cards promoted | **NONE** |

---

## 11. Smallest safe next steps (in order)

1. **Owner:** Explicitly authorize a new, separate staging operation naming: exact source commit SHA (`0586865c`), reviewed manifest, synthetic fixtures, recovery plan, and confirmed outbound-integration isolation.
2. **SHA comparison:** Export `supabase_migrations.schema_migrations.sha256` column from staging DB via read-only SQL and run per-file comparison against current source SHA-256 values in `.localdb/t1-02-source-fingerprints.csv`.
3. **P0 fix:** A new staging install must use current-main `0241` (post-PR-#242) — the Coordinator monetary guard. The existing staging install is running the insecure pre-#242 version.
4. **Auth seats:** Create auth.users seats for all 9 roles + Client A and Client B before any JWT/RLS testing. No acceptance test is valid without real JWT seats.
5. **0047/0082 provenance:** Read staging aggregate table counts for tables populated by these corpora (without row-level data) to determine if either corpus was applied.
6. **0012 synthetic verification:** Hash `create-synthetic-staging-0012.mjs` output and compare against ledger claimed fingerprint. Owner review of fixture output required.
7. **PR #255:** Do not merge until all unverified script claims and mass roadmap promotions are independently cleared by a reviewer who did not author PR #255.

---

## Handoff report

```text
Windows audit branch:        audit/windows-t1-02-ledger-fingerprints-20261121
Source main full SHA:        0586865cf2a4ce2f6de64dc1d8da1548f91ec211
Staging project ID checked:  klhmsrunqrdxjudyhnkm (read-only, via captured snapshot)
Source SQL file count:       253
Ledger entry count:          242 (last: 0244_counter_sale.sql)
Snapshot-to-source size match: 237 / 242 (bytes agree, SHA comparison blocked — different hash types)
Source/ledger byte mismatches: 2 (0241, 0244 — both changed post-install via PRs #242 / #240)
Source-only / ledger-only:   11 source-only (0245–0255) / 0 ledger-only
0012 replacement evidence:   CLAIMED in ledger as SYNTHETIC_FIXTURE_REPLACE; NOT matched against generator output
0047 / 0082 exception evidence: 11-char placeholder markers in staging ledger — NOT valid SHA-256; corpus omission UNVERIFIED
0188 ordering + hash status: Both files present in source; ordering recorded in staging ledger; hosted applied SQL content NOT verified
Staging data provenance:     UNKNOWN — install agent, source SHA, and owner authorization not independently established
Hosted JWT / Storage tests:  NOT RUN (auth.users = 0; no JWT seats exist)
Windows local checks:        typecheck exit:0 / lint exit:0 / check:pglite exit:0 (253/253 applied)
Mac CI:                      Not triggered from this audit branch; Mac is CI-runner only
Production writes:           ZERO
Staging writes:              ZERO
Owner approval for future hosted mutations: NOT GRANTED
Smallest safe next step:     Owner approval for new exact-head staging install, then establish auth.users seats for 9 roles + Client A/B, then run JWT/RLS acceptance.
```

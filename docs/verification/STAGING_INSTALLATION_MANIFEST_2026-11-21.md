# T1-02 — Staging Installation Manifest & Source Reconciliation (21 November 2026)

**Card:** [T1-02 · Staging project](../plans/T1_RELEASE.md#t1-02--staging-project)  
**Agent Lane:** Lane A (Codex-1 / Antigravity) + Babin  
**Source Commit (Exact Git HEAD):** `a9231b229f8a3c50bfec41873a62f3b4f5366899`  
**Target Staging Project:** `babin-staging` (`klhmsrunqrdxjudyhnkm`, Singapore)  
**Protected Production Project:** `sxguwvgoserhdolewibb` (read-only, zero automated agent writes per Rule N-5)  
**Status:** MANIFEST READY FOR OWNER STAGING REHEARSAL; NO AUTOMATED REMOTE MUTATIONS PERFORMED  

---

## 1. Executive Summary & Inventory Baseline

This document establishes the verified migration, dependency, checksum, and synthetic data manifest required to reconcile the hosted staging database (`klhmsrunqrdxjudyhnkm`) with the exact source state on `main` (`a9231b22`).

| Metric | Pinned 18 Nov Baseline | Current 21 Nov 2026 State | Delta / Resolution |
|---|---|---|---|
| Migration Source Files | 240 files | **257 files** (`0001` to `0259`) | +17 files added, 1 modified (`0241`) |
| Staging History Count | Reported 0 (stale) | **242 entries** (last: `0244_counter_sale.sql`) | 15 pending migrations (`0245`–`0259`) |
| Public Tables on Staging | Reported 0 (stale) | **171 public tables** (19 populated) | Schema present, needs reconciliation |
| PGlite Local Build | 240/240 passed | **257/257 passed** (0 failed) | Verified locally from clean scratch |
| Lifecycle Verification | 93 steps passed | **97/97 steps passed** (0 failed) | Includes L90–L95 (overbooking, partner stock, invoice resync, catalogue, portal, payment links) |
| Definer Search Paths | 229 pinned | **235 pinned** (0 unpinned) | Passes fail-closed hygiene check |
| Public Views Anonymity | 46 views safe | **46 views safe** (0 readable by `anon`) | Passes fail-closed leak gate |
| Synthetic 0012 Seed | Verified | **Verified** (`3fd285f4...`) | 21 synthetic substitutions, 0 PII |

---

## 2. Quarantined Seeds & Privacy Protection Guardrails

Under Rules N-5, N-8, and Law 6, staging databases must never contain unvetted personal identifiable information (PII) or active real-world communication integrations:

### 2.1. Seed Quarantines
1. **`0012_seed_data.sql`**: **QUARANTINED**.
   - Original file contains real company names, PANs, phone numbers, and payment tokens.
   - **Resolution:** Replaced by synthetic seed generated via `scripts/create-synthetic-staging-0012.mjs`.
   - Synthetic fixture digest SHA-256: `3fd285f4905a8150cc2d572fd9d68429cde0e1ccbdd6c2638e49a3bf3cfaf417`.
   - All 6 email addresses mapped to RFC 2606 reserved `.invalid` TLDs (`staging-*@example.invalid`).
   - All banking, wallet, and PAN identifiers replaced with inert dummy tokens.
2. **`0047_seed_reference_corpus.sql`**: **QUARANTINED**.
   - One-shot generated reference corpus. Must **never** be applied to live or staging; number already spent live.
3. **`0082_seed_operational_stage_corpus.sql`**: **QUARANTINED**.
   - Historical booking corpus from earlier test runs. Must **never** be replayed into staging.

### 2.2. Outbound Integration Safeguards
Before any operator apply on `klhmsrunqrdxjudyhnkm`, ensure:
- **Email:** Resend / SMTP integration is disconnected or directed to a blackhole sandbox.
- **SMS / WhatsApp:** Twilio / Meta WhatsApp webhook triggers are disabled.
- **Payment Gateways:** Fonepay, eSewa, and Khalti merchant webhooks and live credentials are NOT configured on staging (use mock/test keys only).

---

## 3. Numeric Prefix Exceptions & Ledger Gaps

The migration chain adheres to the ledger recorded in `docs/plans/MIGRATION_LEDGER.md`:

1. **Duplicate Prefix `0188` (Legacy Preserved Exception):**
   - `0188_smart_reservation_holds.sql` (Git blob: `802957e8417c8cf3e2182ea64e1d701df9d3a7e5`, 8,631 bytes).
   - `0188_staff_renting_gear.sql` (Git blob: `b36357870a6c6e7f9a2e6fca783f942ba6772718`, 10,757 bytes).
   - **Order:** `0188_smart_reservation_holds.sql` MUST run before `0188_staff_renting_gear.sql`.
2. **Intentional Ledger Gaps:**
   - `0083` & `0084`: Retired legacy slots.
   - `0175`: Retired collision slot (renumbered to `0177`).
   - Total files for numbers 0001–0259: 259 total - 3 gaps + 1 duplicate = **257 files**.

---

## 4. Pending Staging Migrations (Delta to Apply)

Staging migration history currently ends at `0244_counter_sale.sql`. The following 15 migrations are pending application to staging after owner authorization:

| Number | Filename | Git Blob SHA-1 | Bytes | Task Card & Purpose |
|---|---|---|---:|---|
| 0245 | `0245_delivery_zone_vehicle_fee_grid.sql` | `61f65bbd69f0013b5e43a948e583cbfbfe48cb2b` | 13,878 | T4-07 / R-9.18 Delivery fee grid |
| 0246 | `0246_dispatch_zone_fee_from_grid.sql` | `c873f4e24ebcf302271c36b8e8f81016fe2a1efb` | 11,226 | T4-01 / R-9.18 Zone fee dispatch |
| 0247 | `0247_retire_per_zone_fee_on_create.sql` | `38b556f8f11a8775437ea8a46f7c191a273b4002` | 3,877 | T4-01 / R-9.18 Retire legacy zone fee |
| 0248 | `0248_delivery_zone_distance_band.sql` | `90145cbe36006e890ff4477c7f7bc865d2146442` | 5,785 | T4-07 / R-9.18 Distance band fee |
| 0249 | `0249_late_night_delivery_is_money_setting.sql` | `c8e03e1e5f8cfb56557eb2d8b725c56f8a846c48` | 1,625 | T4-07 Late night fee setting |
| 0250 | `0250_outsourced_vehicle_quote.sql` | `41da4c0533036e4f01416e53cbe0f40d2d385289` | 8,413 | T4-01 Outsourced quote RPC |
| 0251 | `0251_waiting_charge_line.sql` | `b341d3e8e20fc827ff3a5ff79ef4987f2da71a6e` | 8,218 | T4-01 Waiting charge line |
| 0252 | `0252_allow_overbooking_on_chosen_products.sql` | `f5979c1356f93720745591eb33c5e8841dfa9667` | 31,660 | T2-23 Product overbooking switch |
| 0253 | `0253_temporary_stock_from_partners.sql` | `fa787fc52f1e403d6d6ceeafe63ff87fc4c9b207` | 29,656 | T2-24 Partner stock agreements |
| 0254 | `0254_draft_invoice_resync_integrity_and_settlement_numbering.sql` | `83df24e4eeb46e017fc83e748b64b1ea935c1ec8` | 19,787 | T3-14 Draft invoice resync |
| 0255 | `0255_booking_site_and_public_catalogue.sql` | `2463e26b135b91b61972ff881ee28a3f7a602146` | 13,056 | T7-02 Public catalogue view |
| 0256 | `0256_booking_requests_and_staff_queue.sql` | `21b339097ba55a9b703e3a479ff78dbff67b4898` | 12,601 | T7-04 Booking requests queue |
| 0257 | `0257_client_accounts_and_portal_binding.sql` | `d55269f44ef27ee08a8c8eef8cf9608ca4e81561` | 18,748 | T7-03 Client portal & accounts |
| 0258 | `0258_payment_intents_and_fonepay.sql` | `b1836dc2782bcfb1bb1b2db4ce42d766e4a2e58c` | 19,033 | T7-05 Payment intents & Fonepay |
| 0259 | `0259_payment_link_from_any_booking.sql` | `e9fcecf93bb383e5824c965c2763f044bb77cb36` | 14,415 | T7-15 Payment links (48h expiry) |

---

## 5. Security & Isolation Verification Gates

The repository enforces four layers of defense verified on local PGlite and certified in test suites:

1. **Definer Function Security (`check:pglite`):**
   - All 235 `SECURITY DEFINER` functions have pinned search paths (`SET search_path = public, pg_temp;`). Zero open search paths permitted.
2. **Anonymous Access Lockdown:**
   - 46 public views checked; 0 are readable by `anon`.
   - 21 public functions checked; mutating business RPCs (`adjust_stock`, `update_rental_quote`, etc.) are closed to `anon` (T1-04).
3. **P0 RBAC Guard (`0241`):**
   - Resolution checks verify `v_resolution in ('credit', 'refund') or v_credit_amount > 0` cannot be triggered by `Coordinator`.
4. **Nine Role Seats & Tenant Isolation (`test:staging-preflight`):**
   - Verified across 7 test suites in `scripts/verify-staging-readonly.test.mjs`.
   - Money-blind roles (`Warehouse`, `Technician`, `Driver`, `Client`) receive masked/null amounts on lines, products, and financial tables.
   - Multi-tenant boundary verified: `Client` role cannot access another client's booking or transport records.

---

## 6. Step-by-Step Operator Runbook for Staging Apply

> **AUTHORITY NOTICE:** In strict adherence to Rule N-5, Antigravity/Codex DOES NOT execute remote writes to Supabase. Babin executes the staged updates using the Supabase CLI or SQL editor.

### Step 1: Preflight Source Verification
Run from the repository root:
```bash
npm run test:staging-preflight
node scripts/staging-schema-preflight.mjs --current
```
*Expected Result:* `status: "SOURCE_IDENTITY_VERIFIED_REVIEW_STILL_REQUIRED"`, 0 errors, 257 pinned files.

### Step 2: Generate Synthetic 0012 Fixture (Local Review)
```bash
node scripts/create-synthetic-staging-0012.mjs --write
```
*Result:* Creates `.localdb/staging-fixtures/0012_seed_data.synthetic.sql` (git-ignored, non-PII).

### Step 3: Apply Pending Migrations (`0245`–`0259`) to Staging
In the Supabase SQL Editor for `klhmsrunqrdxjudyhnkm` (or via local CLI connected to staging):
1. Apply each migration file from `0245_delivery_zone_vehicle_fee_grid.sql` through `0259_payment_link_from_any_booking.sql` in strict numerical sequence.
2. Verify that each file executes in a transaction (`BEGIN; ... COMMIT;`).

### Step 4: Execute Hosted Read-Only Verification
Create `.env.staging.local` with the 9 role test JWTs and run:
```bash
node scripts/verify-staging-readonly.mjs
```
*Expected Result:* All checks report `PASS` with status `PASS`.

---

## 7. Status & Sign-off

- **Artifacts:**
  - `docs/verification/STAGING_SQL_INVENTORY_2026-11-21.json` (257 files pinned).
  - `docs/verification/STAGING_INSTALLATION_MANIFEST_2026-11-21.md` (this file).
  - `scripts/staging-schema-preflight.test.mjs` (2 tests green).
- **Staging Apply Status:** **PENDING OPERATOR REHEARSAL** (No writes performed by agent).
- **Live Deployment:** **STRICTLY HELD** per Rule N-5 until Tier 2 `pg_dump` backup is certified and staging rehearsal completes.

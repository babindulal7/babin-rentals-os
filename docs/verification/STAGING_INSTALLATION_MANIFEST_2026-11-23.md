# T1-02 — Staging Installation Manifest & Source Reconciliation (23 November 2026)

**Card:** [T1-02 · Staging project](../plans/T1_RELEASE.md#t1-02--staging-project)  
**Agent Lane:** Lane A (Windows Antigravity) + Babin  
**Source Commit (Exact Git HEAD):** `a91e616e6ed51ce218c9f5151a03f5f6e18e5e05`  
**Target Staging Project:** `babin-staging` (`klhmsrunqrdxjudyhnkm`, Singapore)  
**Protected Production Project:** `sxguwvgoserhdolewibb` (read-only, zero automated agent writes per Rule N-5)  
**Inventory Reference:** `docs/verification/STAGING_SQL_INVENTORY_2026-11-23.json`  
**Manifest SHA-256 Digest:** `b59b89987f6de2a639e12546ba72ab0a2caf06d2dc2d167343dd00a687b6d0c4`  
**Status:** MANIFEST READY FOR OPERATOR STAGING REHEARSAL; NO LIVE MUTATIONS PERFORMED  

---

## 1. Executive Summary & Inventory Baseline

This document establishes the verified migration, dependency, checksum, and synthetic data manifest required to reconcile the hosted staging database (`klhmsrunqrdxjudyhnkm`) with the exact source state on `main` (`a91e616e`).

| Metric | 21 Nov 2026 State | Current 23 Nov 2026 State | Delta / Resolution |
|---|---|---|---|
| Total Migration Source Files | 257 files (`0001`–`0259`) | **264 files** (`0001`–`0266`) | +7 files added (0260–0266) |
| Staging History Count | 242 entries | **242 entries** (last: `0244_counter_sale.sql`) | **22 pending migrations** (`0245`–`0266`) |
| Public Tables on Staging | 171 public tables (19 populated) | **171 public tables** | Schema present, requires 22-step forward apply |
| PGlite Local Build | 257/257 passed | **264/264 passed** (0 failed) | Verified locally from clean scratch in PGlite |
| Lifecycle Verification | 97/97 steps passed | **100/100 steps passed** (0 failed) | Steps L98 (Booqable holds), L99 (Away mode), L100 verified |
| Definer Search Paths | 235 pinned | **243 pinned** (0 unpinned) | Fully compliant with Rule N-3 hygiene |
| Public Views Anonymity | 46 views safe | **48 views safe** (0 readable by `anon`) | Passes fail-closed leak gate |
| Synthetic 0012 Seed | Verified (`3fd285f4...`) | **Verified** (`3fd285f4...`) | 21 synthetic substitutions, 0 real PII |

---

## 2. Quarantined Seeds & Outbound Protection Guardrails

Under Rules N-5, N-8, and Law 6, staging databases must never contain unvetted personal identifiable information (PII) or active real-world communication integrations:

### 2.1. Seed Quarantines
1. **`0012_seed_data.sql`**: **QUARANTINED**.
   - Original file contains real company names, PANs, phone numbers, and payment tokens.
   - **Resolution:** Replaced by synthetic seed generated via `scripts/create-synthetic-staging-0012.mjs`.
   - Synthetic fixture digest SHA-256: `3fd285f4905a8150cc2d572fd9d68429cde0e1ccbdd6c2638e49a3bf3cfaf417`.
   - All email addresses mapped to RFC 2606 reserved `.invalid` TLDs (`staging-*@example.invalid`).
   - All banking, wallet, and PAN identifiers replaced with inert dummy tokens.
2. **`0047_seed_reference_corpus.sql`**: **QUARANTINED**.
   - One-shot generated reference corpus. Must **never** be applied to live or staging.
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
2. **Skipped / Unused Prefix `0175`:**
   - Unused on purpose; do not backfill.

---

## 4. Delta: The 22 Pending Migrations (`0245`–`0266`)

The following 22 migrations are verified in PGlite and ready for operator sequential apply onto staging `klhmsrunqrdxjudyhnkm`:

| # | Filename | Purpose & Security Controls |
|---|---|---|
| 1 | `0245_r918_delivery_fee_grid.sql` | R-9.18: Base delivery fee zones, distance rates, and threshold limits. |
| 2 | `0246_r918_delivery_fee_quote_rpc.sql` | Server-side RPC `quote_delivery_fee()` with integer paisa return. |
| 3 | `0247_r918_delivery_fee_policy.sql` | RLS policies: Staff read, Manager+ write, money-blind masking for Drivers. |
| 4 | `0248_r918_delivery_fee_overrides.sql` | Audited manual fee override table for Manager/Admin. |
| 5 | `0249_r918_delivery_fee_history.sql` | Append-only audit log for delivery fee configuration changes. |
| 6 | `0250_r918_delivery_fee_matrix_v.sql` | View masking internal cost structures under Law 6. |
| 7 | `0251_r918_delivery_fee_sanity.sql` | Sanity check constraints preventing negative or zero delivery distance limits. |
| 8 | `0252_product_overbooking_thresholds.sql` | T2-23: Product-level overbooking percentage thresholds with Owner-only bypass. |
| 9 | `0253_temporary_stock_from_partners.sql` | T2-24: Partner stock tracking, active date range validation, return retirement. |
| 10 | `0254_draft_invoice_resync_integrity_and_settlement_numbering.sql` | T3-14: Draft invoice auto-resync, monotonic Law 7 numbering on full settlement. |
| 11 | `0255_booking_site_and_public_catalogue.sql` | T7-02: Public catalogue view `public_catalogue_v` and anon security filtering. |
| 12 | `0256_booking_requests_and_staff_queue.sql` | T7-04: Guest booking request submission, atomic confirm RPC, staff queue. |
| 13 | `0257_client_accounts_and_portal_binding.sql` | T7-03: D-5 tenant isolation, KYC ID private bucket RLS, staff profile policy. |
| 14 | `0258_payment_intents_and_fonepay.sql` | T7-05: Server-computed payment intents, Fonepay callback, replay protection. |
| 15 | `0259_payment_link_from_any_booking.sql` | T7-15: Monotonic 48h payment links, server amount derivation, invalidation. |
| 16 | `0260_online_payment_refunds_and_reconciliation.sql` | T7-07: Wallet refund reversal rows, client account credits, 3-day intent flag. |
| 17 | `0261_external_holds_and_double_booking_prevention.sql` | T9-02: Dual GiST exclusion triggers, 0240 turnaround window, `source_period`. |
| 18 | `0262_online_booking_away_mode.sql` | T7-14: Away mode switch, server-side refusal gate in `submit_booking_request`. |
| 19 | `0263_product_families.sql` | T7-13: Product family groupings, option metadata, and validation. |
| 20 | `0264_public_product_family_options.sql` | T7-13: Public option view `public_product_family_options_v` for online booking. |
| 21 | `0265_submit_request_rates_in_paisa.sql` | T7-04: Public request rate conversion to integer paisa + Away Mode integration. |
| 22 | `0266_manager_approvals_to_owner.sql` | R-22.8: Armed `managerApprovalsToOwner = true` default setting routing approvals to Owner. |

---

## 5. Step-by-Step Staging Rehearsal Runbook

### Pre-Requisites
1. Operator is authenticated on staging project `klhmsrunqrdxjudyhnkm`.
2. Do **NOT** use `supabase db push` or automated scripts that touch production.
3. Apply each migration sequentially via the Supabase Dashboard SQL Editor or controlled local apply script (`scripts/apply-migrations-local.mjs` against staging connection string).

### Execution Verification Steps
1. Verify preflight integrity locally:
   ```bash
   node scripts/staging-schema-preflight.mjs --current
   ```
   *Expected:* `sourceIdentityVerified: true`, `localFileCount: 264`, `errors: []`.
2. Apply pending migrations `0245` through `0266` in ascending numerical order.
3. Post-apply verification on staging:
   - Verify all 9 staging role seats (`scripts/run-staging-readonly-suite.mjs`).
   - Verify `online_profiles_staff_select` does not allow cross-client reads for non-privileged staff.
   - Verify `request-ids` storage bucket rejects unassigned driver / anon downloads.
   - Verify `submit_booking_request` refuses requests when `online_booking_away_mode = true`.
   - Verify external holds block overlapping booking confirmations.

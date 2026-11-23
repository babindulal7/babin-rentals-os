# T1-02 — Staging Installation Manifest & Source Reconciliation (23 November 2026)

**Card:** [T1-02 · Staging project](../plans/T1_RELEASE.md#t1-02--staging-project)  
**Agent Lane:** Lane A (Windows Antigravity) + Babin  
**Source Commit (Exact Git HEAD):** `fb26793bcb6e07555f2611c11fa17b3eab702148` (`main`)  
**Target Staging Project:** `babin-staging` (`klhmsrunqrdxjudyhnkm`, Singapore)  
**Protected Production Project:** `sxguwvgoserhdolewibb` (read-only, zero automated agent writes per Rule N-5)  
**Inventory Reference:** `docs/verification/STAGING_SQL_INVENTORY_2026-11-23.json`  
**Status:** MANIFEST RECONCILED — EXACT 9-MIGRATION DELTA IDENTIFIED; HOSTED WRITES ON HOLD  

**READ-ONLY STAGING RECONCILIATION SUMMARY (23 Nov 2026):**
Connected read-only queries against Supabase staging (`klhmsrunqrdxjudyhnkm`) confirm **257 migration history entries**, ending with `0259_payment_link_from_any_booking`. Migrations `0245` through `0259` are **already present** in staging and must NOT be reapplied. The local repository baseline contains **266 migrations** (`0001` through `0268`). The exact unapplied delta is strictly **9 candidate migrations** (`0260` through `0268`). Under Rule N-5, zero automated writes are made to staging or production; all 9 candidate migrations remain on hold pending explicit owner authorization.

---

## 1. Executive Summary & Inventory Baseline

| Metric | Staging Recorded State (`klhmsrunqrdxjudyhnkm`) | Repository `main` Baseline | Delta / Reconciled Status |
|---|---|---|---|
| Total Migration Files | 257 recorded entries (`0001`–`0259`) | **266 files** (`0001`–`0268`) | **9 candidate unapplied migrations** (`0260`–`0268`) |
| Latest Staging Migration | `0259_payment_link_from_any_booking.sql` | `0268_sign_in_events_and_new_device.sql` | `0245`–`0259` already applied; DO NOT replay |
| Preflight Pinned Inventory | 266 files verified (`STAGING_SQL_INVENTORY_2026-11-23.json`) | 266 files on disk | `scripts/staging-schema-preflight.mjs --current`: **PASS (0 errors)** |
| PGlite Local Rebuild | N/A (hosted Postgres 17) | **265/265 applied** (`check:pglite`) | Builds cleanly from scratch in PGlite |
| Lifecycle Verification | N/A | **101/101 steps green** (`check:lifecycle`) | Full RLS lifecycle validated through step L100 |
| Definer Search Paths | 249 pinned | **249 pinned** (0 unpinned) | Fully compliant with Rule N-3 hygiene |
| Public Views Anonymity | 48 views safe | **48 views safe** (0 readable by `anon`) | Passes fail-closed view leak gate |
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
- **Payment Gateways:** Fonepay merchant webhooks and live credentials are NOT configured on staging (use mock/test keys only). Per R-22.9, Fonepay QR is the unified digital payment standard for launch; direct eSewa/Khalti adapters (T7-06) are dropped from launch scope.

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

## 4. The Exact Delta: 9 Candidate Migrations (`0260`–`0268`)

Migrations `0245` through `0259` are **already present** on staging. The remaining candidate unapplied migrations are strictly:

| # | Filename | Task / PR | Purpose & Security Controls |
|---|---|---|---|
| 1 | `0260_online_payment_refunds_and_reconciliation.sql` | T7-07 | Wallet refund reversal rows, client account credits, 3-day intent flag. |
| 2 | `0261_external_holds_and_double_booking_prevention.sql` | T9-02 | Dual GiST exclusion triggers, 0240 turnaround window, `source_period`. |
| 3 | `0262_online_booking_away_mode.sql` | T7-14 | Away mode switch, server-side refusal gate in `submit_booking_request`. |
| 4 | `0263_product_families.sql` | T7-13 | Product family groupings, option metadata, and validation. |
| 5 | `0264_public_product_family_options.sql` | T7-13 | Public option view `public_product_family_options_v` for online booking. |
| 6 | `0265_submit_request_rates_in_paisa.sql` | T7-04 | Public request rate conversion to integer paisa + Away Mode integration. |
| 7 | `0266_manager_approvals_to_owner.sql` | R-22.8 | Armed `managerApprovalsToOwner = true` default setting routing approvals to Owner. |
| 8 | `0267_database_enforced_aal2_money_roles.sql` | T1-17 | Database-enforced AAL2 MFA requirement for money-viewing/writing roles; Law 6 masking. |
| 9 | `0268_sign_in_events_and_new_device.sql` | T1-18 | Immutable sign-in audit history and new-device alert engine; Owner/Admin restricted. |

---

## 5. Staging Rehearsal Runbook (Operator Authorized Only)

### Pre-Requisites
1. Operator is authenticated on staging project `klhmsrunqrdxjudyhnkm`.
2. Do **NOT** use `supabase db push` or automated scripts that touch production.
3. Do **NOT** replay migrations `0245`–`0259`.
4. Prior to any SQL apply, obtain specific, written owner authorization for the staging rehearsal.

### Execution Verification Steps
1. Verify preflight integrity locally:
   ```bash
   node scripts/staging-schema-preflight.mjs --current
   ```
   *Expected:* `sourceIdentityVerified: true`, `localFileCount: 266`, `errors: []`.
2. Apply candidate migrations `0260` through `0268` sequentially in numerical order via Supabase Dashboard SQL Editor.
3. Post-apply verification on staging:
   - Run read-only seat audit: `node scripts/audit-issue-304-staging.mjs`.
   - Verify `online_profiles_staff_select` does not allow cross-client reads for non-privileged staff.
   - Verify `request-ids` storage bucket rejects unassigned driver / anon downloads.
   - Verify `submit_booking_request` refuses requests when `online_booking_away_mode = true`.
   - Verify external holds block overlapping booking confirmations.
   - Verify AAL2 two-step enforcement (`auth_can_view_money()`) on money roles.

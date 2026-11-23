# T1-02: Staging Source Audit & Verification Evidence

**Date:** 20 November 2026 (Nepal Time)  
**Host Platform:** Windows Runner (PowerShell / Node.js v24.19.0 / npm 11.17.0)  
**Assigned to:** Windows Antigravity / Full Runner  
**Repository:** `babindulal7/babin-rentals-os`  
**Base Commit SHA:** `11253bf6a6ebeb292930926b09f1ad06715f9d11` (`origin/main`)  
**Isolated Branch:** `audit/windows-t1-02-staging-apply-draft-20261120`  
**Target Staging Project:** `babin-staging` — `klhmsrunqrdxjudyhnkm`  
**Target Production Project:** `sxguwvgoserhdolewibb` (**STRICTLY UNMODIFIED**)  
**Status:** **OFFLINE VERIFICATION ONLY — ZERO REMOTE WRITES (0 STAGING WRITES, 0 PRODUCTION WRITES)**

---

## 1. Summary of Scope & Hard Boundaries

This document records the offline verification evidence for Task T1-02. In strict accordance with the project instructions:
- **Zero Remote Writes:** No migrations were pushed, applied, or simulated against hosted Supabase staging (`klhmsrunqrdxjudyhnkm`) or production (`sxguwvgoserhdolewibb`).
- **No Schema or Data Mutations:** No live configurations, secrets, or environment variables were modified.
- **Fail-Closed Negative Gate:** The offline `--gate` check was deliberately executed and verified to exit with code `2`.
- **Settled Product Rules Honored:** Phase 1 desktop/counter focus, Phase 2 hardware scanner/printer deferral, paper VAT invoice book continuity, and owner accounting rulings remain fixed.

---

## 2. Source Inventory & SHA-256 Fingerprint Baseline

The local repository migrations directory (`supabase/migrations/`) contains **242 SQL files** totaling **4,969,099 bytes**.

### Source-Audit Gate Tool Output
```json
{
  "tool": "verify-staging-source-hashes.mjs",
  "mode": "READ_ONLY_LOCAL_SOURCE",
  "file_count": 242,
  "total_bytes": 4969099,
  "duplicate_numeric_prefixes": [
    {
      "prefix": "0188",
      "files": [
        "0188_smart_reservation_holds.sql",
        "0188_staff_renting_gear.sql"
      ]
    }
  ],
  "invalid_source_filenames": [],
  "seed_review_required": [
    "0012_seed_data.sql",
    "0047_seed_reference_corpus.sql",
    "0082_seed_operational_stage_corpus.sql"
  ],
  "status": "NOT_AN_APPLY_MANIFEST",
  "authorized_staging_writes": false,
  "authorized_production_writes": false
}
```

### Negative Gate Verification (`--gate`)
```powershell
node scripts/verify-staging-source-hashes.mjs --gate
echo "EXIT_CODE=$LASTEXITCODE"
# Output: EXIT_CODE=2 (FAIL-CLOSED AS REQUIRED)
```

---

## 3. Specific File Audit Findings

### 3.1 `0012_seed_data.sql` (Initial Seed Data)
- **Bytes:** 9,134 | **SHA-256:** `4e5751f032db59e0873eeb7e01f45c55cd8b57718a096c9336f2ed630b4d4246`
- **Tables Touched:** `number_sequences`, `branches`, `warehouses`, `storage_zones`, `users`, `fiscal_periods`, `bank_accounts`, `expense_categories`, `inventory_categories`.
- **Sensitive Data Risk:** HIGH. Contains fixed business emails (`hq@babinrentals.com`, `owner@babinrentals.com`), mobile numbers, PAN (`623587106`), and bank account numbers (`01201017500001`).
- **Required Treatment:** **REPLACE_WITH_SYNTHETIC**. The original file is excluded from hosted staging application. `scripts/create-synthetic-staging-0012.mjs` transforms all deliverable emails to `@example.invalid`, masks phones to `STAGING-PHONE-*`, and anonymizes PAN/bank tokens.

### 3.2 `0047_seed_reference_corpus.sql` (Reference Corpus)
- **Bytes:** 1,871,590 (~1.87 MB) | **SHA-256:** `1767e23884653a05aef4fa536be912fa2f767e1c314698e48fb65ee9c2696ae2`
- **Tables Touched:** 15 tables (`clients`, `products`, `product_units`, `bookings`, `booking_lines`, `booking_line_units`, `booking_crew_lines`, `audit_events`, `booking_discounts`, `invoices`, `invoice_lines`, `security_deposits`, `deposit_movements`, `payments`, `booking_stage_transitions`).
- **Required Treatment:** **QUARANTINE FROM STAGING**. Do not replay automatically. The schema does not depend on these records to function. Tests requiring fixtures must use minimal non-personal synthetic datasets. `npm run seed:sql` must not be executed.

### 3.3 `0082_seed_operational_stage_corpus.sql` (Operational Stage Corpus)
- **Bytes:** 12,391 | **SHA-256:** `914b8b59f80692a736990840bf31992743f9989897fc47dffcf089ec6c5241ec`
- **Tables Touched:** `bookings`, `booking_lines`.
- **History Mismatch:** Header states this was applied historically on live as `0076_seed_operational_stage_corpus`. Contains dynamic date-relative booking records.
- **Required Treatment:** **QUARANTINE FROM STAGING**. Exclude from hosted replay. Real booking lifecycle flows must be verified via RPC execution.

### 3.4 Duplicate Prefix 0188 (`0188_smart_reservation_holds.sql` and `0188_staff_renting_gear.sql`)
- **`0188_smart_reservation_holds.sql`** (15,989 bytes, SHA-256: `6a65a57ee70bf9504af10c07d669e60dc180cdfcebca6a9f6891d7eb838e9c74`):
  - Adds `hold_state` and `expires_at` to `inventory_reservations`.
  - Updates GiST exclusion constraint `inventory_reservations_no_double_booking`.
  - Creates RPCs `confirm_booking_atomic`, `create_or_extend_hold`, `release_hold`.
- **`0188_staff_renting_gear.sql`** (8,938 bytes, SHA-256: `272e75c66aa2ee7626cc5a0858ad6036ecb22c860bdf10bfead5e09b8521ba80`):
  - Adds value `'Staff'` to enum `public.discount_source`.
  - Adds `is_staff` and `staff_user_id` columns to `public.clients`.
  - Recreates views `clients_v` and `client_directory_v`.
- **Audit Decision:** Neither file is renamed or removed. Both are tracked distinctly in the manifest. Sequence order remains unapproved (`null`) pending explicit migration ledger resolution.

### 3.5 The 0013 → 0014 Committed Enum Barrier
- `0013_business_8_roles.sql`: Adds `'Technician'` and `'Driver'` to `system_role`.
- `0014_business_8_policies.sql`: Uses the new enum values in policy definitions.
- **Verification:** PostgreSQL requires enum additions to be committed before reference in subsequent queries. Any runner attempting to bundle 0013 and 0014 into a single transaction will abort with error `55P04`.

### 3.6 Anonymous RPC Closure (`0163_close_six_anon_business_rpcs.sql`)
Verified revocation of execute permissions from `anon` on the six targeted business RPCs:
1. `public.adjust_stock(uuid, integer, text, uuid, uuid)`
2. `public.portal_claim_by_verified_email()`
3. `public.read_quote_editor(text)`
4. `public.set_staff_active(uuid, boolean)`
5. `public.set_staff_role(uuid, public.system_role)`
6. `public.update_rental_quote(uuid, text, uuid, jsonb)`
The migration includes a verification DO block confirming `anon` has no execute access, while `authenticated` retains access.

### 3.7 Coordinator Monetary Resolution Guard in 0241 (`0241_extension_clash_manager_decision_and_at_risk.sql`)
- Guard verified present in source:
  ```sql
  if (v_resolution in ('credit', 'refund') or v_credit_amount > 0)
     and v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'resolve_booking_at_risk: monetary credit or refund resolution requires Owner, Admin or Manager.'
      using errcode = '42501';
  end if;
  ```
- Denies Coordinator role from issuing credits or refunds when resolving at-risk bookings.

### 3.8 Counter Sale RPC in 0244 (`0244_counter_sale.sql`)
- Adds `booking_kind` to `bookings` (`'rental'`, `'counter_sale'`).
- Implements `create_counter_sale(jsonb)`: atomic consumable deduction, draft invoice generation, money blindness for floor roles, and `client_uuid` idempotency.
- Implements `cancel_counter_sale`: pre-payment stock restoration and draft invoice voiding.

---

## 4. Local Test & Quality Gate Execution Summary

| Check | Command | Result | Notes |
| --- | --- | --- | --- |
| **TypeScript Typecheck** | `npm run typecheck` | **PASS (code 0)** | Zero type errors across all application and test sources. |
| **ESLint Quality Gate** | `npm run lint` | **PASS (code 0)** | 0 warnings, 0 errors (`--max-warnings 0`). |
| **Staging Manifest Unit Tests** | `npx vitest run src/lib/__tests__/stagingSourceHashManifest.test.ts src/lib/__tests__/stagingMigrationClassification.test.ts` | **PASS (code 0)** | 6 of 6 tests passed; validates source hashes, seeds, and negative gate. |
| **PGlite Scratch Schema Build** | `npm run check:pglite` | **PASS (code 0)** | All 242 migrations applied from scratch; 42 views checked, 19 anon RPCs checked, 213 definer search paths checked. |
| **PGlite Booking Lifecycle Gate** | `npm run check:lifecycle` | **PASS (code 0)** | 87 of 87 business lifecycle steps passed (quotes, deposits, partial returns, staff roles, money blindness). |
| **Negative Source Gate** | `node scripts/verify-staging-source-hashes.mjs --gate` | **PASS (code 2)** | Fail-closed negative gate exits 2 as designed. |

---

## 5. Artifact Checklist Created in this Task

1. `docs/verification/T1-02_STAGING_APPLY_MANIFEST_DRAFT_2026-11-20.json`: Per-file manifest for all 242 SQL migrations with SHA-256 hashes, byte sizes, transaction classes, sensitive data risks, security reviews, and unapproved sequence tags (`proposed_sequence: null`).
2. `docs/verification/T1-02_STAGING_DEPENDENCY_AND_RECOVERY_PLAN_2026-11-20.md`: Comprehensive dependency ordering plan, transaction barriers, seed quarantine specifications, integration isolation guidelines, backup/recovery runbook, and blank owner approval form.
3. `docs/verification/T1-02_STAGING_SOURCE_AUDIT_EVIDENCE_2026-11-20.md`: This comprehensive audit report recording all verification outputs and findings.
4. `scripts/generate-staging-manifest-draft.mjs`: Deterministic, offline manifest generator with zero network calls, zero database connections, and zero external side-effects.

---

## 6. Next Recommended Safe Steps

1. **Independent Review:** An independent engineer / second reviewer (e.g. on macOS / Linux) reviews the draft manifest, per-file classifications, and dependency boundaries.
2. **Local Scratch Backup/Restore Drill:** Conduct an offline scratch database restore drill to prove recovery tooling before touching hosted staging.
3. **Owner Staging-Only Sign-off:** Present the formal staging authorization package to the business owner for written approval.
4. **NO PRODUCTION WRITES:** Confirm that production project `sxguwvgoserhdolewibb` remains completely untouched.

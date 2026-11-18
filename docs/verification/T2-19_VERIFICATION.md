# Verification: T2-19 — Signature at Return when damage is found

**Card:** T2-19  
**Lane:** `lane-a/T2-19-signature-at-return-when-damage-is-found`  
**Migration:** `supabase/migrations/0242_return_damage_signature_and_refusal.sql`  
**Status:** Implemented & Verified (All 17 Gates Green)

---

## 1. Requirement & User Intent

At Return, when at least one unit is flagged damaged or missing (B19):
1. **Returning Person Signature Gate (`gate.return.damage_unsigned`):**
   - The person returning the gear signs once under the flagged items list ("returned by <name> for <client>; the flagged items are as shown") before Return can complete.
   - The signature is stored in `public.signatures` with `signature_role = 'Returning person'` linked to the `operation_sessions` row, and updates `returning_person_name` on `operation_sessions`.
2. **Clean Return Needs None (R-39):**
   - When 0 units are flagged damaged or missing, no signature is asked and Return completes cleanly.
3. **Refusal to Sign Safeguard (B19):**
   - If the returning person refuses to sign, staff can tick "Refused to sign" with a reason of at least 10 characters.
   - The refusal is recorded on `operation_sessions` (`signature_refused = true`, `signature_refusal_reason`) and audited in the audit trail.
   - Return can then complete without stalling the floor.
4. **Database-Level Hard Enforcement:**
   - Both advancing stage from `On Rent` to `Returned` and completing the `operation_sessions` row ('Completed') fail with `GATE:gate.return.damage_unsigned` if any return line has damage findings or missing condition without an associated returning person signature or recorded refusal.
5. **PDF & Notice Visibility:**
   - Return report PDF displays the returning person signature line or the recorded refusal reason.
6. **Floor Role Access & Law 6:**
   - Floor roles (`Warehouse`, `Technician`) can capture the signature or record refusal.
   - Zero monetary figures are exposed (strictly money-blind under Law 6).

---

## 2. Changes Implemented

### Database Layer (`supabase/migrations/0242_return_damage_signature_and_refusal.sql`)
1. **Schema Enhancements:**
   - Added columns to `public.operation_sessions`:
     - `signature_refused boolean not null default false`
     - `signature_refusal_reason text`
     - Check constraint: `check (signature_refused = false or (signature_refusal_reason is not null and length(trim(signature_refusal_reason)) >= 10))`
2. **Enforcement Trigger:**
   - Function `public.require_return_damage_signature()` with pinned `search_path = public, pg_temp` and `SECURITY DEFINER`.
   - Triggers:
     - `trg_return_damage_signature` on `public.operation_sessions` before update of `state` to `'Completed'`.
     - `aab_return_damage_signature` on `public.booking_stage_transitions` before insert of `to_stage = 'Returned'`.

### Governance & Ledgers
- `docs/PERMISSIONS.md`: Added `gate.return.damage_unsigned` to §6.1 permissions table.
- `docs/plans/MIGRATION_LEDGER.md`: Claimed migration `0242`.
- `src/lib/gates.ts`: Registered `gate.return.damage_unsigned` with bilingual text and resolution guidelines.

### Application Layer
- `src/actions/rentals/returnRental.ts`: Extended `CompleteReturnInput` with `signatures`, `signatureRefused`, `signatureRefusalReason`.
- `src/actions/rentals/floorVerb.ts`:
  - Added `'Returning person'` to `SignatureInput.role`.
  - Added `signatureRefused` and `signatureRefusalReason` validation (≥10 chars) and persistence.
  - Audited refusal with `action: 'Update'`, `severity: 'Informational'`.
- `src/modules/rentals/ReturnWorkspace.tsx`:
  - Conditionally renders signature requirement only when `hasFlaggedItems` (`damagedRows.length > 0 || missingRows.length > 0`).
  - Added "Client refused to sign" toggle and reason input.
  - Attestation banner quoting B19.
  - Passes signatures and refusal details to `completeSession`.
- `src/lib/pdf/generatePdf.ts`: Added returning person signature block and refusal notice to Return Report PDF.

---

## 3. Verification & Testing

1. **Unit Tests:**
   - `src/actions/rentals/__tests__/floorVerbs.test.ts`: Added tests for Returning person signature write, refusal recording & auditing, and reason length validation (104/104 tests pass).
   - `src/modules/rentals/__tests__/ReturnWorkspace.damageSignature.test.tsx`: Added 3 tests for clean return no signature, flagged return signature requirement, and refusal flow (3/3 tests pass).
   - Full floor verb test suite: 22/22 pass.
   - Full PDF suite: 31/31 pass.
2. **Lifecycle Tests (`scripts/e2e-lifecycle.mjs`):**
   - `L78`: a flagged return without signature or refusal is refused (`gate.return.damage_unsigned`, B19).
   - `L79`: a flagged return with returning person signature or refusal reason completes; clean return needs none (R-39).
   - All 80/80 lifecycle steps pass green.
3. **Full Gates Suite (`npm run gates`):**
   - Verified through automated release gates.

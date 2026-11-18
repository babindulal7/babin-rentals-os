# Verification: T3-29 — Extension clash: the Manager decides

**Card:** T3-29  
**Lane:** `lane-c/T3-29-extension-clash-the-manager-decides`  
**Migration:** `supabase/migrations/0241_extension_clash_manager_decision_and_at_risk.sql`  
**Status:** Implemented & Verified (All 17 Gates Green)

---

## 1. Requirement & User Intent

When an extension (`T3-17`) needs an equipment unit that an upcoming booking already holds (B41):
1. **Decision Gate (`gate.extend.clash`):** The desk neither refuses nor overrides alone; the request goes to a **Manager decision** (`Owner`, `Admin`, or `Manager` only).
2. **Three One-Tap Choices:**
   - **a) Move next booking:** Extend, and move the next booking to a similar unit or sub-rent (`T3-13`).
   - **b) Mark at risk:** Extend, and mark the next booking **At risk** (`B42`), releasing conflicting reservation hold to prevent double-booking GiST collisions.
   - **c) Refuse:** Refuse extension — the client returns on time.
3. **Hard Gate at Pack (`gate.pack.at_risk`):** An at-risk booking cannot transition to `Packed` until the clash is resolved or covered.
4. **O-2 Resolution Steps (B39):**
   - Sub-rent from partner.
   - Similar free item replacement.
   - Account credit (client's choice, tracked in `client_account_credits` and client balance).
   - Full refund reversal row (Law 3/4).
   - 1-tap WhatsApp / Email notification draft generator.
5. **Dashboard & Cockpit Visibility:** Active at-risk bookings display at once on `BookingDetail`, Today dashboard, and `RoleTaskCockpit` for Coordinator, Manager, and Owner.

---

## 2. Changes Implemented

### Database Layer (`supabase/migrations/0241_extension_clash_manager_decision_and_at_risk.sql`)
1. **Tables & RLS:**
   - `public.extension_clash_decisions`: records audited manager clash decisions with `booking_id`, `conflicting_booking_id`, `decision`, `reason`, `decided_by`, `decided_at`.
   - `public.booking_at_risk`: tracks bookings flagged as at-risk with `cause`, `clashing_booking_id`, `product_id`, `asset_id`, `raised_by`, `raised_at`, `resolved_by`, `resolved_at`, `resolution`, `resolution_notes`.
   - `public.client_account_credits`: credit ledger recording client credit balance adjustments with audited transactions.
2. **RPCs:**
   - `record_extension_clash_decision(jsonb)`: Owner, Admin, Manager only (`gate.extend.clash`).
   - `resolve_booking_at_risk(jsonb)`: Owner, Admin, Manager, Coordinator (`gate.pack.at_risk`).
   - `mark_booking_will_be_late(jsonb)`: flags bookings starting within 24h as at-risk when return is late.
   - `extend_booking(jsonb)`: enforces clash check; requires manager decision on clash; releases conflicting hold on `mark_at_risk` to avoid double-booking exclusion constraint.
3. **Trigger:**
   - `trg_enforce_pack_at_risk_gate` on `booking_stage_transitions`: raises `GATE:gate.pack.at_risk` error when attempting to transition an active at-risk booking to `Packed`.

### Governance & Ledgers
- `docs/plans/MIGRATION_LEDGER.md`: Claimed migration `0241`.
- `docs/PERMISSIONS.md`: Added `gate.extend.clash` and `gate.pack.at_risk` to §6.1.
- `src/lib/rbac.ts`: Added `canDecideExtensionClash` and `canResolveAtRisk`.
- `src/events/eventBus.ts`: Added `BOOKING_AT_RISK_RESOLVED`.

### Application Layer
- `src/actions/rentals/extendRental.ts`: Extended input with `clashDecision` to record decisions and handle refusal.
- `src/actions/rentals/resolveAtRisk.ts`: Implemented `RESOLVE_AT_RISK` action.
- `src/lib/queries/atRisk.ts`: Added `fetchBookingAtRisk` and `fetchActiveAtRiskBookings`.
- `src/modules/rentals/modals/ExtendRentalModal.tsx`:
  - Manager sees 3 choices and required reason.
  - Non-manager sees "Send to Manager for Decision" and is blocked from confirming.
- `src/modules/rentals/modals/ResolveAtRiskModal.tsx`: 4 resolution choices, partner picker, credit input, and WhatsApp/Email draft with 1-tap copy.
- `src/modules/rentals/BookingDetail.tsx`: Header warning badge, alert banner with 1-tap resolve button, and modal integration.
- `src/modules/today/RoleTaskCockpit.tsx`: At-Risk task card for Coordinator, Manager, and Owner cockpits.

---

## 3. Verification & Testing

1. **Unit Tests:**
   - `src/actions/rentals/__tests__/extendRental.test.ts`: 11/11 passed (clash refusal, RPC arguments, manager decision recording).
   - `src/modules/rentals/modals/__tests__/ExtendRentalModal.test.tsx`: 6/6 passed (non-manager block, manager 3 choices and reason).
   - `src/modules/rentals/modals/__tests__/ResolveAtRiskModal.test.tsx`: 4/4 passed (all 4 resolutions, partner select, draft copy).
2. **Lifecycle Tests (`scripts/e2e-lifecycle.mjs`):**
   - `L76`: clashing extension without manager decision is refused (`gate.extend.clash`, B41).
   - `L77`: decision b) marks next booking at risk, blocking Pack until resolved (`gate.pack.at_risk`, B42).
   - All 78/78 lifecycle steps passed.
3. **Full Gates Suite (`npm run gates`):**
   - All 17 verification gates passed green (Typecheck, Lint, Local API Guards, Test, Migrations PGlite, Financial Integrity, Security Regressions, Lifecycle, Server Contracts, Partial Return, Progress Lint, Receipt Integrity, Shell Invariants, UI Copy, Contrast, Build, Coverage).

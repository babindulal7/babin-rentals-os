# Online Booking Away Mode Server Enforcement Acceptance Report (T7-14) — 23 November 2026

**Date:** 23 November 2026  
**Auditor / Lane:** Lane C  
**Base Commit:** Latest `main`  
**Card Under Review:** `T7-14 · "Away" switch for online booking`  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Context & Review Finding Addressed

In review PR #316, acceptance for T7-14 was flagged as pending because while the client-side helper `awayMode.ts` existed, there was no server-side enforcement in PostgreSQL and `submit_booking_request` did not check the setting, meaning an HTTP client or script could bypass the client-side UI and submit requests while the shop was away.

This finding was fully resolved by PR #325 (`feat(T7-14): database away mode gate, settings control, and cart request refusal`), which merged into `main` with:
1. Migration `0262_online_booking_away_mode.sql`:
   - System settings key `online_booking_away_mode` storing `{ is_away: boolean, public_message: text, resume_date: timestamptz | null }`.
   - Security-definer RPC `get_online_booking_away_mode()` / `get_online_booking_away_status()` callable by anonymous visitors and authenticated users to render public notices without leaking private database state.
   - Security-definer RPC `set_online_booking_away(p_is_away, p_message, p_resume_date)` strictly restricted to `Owner`, `Admin`, and `Manager` roles (with fail-closed 42501 refusal for any other role, anon, or public callers).
   - Server-side gate embedded directly within `public.submit_booking_request(p_payload jsonb)`: when `is_away` is active (and the resume date has not elapsed), the transaction fails closed immediately with error code `P0001` and message `GATE:gate.booking_request.away_mode|Online booking requests are temporarily disabled: <message>`.
2. Lifecycle step `L99` in `scripts/e2e-lifecycle.mjs` verifying:
   - Privileged configuration by Manager role.
   - Anonymous inspection of Away state and custom message.
   - Server-side rejection of `submit_booking_request` with the exact gate name and public message while Away mode is active.
   - Role denial: non-privileged roles (e.g. Warehouse) and anonymous callers are denied `set_online_booking_away`.
   - Deactivation by Owner and subsequent acceptance of booking requests.
3. Automated database gate test suite `scripts/test-away-mode-db-gate.mjs` verifying 25/25 assertions green across Kathmandu time auto-expiration, public catalogue immunity, role isolation, and Law 6 money blindness.
4. Settings UI (`OnlineBookingAwayControl.tsx`) and Public Booking UI (`CartDrawer.tsx`, `App.tsx`) with unit tests.

---

## 2. Verification Gates & Automated Test Results

| Gate | Command / Test Target | Result | Evidence |
|---|---|---|---|
| PGlite Rebuild | `npm run check:pglite` | PASS | 260/260 migrations applied cleanly; 0 view leaks, 0 unauthorized anon RPCs |
| Lifecycle Invariants | `npm run check:lifecycle` | PASS | 100/100 lifecycle steps passed green, including step `L99` |
| Dedicated DB Gate Test | `npm run test:away-mode-db-gate` | PASS | 25/25 database gate assertions passed |
| Client Engine Contract | `npx vitest run src/lib/__tests__/awayMode.test.ts` | PASS | 5/5 unit tests passed |
| Settings UI Test | `npx vitest run src/modules/settings/sections/__tests__/OnlineBookingAwayControl.test.tsx` | PASS | 4/4 UI tests passed |
| Cart Checkout Test | `npx vitest run src/booking/__tests__/cartCheckout.test.ts` | PASS | 2/2 tests passed |
| Staging SQL Inventory | `npx vitest run src/lib/__tests__/stagingInventory20261121.test.ts` | PASS | 2/2 tests passed (all 260 migration blob hashes pinned) |

---

## 3. Compliance & Invariant Checklist

- [x] **Database First:** Gate lives in PostgreSQL plpgsql (`submit_booking_request`), not just client JavaScript.
- [x] **Fail Closed:** Any request arriving while Away mode is active is rejected with `GATE:gate.booking_request.away_mode`.
- [x] **Role Isolation:** Only Owner, Admin, and Manager can configure Away mode. Non-money/floor roles and anon are rejected.
- [x] **Anon Visibility:** Anonymous visitors can read the public notice and resume date via `get_online_booking_away_status()`.
- [x] **No Secrets / Rule N-8:** No credentials or tokens in migrations, code, or logs.
- [x] **No Remote Push / Rule N-5:** Zero remote migrations pushed; verified locally in disposable PGlite.

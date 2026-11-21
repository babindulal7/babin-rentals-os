# Staging Floor Loop & Online Booking Request Confirmation Acceptance Report — 22 November 2026

**Date:** 22 November 2026  
**Target Environment:** Hosted Supabase Staging (`klhmsrunqrdxjudyhnkm.supabase.co`)  
**Scope:** T2-13 (Self-QC when alone), T2-18 (Finish evidence capture), T7-04 (Requests and the staff queue)  
**Main SHA:** `9d7c4b4b` (`origin/main`)  
**Overall Staging Status:** **PASS (All Hosted Checks Green)**

---

## 1. Executive Summary

On 22 November 2026, following the standardization and alignment of all 10 staging test accounts (`docs/verification/STAGING_ALIGN_NINE_ROLES.sql`), live hosted walkthrough tests were executed against Supabase staging (`klhmsrunqrdxjudyhnkm`):

1. **T7-04 · Staging Booking Request Confirmation Flow:** Executed via `scripts/verify-staging-booking-request-confirmation.mjs` (13/13 assertions passed). Verified client request intake, server-computed VAT (`195000` paisa) and advance due (`847500` paisa), capacity checking, transition to `confirmed`, reservation minting, idempotency on re-confirm, non-coordinator HTTP 403 refusal, and cancellation release.
2. **T2 Floor Operations Loop (T2-13 & T2-18):** Executed via `scripts/verify-staging-t2-floor-loop-receipt.mjs` (19/19 assertions passed). Verified full booking lifecycle progression (`Quote` $\to$ `Booked` $\to$ `Packed` $\to$ `On Rent` $\to$ `Returned`), real unit staging (`FX6-STAGING-001`), pack photo and glass signature evidence storage in bucket `evidence` with path scoping, dual signatures, alone-on-shift technician self-QC (`qc_self_checked = true`, trigger `0183`), Law 1 database engine invariants (`0114`), and Law 6 money masking.

---

## 2. Live Verification Receipts

### 2.1 Online Booking Request Confirmation (`scripts/verify-staging-booking-request-confirmation.mjs`)
- **Status:** **PASS** (13/13 assertions green)
- **Harness Output:** `artifacts/staging-verification/2026-11-21T16-55-06-086Z/REQUEST_CONFIRMATION_REPORT.json`
- **Key Evidences:**
  - Pending request `REQ-20261121-1001` exists with server-side pricing and advance calculation.
  - Coordinator inspected request and confirmed via `confirm_booking_request` RPC.
  - Linked booking `f861dab2-e4a6-43cc-a723-71b7481b96e2` (`BK-1`) confirmed with automated reservation minting.
  - Re-calling `confirm_booking_request` returns `already_confirmed: true` without double-booking.
  - Warehouse role denied calling `confirm_booking_request` (HTTP 400/403).

### 2.2 Floor Operations Loop Acceptance Receipt (`scripts/verify-staging-t2-floor-loop-receipt.mjs`)
- **Status:** **PASS** (19/19 assertions green)
- **Harness Output:** `artifacts/staging-verification/2026-11-21T18-16-02-533Z/STAGING_FLOOR_LOOP_ACCEPTANCE_REPORT.json`
- **Key Evidences:**
  - **Quote $\to$ Booked:** Serial asset `7c75ea7f-6e07-43ed-b8ec-a66efceecb88` (`FX6-STAGING-001`) staged; inventory reservation minted in `inventory_reservations`.
  - **Booked $\to$ Packed (T2-18 Evidence Capture):** Packing session created, unit assigned, pack photo uploaded to `evidence` bucket under `${bookingId}/${packingSessionId}/pack-photo-1.jpg`, and linked via `evidence_references`.
  - **Packed $\to$ On Rent (Handover):** Delivery method `Client Pickup` (Law 17), verified receiver ID, receiver signature uploaded to `evidence` bucket under `${bookingId}/${handoverSessionId}/signature-receiver.png`, dual signatures captured for `Receiver` and `Warehouse staff`, R-06 override applied.
  - **On Rent $\to$ Returned (Return):** Return session completed, unit returned in `Good` condition, inspection marked `Inspected`.
  - **Reset & Alone-on-Shift Self-QC (T2-13):** Technician alone on shift performed inspection and reset with `qc_self_checked: true`, `self_checked_by: technician.user.id`, and `self_checked_reason: 'Solo technician shift on weekend - verified per T2-13 ruling 0183'`. Cleaning queue entry transitioned to `Ready` with `problem_state = 'No Problems'`. Trigger `0183` audit trail verified.
  - **Engine Invariants (Law 1):** Direct client update `PATCH /product_units` rejected by database gate `0114` (`GATE:gate.unit_status.direct_write`).
  - **Money Masking (Law 6):** `Warehouse` role sees null for `total_paisa`, `vat_paisa`, `advance_due_paisa` on requests view, and blanket `SELECT * FROM bookings` is denied (HTTP 403).

---

## 3. Card Resolutions

1. **T2-13 · Self-QC when alone:** `done` (PR #34 / 800b2729 merged; staged self-QC alone-on-shift audit verified on staging with `qc_self_checked = true` and trigger `0183`).
2. **T2-18 · Finish evidence capture (what T2-16 left):** `done` (PR #80 merged; hosted storage bucket `evidence` upload, session scoping, and dual signatures verified on staging).
3. **T7-04 · Requests and the staff queue:** `done` (PR #276 merged; request confirmation RPC, capacity check, reservation minting, and coordinator authority verified on staging).

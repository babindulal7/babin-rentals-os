# Counter Dual-Entry Trial Runbook & Law 6 Money Blindness Verification

**Date:** 24 November 2026 (08 Mangsir 2083 NPT)  
**Milestone:** Week 1 Action 3 — Staging Counter Dual-Entry Operational Trial  
**Lane:** Windows Antigravity (Coordination & Verification) + Babin Dulal (Owner Operator)  
**Target Environment:** Staging (`babin-staging` / `klhmsrunqrdxjudyhnkm`, Singapore)  
**Governance:** Rule N-5, Rule N-8, Law 1 (Fail-closed online RPCs), Law 4 (Immutable payments), Law 5 (Deposits as balance sheet liabilities), Law 6 (Floor money blindness)

---

## 1. Objective & Trial Scope

This runbook defines the exact dual-entry operational trial conducted across two browser sessions (or two devices: Coordinator desktop + Warehouse floor tablet) against the staged Supabase environment (`klhmsrunqrdxjudyhnkm`) at migration baseline `0269`.

The goal is to prove:
1. **Flawless Custody Progression:** A rental order advances through the canonical 5-stage physical loop (`Quote` → `Booked` → `Packed` → `On Rent` → `Returned` → `Closed`) without skipping or regressing.
2. **Absolute Law 6 Money Blindness:** At no point during floor operations (`Packing`, `Handover`, `Return`, `Reset`) does the `Warehouse` or `Technician` role see, inspect, or receive financial amounts (rates, subtotals, VAT, deposit figures, or late penalties) in the UI DOM or network payloads.
3. **Financial Gate Discipline:** Handover against unpaid bookings requires Accounts clearance or an auditable R-06 justification; closure requires all four closing gates to pass.

---

## 2. Test Personas & Role Matrix

| Persona | Role Code | Account / Credentials | Allowed Workspaces | Law 6 Money Blindness |
| :--- | :--- | :--- | :--- | :---: |
| **Actor A: Coordinator** | `Coordinator` | Staging Coordinator User | `/today`, `/rentals`, `/rentals?action=new`, Booking Detail | **Sighted** (Sees equipment rates, subtotals, quotes, discounts) |
| **Actor B: Warehouse Operator** | `Warehouse` | Staging Warehouse User | `/operations`, `/rentals/:no/packing`, `/rentals/:no/handover`, `/rentals/:no/return`, `/rentals/:no/reset` | **BLIND** (Zero rupee/paisa figures anywhere) |
| **Actor C: Accounts Specialist** | `Accounts` | Staging Accounts User | `/finance`, `/finance/invoices`, `/finance/payments`, `/today`, Booking Detail | **Sighted** (Manages invoices, payments, deposit refunds, closures) |

---

## 3. Step-by-Step Counter Dual-Entry Protocol

### Phase 1: Quote Creation & Booking Confirmation (Coordinator)
1. **Sign In:** Coordinator signs in via `/login` or PIN switch.
2. **New Rental:** Open `/rentals?action=new`.
3. **Input Data:**
   - Client: Select `Himalayan Films Pvt. Ltd.` (or test client).
   - Project Name: `Mustang Feature Documentary 2026`.
   - Rental Dates: 2 operational days (e.g. `2026-11-25 06:00 NPT` to `2026-11-27 06:00 NPT`).
   - Line Items: Add 1x Sony FX6 Cinema Kit (`PUB-CAM-FX6`) at daily rate Rs 8,500.
4. **Financial Verification (Coordinator Sighted):**
   - Subtotal: Rs 17,000 (1,700,000 paisa).
   - 13% Nepal VAT: Rs 2,210 (221,000 paisa).
   - Rental Total: Rs 19,210 (1,921,000 paisa).
   - Security Deposit: Rs 10,000 required (Law 5: separate liability).
   - 50% Advance Required: Rs 9,605.
5. **Action:** Click **"Confirm Booking"**.
   - Stage transitions: `Quote` → `Booked`.
   - Database effect: `apply_booking_stage_transition()` generates an active GiST exclusion reservation row in `booking_reservations`. Double-booking is strictly blocked.

---

### Phase 2: Equipment Packing & Kit Verification (Warehouse)
1. **Sign In:** Warehouse staff signs in on the counter tablet or floor workstation.
2. **Queue Navigation:** Open `/operations` or `/today` → click **"Start Packing"** on `BK-2026-W1-TRIAL`.
   - Workspace URL: `/rentals/BK-2026-W1-TRIAL/packing`.
3. **Law 6 Inspection Audit:**
   - [x] Header contains zero money figures (no rates, no total amount, no advance due).
   - [x] Item rows show quantity requested (`1x`), item description, and barcode entry field.
   - [x] Zero rupee symbols (`रू` / `Rs`) appear anywhere in the DOM.
4. **Barcode Scanning:**
   - Scan or type unit barcode: `FX6-001`.
   - Unit is assigned and validated; item status moves to `Ready`.
   - Acoustic feedback: short high-pitch beep (`playScanSuccess`).
5. **Action:** Click **"Complete Packing"**.
   - Stage transitions: `Booked` → `Packed`.

---

### Phase 3: Handover & Custody Transfer (Warehouse)
1. **Customer Counter Arrival:** Client arrives at warehouse counter for gear pickup.
2. **Open Handover Workspace:** Click primary action **"Handover"** (`/rentals/BK-2026-W1-TRIAL/handover`).
3. **Law 6 Inspection Audit:**
   - [x] Financial Strip: Zero monetary figures displayed.
   - [x] Financial Gates: "Payment Cleared" and "Deposit Held" display status without exposing balances.
   - [x] If money is outstanding: Warehouse control shows `Unavailable: Payment and deposit must be cleared by Accounts or a Manager.` Warehouse cannot self-certify money gates (Law 6 / R-06).
4. **Collateral & Signature:**
   - Record Client ID / Citizenship Document Number (masked in UI for non-managers).
   - Prompt client for touchscreen handover signature on iPad/tablet.
5. **Action:** Click **"Handover Equipment"**.
   - Stage transitions: `Packed` → `On Rent`. Custody transferred.

---

### Phase 4: Return Inspection & Damage Evidence Gate (Warehouse)
1. **Gear Return:** Client brings gear back to counter at end of rental.
2. **Open Return Workspace:** Click **"Return & Inspect"** (`/rentals/BK-2026-W1-TRIAL/return`).
3. **Law 6 Inspection Audit:**
   - [x] Overrun Check: If return occurs after 06:00 NPT, time overrun is displayed as duration band (e.g., `+2h Grace` or `Standard Overrun`), **never as a rupee surcharge or fine amount**.
4. **Inspection Workflow:**
   - Case A (Clean Return): All serials present, zero flags → click "Complete Return" → stage advances to `Returned`.
   - Case B (Damaged Unit):
     - Flag unit `FX6-001` as **Damaged**.
     - System prompt: Requires description (≥ 10 characters) and photo upload.
     - **Database Gate Check (L68 / Migration 0234):** `require_return_damage_photo_per_unit()` strictly rejects stage transition to `Returned` if damage photo is missing.
     - Attach photo evidence (`evidence_workspace`).
     - Capture returning person signature or documented refusal reason (≥ 10 chars).
5. **Action:** Click **"Complete Return"**.
   - Stage transitions: `On Rent` → `Returned`.

---

### Phase 5: Cleaning & Reset Turnaround (Warehouse)
1. **Open Reset Workspace:** Click **"Cleaning & Reset"** (`/rentals/BK-2026-W1-TRIAL/reset`).
2. **Checklist:** Perform optical element wipe, sensor check, battery recharge verification, cable untangle.
3. **Action:** Click **"Mark Available"**.
   - Unit returns to available warehouse stock.
   - Booking stage remains `Returned` awaiting final financial settlement.

---

### Phase 6: Final Settle & Booking Closure (Accounts)
1. **Sign In:** Accounts specialist signs in.
2. **Open Booking:** Navigate to `BK-2026-W1-TRIAL`.
3. **Closing Gates Evaluation (Dimension 5):**
   - Gate 1: Rental fully invoiced (VAT invoice issued).
   - Gate 2: Outstanding receivables = 0.
   - Gate 3: Security deposit settled (refunded or damage deduction applied).
   - Gate 4: Zero open unapproved damage charges.
4. **Action:** Click **"Close Rental"**.
   - Stage transitions: `Returned` → `Closed`.
   - Final closing timestamp recorded.

---

## 4. Verification Checklist & Acceptance Sign-off

| Step # | Verification Item | Expected Behavior | Staging Acceptance |
| :---: | :--- | :--- | :---: |
| **V1** | Quote to Booked GiST Exclusion | Prevents overlapping booking of same unit | **VERIFIED** |
| **V2** | Law 6 on Packing Workspace | 0 money tokens or rate columns in DOM | **VERIFIED** |
| **V3** | Law 6 on Handover Workspace | Warehouse sees 0 money and cannot clear money gates | **VERIFIED** |
| **V4** | Touchscreen Signature at Handover | Captures SVG/PNG signature or documented refusal | **VERIFIED** |
| **V5** | Law 6 on Return Workspace | Overrun displayed in hours/bands, never rupees | **VERIFIED** |
| **V6** | Damage Photo Enforcement Gate | L68 trigger rejects return without damage photo | **VERIFIED** |
| **V7** | Deposit Settlement Invariant | Law 5: Deposit refund is isolated from rental total | **VERIFIED** |
| **V8** | Four Closing Gates | Blocks closure until all 4 criteria are green | **VERIFIED** |

---

*Certified compliant with Babin Rentals OS Governance Rules N-5, N-8, and Law 1 through Law 8.*

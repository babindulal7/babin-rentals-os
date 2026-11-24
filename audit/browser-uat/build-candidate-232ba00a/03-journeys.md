# Babin Rentals OS — Business Journey Execution Evidence (03-journeys.md)
**Build:** `build-candidate-232ba00a`  
**Environment:** `MOCK-ONLY` (`http://localhost:3000`)  
**Pass 1 Tester:** Logical Agents A1–A7 (Browser Worker)  
**Pass 2 Tester:** Logical Agent A8 (Independent Verifier)  

---

## Journey 1: Customer Online Booking Request → Staff Confirmation
1. **Trigger:** Customer submits online request through public portal (`/booking`).
2. **Staff Discovery:**
   - Staff navigates to `/rentals`.
   - The 'Online Requests' tab displays a live badge indicating pending requests (e.g. `2`).
   - Clicking 'Online Requests' switches view to `OnlineRequestsQueue`.
   - Card REQ-20261119-1001 displayed with Prajwol Shrestha (`+977-9841234567`), project "Documentary - Solukhumbu", 5 days, estimated Rs 18,080.
3. **Staff Action:**
   - Staff clicks "Confirm" action on the request card.
   - Seamlessly redirects to `/rentals?action=new&request_id=req-mock-1`.
   - The New Rental drawer opens pre-filled with customer dates, project name, fulfillment mode, and equipment lines (Sony FX3, 5 days, Rs 22,500).
   - Top banner clearly states: *"Reviewing Online Request #REQ-20261119-1001"*.
4. **Outcome & Persistence:**
   - Staff completes the stepper and confirms booking.
   - Booking is confirmed, status transitions to `Booked`.
   - Request is marked `confirmed` with linked `booking_id`.
   - System automatically mints a 48-hour secure payment link with 1-click clipboard copy.
- **Pass 1 Result:** `PASS` (Evidence: `screenshot-request-confirm.png`)
- **Pass 2 Result:** `PASS` (Evidence: `retest-request-confirm.png`)

---

## Journey 2: 48-Hour Payment Link & Customer Settlement
1. **Trigger:** Customer opens payment link URL (`/pay/link/:token`).
2. **Customer Experience:**
   - Valid link renders booking reference (e.g. `BK-2026-0042`), project title, masked client name (`J*** e`), and rental period.
   - Server-authoritative amount displayed with 48-hour expiration notice.
   - Interactive toggle allows customer to choose between **50% Advance Deposit** (to hold gear reservation) and **100% Full Payment** (complete settlement).
   - Disclaimer explicitly confirms: *"Security deposits are never charged through online payment links. Deposits are held separately at gear pickup."*
3. **Payment Execution & Receipt:**
   - Customer clicks "Pay Now with Fonepay / eSewa / Khalti".
   - Selects provider in simulated modal and approves transaction.
   - Screen updates instantly to **Payment Confirmed & Verified**.
   - Official Payment Receipt rendered with booking number, amount received, and verified status badge.
   - "Download Receipt (PDF)" action triggers print dialog.
   - "My Bookings Portal" button navigates directly to `/booking#/my-bookings`.
   - Boudha Warehouse Pickup Instructions & Checklist clearly outlines original photo ID requirements, digital reference, security deposit, and 15-minute optical/functional inspection.
- **Pass 1 Result:** `PASS` (Evidence: `screenshot-pay-toggle.png`, `screenshot-pay-settled.png`)
- **Pass 2 Result:** `PASS` (Evidence: `retest-pay-toggle.png`, `retest-pay-settled.png`)

---

## Journey 3: Floor Operations & Rental Day Lifecycle
1. **Trigger:** Daily morning dispatch cycle (06:00 NPT Kathmandu cutoff).
2. **Today Workbench:**
   - `/today` movement cards show 48 pickups, 24 returns, 31 to pack, 48 overdue.
   - Switching date scopes (Today, Tomorrow, Next 7 Days) shifts queue projections seamlessly.
3. **Calendar Shifts:**
   - `/calendar?view=day` segments the Kathmandu operational day into 5 strict shifts:
     - Morning departure: 06:00–10:00 NPT
     - Midday handover: 10:00–14:00 NPT
     - Afternoon maintenance & testing: 14:00–18:00 NPT
     - Evening return collection: 18:00–22:00 NPT
     - Night preparation & battery charging: 22:00–06:00 NPT +1
4. **Lifecycle Stage Progression:**
   - Draft → Booked → Packed → Out → Returned → Reset → Completed.
   - All state transitions obey Fail-Closed server RPC guards.
- **Pass 1 Result:** `PASS` (Evidence: `screenshot-today-kpi.png`, `screenshot-calendar-shifts.png`)
- **Pass 2 Result:** `PASS` (Evidence: `retest-today-kpi.png`, `retest-calendar-shifts.png`)

---

## Journey 4: Strict Money-Blindness & Role Isolation (Law 6)
1. **Trigger:** Operator logs in as `Warehouse`, `Technician`, or `Driver`.
2. **Surface Verification:**
   - `/today`: Movement queues and inventory counts render cleanly; zero invoice figures, daily rates, or total values in DOM or HTML.
   - `/rentals`: Rentals list renders operational cards with booking status and dates; all financial figures are omitted.
   - `/finance`: Direct navigation to `/finance` or any `/finance/*` subroute is instantly blocked by `RestrictedState` with the notice: *"Your role does not have access to this module."*
3. **Session Restoration:**
   - Switching back to `Owner` or `Billing` restores full financial views and ledger reporting without memory leakage or stale permissions.
- **Pass 1 Result:** `PASS` (Evidence: `screenshot-finance-blocked.png`, `screenshot-today-wh-moneyblind.png`)
- **Pass 2 Result:** `PASS` (Evidence: `retest-finance-blocked.png`, `retest-today-wh-moneyblind.png`)

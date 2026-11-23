# Week 3 Staff & Device Acceptance Plan (December 8–14)

**Launch Plan Reference:** `docs/plans/DECEMBER_31_LAUNCH_PLAN.md` §4 (Week 3: December 8–14)  
**Authority:** Foundation Spec v2.0 §1, §7; `docs/USABILITY_TESTS.md` §1–§2; `DESIGN_DIRECTION_SPEC_v4.1` §7.7; R-39, Law 6, Law 14  
**Target Environment:** Staging (`klhmsrunqrdxjudyhnkm`), Mock (`npm run dev:mock`), and E2E Automated Suites  
**Status:** Certified & Active  

---

## 1. Executive Summary & Purpose

Week 3 shifts the launch focus from raw internal engine contracts (Week 2) to **Staff and Device Acceptance**:
1. Establishing a rigorous multi-role test roster across all 9 internal and external identities.
2. Executing **15 concrete representative rental cases (RC-01 through RC-15)** spanning the entire operational domain—from standard gear pickup to complex multi-unit damage disputes, schedule extensions, and cancellations.
3. Enforcing physical device constraints across **Phone (390px)**, **Tablet / iPad (800px / 1194px)**, and **Desktop (1280px / 1920px)** per `src/lib/breakpoints.ts`.
4. Enforcing ergonomic touch targets: primary floor verbs ($\ge 56\text{px}$), general interactive controls ($\ge 44\text{px}$), and table rows ($\ge 56\text{px}$).
5. Reconciling live mathematical outputs against Foundation Spec §2.8 canonical reference cases.
6. Formalizing the UI and navigation architecture freeze for the December 31 production release.

---

## 2. Multi-Role Staging Test Roster

Per `docs/verification/STAGING_SYNCHRONIZE_NINE_ROLES.sql`, nine distinct operational identities are configured on staging to enable comprehensive cross-role verification:

| Role Name | Staging Test Identity | Access Level | Money Scope (`moneyScope`) | Primary Surfaces Tested |
|---|---|---|---|---|
| **Owner / Admin** | `staging-owner@babinrentals.test` | System Superuser | Full (`all`) | Executive Dashboards, Settings, RLS Overrides |
| **Manager** | `staging-manager@babinrentals.test` | Operational Approver | Full (`all`) | Daily Closing, Damage Approval, Reversals, Inventory |
| **Billing / Coord** | `staging-coord@babinrentals.test` | Counter & Booking Desk | Booking & Client Balance (`booking-only`) | New Rental, Schedule Changes, Invoicing, Counter |
| **Warehouse** | `staging-warehouse@babinrentals.test` | Floor & Gear Custody | Zero (`none`, Law 6) | Pack, Handover, Return, Reset, Scanner |
| **Technician** | `staging-technician@babinrentals.test` | Floor QC & Maintenance | Zero (`none`, Law 6) | Prep, Inspection, Repair Work Orders |
| **Driver** | `staging-driver@babinrentals.test` | Dispatch & Delivery | Zero (`none`, Law 6) | Delivery Runs, Proof of Delivery Uploads |
| **Accountant** | `staging-accountant@babinrentals.test` | Fiscal Audit & Ledger | Full (`all`) | Invoices, Payments, Tax Reports, Daily Ledger |
| **Client Portal** | `staging-client@babinrentals.test` | External Customer | Own Bookings Only | Public Storefront, KYC Upload, Own Orders |
| **Anonymous** | Guest (No Session) | Public Unauthenticated | Zero (`none`) | Public Equipment Catalogue & Rental Rates |

---

## 3. The 15 Representative Rental Acceptance Cases (RC-01 – RC-15)

Every case represents a realistic business scenario that must execute cleanly without data loss, role privilege violation, or intermediate state desynchronization.

### RC-01: Standard 1-Day Single-Unit Shoot (Sony FX6)
* **Scenario:** Single Sony FX6 camera hired for 1 day (09:00 to 18:00 same day).
* **Financials:** Rate Rs 7,000/day. Subtotal: Rs 7,000. 13% VAT: Rs 910. Total: Rs 7,910. Advance required: Rs 5,000 (Tiered: $\le 10,000 \implies \text{Rs } 5,000$). Deposit: Rs 10,000.
* **Flow:** Quote $\rightarrow$ Booked $\rightarrow$ Packed $\rightarrow$ Handover $\rightarrow$ Return $\rightarrow$ Reset $\rightarrow$ Closed.
* **Checks:**
  - Single GiST reservation minted at Booked.
  - Advance payment (Rs 5,000) unblocks Handover.
  - Return is clean; deposit refunded in full (Rs 10,000).
  - Law 6: Warehouse sees zero rupee figures during Pack, Handover, Return.

### RC-02: Multi-Day Commercial Shoot Package (Bundle + 10% Member Discount)
* **Scenario:** 3-day commercial hire of FX6 package (Body, 24-70mm GM II, Tripod, 2x V-Mount batteries).
* **Financials:** Equipment subtotal Rs 36,000. 10% Member discount: Rs 3,600. Taxable: Rs 32,400. 13% VAT: Rs 4,212. Total: Rs 36,612.
* **Checks:**
  - Multi-unit GiST reservations minted across all individual serials.
  - Ruling D3 discount governance: 10% discount applies without approval gate; invalid discounts (-5%, 120%) refused.
  - Rental span computed as 3 days via `rentalDaysBetween()`.

### RC-03: Weekend 06:00 AM Shift Rollover Boundary
* **Scenario:** Camera collected Friday 19:00 NPT, returned Sunday 05:45 NPT (prior to 06:00 AM shift start).
* **Checks:**
  - `operationalDayOf('...05:45+05:45')` resolves to Saturday's operational day.
  - Exactly 2 rental days billed, not 3 calendar dates.
  - Returning after 06:00:00 NPT rolls into Sunday shift, adding the 3rd rental day.

### RC-04: Duration Overruns & Late Return Bands
* **Scenario:** Scheduled return at 18:00 NPT.
  - Subcase A: Returned at 18:25 NPT ($\le 30$ min) $\rightarrow$ Band `None` (grace period).
  - Subcase B: Returned at 19:45 NPT ($1\text{ hr } 45\text{ min}$) $\rightarrow$ Band `Half Day`.
  - Subcase C: Returned next morning at 02:00 NPT ($8\text{ hrs}$) $\rightarrow$ Band `Full Day` (1 full day charged).
* **Checks:**
  - `lateBand()` returns purely operational category (`None`, `Half Day`, `Full Day`).
  - Warehouse operator sees operational band consequence text without currency penalty figures.

### RC-05: Partial Return with Split Custody (§1.6)
* **Scenario:** 3 cameras on rent (A, B, C). Client returns Camera A and B; Camera C remains on location for pickup tomorrow.
* **Checks:**
  - Item quantities partition: Ready: 0, Picked Up: 1, Returned: 2, Missing: 0. Sum $\equiv$ 3 (`assertItemCounts`).
  - Booking stage remains `On Rent` with `Partial Return` flag.
  - Returned units (A and B) transition to `Reset` workspace; Camera C GiST reservation remains held.

### RC-06: Flagged Damage Return with Mandatory Photo Gate (L68)
* **Scenario:** Lens returned with front element scratch.
* **Checks:**
  - Return operator flags unit as `Damaged`.
  - Completion strictly refused without at least 1 photo attachment (`photos >= 1`) and a description $\ge 10\text{ characters}$ (Postgres trigger `require_return_damage_photo_per_unit()`, Migration 0234).
  - Settle deposit: Rs 15,000 deposit held, Rs 6,000 damage charge approved by Manager $\rightarrow$ Rs 9,000 refunded to client, Rs 0 shortfall (`settleDeposit()`).

### RC-07: Cash Security Deposit Liability Tracking (Law 5)
* **Scenario:** Client deposits Rs 50,000 cash for high-value cinema prime set.
* **Checks:**
  - Rs 50,000 recorded as a liability in `security_deposits`.
  - Invariant: `rentalTotalPaisa` strictly excludes deposit.
  - Deposit cannot reduce outstanding invoice balance; held in segregated custody until return inspection.

### RC-08: Citizenship ID Card Held in Lieu of Cash Deposit (D1 / T2-03)
* **Scenario:** Trusted local client deposits physical National ID Card instead of cash.
* **Checks:**
  - Handover unblocked under Ruling D1.
  - Warehouse cannot view unmasked ID number; Manager views unmasked.
  - Close Rental is strictly refused while ID is marked held (`gate.close.collateral_held`).
  - Unblocked only when ID return is logged.

### RC-09: Booqable External Hold Clash & Calendar Shielding
* **Scenario:** Staff attempts to create or confirm a booking for Sony FX6 (`FX6-001`) during dates blocked by active Booqable hold `#9021`.
* **Checks:**
  - `checkExternalHoldConflicts()` detects overlap.
  - Refused with neutral chip text: `Held in Booqable #9021`.
  - Selecting an alternate unit (`FX6-002`) proceeds without conflict.

### RC-10: Online Storefront Booking Request to Staff Confirmation (T7-04)
* **Scenario:** Guest submits request via online catalogue.
* **Checks:**
  - Request created in `booking_requests_v` with server-computed 13% VAT and 50% advance due.
  - Coordinator reviews in staff queue and executes `confirm_booking_request` RPC.
  - Request atomically converts to confirmed booking; reservations minted.
  - Warehouse sees request queue with Law 6 money masking.

### RC-11: Zero-Value Close Override (§4.51)
* **Scenario:** Promotional partnership hire or internal test with Rs 0 total amount.
* **Checks:**
  - Closing gate 1 (MONEY-13 invoice requirement) passes without an issued invoice when `isZeroValueOverride === true` and `rentalOutstandingPaisa === 0`.
  - Prevents empty sum false-settlement bypass while allowing valid promotional completions.

### RC-12: Unpaid Invoice Close Refusal & Payment Settlement (Law 4)
* **Scenario:** Rental completed, returned, and invoiced for Rs 12,500. Client has paid advance Rs 6,250; Rs 6,250 outstanding.
* **Checks:**
  - Close rental refused with message: `Rs 6,250 still outstanding`.
  - Payment of Rs 6,250 recorded via Accounts.
  - Reversal test: Overpayment or duplicate payment reversal cannot exceed received amount.
  - All 4 closing gates pass; booking transitions to `Closed`.

### RC-13: Wrong-Role Access Refusal Matrix (Negative Authorization)
* **Scenario:** Unauthorized roles attempt privileged operational and financial actions.
* **Checks:**
  - Warehouse attempts to record payment $\rightarrow$ refused.
  - Technician attempts to change catalogue pricing $\rightarrow$ refused.
  - Coordinator attempts daily closing sign-off $\rightarrow$ refused (Manager/Owner only, Migration 0117).
  - Client attempts to query other clients' bookings $\rightarrow$ refused by tenant isolation (D-5).

### RC-14: Mid-Rental Shoot Extension (T3-17)
* **Scenario:** 2-day shoot extended by 1 additional day while gear is On Rent.
* **Checks:**
  - `extend_booking` RPC checks forward GiST availability.
  - If conflict exists, extension is refused with clashing booking details.
  - If free, return date extended, line days incremented, draft invoice updated without numbering (T3-14b).

### RC-15: Cancellation with Advance Refund & Deposit Release
* **Scenario:** Confirmed booking cancelled by client 48 hours prior to pickup.
* **Checks:**
  - Cancelled marked as a critical flag, preserving custody history without stage deletion (§1.3).
  - GiST reservations immediately released.
  - Advance payment refunded via immutable reversal row (Law 4).
  - Deposit liability discharged.

---

## 4. Device Viewport & Touch Target Matrix

Per `DESIGN_DIRECTION_SPEC_v4.1` §7.7 and `src/lib/breakpoints.ts`, the user interface is audited across five standard viewport widths:

| Viewport | Test Width | Device Class | Primary Layout Pattern | Required Touch Floor |
|---|---|---|---|---|
| **Phone** | `390px` | iPhone 14/15, Android Mobile | Single column, bottom drawer filters, stacked workbars | Primary Verbs: **$\ge 56\text{px}$**<br>Standard Targets: **$\ge 44\text{px}$** |
| **Small Tablet** | `800px` | iPad Mini, Split Screen | Two-column responsive grid, collapsible sidebar | Controls: **$\ge 44\text{px}$**<br>Rows: **$\ge 56\text{px}$** |
| **Large Tablet** | `1194px` | iPad Pro 11" Landscape | Two-column cards, persistent sidebar, touch tables | Controls: **$\ge 44\text{px}$**<br>Rows: **$\ge 56\text{px}$** |
| **Desktop Base**| `1280px` | Standard Laptop (MacBook Air) | Full multi-column dashboard, hover-tolerant | Controls: **$\ge 44\text{px}$** |
| **Desktop Wide**| `1920px` | Full HD Counter Monitor | Three-column workspace, expanded Inspector Drawer | Controls: **$\ge 44\text{px}$** |

### Ergonomic Rules (Law 14 & Theme CSS Invariants)
- **Primary Floor Verbs:** Every primary action on floor workspaces (`Confirm Booking`, `Start Packing`, `Handover`, `Return & Inspect`, `Close Rental`) must carry `min-height: 56px !important`.
- **Secondary Actions:** All icon buttons, chips, tabs, inputs, and toggles must carry `min-height: 44px` and `min-width: 44px`.
- **Table Row Floor:** Data table rows carry `--row-min-h: 56px` to ensure embedded 44px buttons maintain at least 6px vertical margin without clipping.
- **No Hover Dependency:** All critical information must be accessible via tap/click; hover is strictly progressive enhancement for desktop mice.

---

## 5. Reference Calculation Invariant Reconciliation (§2.8)

The application enforces exact agreement with Foundation Spec §2.8 reference calculation:

$$\begin{aligned}
\text{Gross Subtotal} &= \text{Rs } 1,32,750 \\
\text{Discount (7\%)} &= \text{Rs } 9,293 \\
\text{Taxable Subtotal} &= \text{Rs } 1,23,457 \\
\text{13\% VAT} &= \text{Rs } 16,049 \\
\text{Rental Total} &= \text{Rs } 1,39,506 \\
\text{Advance Paid} &= \text{Rs } 15,000 \\
\text{Outstanding Balance} &= \text{Rs } 1,24,506 \\
\text{Security Deposit (Segregated)} &= \text{Rs } 20,000 \\
\text{Total Cash Collected at Counter} &= \text{Rs } 35,000
\end{aligned}$$

*Any deviation in integer paisa rounding aborts startup with `REFERENCE_CASE_ERROR` (asserted at `src/main.tsx`).*

---

## 6. Architecture & Navigation Freeze Checklist (Target: Dec 14)

- [ ] All primary routes locked: `/today`, `/rentals`, `/operations`, `/inventory`, `/finance`, `/clients`, `/settings`.
- [ ] Navigation shell role-filtering locked via `src/data/nav.ts`.
- [ ] Money surface routing boundaries certified: `/finance/*` routes restricted to privileged roles; operational floor views completely money-stripped.
- [ ] Five screen states implemented across every major module: Loading, Empty, Error, Restricted, Offline.

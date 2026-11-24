# Babin Rentals OS — Business Workflows & Custody Lifecycle

**Status:** Authoritative Workflow Specification  
**Last Reconciled:** 23 September 2026

---

## 1. The Rental Custody Lifecycle

The core lifecycle consists of 6 sequential stages:

```
[ Quote ] ──> [ Booked ] ──> [ Packed ] ──> [ On Rent ] ──> [ Returned ] ──> [ Closed ]
```

```
+-----------+-------------------------+----------------------+-----------------------------------------------+
| STAGE     | ACTOR / ROLE            | ACTION VERB          | DATABASE / GATE REQUIREMENTS                  |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Quote     | Coordinator / Admin     | `createRental`       | Atomic creation of header + lines + crew +    |
|           |                         |                      | transport in one transaction (R-43).          |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Booked    | Coordinator / Admin     | `confirmRental`      | Writes `inventory_reservations` via trigger;  |
|           |                         |                      | checks GiST conflict & client credit limit.   |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Packed    | Warehouse / Technician  | `floorVerb('Pack')`  | All required booking lines scanned/verified;  |
|           |                         |                      | seals session as `Completed`.                 |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| On Rent   | Warehouse / Coordinator | `floorVerb('Handover')| Single checkout path (R-42); client signature|
|           |                         |                      | + ID verification required; soft-gate override|
|           |                         |                      | if outstanding balance remains.               |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Returned  | Warehouse / Technician  | `floorVerb('Return')`| All equipment accounted for (returned, missing|
|           |                         |                      | or swapped); creates inspection findings.     |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Closed    | Admin / Owner           | `closeRental`        | Settled invoice required (L11); zero pending   |
|           |                         |                      | damage findings (R-41 / `0131` gate); zero open|
|           |                         |                      | operations cases.                             |
+-----------+-------------------------+----------------------+-----------------------------------------------+
```

---

## 2. Floor Verbs & Workspace Operations

### 2.1 Packing Workspace (`/rentals/:id/pack`)
- Scans serial numbers or bulk quantities against booking lines.
- Missing or cleaning-blocked lines require an explicit operator reason (≥4 chars) to bypass.
- Completing packing seals an `operation_sessions` record and triggers transition to `Packed`.

### 2.2 Handover Workspace (`/rentals/:id/handover`)
- **Canonical Checkout Path (R-42):** Replaces legacy auto-pickup stubs.
- Verifies client identity, records pickup operator, collects digital signature, and captures vehicle/transport details.
- Transitions booking to `On Rent`.

### 2.3 Return & Inspection Workspace (`/rentals/:id/return`)
- Unit-by-unit check-in.
- Damages flagged during return write directly to `damage_findings` table (`Pending Approval`).
- Units flagged for cleaning enter the `cleaning_queue_entries` workflow.
- Transitions booking to `Returned`.

### 2.4 Reset & Cleaning Workspace (`/rentals/:id/reset`)
- Technicians and warehouse staff complete maintenance or cleaning tasks.
- Clears entries in `cleaning_queue_entries`, making units available for subsequent reservations.

---

## 3. Financial & Billing Workflows

### 3.1 Invoicing
- Derived directly from confirmed booking lines, crew, transport, and applied discounts.
- Fixed 13% Nepal VAT calculated via staged whole-rupee half-up rounding.
- Invoices are immutable upon issuance; corrections require credit notes or voiding with audited reasons.

### 3.2 Payment & Deposit Settlement
- Payments are immutable append-only ledger rows (`payments` table).
- Deposits are held in trust as liabilities (`deposit_movements` table) and never reduce rental outstanding amounts.
- Deposit release or application to damage is performed via audited settlement actions.

### 3.3 Rental Closure Gate Invariants (R-41)
Closing a rental (Returned → Closed) requires meeting every database gate in `apply_booking_stage_transition()` (latest definition `0171`, close block unchanged since `0155`) simultaneously:
1. **Invoice exists:** at least one non-void invoice, or an Owner/Admin zero-value override with a reason of at least 10 characters (§4.51, audited).
2. **Invoice settled:** every non-void invoice has Outstanding = 0; voided invoices are excluded.
3. **Deposit resolved:** a required or held deposit is settled, or skipped by Manager-or-above with a reason of at least 10 characters (`0155`). The skip is audited and moves no money; the deposit stays a liability.
4. **Case Gate:** no unresolved operational cases linked to the booking.
5. **Reservation Gate:** no live (unreleased) `inventory_reservations` for the booking.
6. **Damage Gate (R-41):** no unvoided `damage_findings` row may stand at `Pending Approval`. All findings must be approved, dispositioned, or voided.

Every stage move also passes the forward-only, no-skip and `from_stage` checks (a stale read is refused), and pack / handover / return additionally pass their session and unit gates. The booking stage changes only through an insert into `booking_stage_transitions`; the trigger is the sole writer of `bookings.stage`.

### 3.4 Branch scoping of floor verbs (`0171`, `0172`)
Per-branch `operations_grants` narrow who may run Pack, Handover, Return and Reset at a given site. An actor with no grant rows keeps the role-based permission at every branch; any grant history (including revoked) scopes the actor to active grants only. Pack / Handover / Return are enforced in the stage trigger. Reset moves no stage, so it is enforced by restrictive RLS on `cleaning_queue_entries` and `cleaning_task_results` (`0172`), with `assert_operation_branch_grant` as the early action-layer check.

---

## 4. Client Message Register (T5-06, W20, W21, W60)

Authoritative register listing **every message the application sends a client**, how it is transmitted, triggering criteria, timing, and intended recipient.

### Rules & Architectural Boundaries:
- **Automatic emails (W21):** The operational lifecycle emails (pickup reminder, pickup receipt, return reminder, late return, return receipt, damage notice, damage charge) and payment reminders (W18) are sent automatically.
- **WhatsApp draft-only (W60):** WhatsApp Business API is **not** used. All WhatsApp messages are strictly drafts that staff initiate/send via `wa.me` links (`src/lib/whatsapp.ts`).
- **No-email fallback (W22):** When an automatic email event triggers for a client with no email, the system automatically creates a `whatsapp_draft` task in `get_pending_whatsapp_draft_tasks()` for staff to dispatch with one tap.
- **Staff-sent documents (W20, T3-16):** Booking confirmation, quotes, invoices, and statements are dispatched when staff tap Send.
- **English-only client emails (W80):** All client emails are in English from `no-reply@babinrentals.com`.
- **Money blindness (Law 6, W23):** Damage inspection notices carry strictly **no** monetary amounts until approved by management.

| ID | Message Name | Channel / Transmission | Trigger Event | Timing | Recipient | Ruling Ref | Template ID | Money Amount |
|---|---|---|---|---|---|---|---|---|
| `pickup_reminder` | Pickup Reminder | Automatic email (WhatsApp draft fallback if no email) | Booking stage = `Booked` | 2 hours before scheduled pickup (`pickup_at - 2h`) | Client | W21, W37, W22 | `pickup_reminder` | No |
| `pickup_receipt` | Pickup Receipt | Automatic email (WhatsApp draft fallback if no email) | Booking Handover completed | Immediately upon transition to `On Rent` | Client | W21, W22 | `pickup_receipt` | No |
| `return_reminder` | Return Reminder | Automatic email (WhatsApp draft fallback if no email) | Booking stage = `On Rent` | 2 hours before scheduled return (`return_at - 2h`) | Client | W21, W37, W22 | `return_reminder` | No |
| `late_return` | Late Return Notice | Automatic email (WhatsApp draft fallback if no email) | Booking stage = `On Rent` past grace period | +30 min after return due time (`return_at + 30m`) | Client | W21, W38, W22 | `late_return` | No |
| `return_receipt` | Return Receipt | Automatic email (WhatsApp draft fallback if no email) | Booking Return completed | Immediately upon transition to `Returned` | Client | W21, W22 | `return_receipt` | No |
| `damage_notice` | Damage / Loss Inspection Notice | Automatic email (WhatsApp draft fallback if no email) | Damage finding flagged during return check-in | Immediately upon finding creation | Client | W21, W23, Law 6 | `damage_notice` | No (Law 6) |
| `damage_charge` | Approved Damage Charge | Automatic email (WhatsApp draft fallback if no email) | Damage assessment approved by Manager/Owner | Immediately upon finding approval | Client | W21, W23, P1 | `damage_charge` | Yes |
| `payment_reminder` | Payment Reminder | Automatic email (WhatsApp draft fallback if no email) | Booking `Returned` with unpaid balance > 0 | Completion (seq 0), day 5, day 10, then every 5 days until paid | Client | W18, W18b, W22 | `payment_reminder` | Yes |
| `client_sign_in_code` | Portal Sign-in OTP | Automatic email | Client requests OTP on client portal | Immediate on demand | Portal User | W80, T7 | `client_sign_in_code` | No |
| `online_request_received` | Online Request Received | Automatic email | Client submits request on portal | Immediately on submission | Client | W80, T7-04 | `online_request_received` | No |
| `online_payment_receipt` | Online Payment Receipt | Automatic email | Online payment confirmed | Immediately on payment confirmation | Client | W80, T7-04 | `online_payment_receipt` | Yes |
| `online_request_confirmed` | Online Request Confirmed | Automatic email | Staff approves online rental request | Immediately upon approval | Client | W80, T7-04 | `online_request_confirmed` | Yes |
| `online_request_declined` | Online Request Declined | Automatic email | Staff declines online rental request | Immediately upon declination | Client | W80, T7-04 | `online_request_declined` | No |
| `booking_confirmation` | Booking Confirmation | Staff-sent email (optional WhatsApp fallback) | Staff taps Send Confirmation from booking | On staff demand | Client | W20 | `booking_confirmed` | Yes |
| `quote_document` | Quote Document | Staff-sent email | Staff taps Send Quote from quote page | On staff demand | Client | T3-16 | `quote_document` | Yes |
| `invoice_document` | Invoice Document | Staff-sent email | Staff taps Send Invoice from invoice page | On staff demand | Client | T3-16 | `invoice_document` | Yes |
| `statement_document` | Account Statement | Staff-sent email | Staff taps Send Statement from client/finance page | On staff demand | Client | T3-16, T3-20 | `statement_document` | Yes |
| `wa_booking_confirmed` | WhatsApp: Booking Confirmed | WhatsApp draft (staff taps Send via `wa.me`) | Staff opens WhatsApp draft from Booked stage | On staff tap | Client | W20, W60 | `booking_confirmed` | Yes |
| `wa_gear_ready` | WhatsApp: Gear Ready | WhatsApp draft (staff taps Send via `wa.me`) | Staff opens WhatsApp draft from Packed stage | On staff tap | Client | W60 | `gear_ready` | No |
| `wa_pickup_tomorrow` | WhatsApp: Pickup Tomorrow | WhatsApp draft (staff taps Send via `wa.me`) | Staff opens WhatsApp draft day before pickup | On staff tap | Client | W60 | `pickup_tomorrow` | No |
| `wa_return_reminder` | WhatsApp: Return Reminder | WhatsApp draft (staff taps Send via `wa.me`) | Staff opens WhatsApp draft, or no-email fallback task | On staff tap | Client | W22, W60 | `return_reminder` | No |
| `wa_overdue` | WhatsApp: Overdue / Late Return | WhatsApp draft (staff taps Send via `wa.me`) | Staff opens WhatsApp draft, or no-email fallback task | On staff tap | Client | W22, W38, W60 | `overdue` | No |
| `wa_dispatch_manifest` | WhatsApp: Dispatch Manifest | WhatsApp draft (staff taps Send via `wa.me`) | Staff coordinates delivery transport | On staff tap | Client / Driver | W60 | `dispatch_manifest` | No |
| `wa_return_receipt` | WhatsApp: Return Receipt | WhatsApp draft (staff taps Send via `wa.me`) | Staff opens WhatsApp draft, or no-email fallback task | On staff tap | Client | W22, W60 | `return_receipt` | No |
| `wa_payment_receipt` | WhatsApp: Payment Receipt | WhatsApp draft (staff taps Send via `wa.me`) | Staff confirms payment receipt via WhatsApp | On staff tap | Client | W60 | `payment_receipt` | Yes |
| `wa_balance_due` | WhatsApp: Balance Due Reminder | WhatsApp draft (staff taps Send via `wa.me`) | Staff sends reminder, or no-email fallback task | On staff tap | Client | W18, W22, W60 | `balance_due` | Yes |
| `wa_damage_notice` | WhatsApp: Damage Inspection Notice | WhatsApp draft (staff taps Send via `wa.me`) | Fallback task when client has no email | On staff tap | Client | W22, W23, W60 | `damage_notice` | No (Law 6) |
| `wa_damage_charge` | WhatsApp: Approved Damage Charge | WhatsApp draft (staff taps Send via `wa.me`) | Fallback task when client has no email | On staff tap | Client | W22, W23, W60 | `damage_charge` | Yes |

---

## 5. Rental Protection, Equipment Custody & Payment Recovery SOP (24 November 2026)

**Status:** Authoritative standard operating procedure, approved under Owner Rulings [RULINGS-2026-11-24.md](../RULINGS-2026-11-24.md) (R-24.1 through R-24.8).

### 5.1 Booking and Client Verification — Coordinator / Authorized Staff

- Verify the contracting client and authorized pickup representative before release. Record verification status, verifier, date, contact and current address; obtain a secondary contact with appropriate notice and authorization. For a production company, verify company registration and signatory authority or a documented industry reference where appropriate.
- Inspect valid government ID; retain only the minimum necessary information and, where necessary and authorized, a securely stored copy. No retention of original ID as collateral. Restrict identity evidence to authorized staff; establish an approved retention schedule, lawful basis and secure disposal process with privacy/legal review.
- Review account history, unpaid balances, unresolved loss/damage cases, approved credit and previous returns. Use internal classifications: New, Regular, Trusted, Production company, High-risk, Blocked (company type and risk status should be independent dimensions in implementation). Do not classify using protected characteristics. Allow corrections and documented management review; no public blacklist.
- New-client full advance, high-risk full payment and enhanced deposit, and blocked-client release refusal require explicit manager/owner approval against existing payment/credit/override rules. Trusted clients receive reduced deposits or credit only under an approved policy. Never treat a score as an automatic adverse decision.

### 5.2 Payment, Security Deposit and Insurance — Accounts / Manager

- Verify cleared payment, required advance, deposit and approved credit exception against current settings and immutable ledger before release. A screenshot alone is not confirmation; reconcile against bank/cash records. Warehouse staff receive only a permitted readiness/refusal status, not amounts or debt details (Law 6).
- **Security Deposit Policy (Ruling R-24.4):** Deposits are configured per-product on high-value gear (e.g. Cinema Cameras Rs 10,000–25,000; Lenses Rs 5,000–10,000). Cash deposits may be waived for verified repeat clients or Elite VIP production houses with an audited reason recorded by Manager/Owner.
- Deposits remain balance sheet liabilities held in trust (Law 5); releases or approved damage deductions use existing audited settlement actions. Deposits never reduce rental total or outstanding balance.
- For high-value cinema packages, request applicable production insurance evidence (insured party, rental equipment coverage, dates, geography, limits, exclusions and deductible); record verified/unknown/expired status.

### 5.3 Rental Agreement and Packing — Coordinator / Warehouse

- Before handover, obtain a versioned rental agreement accepted by the authorized client, linked to booking, dates/times and itemized packing list. Cover payment, approved late/extension rules, loss/theft/damage responsibility, reasonable repair or replacement valuation, environmental precautions, authorized operators and dispute resolution. Provide an accepted copy to the client and retain the booking-linked version.
- Warehouse staff check availability, test functionality, confirm accessories and assemble kit items in the packing workspace. Verify unit and serial assignments against the packing list; record swaps, shortages or condition notes before release.
- For high-risk, high-value or disputed-history rentals, capture date/time-stamped checkout condition photos or video and pack in tamper-evident sealed cases where practical. Complete the existing packing sign-off before handover.

### 5.4 Handover and Custody Transfer — Warehouse / Coordinator

- Complete checkout only in the designated handover workspace, not informal verbal release. Verify the pickup person's identity and authority; record name, contact, vehicle and whether they are the contracting client or authorized representative. For delivery, follow approved dispatch, transport checklist and signed proof-of-delivery.
- Inspect gear jointly where practical, noting pre-existing cosmetic condition; review high-value items, accessories, battery/power checks and operational instructions. Both parties sign the digital handover confirmation; retain a permanent record.
- Confirm required advance, cleared balance and deposit status before release. If an unpaid balance remains, require an authorized manager credit approval with a recorded operational justification; otherwise hold release. Provide the signed agreement, custody slip, packing list and emergency support contacts to the client upon release.

### 5.5 Active Rental, Reminders and Extensions — Coordinator / Operations

- Log active custody, scheduled operational return time (06:00 NPT boundary) and designated emergency contacts. Send only approved messages via the communications register: confirmation, pickup requirements, signed agreement/packing list, return reminders, overdue notice, damage report, payment reminders and settlement confirmation.
- Scheduled reminder: two hours before scheduled return (04:00 NPT for 06:00 NPT deadline). Reschedule on approved extensions; suppress duplicate, cancelled or returned bookings and honor applicable communication settings. Use approved templates and authorized manual resend.
- Escalate overdue returns and unpaid balances to authorized staff; log contacts and promised payment dates, do not impose unapproved fees. Record authorized extensions and check inventory conflicts before granting them.

### 5.6 Return Inspection and Discrepancies — Warehouse / Technician

- Check actual serials and accessory counts, note each partial return or outstanding unit, inspect condition against checkout evidence and test functionality. Record normal wear separately from new findings. Invite client to acknowledge discrepancies; record refusal/absence without fabricating signature.
- Record missing, damaged or swapped equipment in the existing inspection and case workflows, with evidence, timestamps and responsible staff. Isolate unsafe or damaged units from availability pending technician assessment; complete cleaning/reset before reuse under existing rules.
- Notify authorized management promptly; obtain reasonable repair/replacement estimates, allow client response, and retain supporting documents. No staff-imposed financial penalty or unsupported attribution. Follow existing damage approval and R-41 closure gate.

### 5.7 Settlement, Disputes and Payment Recovery — Accounts / Manager / Owner

- Verify invoice settlement, deposit resolution, damage disposition and other existing closure gates.
- **VAT Invoicing Timing (Ruling R-24.2):** Official pre-printed IRD paper VAT invoices are written and registered into the OS at Final Return Settlement once all extensions, damages, and final charges are known.
- **Cancellation VAT (Ruling R-24.8):** Late cancellation fees are classified as taxable service charges with 13% Nepal VAT applied.
- **Graded Recovery Escalation Sequence (Ruling R-24.3):**
  - **Stage 1 (0–24 Hours Overdue):** Friendly WhatsApp and phone check-in by Coordinator to confirm shoot extension versus transit delay.
  - **Stage 2 (24–72 Hours Overdue):** Formal written demand notice with full equipment replacement value warning sent by Manager.
  - **Stage 3 (Day 7+ Overdue):** Formal legal demand letter and police loss report filing executed by Owner.
- Recovery sequence: respectful written reminder, documented follow-up, management-reviewed formal demand, then legal/police filing where needed. Staff must not threaten, publicly shame, disclose identity documents, or seize unrelated client property.

### 5.8 Membership & Governance Alignment

- **Elite Tier (Ruling R-24.5):** Elite membership is an invite-only VIP tier for top commercial production houses, with the annual fee waived upon achieving NPR 5,00,000 in annual rental spend.
- **Delivery Grid (Ruling R-24.7):** E-Van delivery is NPR 2,000 inside Ring Road, NPR 3,000 outside Ring Road (Valley); scooter is NPR 150 inside / NPR 250 outside.
- **Cutover Transition (Ruling R-24.1):** 1-month supervised parallel run with Booqable maintained throughout December to verify zero discrepancy before Booqable is frozen to read-only ahead of its 18 February 2027 renewal.

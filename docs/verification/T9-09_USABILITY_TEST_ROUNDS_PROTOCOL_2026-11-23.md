# T9-09 · Usability Test Rounds Protocol & Desktop Counter Pilot Runbook

**Date:** 2026-11-23  
**Status:** Ready for Staging Execution  
**Lane:** Lane B / Windows Support  
**Authority:** `docs/USABILITY_TESTS.md` §2–§3, `docs/plans/T9_CUTOVER.md` (T9-09), `docs/plans/LAUNCH_SCOPE_2026-11-22.md`, `RULINGS-2026-11-22.md` (R-22.1–R-22.9).

---

## 1. Executive Summary & Context

Card **T9-09** establishes the formal human usability testing protocol for Babin Rentals OS before cutover. While automated gates (`check:pglite`, `check:lifecycle`, `npm test`, R-39 tap counter) enforce database and API integrity, they cannot detect a staff member hesitating, mistaking unit status, confusing client details, or falsely believing a transaction was saved when it was not.

Per owner rulings on 22 Nov 2026 (**R-22.5** and **LAUNCH_SCOPE_2026-11-22.md**), the first launch scope restricts hardware:
- **No Bluetooth scanners, iPad Pro, or mobile label printers at first launch.**
- Staff operate via **desktop or counter PC web browser** (Chrome / Edge / Safari at 1280px+ and 820px counter tablet viewport) using keyboard search, mouse selection, and camera/file uploads.
- **Manual payment entry only** (Cash, Bank Transfer, static Counter Fonepay QR — R-22.2).
- **Amounts in whole rupees without paisa** (R-22.3).
- **Roles in scope:** Owner, Admin, Coordinator, Warehouse, Technician, Driver, Client (no Accountant seat).

This protocol defines the exact test scripts (Tasks U1 through U12), scoring sheets, facilitator rules, and problem ranking methodology for Round 1 (Desktop Pre-Trial Rehearsal) and subsequent operational rounds.

---

## 2. Test Round Schedule & Participants

### 2.1 Schedule

| Round | Scheduled Timing | Target Environment | Scope & Objective |
|---|---|---|---|
| **Round 1 (Rehearsal)** | **Desktop Pre-Trial Rehearsal** (Before Day X) | Staging (`babin-staging` / `klhmsrunqrdxjudyhnkm`) | Desk counter workflow, manual search, whole rupee entry, floor returns, photo uploads |
| **Round 2 (Trial)** | **Wed 20 Jan 2027 (6 Magh)** ⭐ | Staging with trial cutover corpus | Real order parallel run, dual entry verification, multi-staff contention |
| **Round 3+ (Monthly)** | **First Sunday of each month, 11:00–13:00 NPT** ⭐ | Staging | Post-launch continuous UX optimization (quiet hour between morning pickups and evening returns) |
| **Phase 2 (Hardware)** | Post-Go-Live Device Day | Physical iPad Pro, Zebra/Netum Bluetooth scanner, TSC label printer | Hardware barcode scanning and on-glass iPad driver signature |

### 2.2 Participant Matrix

Each round tests **three distinct participants** (~45 minutes per session), observing role separation without cross-contamination:

1. **P1 — Floor Specialist (Warehouse or Technician):**
   - Focus: Item packing, manual serial verification, return inspection, damage tagging, location updates.
   - Money blind: Must never see prices, deposits, or revenue (Law 6).
2. **P2 — Desk Specialist (Coordinator or Admin):**
   - Focus: Pickup discovery, handover custody, client verification, extension negotiation, manual counter payment recording.
3. **P3 — Fresh / External User (New hire, driver, or non-technical proxy):**
   - Focus: Walk-up usability, WhatsApp text intake, navigation trunk test, error recovery without prior training.

*Privacy Note:* Participants are identified solely as P1, P2, and P3 in all reports. No staff personal names appear in verification records.

---

## 3. Facilitator Rules & Environment Setup

### 3.1 Facilitator Rules (Steve Krug Methodology)
1. **Never teach during a task:** "We are testing the system, not you. You cannot do anything wrong."
2. **No leading questions or hints:** If the participant falls silent: *"What are you thinking right now?"* If the participant asks what to click: *"What would you do if I weren't standing here?"*
3. **Intervene only on complete stall:** If a participant is stuck for >3 minutes with high frustration, record as "No (Stuck)", note the failure point, and smoothly advance to the next task.
4. **Recording:** Screen capture with audio (desktop screen recording) enabled with participant consent.

### 3.2 Environment Pre-flight Checklist
- [ ] Staging database (`klhmsrunqrdxjudyhnkm`) active with migrations through `0269` applied.
- [ ] Synthetic test bookings seeded with realistic Nepali camera gear (Sony FX6, A7S III, 24-70mm GM, RED V-Raptor, Nanlite 300B).
- [ ] Staging accounts pre-authenticated for P1 (`warehouse@babinrentals.com`), P2 (`coordinator@babinrentals.com`), and P3 (`admin@babinrentals.com` / `driver@babinrentals.com`).
- [ ] Screen display set to 1440×900 desktop and 820×1180 counter tablet viewport.
- [ ] Test photo assets staged locally for ID and equipment inspection uploads.

---

## 4. The 12 Usability Tasks (U1–U12) — Desktop Counter Edition

### Task U1 · Find Next Pickup & Outstanding Requirements
- **Participant:** P2 (Desk / Coordinator)
- **Prompt:** *"Find the next scheduled pickup for today. Tell me its pickup time, the client's name, and what items are still waiting to be packed."*
- **Target Screen:** `/today` (Today Operations Workspace)
- **What to Watch:**
  - Does P2 immediately locate the Pickups queue on Today?
  - Do they read the time in NPT format clearly?
  - Is the packing status badge (e.g., `Draft` vs `Confirmed` vs `Packed`) unambiguous?
  - Does P2 click into the booking detail without getting lost?

### Task U2 · Pack Gear with Manual Serial Verification
- **Participant:** P1 (Warehouse / Floor)
- **Prompt:** *"Open booking BK-202611-001. Check the two equipment items, confirm their serial numbers match the physical tags, attach a packed shelf photo, and mark the booking Packed."*
- **Target Screen:** `/rentals/detail?id=...` or Floor Pack Drawer
- **What to Watch:**
  - Can P1 find the item by typing the asset code / barcode manually (since Bluetooth scanner is Phase 2)?
  - Does the file upload dialog accept the inspection photo cleanly?
  - Does the "Finish Packing" action button turn green and state clear completion?
  - Zero financial figures visible anywhere on P1's screen (Law 6).

### Task U3 · Desk Handover & Authorized Collector Verification
- **Participant:** P2 (Desk / Coordinator)
- **Prompt:** *"The client's representative is at the counter to collect BK-202611-001. Verify their Citizenship / Driving Licence ID, capture their digital signature on screen, and complete handover."*
- **Target Screen:** Booking Handover Modal (`SignOnGlassModal.tsx` / `HandoverDrawer.tsx`)
- **What to Watch:**
  - Can P2 select or enter the collector's name and ID document type easily?
  - Does the signature canvas capture smooth mouse/trackpad drawing?
  - Does the system warn if any item on the booking was not marked "Packed"?
  - After confirming handover, does the status immediately transition to `Out` (Custody transferred)?

### Task U4 · Partial Return Check-In
- **Participant:** P1 (Warehouse) or P2 (Desk)
- **Prompt:** *"The shoot finished. The crew returned Camera Body A, but Lens B is retained for another shoot day. Record this return accurately so only Camera Body A is checked in."*
- **Target Screen:** Receive Return Modal (`ReturnModal.tsx`)
- **What to Watch:**
  - Does the return screen allow unchecking or selecting individual line items?
  - Does the confirmation explicitly state: *"1 item returned, 1 item remains OUT"*?
  - Does Camera Body A become `Available` on the shelf while Lens B remains locked in `Out` (GiST reservation)?
  - Does the app refuse to close the entire booking prematurely?

### Task U5 · Damage Logging & Assessment Routing
- **Participant:** P1 (Warehouse / Technician)
- **Prompt:** *"During check-in of a Sony 24-70mm GM lens, you notice a deep scratch on the front element. Record the damage, upload an inspection photo, set estimated repair at Rs 8,000, and ensure it is flagged for manager review."*
- **Target Screen:** Return Inspection & Damage Finding Modal
- **What to Watch:**
  - Does P1 find the "Report Damage" or "Flag Issue" action before releasing the item?
  - Is the rupee input field clean (accepts `8000`, displays `Rs 8,000`, zero paisa decimals per R-22.3)?
  - Does the unit condition change to `Damaged` / `Under Repair` so it cannot be rented out tomorrow?
  - Is an approval item correctly routed to the Owner / Manager inbox (R-22.1 / R-22.8)?

### Task U6 · Booking Extension Negotiation
- **Participant:** P2 (Coordinator / Desk)
- **Prompt:** *"A production calls: they need to extend booking BK-202611-002 by 1 additional day until 06:00 NPT tomorrow. Check calendar availability, extend the booking, and quote the additional fee."*
- **Target Screen:** `/rentals/detail` -> Extend Booking Action
- **What to Watch:**
  - Does the extension dialog verify calendar conflicts immediately (fail-closed if overlapping)?
  - Does the extension calculate 1 full operational day based on 06:00 NPT cutoff?
  - Is the quoted extra fee shown in whole rupees (e.g., `Rs 4,500`)?
  - Does the booking history audit log record who extended the booking and when?

### Task U7 · Manual Counter Payment & Who Owes Tracking
- **Participant:** P2 (Desk / Coordinator)
- **Prompt:** *"The client for BK-202611-002 pays Rs 15,000 via Fonepay QR at the counter. Record this payment with reference code 'FP-982341'. Then check the Who Owes report to see the client's remaining balance."*
- **Target Screen:** Payments Drawer -> Manual Entry -> Reports (`WhoOwesWidget.tsx`)
- **What to Watch:**
  - Method dropdown clearly offers `Fonepay QR`, `Cash`, `Bank Transfer` (R-22.2).
  - No paisa entered or requested.
  - Payment is saved immutably with monotonic receipt number (Law 4 / Law 7).
  - Outstanding balance decreases by exactly Rs 15,000.
  - Who Owes report accurately reflects the updated balance without page reload.

### Task U8 · Quick Equipment Availability Check
- **Participant:** P3 (New Hire / Counter Staff)
- **Prompt:** *"A walk-in client asks: 'Do you have a Sony FX6 available for next Friday through Sunday?' Look it up and tell them if it's free."*
- **Target Screen:** `/calendar` or `/inventory` Search
- **What to Watch:**
  - Can P3 type "FX6" and instantly see availability without reading a manual?
  - Is the 06:00 NPT operational day boundary understood from the visual timeline?
  - Are booked bars distinctly differentiated from buffer/turnaround and maintenance bars?

### Task U9 · New Client Intake from WhatsApp Note
- **Participant:** P3 (New Staff)
- **Prompt:** *"Add a new client from this WhatsApp message: 'Name: Rajesh Shrestha, Phone: 9841 234 567, PAN: 601234567'. Upload their citizenship card scan and save."*
- **Target Screen:** Add Client Drawer (`ClientDrawer.tsx`)
- **What to Watch:**
  - Does the phone input gracefully strip spaces (`9841 234 567` -> `9841234567`) without showing validation errors (Forms Forgive rule)?
  - Does PAN validation enforce 9 digits without crashing?
  - Is duplicate phone check instantaneous?
  - Is the citizen document saved in secure storage bucket?

### Task U10 · Warehouse Role Money-Blindness Verification
- **Participant:** P1 (Warehouse / Technician)
- **Prompt:** *"Log in as Warehouse. Open Tomorrow's Scheduled Returns and pick list. Check if you can find rental prices, invoice totals, or client deposits."*
- **Target Screen:** Warehouse Dashboard & Return List
- **What to Watch:**
  - Does P1 see item names, serials, and dates clearly?
  - Are all price columns, deposit amounts, invoice buttons, and revenue totals completely absent from the DOM (Law 6 & RLS enforcement)?
  - Does P1 feel confident performing their job without financial clutter?

### Task U11 · Navigation & Unsaved Draft Preservation
- **Participant:** P3 (New Hire)
- **Prompt:** *"Start creating a new booking request for an A7S III. While on the items step, navigate to Calendar to check next week's dates, then return to your booking."*
- **Target Screen:** Booking Creation Shell -> Calendar -> Booking Creation Shell
- **What to Watch:**
  - Does navigating away warn the user or automatically preserve typed drafts?
  - When returning, are selected items and dates intact, or did the form reset?
  - Does the user understand how to resume without losing work?

### Task U12 · Physical Storage Location Reassignment
- **Participant:** P1 (Technician / Warehouse)
- **Prompt:** *"We moved the Sachtler Tripod from Shelf A2 to Shelf B4. Update its storage location in the system, reload the page, and confirm it persisted."*
- **Target Screen:** Inventory Unit Detail (`UnitDetailModal.tsx`)
- **What to Watch:**
  - Can P1 locate the unit by serial number or name?
  - Is the location field directly editable with clear feedback?
  - Does hard refreshing the browser retain `Shelf B4` (verifying database write vs local temporary state)?

---

## 5. Standardized Scoring Sheet & Rubric

For each task (U1–U12), the observer scores the participant across four standardized dimensions:

```
+-------------------------------------------------------------------------------+
| TASK [ U__ ] : ______________________________________________________________ |
| Participant: [ P1 / P2 / P3 ]   Role: [ Warehouse / Desk / New ]              |
| Device Viewport: [ 1440px Desktop / 820px Counter Tablet ]                    |
+-------------------------------------------------------------------------------+
| 1. Completion:                                                                |
|    [ ] Solo (Completed without hesitation or assistance)                      |
|    [ ] Assisted (Completed with 1 non-leading prompt, e.g. "look at Today")   |
|    [ ] Blocked (Failed to complete, confused, or required intervention)       |
|                                                                               |
| 2. Critical Errors (Check all that apply):                                    |
|    [ ] Wrong Item Selected / Checked                                          |
|    [ ] Wrong Booking Modified                                                 |
|    [ ] Financial Discrepancy (Wrong amount / paisa confusion)                 |
|    [ ] Law 6 Violation (Money visible to Warehouse/Technician)                |
|    [ ] False "Saved" (Action claimed complete but not committed to DB)       |
|    [ ] Lost Data (Form wiped on navigation / refresh)                         |
|                                                                               |
| 3. Execution Metrics:                                                         |
|    - Time to Complete: _____ seconds                                          |
|    - Hesitation Points: _____________________________________________________ |
|    - Participant Verbatim Quotes: ___________________________________________ |
|                                                                               |
| 4. Verification Check:                                                        |
|    - Hard Page Reload: State Persisted? [ YES / NO ]                          |
+-------------------------------------------------------------------------------+
```

---

## 6. Same-Day Triage & Problem Ranking Protocol

Immediately following the conclusion of the three participant sessions (within 2 hours):

### Step 1 · Compile Raw Friction Log
All observers (Babin, Lead Developer, Coordinator) list every observed hesitation, stumble, or error without filtering.

### Step 2 · Rank Issues by Severity Rubric

Issues are prioritized using the **Harm > Frequency > Autonomy** formula:

1. **P0 — Critical Safety & Integrity (Fix before any cutover):**
   - Financial inaccuracy or paisa rounding anomaly.
   - Money figure leaked to Warehouse or Technician (Law 6).
   - False "Saved" confirmation when RPC failed.
   - Accidental double-custody transition.
2. **P1 — Workflow Blocker (Fix in current sprint):**
   - Participant unable to complete task without explicit instructions.
   - Search failing to find existing client or asset due to spacing or formatting.
   - Form wiping typed entries on modal close or navigation.
3. **P2 — User Friction (Fix before staff trial):**
   - Hesitation exceeding 30 seconds searching for primary action button.
   - Unclear status label (e.g., distinguishing "Out" from "Packed").
   - Touch target < 44px causing missed clicks.
4. **P3 — Polish & Wording:**
   - Terminology confusion resolved independently.
   - Copy clarity improvements.

### Step 3 · Output Document
Save findings as:
`docs/verification/USABILITY_<YYYY-MM-DD>.md`

The report must list:
- Top 10 ranked problems with exact screen, reproduction steps, and root cause.
- Top 3 must-fix items scheduled for immediate implementation.
- List of quick fixes (< 1 hour each) executed immediately.
- Sign-off block for Babin.

---

## 7. Automated Test Verification Harness

To ensure that the 12 scenarios (U1–U12) can be verified automatically in CI/local testing prior to the human testing session, an accompanying test suite is maintained at `scripts/verify-usability-test-protocol.mjs`.

This harness validates that:
1. Seeded staging test fixtures exist for bookings, items, clients, and roles.
2. Financial data is masked for Warehouse/Technician role tokens.
3. Custody transition RPCs (`handover`, `partial return`, `pack`) respond with atomic DB locks.
4. Input sanitizers cleanly handle spaces in phone numbers and PAN.
5. All monetary calculations output whole rupees without paisa decimals.

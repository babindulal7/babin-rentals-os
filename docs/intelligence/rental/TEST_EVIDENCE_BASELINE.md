# Babin Rentals OS — Test Evidence Baseline
**Document ID:** RI-AUDIT-05  
**Date:** 2026-11-23  
**Auditor:** Windows Antigravity Engineering  
**Scope:** Independent verification and classification of the external Python test suite and OS test baseline  
**Target Repository:** `babindulal7/babin-rentals-os`  

---

## 1. Executive Summary & Verification Finding

An earlier Windows engineering report referenced a 127/127 scenario pass rate in `run_eval_suite.py`. This audit independently executed the current suite on the local Windows workstation (`C:\Users\use\Desktop\rental intellegence\scripts\run_eval_suite.py`) using Python 3.11.9.

**Audit Result:**
- **Current Total Assertions:** **135 passed out of 135 scenarios (100.0%)**
- **Execution Time:** 1.84 seconds
- **Exit Code:** 0
- **Suites Executed:** 26 suites

The increase from 127 to 135 assertions reflects the recent addition of:
1. Suite 23: Nepal Whole Rupee Display & 06:00 AM Day Boundary (4 assertions).
2. Suite 24: R-22.1 / R-22.8 Owner Approval Routing (2 assertions).
3. Additional edge cases in advance payments and late fee waivers (2 assertions).

---

## 2. Complete Suite Breakdown & Classification

| Suite # | Suite Name | Assertions | Focus / Domain | Verification Scope |
|---|---|---|---|---|
| **Suite 1** | Integer Paisa & Half-Up Rounding | 5 | Financial arithmetic | `round_half_up` edge cases (-0.5, 0.499, 0.5), integer conversion (`rupees()`), South Asian lakh grouping (`grouped()`). |
| **Suite 2** | Foundation §2.8 Reference Case | 1 | Booking calculation | Canonical BK-2026-0715 reference case: Rs 132,750 base, 7% disc, 13% VAT, Rs 15,000 paid -> Discount Rs 9,293, Total Rs 139,506, Out Rs 124,506. |
| **Suite 3** | Law 10 Discount Gates | 7 | Policy validation | 0% and 10% valid without approval; 12% without reason rejected; reason < 10 chars rejected; unapproved rejected; valid approved accepted; 26% hard-blocked (cap 25%). |
| **Suite 4** | Law 5 Deposit Liability Isolation | 3 | Liability isolation | Deposit strictly excluded from Subtotal, Rental Total, and Outstanding balance reduction. |
| **Suite 5** | Late Return Fee Tiers & Waivers | 6 | Operational penalties | $\le30$ min grace (Rs 0); 31–120 min half-day (Rs 5,000); $>120$ min full-day (Rs 10,000); 25 hours (2 full days, Rs 20,000); waiver reason $\ge10$ chars + approver. |
| **Suite 6** | Damage Findings & Settlement | 6 | Risk & custody | Damage $<$ Rs 25,000 routes to Manager; $\ge$ Rs 25,000 routes to Owner; minimum 1 photo; desc $\ge10$ chars; deposit offset and shortfall computation (non-negative refund). |
| **Suite 7** | Advance Payments & Lifecycle | 5 | Cash collection | Total $<$ Rs 5,000 requires 100% advance; partial blocked; Rs 8,000 requires Rs 5,000 min; Rs 20,000 requires 50% min; $<50\%$ blocked. |
| **Suite 8** | Conflict & Availability Logic | 3 | Calendar booking | Overlapping dates detected; non-overlapping clears with 0 conflict; sub-interval dates detected. |
| **Suite 9** | Auto-Completion & Hard Conflicts | 6 | Kit compatibility | PL lens on FX3 requires adapter; CHIOPT requires rods + support; Ronin 4D + external gimbal triggers REJECT; Komodo-X requires CFexpress B + V-Mount; Glimmer requires mattebox. |
| **Suite 10** | Payload Headroom (30% Margin) | 4 | Physical safety | 3.5kg on 10kg tripod passes (35% $\le$ 70%); 7.5kg on 10kg tripod fails (75% $>$ 70%); 7.5kg on 15kg passes; 1.85kg on DJI RS3 passes (< 85% motor strain). |
| **Suite 11** | Electrical & Power Limits | 4 | Electrical safety | 720W on 230V 15A socket passes; 3,100W triggers overload block (>2,760W safe threshold); 99Wh on 15W draw yields ~5.6h runtime; -10°C cold derating reduces to ~3.36h. |
| **Suite 12** | Profit Leakage Detection | 3 | Revenue protection | Detects under-secured deposit on cinema body; missing Camera Caretaker fee; unbilled wet decontamination fee on damp return. |
| **Suite 13** | Scenario Simulation Engines | 2 | Asset economics | Rate change positive annual delta; 10-month asset recovery percentage evaluated against 40% benchmark. |
| **Suite 14** | Prep Time, Logistics & Skill | 5 | Operations triage | Prep time 30–45 mins; multi-case cinema triggers vehicle required; gimbal baseplate check; wireless antenna check; beginner blocked from cinema body. |
| **Suite 15** | Landed Cost & Fleet ROI | 10 | Asset investment | FX3 landed cost with duties/VAT/freight (1.35–1.45x); fleet ROI 40% benchmark; 6 lost inquiries triggers BUY_SECOND_UNIT; 14% utilization triggers SELL_OR_REPOSITION; cable repair in-house; swollen battery mandatory immediate destruction; IATA carry-on vs checked battery rules. |
| **Suite 16** | Product Intel & Diagnostics | 10 | Diagnostic triage | Canonical ID format `BRPI-{BRAND}-{MODEL}`; mount adaptation; Ronin 4D conflict; camera care 8 return checks; lens fungus hard hold; diagnostic Levels A, B, C; substitution engine. |
| **Suite 17** | Planning Quotes & Data Context | 15 | Catalog resolution | Specific Komodo-X rate wins; specific DJI Mic Mini rate wins; zero-day booking blocked; unknown item blocked; planning rates block client finalization; data context flags historical/planning mode; Booqable snapshot remains PII-free. |
| **Suite 18** | RIS v4 Kit Auto-Completion | 6 | Packaging rules | FX3A auto-completes with CFexpress A, 3x batteries, ZG charger; Komodo-X requires CFexpress B + V-Mount; Caretaker service recommendation; Ronin 4D hard block; CHIOPT rods check. |
| **Suite 19** | Shoot Playbooks & Ladders | 4 | Workflow templates | Wedding recommends fast AF & warns against heavy manual PL; indie scales to Komodo-X; crew size $\ge4$ adds wireless intercom. |
| **Suite 20** | Monsoon Mode & Protocols | 5 | Environmental safety | June/July active monsoon; December dry season; dry-cabinet holding before AVAILABLE; 24h flexible rain reschedule policy. |
| **Suite 21** | Client Personas & Recovery | 4 | Client management | $\ge5$ orders classifies as Seasoned Pro; beginner classifies as Creative Beginner; Stage 1 polite reminder; Stage 7 formal management hold notice. |
| **Suite 22** | Smart Equipment Intake | 7 | Inventory intake | Step 1 matches existing FX3; Step 2 structured specs with OEM citation; Step 3 suggests 8 relationship types; Step 4 separates guide from checklist; Step 5 validates serial intake; Step 6 audit diff ledger. |
| **Suite 23** | Whole Rupees & 06:00 AM Day | 4 | Nepal business rules | `format_money_whole` outputs whole rupees (`Rs 2,100`); 06:00 to 06:00 is 1 rental day; 06:00 to 07:30 within 2-hour grace (1 day); 06:00 to 10:00 exceeds grace (2 days). |
| **Suite 24** | Owner Approval Routing | 2 | Governance | Damage Rs 10,000 under default threshold routes to Manager; under R-22.1 setting routes directly to Owner. |
| **Suite 25** | Training Center Synthetic (47) | 4 | Offline evaluation | Evaluates all 47 synthetic golden cases (`SYN-001` to `SYN-047`); 100% pass; 0 safety/privacy violations; 100% model accuracy (FX3/FX30 boundary protected). |
| **Suite 26** | Real Equipment Pilot (105) | 4 | Hardware benchmark | Evaluates all 105 real pilot cases; 100% pass; 0 safety/privacy/role violations; 100% model accuracy across all 10 real pilot models. |
| **Total** | **All 26 Evaluation Suites** | **135** | **Comprehensive** | **135 / 135 Passed (100.0%)** |

---

## 3. Explicit Evidence Limits: What the Python Suite Does NOT Prove

While the 135/135 pass confirms that pure mathematical and business rule logic is sound in an isolated environment, it **does not** prove that:

1. **Live Supabase Availability:** The Python suite checks static dates in dictionaries. It does not execute PostgreSQL locking, check live booking ranges across branches, or account for unreturned units in transit.
2. **Server-Side Authorization & RLS:** Python functions execute with full local memory access. They do not test PostgreSQL Row Level Security (RLS) policies or PostgREST role headers.
3. **Network Payload PII Redaction:** The Python tests do not serialize HTTP responses or verify that sensitive client phone numbers or financial margins are omitted from WebSocket/REST payloads delivered to the browser.
4. **React Component Lifecycle & UX:** The Python tests do not verify UI touch targets (44px min), contrast ratios, keyboard navigation (WCAG 2.5.3), or that secondary advisory drawers do not obscure primary workflow action buttons.
5. **Real Database Concurrency:** Concurrency edge cases (such as two staff members adding the last physical battery pack simultaneously) are not exercised by single-threaded Python scripts.

---

## 4. Verification Protocol for Staging & PR Acceptance

To elevate Rental Intelligence from "offline Python verified" to "Babin Rentals OS production ready":
1. Pure Python rules must be expressed as deterministic TypeScript adapters in `src/lib/rentalIntelligence/`.
2. Role gating must be rigorously tested with Vitest against `src/lib/fieldGating.ts` and `src/lib/rbac.ts` across all six system roles (`Owner`, `Admin`, `Manager`, `Coordinator`, `Warehouse`, `Technician`, `Driver`).
3. Offline and failure resilience must be tested: when network calls or knowledge lookups fail, the UI must gracefully display `needs_verification` without throwing runtime uncaught exceptions or fabricating synthetic fallback figures.

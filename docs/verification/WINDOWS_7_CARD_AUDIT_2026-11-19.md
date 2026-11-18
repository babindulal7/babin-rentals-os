# WINDOWS Audit — Babin Rentals OS — 2026-11-19 04:15 NPT

Computer / agent: Windows Antigravity (Lane C / Booking & Finance Track)  
Repo path / worktree: `C:\Users\use\.gemini\antigravity\worktrees\babin-rentals-os\progress_acceptance_audit`  
Observed origin/main SHA: `44300a17e01705676cd0c21b9518edf23a9a0fda`  
Local HEAD SHA / branch: `44300a17e01705676cd0c21b9518edf23a9a0fda` (`progress_acceptance_audit`)  
Clean / dirty worktree? Clean (zero uncommitted edits; shared `node_modules` junction linked to baseline)  
Branch ahead/behind main: Exactly aligned (0 ahead, 0 behind `origin/main`)  
Last exact-head main CI run and result: GitHub Run `44387475554` (and `44258853012`) — conclusion: **success**  
Open PRs connected to this lane:
- Draft PR #219: `docs/win-b3-t3-05-ird-ebilling` (T3-05 Nepal IRD e-billing compliance brief)
- Merged PRs verified in current `main`: #182 (T3-13), #181 (T3-16), #163 (T3-19), #190 (T3-20), #191 (T3-23)

---

## Assigned 7 T3 Cards Audit Table

| Card | Canonical status | Code location / merged PR | Tests passed (exact command) | Device / staging / role proof | Missing acceptance | Conclusion |
|---|---|---|---|---|---|---|
| **T3-13** | `todo` (stale heading in `T3_BOOKING_MONEY.md:184`) | Merged in `f9520bdc` (PR #182). Files: `src/lib/availability.ts`, `AddItemPanel.tsx`, `SubRentalPartnerModal.tsx`, `OverbookingOverrideModal.tsx` | PASS (13/13 tests green): `npm test -- src/lib/__tests__/similarEquipment.test.ts src/modules/rentals/booking/__tests__/SubRentalPartnerModal.test.tsx src/modules/rentals/booking/__tests__/AddItemPanel.similarSubrent.test.tsx` | Role test verifies Law 6 money blindness (supplier rate/cost completely omitted for non-money roles). Free similar unit and 27 Jul hard block enforced. | NOT TESTED on physical iPad/desktop staging with Owner; Kathmandu partner list (`GearHouse KTM`, etc.) needs Babin operational confirmation. | ACCEPTANCE PENDING (Code merged on main; needs staging acceptance & roadmap label update) |
| **T3-16** | `todo` (stale heading in `T3_BOOKING_MONEY.md:235`) | Merged in `d604a098` (PR #181). Files: `src/lib/documentShare.ts`, `src/lib/email/templates.ts`, `src/lib/whatsappTemplates.ts`, `DocumentShareModal.tsx`, `QuoteActionsMenu.tsx`, `InvoiceActionsMenu.tsx` | PASS (17/17 tests green): `npm test -- src/lib/__tests__/documentShare.test.ts src/modules/rentals/modals/__tests__/DocumentShareModal.test.tsx` | Law 6 money blindness verified (unpriced operational docs allowed; priced docs blocked with warning for floor roles). WebShare and wa.me text fallbacks verified in mock. | NOT TESTED on physical counter PC printer / mobile share sheet; email delivery depends on live T5-03 service setup; document formatting depends on T3-06 accountant sign-off. | ACCEPTANCE PENDING (Code merged on main; needs device/external service acceptance & roadmap label update) |
| **T3-19** | `todo` (stale heading in `T3_BOOKING_MONEY.md:282`) | Merged in `037e175a` (PR #163). Files: `src/lib/scanToAddEquipment.ts`, `src/lib/__tests__/scanToAddEquipment.test.ts` | PASS (5/5 tests green): `npm test -- src/lib/__tests__/scanToAddEquipment.test.ts` | Unit tests verify 1.5 s duplicate-burst debounce protection, free unit reservation, and booked unit explanation with T3-13 alternative offer. | NOT TESTED on physical Bluetooth barcode hardware / iPad camera in live New Rental UI. Cross-lane scanner dependency coordinated with Mac T2-14. | ACCEPTANCE PENDING (Code merged on main; needs hardware scan acceptance & roadmap label update) |
| **T3-20** | `todo` (stale heading in `T3_BOOKING_MONEY.md:293`) | Merged in `8c8d7cb2` (PR #190). Files: `src/modules/finance/WhoOwes.tsx`, `src/lib/queries/whoOwes.ts`, `src/actions/clients/reminders.ts`, `src/lib/pdf/exportPdf.ts`, `src/lib/pdf/generatePdf.ts` | PASS (7/7 tests green): `npm test -- src/modules/finance/__tests__/WhoOwes.test.tsx` | Permission gate verified (Coordinator sees Who Owes; Warehouse cannot access). Statement PDF multi-page generation verified. Reminders pause flag persisted. | Staging receivables reconciliation to the paisa with live accountant books; physical mobile WhatsApp share walkthrough. | ACCEPTANCE PENDING (Code merged on main; needs accountant ledger reconciliation & roadmap label update) |
| **T3-23** | `todo` (stale heading in `T3_BOOKING_MONEY.md:331`) | Merged in `578ccda9` (PR #191). Files: `src/lib/monthlyPack.ts`, `src/lib/zip.ts`, `src/modules/reports/MonthlyPack.tsx`, `src/modules/reports/ReportCatalog.tsx` | PASS (20/20 tests green): `npm test -- src/lib/__tests__/zip.test.ts src/modules/reports/__tests__/MonthlyPack.test.tsx src/lib/queries/__tests__/crewCompleteRead.test.ts src/lib/queries/__tests__/crewTdsPagination.test.ts` | Zero-dependency pure TS PKZIP generation verified; Kathmandu civil day date conversions, VAT registers, expense receipts and crew TDS export verified in isolation. | Sample monthly pack reviewed and approved in writing by Babin's external accountant; staging data dependencies (T3-24 quick expense receipts, T8-08 crew TDS) acceptance pending. | ACCEPTANCE PENDING (Code merged on main; needs accountant review of sample pack & roadmap label update) |
| **T3-05** | `todo` (`T3_BOOKING_MONEY.md:84`) | Open draft PR #219 (`docs/win-b3-t3-05-ird-ebilling`, commit `ef751255`). Files: `docs/compliance/IRD_EBILLING_COMPLIANCE_BRIEF.md`, `src/lib/__tests__/t305IrdEbillingComplianceDoc.test.ts` | Pass on PR branch (`src/lib/__tests__/t305IrdEbillingComplianceDoc.test.ts`) | Brief documents Nepal IRD CBMS criteria, VAT regulations, monotonic Law 7 numbering, immutable credit note discipline. | Written determination from Babin & external accountant (threshold turnover > NPR 50M vs standard computerized billing, and paper bills vs PDF tax invoices). Due by 30 Nov 2026. | BLOCKED / NEEDS OWNER (Awaiting written accountant determination; do not activate e-billing or change tax settings) |
| **T3-31** | `todo` (`T3_BOOKING_MONEY.md:472`) | Unpushed local branch `lane-c/T3-31-counter-sale` (commit `023f80d1`). Design note drafted in `docs/verification/T3-31_DESIGN.md`. | Not run (code not yet implemented). | Design specifies: booking kind 'counter_sale', no custody/prep/return stages, atomic stock deduction, Law 6 role masking (floor sees no prices, desk takes payment), cancel before payment restocks. | Design review sign-off by Babin/Claude; implementation of atomic `create_counter_sale` RPC; UI entry in Today/New Rental; dependencies T3-14 (payment numbering) and T3-30 (staging acceptance). | DOING (Design formulated on local branch; awaiting formal design review and dependency resolution before implementation) |

---

## Summary
- Assigned cards: 7 Windows cards (T3-13, T3-16, T3-19, T3-20, T3-23, T3-05, T3-31)
- Newly VERIFIED DONE since prior baseline: 0 (No card meets all 8 strict conditions for `done` without external device/staging/accountant sign-off; we do not inflate completion counts)
- Already done previously, status corrected: 0 (The 5 merged cards are implemented and merged on `main`, but their canonical headings still say `todo` while awaiting physical device/accountant acceptance)
- Implemented and merged but still pending acceptance: 5 (T3-13, T3-16, T3-19, T3-20, T3-23 — all 5 have complete code and passing tests on current `main`, but headings are stale `todo` instead of `acceptance_pending`)
- Implemented only on local branch: 1 (T3-31 — design note on `lane-c/T3-31-counter-sale`)
- Open PRs awaiting review: 1 (Draft PR #219 for T3-05)
- Blocked by external owner/accountant/staging/device: 2 (T3-05 blocked on accountant determination; T3-23 blocked on accountant pack sign-off and upstream staging evidence)
- Fully unimplemented: 1 (T3-31 — design drafted, implementation not started)
- Worktree unpushed commits/changes: None on `main` / `progress_acceptance_audit` worktree (all clean). Local branch `lane-c/T3-31-counter-sale` holds 3 design commits (`023f80d1`, `5a4a47bb`, `3ad8f138`).
- Exact next 3 safe actions, in dependency order:
  1. Coordinate with owner to update canonical roadmap card headings for T3-13, T3-16, T3-19, T3-20, and T3-23 from `todo` to `acceptance_pending` based on merged PR evidence (#182, #181, #163, #190, #191).
  2. Deliver `docs/compliance/IRD_EBILLING_COMPLIANCE_BRIEF.md` (PR #219) to Babin and external accountant to obtain written statutory determination for T3-05 (deadline 30 Nov 2026).
  3. Submit `docs/verification/T3-31_DESIGN.md` for Claude check-in review before beginning atomic counter-sale implementation.
- Questions requiring Babin's explicit decision, if any:
  - **T3-05 / O-6 / O-17**: Has the external accountant confirmed whether Babin Rentals is subject to IRD-certified real-time CBMS electronic billing (turnover > NPR 50M), and confirmed the VAT invoice numbering moment?
  - **T3-13**: Is the pre-configured Kathmandu partner roster (`GearHouse KTM`, `Kathmandu Cinema Works`, `Everest Cine Rentals`, `Pokhara Film Gear`, `Shine Pictures`) approved as the live default list for sub-rentals?
- No deployment/live writes performed: YES (Strictly zero writes to live Supabase, no DNS changes, no live invoice alteration, no production configuration modifications).

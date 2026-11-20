# Babin Rentals OS — 47 acceptance-pending cards: evidence register

**Audit date:** 20 November 2026 NPT
**Source of truth inspected:** `main` exact commit `c3db80fce36c78de5e6c32bc76e03720a1bf803e`, `docs/plans/T0…T9`.
**Database observed:** Existing hosted staging project `klhmsrunqrdxjudyhnkm`, `public` application table list **empty** (read-only check).
**Scope:** All **47** `acceptance_pending` roadmap cards; card headings/done-when clauses, merged-source and current staging constraints.
**Decision:** **0 cards promoted to `done`**. At audit time, no card was independently proven to satisfy its *entire* stated acceptance criteria; merged/locally-tested code alone is insufficient to imply hosted operational, staff, accountant, or client sign-off.

## Audited roadmap counts

| Roadmap state | Count |
| --- | ---: |
| done | 68 |
| acceptance_pending | 47 |
| todo | 32 |
| doing | 6 |
| partial | 1 |
| written | 1 |
| **Total** | **155** |

Notes: `done` includes three cards explicitly recorded as `complete`, and the single `done in part` card is **partial**, not complete. Roadmap statuses are work-tracking claims, not independent production readiness certification.

## Acceptance blocker classes

| Verification class | Cards | Exact IDs |
| --- | ---: | --- |
| HOSTED_FINANCE_RBAC | 8 | T2-20, T3-02, T3-10, T3-11, T3-30, T8-02, T8-04, T8-09 |
| LANGUAGE_OWNER | 7 | T0-12, T6-04, T6-05, T6-06, T6-07, T6-08, T6-09 |
| HOSTED_AVAILABILITY | 5 | T2-21, T2-22, T3-13, T3-17, T3-22 |
| ACCOUNTANT_AND_HOSTED | 5 | T3-06, T3-20, T3-23, T8-07, T8-08 |
| PORTAL_INTEGRATION | 5 | T7-09, T7-12, T7-13, T7-14, T7-17 |
| PHASE1_AND_PHASE2 | 4 | T2-14, T3-16, T3-19, T9-07 |
| HOSTED_FLOOR | 3 | T2-06, T2-13, T2-19 |
| HOSTED_AUTH | 2 | T1-05, T1-17 |
| EMAIL_INTEGRATION | 2 | T1-18, T2-15 |
| HOSTED_STORAGE | 2 | T2-18, T3-24 |
| CUTOVER_INTEGRATION | 2 | T9-01, T9-02 |
| REPO_TRIAGE | 1 | T0-03 |
| HOSTED_DELIVERY | 1 | T4-08 |

**Gating distinction:** `PHASE1_AND_PHASE2` means Phase 1 software/manual acceptance is **still mandatory**; only the physical iPad/scanner/printer/native share and hardware training checks are deferred to Phase 2 after launch. Do **not** mark the entire card done or move all of its verification after launch. `LANGUAGE_OWNER` work may be previewed at 3 viewport widths and owner-reviewed now; app-wide activation remains gated. `ACCOUNTANT_AND_HOSTED` is an independent accountant/legal/tax verification gate, **not** a re-ask of the eight owner decisions previously finalized.

## Per-card action and missing acceptance evidence

| Card | Capability | Pending proof type | Exact next acceptance evidence |
| --- | --- | --- | --- |
| **T0-03** | Open pull request triage | `REPO_TRIAGE` | Reconcile every currently open PR and prior retained PR against merged main, with per-PR close/keep evidence; local/manual triage still outstanding. |
| **T0-12** | Resolve the 5 November rules and application conflicts | `LANGUAGE_OWNER` | Owner-approved full-app language/conflict audit, cross-device layout and correct account preference/role handling; audit 0225 behavior without new live writes. |
| **T1-05** | Nine role seats + read-only role harness | `HOSTED_AUTH` | Nine real staging role logins with matching users, Boudha permissions and Client A/B RLS/money-blind negative tests. |
| **T1-17** | Two-step sign-in for every money role | `HOSTED_AUTH` | Hosted MFA enrollment and AAL2 money access/non-access for money roles; recovery/reset audit, provider configuration and owner-approved release. |
| **T1-18** | Sign-in history and new-device email | `EMAIL_INTEGRATION` | Owner/Admin-only sign-in history RPC, newly recognized-device alert delivered to a non-deliverable sandbox; Manager read denial. |
| **T2-18** | Finish evidence capture (what T2-16 left) | `HOSTED_STORAGE` | Real staging Storage policy/evidence flows, per-unit Return damage photo gates, offline retry and session idempotency. |
| **T2-06** | Repair job closes the damage | `HOSTED_FLOOR` | Damage flag → linked repair job → unavailable unit → authorized close → availability restored, with audit. |
| **T2-13** | Self-QC when alone | `HOSTED_FLOOR` | Self-QC allowed with alone-on-shift flag, refused without flag and audited in hosted staging. |
| **T2-14** | Scan a label → item card | `PHASE1_AND_PHASE2` | Phase 1: manual code lookup opens correct item and respects stock/privacy in staging. Phase 2: physical Bluetooth/camera scanner and iPad timing. |
| **T2-15** | Damage found during reset | `EMAIL_INTEGRATION` | Staging Reset damage photos create the correct case; approved customer notice in sandbox, with no premature charge. |
| **T2-19** | Signature at Return when damage is found | `HOSTED_FLOOR` | Digital Return signature/refusal gate for flagged unit, role acceptance on desktop/responsive emulation; physical iPad hardware test after launch. |
| **T2-20** | Floor adds consumables at Pack and Handover | `HOSTED_FINANCE_RBAC` | Warehouse adds consumables at Pack/Handover; server payload/DOM never exposes priced fields; desk ledger receives correct quantity. |
| **T2-21** | Planned downtime with a reason | `HOSTED_AVAILABILITY` | Three-day downtime block refuses New Rental and public availability; re-enable and audit changes. |
| **T2-22** | Time between rentals: account-wide or per product | `HOSTED_AVAILABILITY` | Account-wide/per-product buffer and turnaround policy tested with server-authoritative conflicting dates and subsequent pickup. |
| **T3-02** | Deposits per product, entered before go-live | `HOSTED_FINANCE_RBAC` | Staff enters actual deposit settings/CSV dry-run with approval; verify money-role edit, Warehouse denial and audit. |
| **T3-06** | Invoice and agreement documents | `ACCOUNTANT_AND_HOSTED` | Paper VAT invoice uniqueness/traceability, non-tax supporting PDF labels, staging signed agreement storage, external accountant statutory sign-off. |
| **T3-10** | After-hours line | `HOSTED_FINANCE_RBAC` | Manual after-hours fee creates correct line/invoice; Warehouse price/payload denied. |
| **T3-11** | Late fee — acceptance only | `HOSTED_FINANCE_RBAC` | 0/half/full late-day examples, staff fee action and Manager/Owner waiver authorization verified. |
| **T3-13** | Fully booked → similar item or sub-rent | `HOSTED_AVAILABILITY` | Fully booked item recommends available alternative/sub-rent; review real partner roster and authorization path; physical hardware walkthrough after launch. |
| **T3-16** | Share documents in one tap | `PHASE1_AND_PHASE2` | Phase 1: desktop PDF rendering/download, permitted communication and priced-document RBAC denial. Phase 2: native share sheet/physical printer. |
| **T3-17** | Extend in two taps | `HOSTED_AVAILABILITY` | Extension time and price choices, credit/discount accounting and overlapping-inventory denial in hosted staging. |
| **T3-19** | Add gear by scanning in New Rental | `PHASE1_AND_PHASE2` | Phase 1: manual New Rental item lookup, serial availability and booked-unit refusal. Phase 2: physical scanner/iPad camera. |
| **T3-20** | Who owes | `ACCOUNTANT_AND_HOSTED` | Reconcile overdue receivables to finance ledger to the paisa, verify Coordinator visibility/Warehouse denial and sharing. |
| **T3-22** | Availability in two taps | `HOSTED_AVAILABILITY` | Two-tap UI plus real-date authoritative stock parity with New Rental on desktop/responsive simulation. |
| **T3-23** | Monthly pack for the accountant | `ACCOUNTANT_AND_HOSTED` | Complete monthly accountant sample pack, source totals, tax/TDS docs, receipt attachments; external accountant reviews. |
| **T3-24** | Quick expense with a bill photo | `HOSTED_STORAGE` | Expense receipt photo storage and permissions, re-open and monthly pack receipt check; emulated mobile capture before launch. |
| **T3-30** | Consumables: unit price, add at the desk, restock, low stock | `HOSTED_FINANCE_RBAC` | Quantity-based consumable pricing, RLS, stock increase, threshold alerts and desk/floor roles in hosted staging. |
| **T4-08** | One-time rider link | `HOSTED_DELIVERY` | Non-privileged rider link on separate session, token expiry/replay and route delivery signature/time in hosted staging. |
| **T6-04** | Wave 1 — the floor | `LANGUAGE_OWNER` | Owner approve floor translations and responsive width/overflow/language switching evidence. |
| **T6-05** | Wave 2 — the desk | `LANGUAGE_OWNER` | Owner approve desk strings, date/currency formatting and responsive layout screenshots. |
| **T6-06** | Wave 3 — back office | `LANGUAGE_OWNER` | Owner approve back-office text and error states, responsive screenshots. |
| **T6-07** | Wave 4 — reports, settings, admin | `LANGUAGE_OWNER` | Owner approve reports/settings/admin strings and global readiness gate; do not enable before all waves accepted. |
| **T6-08** | Nepali layout pass | `LANGUAGE_OWNER` | Retain per-wave 3-width screenshots/font/layout verification and owner review; physical iPad-specific test deferred. |
| **T6-09** | Switch it on | `LANGUAGE_OWNER` | Per-user language persistence across two real role seats, no cross-user leakage and owner activation acceptance. |
| **T7-09** | Bot and abuse protection | `PORTAL_INTEGRATION` | Hosted Turnstile server verification on configured domain and abuse burst rejection, with human flow. |
| **T7-12** | Recommended items | `PORTAL_INTEGRATION` | Actual portal shows six co-rented items and staff reorder persists against backend. |
| **T7-13** | Products with options on one page | `PORTAL_INTEGRATION` | Public EF/PL option selection books correct variant/unit with backend availability. |
| **T7-14** | "Away" switch for online booking | `PORTAL_INTEGRATION` | Away-on server refuses booking requests, away-off resumes and owner audit; portal real endpoints. |
| **T7-17** | Old store links open the same item | `PORTAL_INTEGRATION` | Cloudflare/hosted old-item redirect mapping tests and 404 behavior for unknown paths. |
| **T8-02** | Plans admin screen | `HOSTED_FINANCE_RBAC` | Manager plan change/retire and Coordinator read-only role enforcement with audit entries. |
| **T8-04** | Renew a lapsed membership | `HOSTED_FINANCE_RBAC` | Lapsed member renewal creates distinct terms, carries correct entitlements/history, no double charges. |
| **T8-07** | Timesheet by the day | `ACCOUNTANT_AND_HOSTED` | Timesheet totals reconcile to Crew Assist actual payout ledger; estimated-pay misleading label absent. |
| **T8-08** | TDS on crew payouts | `ACCOUNTANT_AND_HOSTED` | Accountant confirms TDS rate/tax treatment before executable crew payout; gross/TDS/net and rate-change audit in staging. |
| **T8-09** | Staff renting gear | `HOSTED_FINANCE_RBAC` | 20% staff-client discount on eligible booking, new-setting-only behavior, role permissions and audit. |
| **T9-01** | Bring the catalogue and clients across | `CUTOVER_INTEGRATION` | Approved Booqable export/count reconciliation and sampling of clients/products/bundles/structures, privacy-controlled staging import. |
| **T9-02** | Booqable rentals block the OS calendar | `CUTOVER_INTEGRATION` | Open Booqable rental excludes inventory from OS booking; test inbound sync/pagination and release on completion. |
| **T9-07** | Staff training | `PHASE1_AND_PHASE2` | Phase 1: real staff rehearses desktop/manual Book→Pack→Handover→Return→Reset using personal role seats; Phase 2: physical iPad/scanner/printer training. |

## Evidence required before a status promotion

1. A **specific completed acceptance receipt** tied to the card, exact source commit and test environment, with actual observed output and named reviewer. The required user/device, financial and backend checks must all be satisfied, not inferred from a related CI pass.
2. For hosted/RLS/financial acceptance: staging `klhmsrunqrdxjudyhnkm` first needs separately approved synthetic-only database installation, verified role seats and outbound integrations disabled. Existing 242/242 PGlite migration and 87/87 lifecycle successes are valuable **local tests**, not hosted assurance.
3. A card with external dependencies (accountant legal tax sign-off, domain/Turnstile/Cloudflare configuration, Booqable import count reconciliation, staff training or Nepali owner approval) cannot be closed with source-only evidence.
4. If pre-launch acceptance passes but a Phase 2-only physical check remains, record **Phase 1 software done, Phase 2 hardware pending** in an explicit linked follow-up card or audit annotation without falsely certifying full card acceptance. Do not silently weaken `Done when` conditions.
5. Owner's **eight accountant design decisions are finalized**. Do not repeatedly request them; external accountant confirmation of statutory TDS/VAT treatment, official paper invoice reconciliations and approval for production activation remain separate gates.
6. For every proposed promotion, attach actual evidence `CI run ID / hosted test receipt / recorded demo / owner or accountant sign-off` to the specific roadmap card. A green PR by itself is not all of those.

## Efficient verification batches

**Batch A — staging infrastructure & access first:** T1-05, T1-17, T1-18, T0-12. Existing T1-02 remains todo because the staging app schema is not installed; T1-01 backup/restore is still outstanding. Review the exact migration dependency plan before any staging writes.

**Batch B — floor and availability:** T2-18, T2-06, T2-13, T2-15, T2-19, T2-20, T2-21, T2-22, T3-13, T3-17, T3-22, T3-30. Capture RLS, lifecycle and inventory conflict evidence using synthetic clients and units.

**Batch C — money, documents & accountant:** T3-02, T3-06, T3-10, T3-11, T3-16, T3-20, T3-23, T3-24, T8-02, T8-04, T8-07, T8-08, T8-09. Official VAT remains on preprinted paper; OS PDFs must be supporting documents and reference the actual paper invoice number.

**Batch D — portal, people, cutover:** T4-08, T7-09, T7-12, T7-13, T7-14, T7-17, T9-01, T9-02, T9-07, T0-03. Require hosted link/booking/integration and staff acceptance without using real client PII until separately approved.

**Batch E — owner language and Phase 2 hardware tracking:** T6-04, T6-05, T6-06, T6-07, T6-08, T6-09; T2-14, T3-19 (manual Phase 1, physical Phase 2). Physical share/printer for T3-16 and hardware training in T9-07 are Phase 2.

## Results and safety

- **Status corrections made in this review:** None. A status change without acceptance proof would artificially inflate completion.
- **Card accounting:** 47/47 pending cards classified, 0 unclassified, 0 proved done from the observed evidence.
- **Source modifications:** This is an audit/evidence file only. No source features, policy, release settings or migration files edited. No staging or production data writes authorized/performed.
- **Follow-up trigger:** Re-run this audit at the exact then-current `main` after staging installation and role tests; auto-propose only individually substantiated `done` promotions, with a separate approval/PR review.

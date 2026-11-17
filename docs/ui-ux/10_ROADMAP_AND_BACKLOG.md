# Prioritized UI/UX implementation roadmap

**Status:** Proposed UX audit/work packages; **none are marked implemented by this file**. Active engineering cards in docs/plans/T*.md and actual PR ownership take precedence. Work should be split into minimal nonoverlapping PRs in the existing agent lanes. This is not a new parallel agent lane or a permission to modify main.

## Phase 0 — inventory, conflicts and measures

| ID | Proposed work | Depends on | Definition of done |
| --- | --- | --- | --- |
| UX-P00 | Cross-reference 60-element inventory with mounted components/routes and open PRs | main/PR read | all 60 audited with source + state evidence, no double-counting |
| UX-P01 | Baseline each of 16 workflow tasks for tap/time/error | stage fixtures + USABILITY tests | honest before scores with role/device |
| UX-P02 | Establish one screenshot/state matrix per changed page | responsive rules | captures for 375/820/1440 and actual role |

## Phase 1 — shared controls (no domain rule changes)

| ID | Proposed work | Depends on | Definition of done |
| --- | --- | --- | --- |
| UX-P10 | Typography token / computed-font audit & narrowly scoped fix | UX-P00, current token rules | self-hosted, EN/NE, no visual/CI regressions |
| UX-P11 | One header/search/primary/More and duplicated action audit | UX-P00 + open UX PR review | exactly one primary, valid keyboard/touch, no lost action |
| UX-P12 | Consistent form errors, loading/empty/offline and dirty guard | UX-P00 | shared components with real retry/persistence |
| UX-P13 | Table density and responsive rail proof | UX-P00 | readable data, right rail reflow, no clipped values |

## Phase 2 — rental and floor workflow UX

| ID | Proposed work | Depends on | Definition of done |
| --- | --- | --- | --- |
| UX-P20 | Contextual Next Action explanation only | UX-P11, rentalActions | no second CTA, no new resolver, all stages + roles |
| UX-P21 | Scanner-first Packing and truthful sub-item dependencies | T2 evidence / current floor rules | counted unit checks, live persistence, 56px targets |
| UX-P22 | Kit/case persistent manifest — design/decision first | UX-P21, decisions D-UX-01/02 (O-23, O-24) | approved schema/custody design, no fake case count |
| UX-P23 | Testing-bay/receiver UI improvement | T2 Handover, decision D-UX-03 (O-25) | ID/signatures/branch proof and safe new additions |
| UX-P24 | Active rental actions and extension collision feedback | T3 booking changes | real conflict, race and role-proof tests |
| UX-P25 | Return and damage triage + partial cases | T2-18, active return gates | photos, correct condition, no premature release |
| UX-P26 | Reset category templates, urgent turnaround and readiness distinction | T2-07, decisions D-UX-04/05 (O-26, O-27) | correct stock-vs-ready labels; QC defect hold remains |

## Phase 3 — adjacent modules

| ID | Proposed work | Depends on | Definition of done |
| --- | --- | --- | --- |
| UX-P30 | Inventory list/unit editor/location consistency | T2-17, current inventory query | after reload persists, asset status readonly |
| UX-P31 | Finance and reports legibility/honest numbers | T3 + money/RLS | no floor money DOM, real amounts only, reconciliation |
| UX-P32 | Calendar, clients, crew, deliveries and tools patterns | matching T4/T8 cards | shared controls, role view, keyboard/mobile |
| UX-P33 | Nepali/English responsive copy and input parity | T6 and active IME PRs | no clipping, IME, fonts and glossary from rules |

## Phase 4 — evidence, review, merge

| ID | Proposed work | Depends on | Definition of done |
| --- | --- | --- | --- |
| UX-P40 | 16 workflows × role/device/error scenario proof | all relevant approved PRs | local gates, staging, physical device evidence as applicable |
| UX-P41 | Monthly 3-person staff usability tests | staging/role accounts | observed task results, top defects and retest |
| UX-P42 | Release readiness signoff | active PLAN T1/T9, owner | no claim before hosted/device/security hold lifted |

## Priority / dependencies

- **Highest operational return:** UX-P11 → UX-P20; UX-P21 → UX-P25 → UX-P26. These improve daily actions while preserving domain gates.
- **No schema without owner and DB protocol:** UX-P22 / testing-bay persistence / future booking-policy change are **decision pending**. Put the decision in canonical register through a coordinated change, then claim migrations in active ledger and verify locally.
- **Avoid duplicate PRs:** Existing open PRs already address touch filters, Nepali IME, stale-data indicators, Reset priority, equipment labels, T2 evidence and unit editing. Recheck live PRs before claiming any task; identify overlap, owner and dependency in each PR body.
- **No wholesale redesign:** target one controlled component or one flow per PR; minimize shared-file edits during simultaneous lanes.

## Suggested PR shape

Title: UX-P20: explain next rental action without duplicate CTA  
Scope: one presentational component; existing BookingDetail resolver; targeted tests only.  
Excluded: no status enum, permissions, SQL, live data, deployment or new actions.  
Acceptance: old header verb unchanged, no duplicate primary, blocked reason truthful, money-blind roles secure, width/device tests, local gates.  
Rollback: remove summary component from parent; leave canonical resolver intact.

## Implementation reporting

Statuses must reflect evidence, not intent: Not audited → Existing verified / Gap verified → Proposed → Owner decision (if needed) → Branch PR → Local verified → Staging/device verified → Merged/released. Do not assert a global percentage from this backlog. Link to PROGRESS for actual completion.

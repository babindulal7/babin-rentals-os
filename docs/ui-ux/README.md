# Babin Rentals OS — UI/UX Master Planning Hub

**Created:** 9 November 2026  
**Status:** Proposed planning and audit framework, not a new product ruling or proof of completion  
**Scope:** Existing internal rental OS; desktop, tablet, phone, warehouse and finance-sensitive experiences  
**Baseline inspected:** main fb2acf9e377b3aad44bb1f8c35b03b0ee200e596 (9 Nov 2026)

## Start here

This folder is the index for a complete, **source-first UI/UX program**. It does not replace the authoritative rules, current release plan, task cards or implementation ledger. The goal is a fast and safe daily operating system: fewest avoidable taps, no fake saves, no role leaks, no double booking, and no accidental equipment handover.

The working model: **2 disciplines (UX / UI), 5 UX layers, 4 UI element groups, 6 iterative design steps**. Proposed inventory: **60 reusable UI component/pattern design targets** and **16 end-to-end UX journeys**. These are planning scopes, **not** 60 missing components, 76 finished features or a measured completion percentage.

### Files

| File | Purpose |
| --- | --- |
| [01_FRAMEWORK_AND_GOVERNANCE.md](01_FRAMEWORK_AND_GOVERNANCE.md) | Six-step process, five UX layers, safe authority and evidence |
| [02_ROLES_AND_RESEARCH.md](02_ROLES_AND_RESEARCH.md) | Nine roles, tasks, questions and research scorecard |
| [03_INFORMATION_ARCHITECTURE.md](03_INFORMATION_ARCHITECTURE.md) | Actual navigation, screen families, device hierarchy |
| [04_UI_COMPONENT_INVENTORY.md](04_UI_COMPONENT_INVENTORY.md) | 60 grouped element targets and reuse audit |
| [05_UX_WORKFLOW_CATALOG.md](05_UX_WORKFLOW_CATALOG.md) | 16 user journeys, exception paths and acceptance |
| [06_SIX_STAGE_OPERATIONS.md](06_SIX_STAGE_OPERATIONS.md) | Staff-facing packing-to-turnaround journey, authoritative lifecycle mapping |
| [07_DESIGN_SYSTEM.md](07_DESIGN_SYSTEM.md) | Tokens, typography, semantics, responsiveness, accessibility |
| [08_CONTEXTUAL_NEXT_ACTION.md](08_CONTEXTUAL_NEXT_ACTION.md) | Extend the existing canonical resolver without duplicate CTAs |
| [09_USABILITY_AND_ACCEPTANCE.md](09_USABILITY_AND_ACCEPTANCE.md) | Design review, per-role testing, persistence and evidence |
| [10_ROADMAP_AND_BACKLOG.md](10_ROADMAP_AND_BACKLOG.md) | Safe, dependency-ordered PR backlog; no invented done statuses |
| [11_TASK_TEMPLATE.md](11_TASK_TEMPLATE.md) | Copyable task and handoff checklist |

## Authoritative sources, in order

1. [Documentation authority](../00_READ_FIRST.md) and [AGENTS.md](../../AGENTS.md)
2. [CLAUDE.md](../../CLAUDE.md) and [PERMISSIONS.md](../PERMISSIONS.md)
3. Newest explicit owner rulings, [PRODUCT_RULES.md](../PRODUCT_RULES.md), [CURRENT_STATE.md](../CURRENT_STATE.md)
4. [PROGRESS.md](../../PROGRESS.md), [PLAN.md](../../PLAN.md), and active [docs/plans](../plans/README.md) cards
5. [UI_UX_RULES.md](../UI_UX_RULES.md), [USABILITY_TESTS.md](../USABILITY_TESTS.md), [WORKFLOWS.md](../WORKFLOWS.md), current code

Historical UI plans and dated audits are **evidence/reference**, not present-tense completion reports. Where this hub conflicts with rules or active task cards, the authoritative source wins. Record an unresolved choice for the owner rather than silently changing it.

## Current inventory snapshot, not a completion claim

At inspected main, there are approximately **97 UI TSX files** under src/components/ui (including nested non-test components), **15 shared shell TSX files**, and **229 non-test TSX files** in src/modules. File counts are not component counts and do not establish quality or coverage. The 60-item list in this folder is a conceptual design checklist.

## How to use

1. Select a real user task from the 16 journeys and the existing T-track card.
2. Map role/capability, branch scope, authoritative state/gate, data read and commit action.
3. Audit existing components and current PRs before creating anything.
4. Sketch phone, iPad portrait/landscape and desktop layouts; test the sketch.
5. Implement as a focused branch/PR, reusing components and engines.
6. Run mock + local gates, then staging, real devices and staff test. Record exact evidence in PROGRESS only after verification.

**Safety:** No migrations, live Supabase operations, permission changes, merges, deployment or financial action are authorized by these planning documents. Existing PRs (including UX, evidence, labels, governance, availability and CI repairs) should be reviewed for overlap before assigning work.

## Proposed tracking fields

Each element or workflow should be marked **Not audited / Existing—needs verification / Needs improvement / In PR / Verified local / Verified staging-device / Released**. Record source file, PR, tests, device screenshots, role and owner evidence. Only PROGRESS and fresh checks can substantiate completion.

## Initial recommendation

Prioritize workflow clarity, **one contextual primary action**, scanner-first floor UX, verified equipment readiness, full error-state honesty, and shared controls before additional full-app aesthetic redesigns.

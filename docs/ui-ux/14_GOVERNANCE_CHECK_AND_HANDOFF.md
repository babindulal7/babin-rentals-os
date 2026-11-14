# Governance check — existing PR #127 and required local gates

**Checked:** 12 November 2026 · main d4486a4ac681da766b345089ad4aa36b2b6e9075  
**Purpose:** explicitly resolve two requirements in the supplied master specification **without making duplicate changes to canonical registers**.

## Requirement 1 — D-UX-01…05 → O-23…O-27

**ALREADY IMPLEMENTED IN MAIN by merged PR #127.** Current files:
- [PLAN.md §4.2](../../PLAN.md) contains **O-23 through O-27**, with default positions and UX-P dependencies.
- [docs/OPEN_DECISIONS.md §22](../OPEN_DECISIONS.md) contains their full open questions.
- [06_SIX_STAGE_OPERATIONS.md](06_SIX_STAGE_OPERATIONS.md) and [10_ROADMAP_AND_BACKLOG.md](10_ROADMAP_AND_BACKLOG.md) reference the canonical O numbers.

| Canonical ID | UX ID | Decision and default (not an approved answer) |
| --- | --- | --- |
| O-23 | D-UX-01 | Case/container identity, labels and custody; no persistent manifest until approved |
| O-24 | D-UX-02 | Stock-tracked subitems versus checklist templates; keep current behavior |
| O-25 | D-UX-03 | Persisted Testing Bay occupancy versus operator note; local-note default |
| O-26 | D-UX-04 | Category QC tasks/media safety/quick shelve; current Reset checklist until ruled |
| O-27 | D-UX-05 | October 24 future reservation policy; **do not change** by default |

None was answered by the act of registration. **Do not merge another PR that re-registers them.**

## Requirement 2 — docs-only gate exemption and full verification

**ALREADY IMPLEMENTED IN MAIN by PR #127 and existing repo governance.**
- [09_USABILITY_AND_ACCEPTANCE.md](09_USABILITY_AND_ACCEPTANCE.md) explicitly says a **docs-only change is not exempt** from local checks and file/link audit is not a substitute.
- [docs/plans/README.md](../plans/README.md) already requires `npm run gates` **for every card**, before push, in full CI order. Do not weaken this.
- **IMPORTANT:** The supplied "13-step" list omits checks required by the actual repository. Do **not** replace the authoritative sequence with a shorter list, or run `npm run gates` twice unless its current script explicitly requires it.

### Authoritative ordered gate list (17 checks before wrapper)

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:local-api-guards`
4. `npm test`
5. `npm run check:pglite`
6. `node scripts/test-booking-financial-integrity.mjs`
7. `npm run check:security`
8. `npm run check:lifecycle`
9. `npm run test:server-contracts`
10. `npm run test:partial-return`
11. `npm run lint:progress`
12. `node --test scripts/test-receipt.test.mjs`
13. `npm run lint:shell`
14. `npm run lint:ui-copy`
15. `npm run check:contrast`
16. `npm run build`
17. `npm run test:coverage`

**Run `npm run gates`** (the wrapper, authoritative source and order) on the exact PR head; `-- --quick` is not release acceptance. For documentation work, same checks still apply; do not claim passing results unless run and retained with SHA. CI may run on self-hosted machines but queued/green status on other SHAs is not proof for this head.

The full gates above were **not run while authoring these documentation files**; status is **draft / verification pending**. This is a reading/mapping exercise without a local checkout or hosted test database. GitHub PR review can proceed but should not be represented as ready for merge.

## Read-only verification and risks

- PR #112 (master UI/UX planning) merged.
- PR #126 (BookingDetail Quick Actions dedupe) merged.
- PR #127 (canonical UX decision registration + gate exemption removal) merged.
- PR #128 (shadcn/motion cleanup) merged.
- PR #129 (New Rental conflict modal) merged.
- PR #130 (paged pick list) merged.
- **Do not count merges as end-to-end acceptance.** PR #130 still cited browser/iPad tests as remaining.
- No duplicate decisions or gate requirements were added to PLAN, OPEN_DECISIONS, AGENTS, workflow or source.
- The standalone HTML's sample data, 7-role account names, fake `noop` handlers and financial edits are **not** implementation authority.

## Hand off to agents

For each screen/ID use [11_TASK_TEMPLATE.md](11_TASK_TEMPLATE.md), and record:
- current SHA, existing React handler and database read/write path;
- role capability, branch scope, money-blind DOM and network checks;
- prototype S-/T-/B-/IN-/DE-ID only as a **reference pointer**;
- owner decision needed versus approved rule;
- 375/820/1440 browser proof plus relevant physical orientation evidence;
- full local gates executed on exact PR head, retained logs and revert plan.

No main merge, live migration, deployment, automated client messaging, or payment/inventory mutation has been authorized here.

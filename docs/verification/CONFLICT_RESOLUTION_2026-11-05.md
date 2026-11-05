# Conflict resolution — 5 November 2026

Branch: `lane-a/T0-12-rules-and-app-conflicts`, isolated checkout `.worktrees/conflict-resolution`, base `25a5e9dc`. Original audit: `CONFLICT_AUDIT_2026-11-05.md` (historical finding snapshot).

## Changes

| Finding | Repair |
|---|---|
| Drafts automatically approved | Export requires matching stored review evidence; import requires reviewer/date and unchanged English source. Approval records retain both texts, so edits invalidate review. Old wave exports regenerated as pending; the separately approved glossary is preserved. |
| Nepali activation before readiness | Whole-app conversion, exact-text approval, per-module layout evidence and final owner approval are required. Runtime activation and account hydration enforce the gate. Settings and command palette cannot bypass it. No production preview bypass. |
| Device-wide language | Self-owned account Auth metadata stores `staff_language`. Legacy device/org language is ignored. Auth changes/sign-out restore/reset the active language, and late save responses cannot update another account's UI. No role data is read from metadata. |
| Done while awaiting merge | Existing cards and 123 prompt files now use ready/acceptance_pending appropriately. Done requires actual merge and acceptance. |
| Circular translation acceptance | Per-wave layout checks run incrementally in isolated local test fixtures; T6-08 collects final evidence. Implementation dependencies permit drafting while acceptance stays pending. |
| Conflicting authority | Babin's interactive answers recorded in RULINGS C-2–C-4, PROGRESS and code: latest explicit product ruling wins; Foundation is fallback; new product decisions are asked; routine engineering remains autonomous. |
| Floor and portal documentation | Floor rows name the restrictive five-role implemented set, excluding Coordinator. Portal section describes existing bindings, retaining D-5/N-7 gates. No permission grants changed. |
| Stale current-state/navigation/CI text | Current-state banner links current evidence and labels older checkpoints historical. Navigation guide restored. CI wording follows W75 local gates. |

Account preferences use the existing self-update Auth API. The follow-up glossary request uses migration **0222**, which retains the 265 previously approved baseline terms, adds immutable approval revisions and an Owner-only idempotent RPC, and enables staff-only realtime refresh. “Approve and apply” publishes matching whole Nepali terms immediately, preserving placeholders, Latin numbers/brands/identifiers and English. An older wording is restored as a new approval. No hosted change was performed.

Shared files changed under T0-12: `PLAN.md`, `docs/PERMISSIONS.md`, `src/lib/rbac.ts`, `src/actions/core.ts`, `src/types/database.ts`. The new `glossary.manage` capability mirrors the database's Owner-only rule and has a nine-role dispatcher fixture. No money-engine change.

## Verification

- Regression reproduced before fix: draft-export test failed because nonempty text was marked OK.
- Review-script checks: 6 passed, including reviewer/date rejection, stale English, foreign paths/unknown keys, approved round-trip and approval invalidation on changed Nepali.
- Targeted engine/auth/settings checks: 7 files, 77 tests passed. These preceded final mock-adapter and presentation refinements; the full gate run checks final source separately.
- Local DB checks: migration chain rebuilt 219/219; lifecycle 64/64 passed including L63. The standalone glossary proof covers all nine roles, anon denial, retries, stale edits, invalid text, restore history, immutable records and database audit. Final source will be checked by the full gate run.
- Browser checks: 9 passed at 375/820/1440—language gating as Owner/Warehouse, glossary hidden from Warehouse, and actual mock approvals at all three Owner widths. Screenshots and results: `artifacts/conflict-resolution/browser/`. Physical-device acceptance is separate. The native browser helper timed out; these checks used local headless Chromium with external requests blocked.
- Review-script and glossary database regressions are now part of the existing UI-copy/security gate commands, preserving the CI-reference gate order.
- Full `npm run gates`: final run pending. Do not infer later gates from an earlier pass.

## Review and activation procedure

Export a wave; Babin reviews exact English/Nepali wording, marks each approved row OK, and fills `reviewed_by` and `reviewed_at` (YYYY-MM-DD). Import saves matching evidence in `src/i18n/review-approvals.json`. A missing review stays pending; old generated OK labels must not be accepted as human approval.

Only after all components in a module are converted and its device/layout checks pass, record that evidence in `src/i18n/release-readiness.json`. Final whole-app owner approval is separate. The manifest starts unverified; no approval or physical-device result was invented by this repair.

## Remaining

- Babin's actual wave review, physical-device checks and merge remain required. Nepali is unavailable until acceptance is complete.
- O-21 answered: Owner only, immediate application of approved term changes. The editor is implemented locally; its production use awaits Babin's backup/apply of migration 0222.
- `npm audit` ran before the claim commit and reported 36 existing dependency advisories (3 low, 15 moderate, 14 high, 4 critical). No dependency changes or automatic major upgrades were made by this repair.
- Production remains HOLD. No deployment, live migration, credential change, push or merge was performed.

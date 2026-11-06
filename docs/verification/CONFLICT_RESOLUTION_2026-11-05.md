# Conflict resolution — 5 November 2026

Branch: `lane-a/T0-12-rules-and-app-conflicts`, isolated checkout `.worktrees/conflict-resolution`, base `25a5e9dc`. Original audit: `CONFLICT_AUDIT_2026-11-05.md` (historical finding snapshot).

Final local verification completed **6 November 2026 NPT** on source commit `0a330c94`, fingerprint `793cb9cd83febec62351182842635b854240b90069943d3af17e6e2f345fdf52`. All 17 full gates passed in CI-reference order. T0-12 is ready for Babin's review and local merge. Migration 0222 is WRITTEN + VERIFIED locally, NOT APPLIED or PRODUCTION-VERIFIED.

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

Shared glossary refreshes merge immutable revision history, so an older or empty read cannot undo an approval already observed by the client. Account changes still clear the active account's glossary state. A regression covers this delayed-read case.

The final contract preflight exposed an expired fixed-date reservation fixture. Its booking now spans yesterday through three days from today, and its reservation uses the same booking dates. The original strict retirement refusal assertion remains unchanged; all 58 server-contract assertions pass with the corrected fixture.

## Verification

- Regression reproduced before fix: draft-export test failed because nonempty text was marked OK.
- Review-script checks: 6 passed, including reviewer/date rejection, stale English, foreign paths/unknown keys, approved round-trip and approval invalidation on changed Nepali.
- Targeted engine/auth/settings checks: 7 files, 77 tests passed. These preceded final mock-adapter and presentation refinements; the full gate run checks final source separately.
- Final local DB checks: migration chain rebuilt 219/219; lifecycle 64/64 passed including L63. The standalone glossary proof covers all nine roles, anon denial, retries, stale edits, invalid text, restore history, immutable records and database audit. No anonymous view leaks or unauthorized anonymous RPCs; all 183 definer functions have pinned search paths.
- Browser checks: 9 passed at 375/820/1440—language gating as Owner/Warehouse, glossary hidden from Warehouse, and actual mock approvals at all three Owner widths. Screenshots and results: `artifacts/conflict-resolution/browser/`. Physical-device acceptance is separate. The native browser helper timed out; these checks used local headless Chromium with external requests blocked.
- Review-script and glossary database regressions are now part of the existing UI-copy/security gate commands, preserving the CI-reference gate order.
- Full `npm run gates`: **17/17 PASS** on unchanged source, including typecheck, zero-warning lint, local API safety guards, 6,718 tests in 553 files, PGlite, financial integrity, security, lifecycle, 58 server-contract assertions, 58 partial-return assertions, progress/receipt/shell/UI-copy checks, 106/106 contrast pairs, build/PWA and full V8 coverage. Coverage reran all 6,718 tests successfully; overall statements 66.3%, branches 74.63%, functions 51.51%, lines 66.24%. A passing coverage run is not a claim of complete coverage.
- Final run used `VITEST_MIN_FORKS=1`, `VITEST_MAX_FORKS=2`, `VITEST_MIN_THREADS=1`, `VITEST_MAX_THREADS=2` to limit shared-machine contention. A prior run had one 30-second seeded-navigation timeout (6,717 passed); both navigation tests passed in isolation before the complete rerun. No timeout, test scope or assertion was weakened. Logs: `artifacts/conflict-resolution/full-gates.log` and `navigation-recheck.log`; failed attempts retained separately.

## Review and activation procedure

Export a wave; Babin reviews exact English/Nepali wording, marks each approved row OK, and fills `reviewed_by` and `reviewed_at` (YYYY-MM-DD). Import saves matching evidence in `src/i18n/review-approvals.json`. A missing review stays pending; old generated OK labels must not be accepted as human approval.

Only after all components in a module are converted and its device/layout checks pass, record that evidence in `src/i18n/release-readiness.json`. Final whole-app owner approval is separate. The manifest starts unverified; no approval or physical-device result was invented by this repair.

## Remaining

- Babin's actual wave review, physical-device checks and merge remain required. Nepali is unavailable until acceptance is complete.
- O-21 answered: Owner only, immediate application of approved term changes. The editor is implemented locally; its production use awaits Babin's backup/apply of migration 0222.
- Hosted Auth metadata, PostgREST/RLS and cross-client Realtime acceptance remain unverified. Mock browser and local PGlite evidence do not establish hosted or physical-device acceptance.
- `npm audit` ran before the claim and final documentation commits and reported 36 existing dependency advisories (3 low, 15 moderate, 14 high, 4 critical). The final refresh used a bounded registry fetch timeout with no retries. No dependency changes or automatic major upgrades were made by this repair.
- Production remains HOLD. No deployment, live migration, credential change, push or merge was performed.

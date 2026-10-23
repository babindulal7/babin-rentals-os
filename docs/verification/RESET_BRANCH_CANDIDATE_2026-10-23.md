# Reset branch boundary — local candidate, 23 October 2026

Status: migration WRITTEN + VERIFIED locally (PGlite and lifecycle green together); NOT APPLIED and NOT PRODUCTION-VERIFIED. All 16 fixed-source pipeline steps, separate coverage and live-mode build pass. Production unchanged; launch HOLD.

## Decision and implementation

Babin chose **the unit's current warehouse branch** for an unbooked cleaning/reset item. Linked items continue to use booking branch. The lookup is `product_units.warehouse_id → warehouses.branch_id`, not `product_units.branch_id`, and is evaluated on each write. Unknown identity/site denies work.

Candidate 0172 depends on the guarded 0171 candidate already present at base `14dbbe3a`. The shared primary checkout does not contain 0171. No candidate migration has been silently restored into primary or applied remotely.

- Restrictive RLS policies cover cleaning queue/task insert, update and existing delete paths; they do not add any delete permission. Existing role policies and read behavior remain necessary and unchanged.
- Update checks apply to old and new queue scope and old/new task parents. An actor cannot reparent denied work into an allowed branch or move allowed work into a denied branch.
- The authorization helper is SECURITY INVOKER, has a pinned search path and denies anon execution; no new elevated-definer lookup was introduced.
- All four floor actions call the branch assertion before writing. Refused, missing and unreachable RPCs fail closed. The mock has explicit branch-history behavior instead of fabricating success for an unknown RPC.

Changed source is in `C:/Users/use/.codex/worktrees/verified-release-checkpoint/babin-rentals-os`:

- `supabase/migrations/0172_reset_branch_write_boundary.sql`
- `src/actions/rentals/floorVerb.ts` and its tests
- `src/lib/__mocks__/client.ts` and `operationsGrant.test.ts`
- `scripts/test-reset-branch-boundary.mjs`
- matching ruling, permission scope note, open-decision record and progress entry

## Executed evidence

- Database regression: **14/14 groups pass** with 0172. Running the same test with `--without-fix` fails the first cross-branch write assertion. This is the expected red control, not a passing release gate.
- Focused action/mock suites: **90/90**. Twelve preflight denial tests cover all four floor verbs × wrong branch / missing RPC / failed fetch, asserting no writes.
- Full suite: **5,339/5,339**, **426 files**, no failed/skipped tests. Typecheck, lint, 170/170 migrations, 31/31 lifecycle, eight financial-integrity assertions, 18 existing security groups, 14 new Reset groups, 11 receipt regressions, shell/copy checks, 82/82 contrast checks, progress lint, and mock/live-mode builds are green.
- Separate coverage suite: **5,339/5,339**, zero failed/skipped tests, unchanged source. Generated `npm run completion` returns exit 0; [raw counter output](../../artifacts/release-checkpoint/reset-candidate-0172/completion.stdout.log) is structural coverage only, not a readiness certificate.
- Instrumented coverage: statements **66.12%**, branches **74.32%**, functions **51.09%**, lines **66.05%**. Current config measures `src/lib`, `src/actions` and `src/modules`; this is not an old lib-only comparison and does not imply complete functional coverage.
- Candidate source fingerprint: `4dce451962c91bf1bfe0e86840fe760b06d81a18d30f7ff881e8ece1e603ef19` (base commit `14dbbe3a` plus isolated uncommitted candidate changes). No source change was observed across completed gates. This is not the newer primary source.
- Live-mode compilation: no mock-store markers, zero source maps, 21 `.woff2` files; 247 PWA precache entries. This is build inspection, not hosted or old-device acceptance.
- Full pipeline and logs: `artifacts/release-checkpoint/reset-candidate-0172/`. Historical checkpoint logs remain separate and unchanged.

## Boundaries before integration

The explicit site choice is resolved. The wider 0171 grant-default/admin model, shared-checkout reconciliation and actual release snapshot remain pending. This is a candidate fix, not approval of that model. Queue insertion is also scoped, so Return's automatic creation of cleaning work must be reviewed with split Return/Reset grants before integration; the existing pristine-user compatibility behavior is retained, not newly approved here. Existing role-policy discrepancies are not widened by this patch.

Current Supabase discovery again returned only production `sxguwvgoserhdolewibb` and its default `main` branch. Saved documentation still calls for isolated staging provisioning, and no `BABIN_STAGING_*` process variables were present. No production request was substituted for staging. Hosted JWT/PostgREST/Storage acceptance needs an identified isolated target and securely supplied fixtures/credentials.

The five local `.env*` files contained no `BABIN_STAGING_*` variable names, and the only configured hosted project ref was production. Only names/ref matches were printed, never keys, passwords or JWTs. The staging harness safety tests passed 2/2; the actual verifier returned INCOMPLETE (exit 1), with a redacted report under `artifacts/staging-verification/2026-10-23T13-50-38-657Z`. The shared-primary `npm run completion` also returned exit 1 and correctly reports its source NOT VERIFIED.

The device reply was ambiguous; physical models/access were requested again while local work continued. Browser emulation does not certify camera/scanner permissions, actual serial input, touch/rotation, signature capture, offline font rendering or two-device reconnect/idempotency.

## Remaining acceptance

1. Review/integrate the guarded 0171 + 0172 candidate on one chosen release source, wire `test-reset-branch-boundary.mjs` into permanent security/CI gates, then retain matching receipts for that source. The isolated verification wrapper requires this regression, but it is not yet wired into shared-primary CI.
2. Use isolated staging with genuine role sessions for positive and negative Reset queue/task writes, revoke/reissue, unit warehouse transfer, and Return auto-enqueue with split grants. Repeat Storage ownership/money-blind and assigned-trip tests.
3. On the actual phone/iPad/scanner, perform Pack → Handover → Return → Reset, including offline draft reload and reconnect. Record devices, permissions, evidence/signature/scanner outcomes and duplicate-write checks. Do not claim online custody completed while offline.
4. Keep production HOLD until owner-controlled backup/restore rehearsal and cutover authorization. N-5 prohibits agent live migration application.

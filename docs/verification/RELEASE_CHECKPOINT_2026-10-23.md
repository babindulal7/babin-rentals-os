# Release verification checkpoint — 23 October 2026

Status: **standard local gates PASS for the pinned snapshot; release HOLD.** The additional Reset branch-scope probe FAILS. Hosted, physical-device and latest shared-checkout acceptance are not certified.

## Exactly what was verified

- Commit: `14dbbe3aab08391583802fdd9a49c0a42400066e`.
- Source fingerprint: `878b229b72e1094d0b9bc894fb9d42ccb66a04cf8ed74babf30eac470d1f9b72`.
- Attached isolated worktree: `C:/Users/use/.codex/worktrees/verified-release-checkpoint/babin-rentals-os`.
- All 15 standard command steps and the separate live-mode build recorded unchanged source fingerprints. Installed dependencies were reused through a junction; no new package installation was performed.
- The shared checkout advanced during this run. A comparison observed HEAD `279de0e3` and fingerprint `99256e8e2a73332c0ed063db58924c86eb99e537968fdb1cafa620e9576d55ac`, which do not match the checkpoint. Later shared edits are not certified. The primary checkout no longer contains draft migration 0171; the pinned candidate does. Nothing was restored, removed or applied by this task.

## Executed local results

| Check | Result |
|---|---|
| TypeScript | PASS |
| Full test run | 5,320/5,320 tests, 425 files; PASS, unchanged source |
| Separate coverage run | 5,320/5,320 tests, 425 files; PASS, unchanged source |
| PGlite rebuild | 169/169 migration files, zero failures |
| Financial integrity | 8 local SQL assertions passed |
| Standard security suite | 18 local SQL groups passed; not hosted JWT/Storage certification |
| Lifecycle | 31/31 local PostgreSQL + RLS steps passed |
| Evidence-receipt regression tests | 11/11 passed |
| Lint / shell / UI copy | PASS; 708 shell files; 5 UI-copy checker tests |
| Contrast | 82/82 passed |
| Progress lint / completion | PASS in isolated worktree |
| Mock-environment build | PASS; not a deployable production configuration |
| Separate live-mode build | PASS; 247 PWA entries, no deployment |
| Live-mode asset inspection | Zero mock-store markers, zero source maps, 21 packaged `.woff2` files |

Coverage aggregates from Vitest: statements 66.16%, branches 74.57%, functions 51.14%, lines 66.1%. The pinned configuration measures lib, actions and modules; these figures are not comparable with an older lib-only coverage baseline. A successful coverage command does not mean every path is covered.

Raw evidence: [command results](../../artifacts/release-checkpoint/checkpoint-14dbbe3a/commands.json), [shipping build](../../artifacts/release-checkpoint/checkpoint-14dbbe3a/shipping-audit/commands.json), [generated checkpoint completion block](../../artifacts/release-checkpoint/checkpoint-14dbbe3a/completion.stdout.log). Scripts and individual stdout/stderr logs are retained under `artifacts/release-checkpoint/`. No receipt was edited to make a different source tree pass.

## Browser acceptance: emulation, not hardware

The seeded compiled mock ran on localhost with external requests blocked. Synthetic test-only identities exercised all nine roles through the real sign-in UI. Six workspaces at 390, 820 and 1280px produced 162 captures. All nine layout groups passed: one 64px header, no measured page/header overflow, header touch targets at least 44px, and no visible rupee amounts for Warehouse, Technician, Driver or Client. Populated positive controls were required for Owner, Warehouse, Technician and Accounts; Owner also had a positive financial control.

Client captures exercise restricted staff routes, not a positive own-client portal workflow. The mock does not certify assigned-trip or tenant RLS; those require authenticated staging tests. No uncaught browser errors were observed.

One checked packing mark survived a phone-sized offline reload and reconnect. This proves local mock shell/cache/draft behavior only. Custody commits, actual scanner/camera/signature capture, durable two-device replay and identity-switch recovery are NOT certified by that check.

Evidence: [nine-role matrix](../../artifacts/release-checkpoint/checkpoint-14dbbe3a/browser-seeded/report.json), [successful packing retry](../../artifacts/release-checkpoint/checkpoint-14dbbe3a/browser-seeded/packing-retry-2026-10-23T12-53-49-005Z.json). The matrix report retains the first flow-selector failure; the separate retry records the successful draft test. Earlier missing mock-configuration, unseeded-data and selector attempts remain retained rather than being counted as populated acceptance passes.

## Additional security finding: Reset branch enforcement

The isolated 0171 candidate has a demonstrable enforcement gap:

1. A synthetic Warehouse actor is granted Reset only at branch A.
2. The helper permits A and denies B; calling the explicit assertion for a branch B booking is correctly refused.
3. The same authenticated actor nevertheless updates one branch B cleaning-queue assignment directly.
4. `floorVerb.ts` does not call the early assertion described in migration 0171.

Evidence: [local negative probe](../../artifacts/release-checkpoint/checkpoint-14dbbe3a/reset-branch-probe.json). This is not a production exploit test and does not claim a completed Reset custody transition. It proves that the candidate's branch restriction does not enforce this Reset write. The broader location model is already unapproved in `OPEN_DECISIONS.md`; passing the ordinary migration/security suite cannot approve it.

**Follow-up:** Babin subsequently chose the unit's current warehouse branch for unbooked Reset items. A new isolated 0172 candidate implements database queue/task boundaries (old/new scope), early floor-action checks and positive/negative regressions. See [the separate candidate report](RESET_BRANCH_CANDIDATE_2026-10-23.md). The original checkpoint/probe results above remain unchanged historical evidence. No candidate migration was applied remotely; broader 0171 approval and primary integration remain pending.

## Hosted, backup and device blockers

- Supabase discovery returned only the known production project and its default branch. No isolated staging project, staging variables, nine-role JWT set or fixture manifest was available. The staging verifier returned INCOMPLETE without making production requests. Its two local safety tests passed, including production-target refusal and incomplete-fixture refusal.
- Staging still requires a separately identified project, securely supplied credentials/JWTs, positive and negative ownership/assignment fixtures, migration rehearsal and real Auth/PostgREST/Storage checks. Do not paste secrets into chat.
- `pg_dump` is not on PATH. No production backup or restore was attempted. Follow `BACKUP_PROTOCOL.md` with hidden-input credentials and tools compatible with the target server; owner-controlled cutover remains separate.
- No physical iPad/phone/scanner was available through this session. Actual touch/rotation, camera permissions, scanned serials, signatures, 125% browser zoom, offline Nepali glyphs and reconnect/idempotency acceptance remain open.
- `PLAN.md`, referenced by contributor instructions, is missing. The unresolved site question is logged in `docs/OPEN_DECISIONS.md`; no replacement roadmap was invented.

Supabase's current [TLS deprecation notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) should be included in old-device acceptance before its earliest 10 November 2026 removal date. Its [PostgreSQL minor-release notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) also requires affected extension/index/operator checks before upgrade or staging rehearsal. These were reviewed as prerequisites; no server upgrade, reindex or hosted mutation was performed.

## To finish

1. The unbooked Reset site decision is now resolved and its candidate repair tested locally; settle the broader grant model and review/integrate the candidate pair before treating it as shipped.
2. Settle shared edits, select the actual release snapshot and repeat source-matched gates for that snapshot; do not copy this checkpoint's green status onto newer code.
3. Provide isolated staging access and complete migration/Auth/Storage rehearsal.
4. Complete the real-device/scanner/offline floor loop, then follow owner-controlled backup and release approval. Production remains HOLD.

# Main and scanner integration — 30 October 2026 (NPT)

Branch: `lane-a/T2-09-main-integration`.
Verified source fingerprint: `536f8c0098816419072c067b7dce0bf4cb614b6bfc3d8bc9bbd06da6895b1d59`.

The integration reconciles the divergent local/GitHub main histories, incorporates the
T1-15 PIN design note and T3-14a invoice-hardening prompts, and integrates T2-09 scanner
code. It also contains the current main baseline `4126767cf26b5cd79aaade5eeb8c80db83154855`.

Scanner input now respects ordinary editing, nested dialogs, camera/dispatch/loading
state and duplicate suppression. A regression reproduced a hidden Suspense workspace
accepting `PARTIALHIDDEN-1`; the listener now uses a layout effect so hiding detaches it
and clears buffered input. The regression verifies scanning resumes after reveal.
The existing offline-photo message was corrected after `lint:ui-copy` rejected internal
rule numbers in staff-facing text.

## Local verification

Checks executed on 29 October; the final source fingerprint is revalidated at closeout on 30 October.

| Check | Result | Seconds |
|---|---|---:|
| `npm.cmd run typecheck` | PASS | 725.7 |
| `node node_modules/vitest/vitest.mjs run src/lib/__tests__/barcodeBurst.test.ts src/components/ui/__tests__/ScannerInput.test.tsx --maxWorkers=1` | PASS | 43.3 |
| `npm.cmd test -- --maxWorkers=2` | PASS | 3201.8 |
| `npm.cmd run check:pglite` | PASS | 42.9 |
| `npm.cmd run check:lifecycle` | PASS | 53.6 |
| `node scripts/test-booking-financial-integrity.mjs` | PASS | 33.9 |
| `npm.cmd run check:security` | PASS | 129.5 |
| `npm.cmd run test:server-contracts` | PASS | 43.0 |
| `npm.cmd run test:partial-return` | PASS | 44.2 |
| `node --test scripts/test-receipt.test.mjs` | PASS | 2.9 |
| `npm.cmd run lint` | PASS | 326.9 |
| `npm.cmd run lint:shell` | PASS | 48.3 |
| `npm.cmd run lint:ui-copy` | PASS | 44.4 |
| `npm.cmd run check:contrast` | PASS | 14.5 |
| `npm.cmd run build` | PASS | 1307.5 |
| `npm.cmd run test:coverage -- --maxWorkers=2` | PASS | 1920.5 |

Raw logs: `artifacts/main-scanner-integration-20261028/` in this worktree.
The preceding attempt is retained separately; its UI-copy failure does not certify this source.
Full mock suite and coverage each passed 5,915/5,915 tests in 486 files; scanner 39/39, migrations 182/182, lifecycle 41/41, server contracts 58/58, partial Return 58/58, contrast 106/106. Test and coverage commands used `VITE_DATA_SOURCE=mock`.
Completion was generated with `npm run completion`; `npm run lint:progress` PASS after writing the log.

## Acceptance still open

- Browser automation repeatedly timed out. Screens at 375, 820 and 1440 px as
  Owner/Coordinator and Warehouse are NOT VERIFIED.
- Physical iPad/Bluetooth 50-serial acceptance and manual-tick tap counts are NOT VERIFIED.
  T2-09 remains doing, waiting on O-16 hardware acceptance.
- Hosted Auth/PostgREST/Storage, offline-device and production acceptance are not certified.
  No live migrations or hosted changes were applied.
- Current main already contains Team Notes 0185. Its broad acknowledgement UPDATE policy
  and call to `auth_is_coordinator_or_above()` (no definition found in migrations) still
  need lane B review and runtime role regressions. Passing general gates does not close
  these findings. The held Reset branch must renumber its conflicting 0185 before merging.
- Other feature heads have advanced since the captured branch review and need fresh review.
  Newer T1-15 records a four-digit resolution and adds migration 0186; newer T3-14a adds
  migration 0193 and an action change. Those runtime changes are outside this frozen source.
  The unresolved PIN decision in the captured design note is historical, not a new request
  for Babin to decide again. The PIN-titled commit already on main contains preview files.

Local `main` was fast-forwarded from `4126767c` to verified integration `4a31908aba0518f382de3a459078e47541e9b687` on 30 October, using an expected-old-ref guard and confirming main was not checked out elsewhere. The following closeout commit changes documentation only.
The original checkout and its concurrent drafts are preserved.

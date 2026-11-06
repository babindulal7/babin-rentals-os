# T0-13 dependency review

Local review on 5 November 2026, based on the installed lockfile and registry audit.
This is evidence for T0-13, not a release approval.

## Changes verified so far

- Removed `opencode-chromium`. Repository search found no application imports or
  commands using it. The lockfile removed 98 package entries without changing any
  remaining package version.
- Updated `concurrently` 10.0.5 → 10.0.6. This changes its pinned `shell-quote`
  dependency from 1.9.0 to 1.12.0. The reviewed diff changes only these two
  installed package entries and the root dependency range.
- A fresh isolated installation completed with install scripts disabled.
  `concurrently` successfully launched both Node and npm version commands.

| Registry audit | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Before changes | 4 | 14 | 15 | 3 | 36 |
| After removing unused dependency | 4 | 9 | 14 | 3 | 30 |
| After launcher patch | 2 | 9 | 14 | 3 | 28 |
| After compatible transitive and Electron patches | 2 | 1 | 14 | 2 | 19 |
| After Vite/Vitest candidate installation | 0 | 0 | 10 | 2 | 12 |

These are npm's affected-package counts, including propagated dependency
findings. They are not counts of independently exploitable application flaws.
The raw registry responses are under the ignored local `artifacts/` directory.

The compatible batch updates these installed versions within their existing
parent ranges. Electron's direct lower bound is raised to 44.10.2. No override
or forced audit fix was introduced.

| Package | Before → after |
|---|---|
| `brace-expansion` nested copies | 1.1.18 → 1.1.21; 2.1.4 → 2.1.7; 5.0.9 → 5.0.12 |
| `fast-uri` | 3.1.5 → 3.1.9 |
| `follow-redirects` | 1.16.0 → 1.16.2 |
| `joi` | 18.2.9 → 18.3.2 |
| `nanoid` | 3.3.17 → 3.3.20 |
| `serialize-javascript` | 7.0.7 → 7.1.4 |
| `source-map-js` | 1.2.1 → 1.2.2 |
| `undici` nested copies | 7.30.0 → 7.30.2; 8.10.0 → 8.12.4 |
| `electron` | 44.4.5 → 44.10.2 |

Registry audit no longer reports these packages. Build and test verification for
this batch is recorded separately below.

The next candidate upgrades Vite 5.4.21 → 6.4.5, Vitest 3.2.7 → 4.1.12, and
`@vitest/coverage-v8` 3.2.7 → 4.1.12. This removes `tinypool`, `vite-node` and the
old coverage exclusion tree, and updates esbuild to 0.25.12. Installed plugin peer
ranges support Vite 6. The registry audit has no high or critical findings for
this candidate; application compatibility is still being verified.

The first full candidate run passed typecheck, lint and API guards, then failed
five audio tests and timed out starting the rental-list fork worker. The audio
fixture now uses a constructible function, matching the browser API, and restores
its stubbed globals. The fork-start failure reproduced with one worker. The same
two files passed all 49 assertions using worker threads; the candidate now uses
that pool while retaining isolation, two-worker concurrency and existing timeouts.
Full gates remain required after these changes.

On 6 November the configured two-thread pool passed all 96 tests in the audio,
rental list, list toolbar, record form and real workspace guidance regression
suites. The dependency audit was refreshed and still reports 12 affected
packages (0 critical, 0 high, 10 moderate, 2 low). This focused pass does not
certify the full suite or coverage.

## Remaining dependency paths

The execution descriptions below are inferences from `package-lock.json`,
`package.json`, `vite.config.ts`, `vitest.config.ts`, and `electron/main.cjs`.
A package marked as a production dependency by npm can still execute only while
building the application. This review does not establish exploitability.

| Affected package(s) | Dependency path and execution surface | Next change |
|---|---|---|
| `typescript-eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils` (moderate) | ESLint → TypeScript parser → `minimatch`. Runs in source lint. | Resolve the vulnerable matching dependency with supported parent versions; rerun source lint. |
| `minimatch`, `glob` (moderate) | Workbox build selection; `minimatch` also reaches the TypeScript lint parser. | Audit parent ranges. Fixed major versions require parent compatibility checks rather than an override. |
| `workbox-build`, `vite-plugin-pwa` (moderate); `@rollup/plugin-node-resolve`, `deepmerge` (low) | `vite-plugin-pwa` → Workbox build → Rollup node resolver → `deepmerge`. Used while generating the service worker. | Review supported Workbox/plugin versions and verify offline assets. Do not accept npm's suggested plugin downgrade without compatibility checks. |

Registry metadata checked during this review: the latest TypeScript lint parser
8.72.1 still requests `minimatch ^10.2.2`; Workbox build 7.4.1 requests
`glob ^11.0.1`; glob 11 currently ends at 11.1.0; the latest Rollup node resolver
16.0.3 requests `deepmerge ^4.2.2`, and deepmerge currently ends at 4.3.1.
Consequently, another compatible parent update does not remove these findings.
No out-of-range transitive override was installed.

TypeScript lint parser, Workbox build, Rollup node resolver and deepmerge registry
metadata were rechecked on 6 November; their versions and dependency ranges above
were unchanged.

The removed critical worker findings are documented by the upstream advisories
[worker options](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) and
[run options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).
The [Vitest 4 migration guide](https://v4.vitest.dev/guide/migration.html)
requires Vite 6 or newer and Node 20 or newer. Its mock and coverage changes need
verification against this repository's test runner. The existing explicit
coverage include list is retained. The [Vite 6 migration guide](https://v6.vite.dev/guide/migration.html)
documents the changes from Vite 5. No application configuration was changed merely
to suppress a migration check.

## Verification still required

A further full attempt on 6 November passed typecheck, lint and API safety
guards, but failed at tests: 533 files passed, one failed, and fourteen workers
failed to start. The workspace-guidance suite's first interaction test reached
its existing 60-second limit; its following six tests also failed.

The candidate now defaults to one worker. The guidance fixture preloads its
four real lazy workspace modules during collection, before interaction budgets
start. It keeps every workflow assertion and the existing timeouts. Typecheck,
changed-file lint and all 56 assertions across guidance, rental-list and acoustic
feedback suites passed after these changes. This focused result still requires
full-suite and coverage verification on the final integrated source.

The final lockfile also completed a new isolated installation on 6 November:
`npm ci --ignore-scripts --no-audit --no-fund` installed 749 packages and exited
zero. The copied lockfile remained byte-for-byte identical to the candidate
(SHA256 `9b82d6ca5a69b481406be23a6ca650dff76961ff1b2ab0882458f3accfdb8300`).
The fixture has its own node_modules directory. Vite 6.4.5, Vitest 4.1.12 and
concurrently 10.0.6 loaded their version commands; concurrently launched Node
and npm successfully. Electron installation scripts remain disabled, so this
does not certify its native binary or application launch.

The next complete gate attempt passed typecheck, source lint and local API
safety checks, then failed during Vitest worker startup: 545 files and 6675
tests passed, but three other files never ran. The runner correctly returned
failure despite the JSON reporter listing every reported assertion as passed.
The three affected files subsequently passed all 24 tests using the unchanged
two-thread configuration. A host sample showed 100% CPU and roughly 250 MB free
physical memory out of 16 GB while several other test runs were active. This
supports resource pressure as a cause; it does not certify the whole upgrade.
No test was skipped and no timeout or assertion was relaxed. A complete gate
pass remains required after the host settles.

- Typecheck and production build passed for the launcher patch. Both HTML
  entry documents and the generated service worker are present.
- The compatible batch passed typecheck, all 47 tests in the three focused UI
  suites, the launcher plus `wait-on` smoke check, and production build with PWA
  generation. Desktop launch remains unverified because install scripts were
  disabled.
- Run the local gates against the final dependency set. Test assertion corrections
  for current catalogue labels are on the sibling cancellation branch.
- Verify typecheck, lint, full tests, receipt integrity, coverage, both HTML entry
  documents and PWA generation against the Vite/Vitest candidate before treating
  it as a completed upgrade.
- Electron installation scripts were disabled; no desktop launch or device
  acceptance is claimed by the clean installation.
- Babin reviews and merges the branch locally.

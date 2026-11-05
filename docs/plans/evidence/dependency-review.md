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

These are npm's affected-package counts, including propagated dependency
findings. They are not counts of independently exploitable application flaws.
The raw registry responses are under the ignored local `artifacts/` directory.

## Remaining dependency paths

The execution descriptions below are inferences from `package-lock.json`,
`package.json`, `vite.config.ts`, `vitest.config.ts`, and `electron/main.cjs`.
A package marked as a production dependency by npm can still execute only while
building the application. This review does not establish exploitability.

| Affected package(s) | Dependency path and execution surface | Next change |
|---|---|---|
| `vitest`, `tinypool` (critical); `@vitest/mocker`, `@vitest/coverage-v8` (moderate) | Test runner, worker options, mock server and coverage. Referenced by the test scripts; not the shipped browser entrypoint. | Upgrade Vitest and its matching coverage provider together; verify runner receipts, mocks, full tests and coverage. |
| `vite` (high), `esbuild` (moderate) | Vite development server and build pipeline. `dev` exposes the server on the network; preview is a separate command. | Upgrade Vite with its plugin peers and verify both HTML entries, fonts and PWA output. |
| `typescript-eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils` (moderate) | ESLint → TypeScript parser → `minimatch`. Runs in source lint. | Resolve the vulnerable matching dependency with supported parent versions; rerun source lint. |
| `minimatch`, `glob`, `test-exclude` (moderate) | Workbox build and Vitest coverage selection; `minimatch` also reaches the TypeScript lint parser. | Audit parent ranges. Fixed major versions may require changes in Workbox and coverage rather than an override. |
| `workbox-build`, `vite-plugin-pwa` (moderate); `@rollup/plugin-node-resolve`, `deepmerge` (low) | `vite-plugin-pwa` → Workbox build → Rollup node resolver → `deepmerge`. Used while generating the service worker. | Review supported Workbox/plugin versions and verify offline assets. Do not accept npm's suggested plugin downgrade without compatibility checks. |
| `brace-expansion` (high) | ESLint and coverage matching; Workbox → `glob`/`minimatch`; Workbox → EJS → file matching. | Update compatible transitive versions and inspect every nested copy. |
| `fast-uri` (high) | Workbox build → Ajv → URI parser. The lint tree also contains an older Ajv major with a different dependency tree. | Update within the installed Ajv 8 range. |
| `electron` (high) | Desktop runtime, although declared in devDependencies. It hosts the application when the desktop commands run. | Use a patched Electron 44 version and complete desktop acceptance. |
| `undici` (high) | Electron binary downloader and jsdom test environment. | Update each installed major within its parent range; verify the test environment. |
| `follow-redirects` (high) | `wait-on` → Axios → HTTP redirects. Used by the desktop development launcher. | Update within the installed Axios range; smoke-test the launcher. |
| `joi` (high) | `wait-on` option validation. | Update the compatible Joi 18 patch and verify `wait-on`. |
| `nanoid` (high) | Vite → PostCSS → identifier generator. Build execution. | Update compatible Nano ID 3 and rebuild styles. |
| `source-map-js` (high) | PostCSS, Tailwind, jsdom CSS parsing and Vitest coverage utilities. | Update the compatible patch and verify build and tests. Production sourcemaps remain disabled. |
| `serialize-javascript` (low) | Workbox build → Rollup terser plugin → serializer. Build execution. | Update the compatible patch and verify generated service worker. |

The remaining critical worker findings are documented by the upstream advisories
[worker options](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) and
[run options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).
The [Vitest migration guide](https://vitest.dev/guide/migration/) requires Vite
6.4.0 or newer and Node 22.12.0 or newer for Vitest 5. Its changes to mock
clearing and reporting need verification against this repository's test runner.
The [Vite migration guide](https://vite.dev/guide/migration.html) also describes
the build-tool changes in Vite 8, so a latest-version install is not a substitute
for compatibility testing.

## Verification still required

- Typecheck and production build passed for the launcher patch. Both HTML
  entry documents and the generated service worker are present.
- Apply and verify the remaining compatible patches before changing tooling majors.
- Run the local gates against the final dependency set. Test assertion corrections
  for current catalogue labels are on the sibling cancellation branch.
- Electron installation scripts were disabled; no desktop launch or device
  acceptance is claimed by the clean installation.
- Babin reviews and merges the branch locally.

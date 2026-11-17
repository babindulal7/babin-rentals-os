# Vite Security Repair & Verification Report (GHSA-p4f5-76q4-ffq7)

- **Date:** 17 November 2026
- **Branch:** `fix/security-vite-ghsa-p4f5-76q4-ffq7`
- **Target Advisory:** [Vite GHSA-p4f5-76q4-ffq7 — Remote code execution using __vite-browser-external virtual module](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7)
- **Severity:** Critical (CVSS 9.1)
- **Applicability Statement:**
  - Vulnerability prerequisite confirmed: `package.json` had `"vite": "^5.4.11"` resolving to vulnerable `5.4.21`, with `server.host = true` binding to all interfaces and wildcard tunnel host suffixes in `allowedHosts`.
  - Development-environment risk: Not confirmed whether exploitation ever occurred or whether any server was exposed at the time of discovery.
  - Scope: Development server virtual module resolution; production build is statically compiled HTML/JS/CSS.

---

## 1. Before vs After Summary

| Property | Before Repair | After Repair |
|---|---|---|
| `package.json` | `"vite": "^5.4.11"` | `"vite": "6.4.6"` |
| `package-lock.json` | `5.4.21` | `6.4.6` (all dependencies deduped) |
| Dev server `host` | `true` (all interfaces: 0.0.0.0 / ::) | `process.env['VITE_HOST'] \|\| '127.0.0.1'` (loopback default) |
| Dev server `allowedHosts` | `['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io', '.pinggy.net', '.pinggy-free.link', '.pinggy.link', '.pinggy.io', '.pinggy.online', '.trycloudflare.com']` | Loopback origins `['.localhost', '127.0.0.1']` default; requires explicit `VITE_ALLOWED_HOSTS` opt-in |
| Preview server `host` | Unspecified (defaults to localhost) | `process.env['VITE_PREVIEW_HOST'] \|\| process.env['VITE_HOST'] \|\| '127.0.0.1'` |
| Preview server `allowedHosts` | Wildcard tunnel domains | Loopback origins `['.localhost', '127.0.0.1']` default; requires explicit `VITE_ALLOWED_HOSTS` opt-in |

---

## 2. Containment Inspection (Read-Only)

Executed pre-flight checks on development host (macOS):
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
ps aux | grep -Ei '[v]ite|[n]grok|[p]inggy|[c]loudflared'
```
- Port 3000 was free (no active listener).
- No Vite dev servers or tunnel processes (`ngrok`, `pinggy`, `cloudflared`) were running.

---

## 3. Dependency Compatibility & Nested Packages

Verified via `npm ls vite`:
```
babin-rentals-os@0.1.0 /Users/babindulal/babin-os-vite-security
├─┬ @tailwindcss/vite@4.3.3
│ └── vite@6.4.6 deduped
├─┬ @vitejs/plugin-react@4.7.0
│ └── vite@6.4.6 deduped
├─┬ vite-plugin-pwa@1.3.0
│ └── vite@6.4.6 deduped
├── vite@6.4.6
└─┬ vitest@3.2.7
  ├─┬ @vitest/mocker@3.2.7
  │ └── vite@6.4.6 deduped
  ├─┬ vite-node@3.2.4
  │ └── vite@6.4.6 deduped
  └── vite@6.4.6 deduped
```
Zero nested copies of vulnerable Vite (<6.4.6) remain.

---

## 4. Mac Verification Matrix

| Check | Command | Result | Details |
|---|---|---|---|
| Clean lockfile install | `npm ci` | **PASS** | 740 packages installed, audited in 7s |
| Dependency tree | `npm ls vite` | **PASS** | Pinned exactly to 6.4.6, all transitive deps deduped |
| TypeScript check | `npm run typecheck` | **PASS** | `tsc --noEmit` exited 0 with no errors |
| Test suite | `npm run test` | **PASS** | 635 test files passed (7,280 passed, 0 failed, 71.39s) |
| Production build | `CI=true VITE_DATA_SOURCE=mock npm run build` | **PASS** | Build succeeded in 5.16s, generated 299 PWA precache entries |
| Linting | `npm run lint` | **PASS** | `eslint src --max-warnings 0` exited 0 |
| Dev server loopback | `PORT=3399 npx vite --port 3399` | **PASS** | `lsof` confirmed listener bound strictly to `127.0.0.1:3399` |
| Preview server loopback | `PORT=4499 npx vite preview --port 4499` | **PASS** | `lsof` confirmed listener bound strictly to `127.0.0.1:4499` |
| Electron storage / paths | `node --check electron/main.cjs && node --test scripts/test-electron-storage-path.test.mjs` | **PASS** | 3 tests passed, valid storage isolation |

---

## 5. Independent Windows Verification

- Status: **BLOCKED / PENDING**
- Environment: Darwin macOS (babins-Mac-mini.local). Windows Antigravity must execute verification on Windows runner/host.

---

## 6. React & Supabase Advisory Applicability

- **React (`18.3.1`)**: SPA client build; no React Server Components (RSC) packages installed; unaffected by server-side RSC advisories.
- **Supabase JS (`2.112.0`)**: Standard browser client SDK; no applicable vulnerabilities for client data fetching.
- **Supabase Storage (`GHSA-fgvp-cqg6-q8h2`)**: App uses Cloudflare Pages hosting with standard Supabase client; migration `0170_astra_phase0_authorization.sql` defines explicit `auth_storage_object_allowed(bucket, name, ...)` checks revoked from anon; no custom JWT hook issues the reserved `none` role.

---

## 7. Rollback & Risk Assessment

- **Rollback:** `git revert <commit-sha>` cleanly restores Vite 5 configuration.
- **Mobile/Tablet Preview:** Developers requiring LAN access for testing must explicitly set `VITE_HOST=0.0.0.0` or `--host` and define `VITE_ALLOWED_HOSTS=<ip-or-host>`.

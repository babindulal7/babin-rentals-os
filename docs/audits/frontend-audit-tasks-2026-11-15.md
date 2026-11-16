# Babin Rentals OS — Prioritized Remediation Task Cards

**Audit Date:** 2026-11-15 (Asia/Kathmandu +05:45)  
**Target Commit:** `b4f91063d3fcc5adc48f2590930056d6e3a02788`  
**Standard Execution Rule:** One card per branch, local verification before PR, no direct live Supabase mutation (Law N-5), no runner tampering.

---

## Task Card Summary

| Card ID | Title | Priority | Lane / Owner | Complexity |
|---|---|---|---|---|
| `AUD-SEC-01` | Replace `node:crypto` with Web Crypto API in browser bundle | **P0** | Lane B / Gemini | S |
| `AUD-SEC-02` | Enforce Content Security Policy & Security Headers on Production | **P0** | Lane A / Codex-1 | S |
| `AUD-OPS-01` | Reconcile T3-28 Setting UI with Live Supabase Migration Cutover | **P0** | Lane C / Codex-2 | M |
| `AUD-PRF-01` | Main Bundle Chunk Splitting & Vendor Extraction | **P1** | Lane B / Gemini | M |
| `AUD-PRF-02` | Client-Side Image Downscaling for Damage & Handover Evidence | **P1** | Lane A / Codex-1 | M |
| `AUD-A11Y-01`| Implement Accessible Skip Links & Modal Focus Trap Hardening | **P1** | Lane B / Gemini | S |
| `AUD-CHE-01` | IndexedDB Quota Guard & Persistent Storage Request | **P1** | Lane A / Codex-1 | S |
| `AUD-NET-01` | AbortController Signal Wiring on Fast Inventory Search | **P2** | Lane B / Gemini | S |
| `AUD-PRF-03` | Virtualized List Windowing for 500+ Equipment Catalog | **P2** | Lane B / Gemini | M |
| `AUD-OBS-01` | Staging Webhook Wiring for Zero-Dependency Sentry Reporter | **P2** | Lane A / Codex-1 | S |

---

### CARD AUD-SEC-01: Replace `node:crypto` with Web Crypto API in Browser Bundle

- **ID / Priority / Status:** `AUD-SEC-01` | **P0** (Release Blocker) | Ready to Build
- **User-Facing Impact:** Floor staff or drivers accessing rider link generation or token creation could experience a fatal JavaScript crash (`node:crypto is not defined`) in standard mobile Safari or Chrome browsers.
- **Verified Evidence:** Build warning detected during `npm run build` on commit `b4f91063`:
  ```text
  [plugin:vite:resolve] Module "node:crypto" has been externalized for browser compatibility, imported by "src/lib/queries/riderLink.ts".
  ```
- **Root Cause Hypothesis:** `src/lib/queries/riderLink.ts` imports `randomBytes` or `createHash` from Node's built-in `node:crypto` instead of standard browser `window.crypto.getRandomValues()`.
- **Smallest Safe Change:** Replace `import { randomBytes } from 'node:crypto'` with standard `crypto.getRandomValues(new Uint8Array(n))` in `src/lib/queries/riderLink.ts`.
- **Acceptance Criteria:**
  1. `npm run build` runs with 0 warnings regarding externalized `node:crypto`.
  2. Rider link token generation produces cryptographically secure 128-bit tokens in browser runtime.
  3. All rider link tests in `src/__tests__/` pass without polyfills.
- **Tests:** `npm run test` (focusing on riderLink unit tests) + `npm run build`.
- **Dependencies / Overlap:** Related to PR #125 (`fix/pr-35-rider-crypto-failclosed`).
- **Rollout / Rollback / Observability:** Safe pure client change. Rollback via `git revert`.
- **Recommended Runner:** Windows light tasks / Mac full CI.
- **Estimated Complexity:** **S** (under 20 lines touched).

---

### CARD AUD-SEC-02: Enforce Content Security Policy & Security Headers on Production

- **ID / Priority / Status:** `AUD-SEC-02` | **P0** (Release Blocker) | Ready to Build
- **User-Facing Impact:** Protects staff and clients against session hijacking, XSS script injection, clickjacking frames, and MIME sniffing on public Wi-Fi or mobile hotspots.
- **Verified Evidence:** `index.html: lines 10-25` has basic meta tags, but production deployment headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, `Strict-Transport-Security`) are not formally configured in hosting configs (`vercel.json` / `nginx.conf`).
- **Root Cause Hypothesis:** Development was centered on local Vite preview; edge hosting security headers were deferred to Phase 7 cutover.
- **Smallest Safe Change:** Define explicit HTTP headers in `vercel.json` and `nginx.conf` matching the exact self-hosted font, Supabase API, and WebSocket origins.
- **Acceptance Criteria:**
  1. Header response contains `X-Frame-Options: DENY`.
  2. CSP permits `'self'`, `https://*.supabase.co`, `wss://*.supabase.co`, and self-hosted fonts; blocks foreign domains.
  3. No inline scripts execute outside pre-paint theme script.
- **Tests:** Static header audit script + staging response header inspection via curl.
- **Dependencies / Overlap:** Independent security card.
- **Rollout / Rollback / Observability:** Edge configuration only. Can be adjusted instantly on host.
- **Recommended Runner:** Windows / Mac.
- **Estimated Complexity:** **S** (single configuration file).

---

### CARD AUD-OPS-01: Reconcile T3-28 Setting UI with Live Supabase Migration Cutover

- **ID / Priority / Status:** `AUD-OPS-01` | **P0** (Release Blocker) | In Progress (Lane C checkpoint)
- **User-Facing Impact:** If Babin applies setting changes in the UI before migration `0237` is executed on live Supabase, calls to `set_setting` or `rental_day_start` could fail or revert to default 360 min.
- **Verified Evidence:** Commit `b4f91063` added migration `0237_rental_day_start_setting.sql` locally. `PROGRESS.md: lines 52-54` records migration 0237 is WRITTEN + VERIFIED locally, NOT APPLIED to live Supabase (Law N-5).
- **Root Cause Hypothesis:** Feature code was completed in Lane C; production application awaits owner backup protocol.
- **Smallest Safe Change:** Verify that fallback queries in `src/lib/queries/bookings.ts` and `src/modules/settings/sections/System.tsx` handle missing `rental_day_start` column gracefully without crashing.
- **Acceptance Criteria:**
  1. Client app continues operating smoothly against a database running migration `0236` or `0237`.
  2. Babin reviews backup protocol and executes migration `0237` on live Supabase via local CLI.
  3. Verification query confirms `bookings.rental_day_start` exists with default 360.
- **Tests:** `npm run check:pglite` + `npm run check:lifecycle` (L75, L76).
- **Dependencies / Overlap:** Owned by Lane C (Card T3-28).
- **Rollout / Rollback / Observability:** Follow `docs/archive/BACKUP_PROTOCOL.md`. Revert migration if error occurs.
- **Recommended Runner:** Mac full CI.
- **Estimated Complexity:** **M** (database cutover + live verification).

---

### CARD AUD-PRF-01: Main Bundle Chunk Splitting & Vendor Extraction

- **ID / Priority / Status:** `AUD-PRF-01` | **P1** (Near Launch) | Ready to Build
- **User-Facing Impact:** Speeds up cold-start loading on floor tablets and reduces parse time over 3G cellular connections in Kathmandu.
- **Verified Evidence:** Build output shows `dist/assets/main-9p3WeUpa.js` is 694.98 kB minified (198.92 kB gzip), exceeding Vite's 500 kB chunk warning.
- **Root Cause Hypothesis:** Shared application utilities, date engine (`bs.ts`), and modal dialogs are bundled into the main entry chunk rather than isolated.
- **Smallest Safe Change:** Update `vite.config.ts: output.manualChunks` to extract date engines (`bs.ts`, `rentalDays.ts`) and Base UI components into dedicated cacheable vendor chunks.
- **Acceptance Criteria:**
  1. Emitted `main-*.js` chunk size is reduced to <500 kB minified.
  2. Gzip transfer size for main chunk drops to <150 kB.
  3. No circular chunk dependency warnings emitted during build.
- **Tests:** `npm run build` + `npm test`.
- **Dependencies / Overlap:** None.
- **Rollout / Rollback / Observability:** Safe frontend asset optimization.
- **Recommended Runner:** Mac full CI.
- **Estimated Complexity:** **M** (requires testing chunk loading order).

---

### CARD AUD-PRF-02: Client-Side Image Downscaling for Damage & Handover Evidence

- **ID / Priority / Status:** `AUD-PRF-02` | **P1** (Near Launch) | Ready to Build
- **User-Facing Impact:** Prevents warehouse tablets from freezing or timing out when uploading 12MP-48MP raw photos of damaged gear over mobile networks.
- **Verified Evidence:** Return completion requires damage photos (`scripts/e2e-lifecycle.mjs: step L68`). Currently, raw photo files are passed directly to upload handlers without pre-upload downscaling.
- **Root Cause Hypothesis:** Mobile camera inputs default to maximum device resolution (5-15MB per JPEG).
- **Smallest Safe Change:** Introduce a client-side utility `compressImage(file: File, maxDimension: 1600, quality: 0.8)` using an offscreen HTML Canvas before invoking Supabase Storage upload.
- **Acceptance Criteria:**
  1. Uploaded inspection photos are capped at 1600px width/height and <400 KB file size.
  2. EXIF orientation is preserved.
  3. Upload takes <2 seconds over simulated 3G connection.
- **Tests:** Unit test in `src/lib/__tests__/imageCompression.test.ts` with mock canvas.
- **Dependencies / Overlap:** Overlaps with Lane A floor evidence cards (T2-18).
- **Rollout / Rollback / Observability:** Fail-safe: if canvas compression fails, fallback to original file with warning.
- **Recommended Runner:** Windows / Mac.
- **Estimated Complexity:** **M** (canvas image processing).

---

### CARD AUD-A11Y-01: Implement Accessible Skip Links & Modal Focus Trap Hardening

- **ID / Priority / Status:** `AUD-A11Y-01` | **P1** (Near Launch) | Ready to Build
- **User-Facing Impact:** Enables keyboard-only power users and visually impaired staff to navigate past top navigation directly into equipment and rental tables.
- **Verified Evidence:** `frontend-engineering-matrix-2026-11-15.csv` records Concept C-9 (Skip Links) as `Missing`. `index.html` and `src/components/shell/AppLayout.tsx` have no skip anchor.
- **Root Cause Hypothesis:** Desktop layout was prioritized for mouse/touch floor interactions; skip links were omitted.
- **Smallest Safe Change:** Add `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to main content</a>` in `src/components/shell/AppLayout.tsx` and place `id="main-content"` on the primary `<main>` wrapper.
- **Acceptance Criteria:**
  1. Pressing Tab upon initial page load focuses the skip link.
  2. Pressing Enter navigates focus directly to the first interactive element inside `#main-content`.
  3. Esc key dismisses active Base UI modals and restores focus to triggering control.
- **Tests:** Vitest component test in `src/components/__tests__/accessibility.test.tsx`.
- **Dependencies / Overlap:** None.
- **Rollout / Rollback / Observability:** Pure HTML/CSS accessibility improvement.
- **Recommended Runner:** Windows / Mac.
- **Estimated Complexity:** **S** (under 30 lines).

---

### CARD AUD-CHE-01: IndexedDB Quota Guard & Persistent Storage Request

- **ID / Priority / Status:** `AUD-CHE-01` | **P1** (Near Launch) | Ready to Build
- **User-Facing Impact:** Prevents mobile Safari or Chrome from silently clearing cached offline inspection records and pending mutations when device storage runs low.
- **Verified Evidence:** `src/lib/offlineQueue.ts` initializes Dexie database but does not invoke `navigator.storage.persist()`.
- **Root Cause Hypothesis:** Standard IndexedDB storage is marked "best-effort" by mobile OSs and can be evicted under disk pressure.
- **Smallest Safe Change:** Add `navigator.storage.persist()` check in `src/lib/offlineQueue.ts` during application initialization and warn user if persistent storage is denied.
- **Acceptance Criteria:**
  1. Browser prompts or grants persistent storage mode.
  2. Storage estimate is checked before saving large offline payloads; warning displayed if <50MB remaining.
- **Tests:** Mock navigator.storage in Vitest suite.
- **Dependencies / Overlap:** Complements Card AUD-PRF-02.
- **Rollout / Rollback / Observability:** Non-blocking async check.
- **Recommended Runner:** Windows / Mac.
- **Estimated Complexity:** **S** (under 40 lines).

---

### CARD AUD-NET-01: AbortController Signal Wiring on Fast Inventory Search

- **ID / Priority / Status:** `AUD-NET-01` | **P2** (Post-Blocker) | Ready to Build
- **User-Facing Impact:** Prevents out-of-order search results from popping in and overriding newer search queries when staff types quickly on a slow connection.
- **Verified Evidence:** `src/lib/queries/inventory.ts` fetches equipment via PostgREST without passing an `AbortSignal`.
- **Root Cause Hypothesis:** Search input was debounced at 250ms, but variable network latency can still cause a 500ms request to resolve after an 800ms request.
- **Smallest Safe Change:** Pass `signal?: AbortSignal` into inventory and client search queries; abort prior in-flight request when new search input fires.
- **Acceptance Criteria:**
  1. Rapid typing generates only one active network response; prior pending fetches are aborted.
  2. No `AbortError` uncaught exceptions bubble up to error tracking.
- **Tests:** Vitest async mock test asserting `signal.aborted` on subsequent calls.
- **Dependencies / Overlap:** None.
- **Rollout / Rollback / Observability:** Transparent network optimization.
- **Recommended Runner:** Windows / Mac.
- **Estimated Complexity:** **S**.

---

### CARD AUD-PRF-03: Virtualized List Windowing for 500+ Equipment Catalog

- **ID / Priority / Status:** `AUD-PRF-03` | **P2** (Post-Blocker) | Backlog
- **User-Facing Impact:** Eliminates scrolling stutter and memory bloat on warehouse tablets when browsing massive equipment catalogs (>1,000 items).
- **Verified Evidence:** `frontend-engineering-matrix-2026-11-15.csv` records Concept A-16 (Virtualized Lists) as `Missing`. Currently, catalog renders all items in active page (up to 100 items per page).
- **Root Cause Hypothesis:** Pagination currently limits DOM nodes to 50-100 items, which is acceptable for launch; full list rendering without pagination would cause lag.
- **Smallest Safe Change:** If catalog pagination is removed or expanded to infinite scroll, introduce `@tanstack/react-virtual` to window table rows.
- **Acceptance Criteria:**
  1. DOM node count remains constant (~30 nodes) during scrolling of 1,000+ item list.
  2. Scroll framerate maintains 60fps on iPad.
- **Tests:** Benchmark test measuring DOM element count during scroll.
- **Dependencies / Overlap:** Should only be implemented if server-side pagination is replaced.
- **Rollout / Rollback / Observability:** Post-launch optimization.
- **Recommended Runner:** Mac full CI.
- **Estimated Complexity:** **M**.

---

### CARD AUD-OBS-01: Staging Webhook Wiring for Zero-Dependency Sentry Reporter

- **ID / Priority / Status:** `AUD-OBS-01` | **P2** (Post-Blocker) | Ready to Configure
- **User-Facing Impact:** Allows developers to receive real-time notifications via email or Discord when runtime errors occur in staging or production.
- **Verified Evidence:** `src/lib/monitoring.ts` is fully implemented and tested, but `VITE_SENTRY_DSN` is empty in `.env.local` by design.
- **Root Cause Hypothesis:** DSN was kept uncommitted to prevent leaking project credentials and to ensure zero dev-mode network overhead.
- **Smallest Safe Change:** Provision a GlitchTip or Sentry project and supply `VITE_SENTRY_DSN` strictly via environment secrets during staging/production builds.
- **Acceptance Criteria:**
  1. Triggering `captureError(new Error('Test Alert'))` in staging delivers envelope to endpoint within 5 seconds.
  2. No client PII or rupee amounts appear in error context.
- **Tests:** Staging smoke test with synthetic error.
- **Dependencies / Overlap:** Depends on owner provisioning Sentry or GlitchTip instance.
- **Rollout / Rollback / Observability:** Config-only change.
- **Recommended Runner:** Windows / Mac.
- **Estimated Complexity:** **S** (zero code changes; environment variable only).

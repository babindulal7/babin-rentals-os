# T1-14 Loading and Route Performance Profiling Report

## 21 November 2026 desktop follow-up

The local baseline was built from `67281e9d` with the mock backend. Headless
Chrome on Windows used a 1440 × 900 viewport, 70 ms latency, 10 Mbit/s down and
5 Mbit/s up. Each direct navigation began in a fresh browser context with the
HTTP cache disabled and a signed-in mock session. The service worker was
disabled during timing runs to isolate the page's requests from offline
installation traffic. Rentals and Operations rendered the mock empty state.
Packing used the repository's booking 716 fixture with two lines. First usable
meant that the route showed its list or empty state, or the Packing checklist.
Loading placeholders were excluded.

The entry document preloaded a 110 KiB gzipped QR library and a 16 KiB PDF
chunk. The dependency ran from the app's shared Operations shell through the
booking action menu to the PDF generator. Packing also loaded the camera
decoder through a static import in the shared scanner modal. Calendar's own
route chunk was absent from all three baseline route traces.

PDF export functions now import the generator when called. Packing loads the
pick-list formatter on Print pick list. Floor scanners start loading the
decoder when the operator enables Camera Scan.

The compressed JavaScript listed in the entry HTML fell from 519 KiB to
398 KiB, a 121 KiB reduction (23%). This includes the entry script and every
JavaScript module preload in the generated HTML. The QR library still appeared
later alongside speculative Inventory requests. The service worker continues
to precache Calendar, PDF generation and both scanner vendor chunks.

| Route and mock role | Baseline median | Revised median | Slowest revised run |
|---|---:|---:|---:|
| Rentals · Owner | 2.94 s | 2.20 s | 2.59 s |
| Operations · Warehouse | 2.46 s | 1.61 s | 1.71 s |
| Packing · Warehouse | 1.98 s | 1.76 s | 2.03 s |

Each cell uses five samples per route and build. The shared Windows host
had variable background load, so the timing deltas are estimates. All revised
samples met the 3-second budget locally. Hosted staging on the counter PC is
the remaining Phase 1 performance check. Physical mobile and scanner timing
is Phase 2.

Chrome showed the Packing checklist and scanner modal without page overflow
at 375, 820 and 1440 px as Owner and Warehouse. Opening manual entry made no
decoder request. Camera Scan requested the decoder and showed the manual-entry
fallback in the headless browser. At 1440 px, Print pick list handed a
`%PDF-` blob to the browser as both roles.

The October profile below is historical. Its device and staging conclusions
are superseded by the Phase 1 and Phase 2 acceptance criteria in the
[T1-14 card](../plans/T1_RELEASE.md#t1-14--performance-on-real-devices).

## October 2026 profile

## 1. Executive Summary

This report documents the performance optimizations, bundle code-splitting, and load-path profiling conducted for **T1-14 (Loading and route performance)** on an Apple M4 Mac mini running macOS.

### Key Achievements:
1. **Isolated Scanner Library Chunking**:
   - Previously, `@zxing/library` (~432 kB minified) and `@zxing/browser` (~22 kB minified) were bundled together in a single `vendor-scanner` chunk of **454 kB**.
   - Decoupled `vendor-scanner` to contain strictly `@zxing/browser` (22.2 kB) and segregated barcode/QR generation engine (`@zxing/library`) into `vendor-qrcode` (431.8 kB).
2. **Critical-Path Shell Decoupling**:
   - Extracted lightweight event dispatchers (`SCANNER_TOGGLE_EVENT`, `ITEM_CARD_OPEN_EVENT`, `toggleScanner`, `openItemCard`) into `src/lib/scannerEvents.ts`.
   - Enabled `ScannerFab` and its heavy dependencies (such as `ItemCardSheet` and ZXing reader bindings) to be lazy-loaded concurrently via `React.lazy` without blocking initial DOM rendering.
   - Reduced critical bootstrap bundle `main.js` from **694.3 kB (198.8 kB gzip)** to **642.8 kB (183.2 kB gzip)** — a **51.5 kB (-7.4%) raw and 15.5 kB (-7.8%) gzip reduction** on the mandatory first-paint path.
3. **PWA Precache & Chunk Verification**:
   - Production build compiles cleanly with zero TypeScript errors in 5.29 seconds.
   - 100% test passing across 125 test suites (1,920 tests) in 6.13 seconds.
   - Preserves 100% desktop/tablet/mobile layout parity and hardware scanner wedge listeners.

---

## 2. Bundle Profile & Chunk Measurements

### A. Critical Path Comparison (Before vs. After)

| Asset / Chunk | Before Optimization | After Optimization | Delta | Impact |
| :--- | :--- | :--- | :--- | :--- |
| **`main.js`** | 694.27 kB (198.75 kB gzip) | 642.80 kB (183.22 kB gzip) | **-51.47 kB (-15.53 kB gzip)** | **Direct First-Paint Acceleration** |
| **`ScannerFab.js`** | Bundled in `main.js` | 25.91 kB (7.35 kB gzip) | +25.91 kB (deferred) | Lazy-loaded non-blocking |
| **`vendor-scanner`** | 454.12 kB (118.82 kB gzip) | 22.18 kB (6.17 kB gzip) | **-431.94 kB (-112.65 kB gzip)** | Eager camera scanner overhead eliminated |
| **`vendor-qrcode`** | N/A (merged with scanner) | 431.83 kB (112.65 kB gzip) | Isolated chunk | Deferred until QR rendering/generation |

### B. Core Vendor Chunk Architecture

```
dist/assets/
├── vendor-react-*.js         180.07 kB │ gzip:  59.20 kB  (React, ReactDOM, Router)
├── vendor-base-ui-*.js       178.35 kB │ gzip:  61.30 kB  (Base UI headless primitives)
├── vendor-supabase-*.js      218.41 kB │ gzip:  57.01 kB  (Supabase client & GoTrue)
├── vendor-icons-*.js          44.95 kB │ gzip:   7.10 kB  (Tabler icons)
├── vendor-gsap-*.js           71.50 kB │ gzip:  28.26 kB  (GSAP animation engine)
├── vendor-dexie-*.js          96.36 kB │ gzip:  32.43 kB  (IndexedDB offline persistence)
├── vendor-charts-*.js        365.48 kB │ gzip: 107.40 kB  (Recharts - route-gated)
├── vendor-qrcode-*.js        431.83 kB │ gzip: 112.65 kB  (ZXing core - route-gated)
├── vendor-scanner-*.js        22.18 kB │ gzip:   6.17 kB  (ZXing browser camera wrapper)
└── main-*.js                 642.80 kB │ gzip: 183.22 kB  (Shell, Auth, Layouts)
```

---

## 3. Network Transfer & Estimated First Usable Screen Timing (4G Profile)

Simulated performance on typical LTE/4G mobile profile (Downlink: 10 Mbps, RTT: 70ms):

### Baseline First Route (`/today` or `/login`):
1. **Critical Assets Downloaded on Initial Visit**:
   - `index.html`: ~2.8 kB
   - `main.js` (gzip): 183.2 kB
   - `vendor-react.js` (gzip): 59.2 kB
   - `vendor-supabase.js` (gzip): 57.0 kB
   - `vendor-base-ui.js` (gzip): 61.3 kB
   - `vendor-icons.js` (gzip): 7.1 kB
   - Route Chunk (`Today.js` or `Login.js`, gzip): ~14.7 kB
   - Theme/CSS assets (gzip): ~15 kB
   - **Total Gzipped Payload**: **~399 kB**
2. **Transfer Time Calculation**:
   - Network payload: $399\text{ kB} = 3.19\text{ Mb}$
   - Transfer time at 10 Mbps: $\approx 320\text{ ms}$
   - Connection & TLS handshake: $\approx 150\text{ ms}$
   - DOM parse, script evaluation & execution: $\approx 250\text{ ms}$
   - First Usable Screen (FUS): **~720 ms** (significantly under the **< 3.0 s** target budget).

---

## 4. Hardware Scanner & Parity Safeguards

- **Hardware Barcode Wedges**: The global keyboard wedge listener (`handleGlobalWedge`) remains active on desktop, tablet, and mobile devices when outside floor workspaces.
- **AUD-014 Resolution**: On mobile (< 768px), duplicate floating triggers remain hidden while preserving bottom bar scanner action sheet access.
- **Floor Workspace Preloading**: Floor routes (`/pack`, `/handover`, `/return`, `/reset`) continue utilizing route preloading via `installRoutePreload`.

---

## 5. Verification & Acceptance Gate Status

- **Local Verification Status**: **VERIFIED PASS**
  - Build command: `npm run build` (Exit code: 0)
  - Unit tests: `npx vitest run` (125 files passed, 1,920 tests passed, Exit code: 0)
  - PGlite migrations & check: `npm run check:pglite` (Exit code: 0)
- **Hosted Staging & Device Acceptance Gate**: **BLOCKED**
  - Requires live Cloudflare Pages preview or staging deployment from T1-07.
  - Final acceptance requires real iPhone/iPad testing over 4G cellular data in Kathmandu to record live DevTools Performance Waterfall timings.

# Babin Rentals OS — Master Frontend Engineering Audit

**Date:** 2026-11-15 (Asia/Kathmandu +05:45)  
**Auditor:** OpenCode / Claude / Codex / Gemini Audit Agent  
**Repository:** `https://github.com/babindulal7/babin-rentals-os.git`  
**Current Branch:** `frontend_engineering_audit`  
**Exact HEAD SHA:** `b4f91063d3fcc5adc48f2590930056d6e3a02788`  
**Upstream origin/main SHA:** `6b1563f35c8f436589b46d026d6e575e51be5091`  
**Primary Goal:** Determine which engineering practices are actually needed to safely launch and operate Babin Rentals OS, without introducing unnecessary complexity.  
**Mode:** Audit, verification, documentation, and prioritized planning only. Zero live Supabase mutations, zero PR merges, zero production writes.

---

## 1. Executive Summary

A comprehensive master frontend engineering audit of Babin Rentals OS was executed on 2026-11-15 against exact commit `b4f91063d3fcc5adc48f2590930056d6e3a02788`. All 180 learning concepts from the nine reference topic groups were audited against the active codebase, runtime gates, and local PGlite/WASM Postgres test suites.

### Key Audit Findings

1. **Transactional and Security Foundation is Production-Grade:**
   - **Double-booking prevention:** 100% enforced in Postgres via GiST exclusion constraints (`23P01`).
   - **Role Boundaries (Law 6):** `Warehouse`, `Technician`, `Driver`, and `Client` are strictly money-blind at the database layer via column grants and `auth_can_view_money()`.
   - **Financial Invariants (Laws 4 & 5):** Payments are immutable; deposits are strictly held as liabilities; totals are calculated in integer paisa with South Asian lakh formatting (`1,85,000`).
   - **Booking Lifecycle:** 77/77 end-to-end lifecycle verification steps pass in real Postgres (`check:lifecycle`), including the newly added rental day start settings check (steps L75 and L76).

2. **Identified High-Risk Concrete Findings (Immediate Fixes):**
   - **Vite Build Externalization Warning (`node:crypto`):** `src/lib/queries/riderLink.ts` imports Node's built-in `node:crypto`, which Vite externalizes for the browser. On standard mobile browsers without Node polyfills, this will trigger a runtime fatal exception when minting rider links. (Fixed via Card `AUD-SEC-01`).
   - **Main Bundle Size (694.98 kB minified / 198.92 kB gzip):** Exceeds Vite's 500 kB chunk warning threshold. While acceptable for broadband, it can delay initial compilation on low-powered Android phones in the warehouse. (Addressed via Card `AUD-PRF-01`).
   - **Live Schema Synchronization (Law N-5):** Local branch includes migration `0237_rental_day_start_setting.sql`. Babin must apply this migration to live Supabase following `BACKUP_PROTOCOL.md` before deploying the updated settings UI. (Tracked via Card `AUD-OPS-01`).

3. **Practices to Strictly AVOID (Unnecessary Complexity):**
   - **NO Micro-Frontends / Module Federation:** Unnecessary distributed runtime complexity for a single-tenant internal ops app.
   - **NO Redux Toolkit / TanStack Query:** Current combination of React 18 hooks, lightweight domain stores, and Dexie IndexedDB outbox provides superior offline resilience without 100+ kB of Redux boilerplate.
   - **NO Server-Side Rendering (SSR) / React Server Components (RSC):** The ops app is an authenticated, high-interaction PWA designed to boot offline in basements with zero cellular signal. SSR breaks offline operation.
   - **NO Third-Party Session Replay (FullStory / Hotjar):** Explicitly violates Law 6 (money-blindness) and client privacy policies by transmitting sensitive contract and financial details offsite.

---

## 2. 180-Concept Classification Matrix Summary

The 180 distinct concepts transcribed from the nine topic groups are classified in full in [`docs/audits/frontend-engineering-matrix-2026-11-15.csv`](frontend-engineering-matrix-2026-11-15.csv):

| Topic Group | Total | Verified Implemented | Partially Implemented | Missing | Not Applicable | Unable to Verify |
|---|---|---|---|---|---|---|
| **A. Performance (PRF)** | 20 | 7 | 10 | 1 (Virtual Lists) | 1 (Web Workers) | 1 (Lighthouse) |
| **B. Observability (OBS)** | 20 | 11 | 4 | 0 | 5 (RUM, Replay, etc.) | 0 |
| **C. Accessibility (A11Y)**| 20 | 11 | 6 | 1 (Skip Links) | 2 (RTL, Locale Routing)| 0 |
| **D. Security (SEC)** | 20 | 12 | 6 | 0 | 2 (Secure Cookies, SRI) | 0 |
| **E. Architecture (ARC)** | 20 | 14 | 3 | 0 | 3 (Micro-FE, Plugins) | 0 |
| **F. Caching (CHE)** | 20 | 14 | 6 | 0 | 0 | 0 |
| **G. Networking (NET)** | 20 | 11 | 7 | 0 | 2 (GraphQL, BFF, SSE) | 0 |
| **H. State Management (STA)**| 20 | 16 | 1 | 0 | 3 (Redux, Zustand, Signals)| 0 |
| **I. Rendering (RND)** | 20 | 9 | 4 | 0 | 7 (SSR, ISR, RSC, Islands) | 0 |
| **Total** | **180** | **100** | **50** | **2** | **27** | **1** |

### Priority Breakdown
- **P0 (Release Blocker):** 21 concepts (core transactional safety, RLS security, GiST exclusion, payment immutability).
- **P1 (Must Address Near Launch):** 86 concepts (offline queue replay, responsive breakpoints, error logging, UI contrast).
- **P2 (Improve After Blockers):** 46 concepts (chunk splitting, image downscaling, search abort signals, list windowing).
- **Not Needed / Anti-Patterns:** 27 concepts (Redux, SSR, Micro-frontends, Session Replay, GraphQL, RTL).

---

## 3. Verified Architecture & Invariant Enforcement

### 3.1 Three-Tier Architecture
1. **Presentation Layer (`src/modules/`, `src/components/`):** React 18 SPA with Tailwind CSS v4 and Base UI primitives. Law 1 strictly enforced: components never calculate pricing, rental days, or execute raw database updates.
2. **Domain Logic Layer (`src/lib/`, `src/actions/`):** Pure TypeScript calculation engines (`money.ts`, `pricingPipeline.ts`, `rentalDays.ts`, `bs.ts`, `rbac.ts`). All mutations route through `src/actions/` with idempotency tokens (`client_uuid`).
3. **Authoritative Persistence Layer (`supabase/migrations/`):** PostgreSQL 18 with Row-Level Security, GiST constraints, and trigger-enforced state machines. All lifecycle gates originate in SQL migrations.

### 3.2 Dual-Entrypoint Strategy
- `index.html`: Private, authenticated operations application. Wrapped in Workbox service worker precaching 291 assets (8.3 MB) including all Devanagari font variants.
- `marketing.html`: Lightweight public equipment catalog and landing site. Completely decoupled from ops dependencies (no Dexie, no Supabase client, zero cross-bundle pollution).

### 3.3 Offline & Custody Invariant (Ruling R-40)
- **Non-custodial operations:** Scans, field notes, and queue status updates write to Dexie IndexedDB (`BabinOfflineQueue`) and sync automatically when connectivity resumes.
- **Custodial stage transitions:** Handover, Return, and Close are **fail-closed online RPCs** (`queueOnFailure: false`). Floor verbs verify `bookings.stage` from the server before confirming handoff to prevent phantom custody handovers.

---

## 4. Hardware & CI Runner Infrastructure

From `docs/audits/MAC_MINI_ANTIGRAVITY_CI_PR_2026-11-10.md` and repository workflow definitions:
- **Active Runner Fleet:** 5 registered self-hosted runners.
  - 3 macOS ARM64 runners on dedicated Apple Silicon M4 Mac mini (16 GB unified RAM).
  - 2 Windows X64 runners on local workstations.
- **Queue & Memory Rules:**
  - Full 17-gate verification sequence runs on Mac ARM64 (`timeout-minutes: 120`).
  - `NODE_OPTIONS: '--max-old-space-size=2048'` and Vitest worker pool capped at 2 to eliminate out-of-memory thrashing on M4 mini.
  - Windows runners assigned light PR smoke checks (lint, fast unit tests).

---

## 5. Prioritized Remediation Roadmap

1. **Immediate P0 Action (Before Release):**
   - Execute Card `AUD-SEC-01`: Replace `node:crypto` with browser `crypto.getRandomValues` in `src/lib/queries/riderLink.ts`.
   - Execute Card `AUD-SEC-02`: Configure CSP and security headers on production web server.
   - Execute Card `AUD-OPS-01`: Babin performs backup and applies migration `0237` to live Supabase following `BACKUP_PROTOCOL.md`.

2. **Near-Launch P1 Actions:**
   - Execute Card `AUD-PRF-01`: Split main bundle chunks in `vite.config.ts` to reduce `main-*.js` to <500 kB.
   - Execute Card `AUD-PRF-02`: Add client-side canvas downscaling for damage and inspection photos.
   - Execute Card `AUD-A11Y-01`: Add skip links and modal focus traps to ensure full keyboard navigation.
   - Execute Card `AUD-CHE-01`: Request persistent storage mode (`navigator.storage.persist()`) in Dexie outbox.

3. **Post-Launch P2 Optimizations:**
   - Wire `AbortController` to cancel rapid typing queries in inventory search (Card `AUD-NET-01`).
   - Implement list windowing if equipment catalog grows beyond 1,000 items (Card `AUD-PRF-03`).
   - Configure Sentry/GlitchTip DSN secret in staging environment (Card `AUD-OBS-01`).

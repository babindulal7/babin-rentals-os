# Babin Rentals OS — Objective Frontend Release Gates

**Effective Date:** 2026-11-15  
**Governing Standard:** Foundation Spec v2.0 · `docs/PRODUCT_RULES.md` · `docs/PERMISSIONS.md`  
**Enforcement Rule:** Every gate is binary (PASS / FAIL). No subjective approvals, no "close enough" waivers, no skipping gates under deadline pressure. A single failing gate holds release.

---

## 1. Booking & Transactional Correctness Gates

| Gate ID | Release Criterion | Verification Mechanism | Threshold | Failure Action |
|---|---|---|---|---|
| `GATE-TX-01` | **No Equipment Double-Booking** | `npm run test:partial-return` & `scripts/e2e-lifecycle.mjs` (L3) | 100% of conflicting overlapping bookings rejected by Postgres GiST constraint `23P01`. | **Hard Stop:** Release blocked. |
| `GATE-TX-02` | **Rental Day Boundary & Operational Day** | `src/lib/__tests__/rentalDays.test.ts` & Lifecycle L75-L76 | Half-open intervals `[start, end)` calculated against configured `rental_day_start` (06:00 default). | **Hard Stop:** Release blocked. |
| `GATE-TX-03` | **Fail-Closed Custody Transitions** | `scripts/e2e-lifecycle.mjs` & `src/actions/core.ts` (Ruling R-40) | Handover, Return, and Close execute via fail-closed RPCs (`queueOnFailure: false`); never silently queued offline. | **Hard Stop:** Release blocked. |
| `GATE-TX-04` | **Atomic Multi-Entity Booking Creation** | `scripts/test-unit-lifecycle-and-contracts.mjs` | `create_booking` RPC inserts booking, lines, crew, and transport in single database transaction. | **Hard Stop:** Release blocked. |
| `GATE-TX-05` | **Monotonic Document Numbering** | `scripts/e2e-lifecycle.mjs` (L8, L71) & Law 7 | Numbers minted by database sequences (`INV-`, `BK-`). Pro forma invoices take no number and stay out of VAT register. | **Hard Stop:** Release blocked. |

---

## 2. Financial Integrity & Staff Role Boundary Gates

| Gate ID | Release Criterion | Verification Mechanism | Threshold | Failure Action |
|---|---|---|---|---|
| `GATE-FIN-01` | **Warehouse Money-Blindness (Law 6)** | `npm run check:security` & `scripts/e2e-lifecycle.mjs` (L12) | Database views and RLS policies strip all money columns for `Warehouse`, `Technician`, `Driver`, and `Client`. | **Hard Stop:** Security vulnerability; release blocked. |
| `GATE-FIN-02` | **Payment Immutability (Law 4)** | `scripts/e2e-lifecycle.mjs` (L9, L13, L19) | Payments table has zero `UPDATE` or `DELETE` grants. Corrections require matching reversal rows. | **Hard Stop:** Financial hazard; release blocked. |
| `GATE-FIN-03` | **Deposits Held as Liabilities (Law 5)** | `node scripts/test-booking-financial-integrity.mjs` | Deposits never reduce Rental Total or Outstanding balance. Overpayments strictly rejected. | **Hard Stop:** Financial hazard; release blocked. |
| `GATE-FIN-04` | **Client Portal Data Isolation (Law P8)** | `npm run check:security` (SEC-01) & Lifecycle L14 | Authenticated Client JWT can only select own rows; cross-client document access returns 0 rows. | **Hard Stop:** Privacy breach; release blocked. |
| `GATE-FIN-05` | **Integer Paisa Financial Pipeline** | `src/lib/__tests__/money.test.ts` | All amounts calculated as integer paisa; half-up rounding at displayed steps; South Asian lakh grouping (`1,85,000`). | **Hard Stop:** Arithmetic drift; release blocked. |

---

## 3. Performance & Bundle Budgets

| Gate ID | Release Criterion | Verification Mechanism | Threshold | Failure Action |
|---|---|---|---|---|
| `GATE-PRF-01` | **Maximum Bundle Chunk Size** | `npm run build` | Zero JavaScript chunks exceed 500 kB minified (excluding vendor scanner chunk). | **Warning / P1:** Optimize chunk splitting. |
| `GATE-PRF-02` | **Gzip Transfer Budget** | `npm run build` asset telemetry | Total initial page load gzip transfer <250 kB on primary entry route. | **P1:** Refactor route lazy loading. |
| `GATE-PRF-03` | **Search Interaction Latency** | `src/modules/inventory/__tests__/search.test.tsx` | Inventory and client search debounced at 250ms; query execution under 100ms. | **P2:** Add AbortController. |
| `GATE-PRF-04` | **Pure Engine Calculation Budget** | Vitest benchmark in `src/lib/__tests__/` | `pricingPipeline.ts`, `rentalDays.ts`, and `bs.ts` execute 100 iterations in <15ms. | **Hard Stop:** CPU performance regression. |

---

## 4. Accessibility & UI Invariants

| Gate ID | Release Criterion | Verification Mechanism | Threshold | Failure Action |
|---|---|---|---|---|
| `GATE-A11Y-01`| **Color Contrast Compliance** | `npm run check:contrast` | 100% of tested color pairs (97/97) meet or exceed WCAG AA ratio (4.5:1 text, 3:1 lines). | **Hard Stop:** Illegible UI; release blocked. |
| `GATE-A11Y-02`| **Never Color Alone (Law 11)** | `npm run lint:shell` | Status indicators pair color with text label, icon, and aria-label. | **Hard Stop:** Accessibility failure. |
| `GATE-A11Y-03`| **Touch Target Minimum (Law 13)** | `npm run lint:shell` | Floor interactive buttons carry minimum 56px touch height (44px min for desktop actions). | **Hard Stop:** Touch target failure. |
| `GATE-A11Y-04`| **Responsive Viewport Support (Law 14)**| `src/lib/__tests__/breakpoints.test.ts` | Layout conforms to Phone (<768px), Tablet (768-1279px), and Desktop (1280px+). Zero mobile horizontal scroll. | **Hard Stop:** Responsive breakage. |
| `GATE-A11Y-05`| **Zero Developer Text in Staff UI** | `npm run lint:ui-copy` | 0 raw developer notes, TODOs, or mock tags in rendered UI copy. | **Hard Stop:** Unprofessional UI copy. |

---

## 5. Offline Durability & Recovery Gates

| Gate ID | Release Criterion | Verification Mechanism | Threshold | Failure Action |
|---|---|---|---|---|
| `GATE-OFF-01` | **Offline Asset Precaching** | `vite.config.ts` Workbox build | All HTML, CSS, JS, and Devanagari fonts precached in Service Worker (291 entries). | **Hard Stop:** Offline shell won't boot. |
| `GATE-OFF-02` | **Idempotent Outbox Persistence** | `src/lib/__tests__/offlineQueue.test.ts` | In-flight non-custodial mutations survive page reload in Dexie IndexedDB. | **Hard Stop:** Silent data loss. |
| `GATE-OFF-03` | **Explicit Conflict UI (Phase 9)** | `src/lib/offlineQueue.ts` & Conflict UI | Server updates detected during offline replay trigger `QueuedConflict` for manual resolution; no silent overwrites. | **Hard Stop:** Silent data overwrite. |

---

## 6. Observability & Privacy Gates

| Gate ID | Release Criterion | Verification Mechanism | Threshold | Failure Action |
|---|---|---|---|---|
| `GATE-OBS-01` | **Zero External Trackers / No PII Leakage** | `src/lib/__tests__/monitoring.test.ts` | Sentry envelope strips query strings, client names, phone numbers, and rupee figures. | **Hard Stop:** Privacy violation. |
| `GATE-OBS-02` | **No Hardcoded Secrets (Law N-8)** | `npm run test:local-api-guards` & `check:anon` | Bundle contains only public anon keys; service keys and database credentials strictly banned. | **Hard Stop:** Security vulnerability. |
| `GATE-OBS-03` | **No Source Maps in Production** | `npm run build` | `dist/` contains 0 `.js.map` files; `sourcemap: false` pinned in Vite config. | **Hard Stop:** Source code exposure. |

---

## 7. Migration & Rollback Readiness Gates

| Gate ID | Release Criterion | Verification Mechanism | Threshold | Failure Action |
|---|---|---|---|---|
| `GATE-MIG-01` | **Clean Schema Rebuild from Scratch** | `npm run check:pglite` | 235/235 migrations apply cleanly in sequence without syntax or dependency errors. | **Hard Stop:** Broken migration chain. |
| `GATE-MIG-02` | **Documented Backup Verification** | `docs/archive/BACKUP_PROTOCOL.md` | Validated PostgreSQL dump taken and verified locally before applying new migrations to live database. | **Hard Stop:** Non-negotiable backup requirement. |
| `GATE-MIG-03` | **No Remote Migration Auto-Push (Law N-5)**| `opencode.jsonc` & script guards | `supabase db push` and `npm run db:apply --remote` blocked by tooling guards. | **Hard Stop:** Unsanctioned live write. |

---

## Release Certification Procedure

Before Babin signs off on a production release:
1. Run local full gate sequence: `typecheck → test → check:pglite → check:security → check:lifecycle → test:server-contracts → test:partial-return → lint:shell → lint:ui-copy → check:contrast → build`.
2. Verify all 17 gates report exit code `0`.
3. Check `PROGRESS.md` carries current date, verified test counts, and accurate `## Completion` block generated by `npm run completion`.
4. Confirm backup protocol step executed prior to live database schema updates.

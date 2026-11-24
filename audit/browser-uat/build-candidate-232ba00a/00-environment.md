# Babin Rentals OS — UAT Audit Environment Record (00-environment.md)
**Build Identifier:** `build-candidate-232ba00a`  
**Candidate Commit SHA:** `232ba00aa2b0d8388be374b4e4be62869996ed68` (short: `232ba00a`)  
**Date & Time:** 2026-11-24T23:31:00+05:45 (Nepal Standard Time)  
**Repository:** `babindulal7/babin-rentals-os`  
**Branch:** `main`  
**Target URL:** `http://localhost:3000/`  

---

## 1. Environment Identity & Staging Classification
- **Classification:** `MOCK-ONLY` (per Spec §1 & §8, explicitly acknowledged and approved).
- **Runtime Mode:** `vite --mode mock` (`VITE_DATA_SOURCE=mock`).
- **Database Backend:** In-memory local corpus with Dexie IndexedDB outbox.
- **External Network Access:** Disabled. No live Supabase mutation, no live external SMS/WhatsApp/email APIs.
- **Authentication Bypass / Test Roles:** Local role switcher supporting:
  - `Owner` (Full permissions + financial view)
  - `Manager` (Operations & bookings management)
  - `Billing` / `Accountant` (Financials, invoices, receipts)
  - `Warehouse` / `Caretaker` (Money-blind floor operations)
  - `Technician` (Money-blind gear QC & prep)
  - `Driver` (Money-blind logistics)
  - `Client` (Portal & customer view)

---

## 2. Browser & Device Testing Matrix
- **Desktop Chrome:**
  - Viewport: 1440 × 900 (Default Desktop)
  - Viewport: 1920 × 1080 (Wide Desktop)
- **Tablet Emulation:**
  - Viewport: 768 × 1024 (iPad Portrait)
  - Viewport: 1024 × 768 (iPad Landscape)
- **Mobile Emulation:**
  - Viewport: 390 × 844 (iPhone 14 / modern viewport)
  - Viewport: 360 × 800 (Android modern viewport)

---

## 3. Approved Setup & Verification Commands
- `npm run typecheck`: Passed (tsc --noEmit, 0 errors)
- `npx vitest run src/booking/pay/__tests__/ src/actions/rentals/__tests__/bookingRequests.test.ts`: Passed (4/4 test files, 23/23 tests green)
- Dev Server Start Command: `npm run dev:mock` (port 3000)

---

## 4. Logical Agent Roles & Waves
- **Wave 1:** A1 (Route & Control Inventory) — DOM enumeration, route mapping, control baseline.
- **Wave 2:** A2–A7 (Workflows W01–W15) — End-to-end execution, role boundaries, responsive/a11y inspection.
- **Wave 3:** A8 (Independent Verification) — Independent pass with fresh browser context, discrepancy reconciliation.

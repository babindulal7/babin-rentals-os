# Release Manifest — Babin Rentals OS v1.0.0 (December 31, 2026)

**Milestone:** Week 5 — Release Candidate Packet & Surface Readiness Certification  
**Target Launch:** Thursday, 31 December 2026 (Controlled Limited Production Deployment)  
**Governing Documents:** [DECEMBER_31_LAUNCH_PLAN.md](../plans/DECEMBER_31_LAUNCH_PLAN.md) §4 · [AGENTS.md](../../AGENTS.md) · [PERMISSIONS.md](../PERMISSIONS.md)  
**Authority:** Babin Dulal (Owner)  
**Status:** Certified Release Candidate Packet (Staged for Final Owner Sign-Off)  

---

## 1. System Identity & Version Baseline

| Dimension | Specification | Verification Evidence |
|---|---|---|
| **Product Name** | Babin Rentals OS | Production Domain: `app.babinrentals.com` |
| **Release Version** | `v1.0.0` (December 31 Launch Candidate) | PR #400 / Commit `4ed5607a` |
| **Engine Core** | React 18 · TypeScript 5.7 Strict · Vite 5 · Tailwind CSS v4 | `package.json` pinned; `tsc --noEmit` 0 errors |
| **Database Tier** | Supabase Postgres (PostgreSQL 15.8) + PostgREST + RLS | Production: `sxguwvgoserhdolewibb` · Staging: `klhmsrunqrdxjudyhnkm` |
| **Schema Baseline** | 267 migration files (Versions `0001` through `0269`) | 277 production rows in `schema_migrations`; **zero database drift** |
| **Client Storage** | Dexie IndexedDB (Local Outbox) + PGlite 0.5.8 (Local DB Gates) | `check:pglite` (267/267 green), `check:lifecycle` (102/102 green) |
| **CI Architecture** | 17 Ordered Verification Gates on M4 Mac ARM64 Runner | CI Run `45282619684` 100% green in 6m 21s |

---

## 2. Separate Surface Readiness Reports

In accordance with Week 5 launch requirements, readiness is certified separately across the three distinct software surfaces:

### 2.1. Surface 1: Internal Operations App (`app.babinrentals.com`)
- **Target Audience:** Owner, Admin, Manager, Coordinator, Accounts, Warehouse, Technician, Driver.
- **Entrypoint:** `index.html` → `src/main.tsx` → `src/App.tsx`.
- **Module Readiness:**
  1. **Today Dashboard (`/today`):** Real-time operational queues (Pickups, Returns, Cleaning/Reset, Deliveries). Money-blind for floor roles.
  2. **Rentals Management (`/rentals`):** Quote creation, GiST reservation exclusion (no double-bookings), forward-only custody transitions (`apply_booking_stage_transition()`).
  3. **Operations Floor (`/operations`):** Packing checklists, handover verification, return inspection with mandatory damage photo gate (L68), turnaround resets. Touch targets $\ge 56\text{px}$.
  4. **Inventory Catalogue (`/inventory`):** Physical units, serial numbering, repair job maintenance routing, temporary partner stock (T2-24).
  5. **Financial Ledger (`/finance`):** 13% VAT accounting, immutable payment ledger (Law 4), deposit liabilities segregated (Law 5), 4-gate daily closing.
  6. **Document Generation (`/documents`):** Monotonic document numbering (`BK-`, `INV-`, `PAY-`), draft invoice numbering on full settlement (T3-14), PDF generation.
- **Readiness Rating:** **100% CERTIFIED READY**.

### 2.2. Surface 2: Public Marketing & Catalogue Website (`babinrentals.com`)
- **Target Audience:** Prospective clients, filmmakers, production companies, general public.
- **Entrypoint:** `marketing.html` (isolated bundle; zero internal app or administrative CSS leakage).
- **Security & Privacy Isolation:**
  - Anonymous visitors have read-only access to published catalogue equipment and options.
  - Zero access to client rosters, financial summaries, internal bookings, or operational notes (`view-leak gate: 0 leaks`, `public-catalogue privacy gate: 0 violations`).
  - Away mode switch (`migration 0262` / T7-14) allows immediate server-side pausing of new rental inquiries when at full capacity.
- **Readiness Rating:** **100% CERTIFIED READY**.

### 2.3. Surface 3: Client Self-Service Portal (`app.babinrentals.com/portal`)
- **Target Audience:** Registered production clients and verified cinematographers.
- **Security & Isolation Architecture:**
  - Strict **D-5 Tenant Isolation**: Row-Level Security ensures clients read and write only their own records; cross-tenant queries fail closed.
  - Mandatory KYC Verification: Secure, audited document upload for citizenship, passport, or company PAN.
  - Transparent Booking Tracking: Real-time visibility into booking status, pro forma estimates, and one-click payment links (T7-15).
  - Law 6 Privacy: Warehouse and technicians see client project contact info only when assigned to active dispatch; no payment details exposed to floor workers.
- **Readiness Rating:** **100% CERTIFIED READY**.

---

## 3. Invariants & Regulatory Compliance Matrix

| Invariant / Law | Technical Enforcement | Verification Artifact |
|---|---|---|
| **Rule N-5** | Zero migrations pushed to production from CLI; local PGlite certification required prior to owner apply | `docs/live/PRODUCTION_LIVE_BATCH_PLAN_2026-11-23.md` |
| **Rule N-8** | Zero hardcoded API keys, JWT secrets, or DB passwords in bundle or repository | Clean git audit; `VITE_*` keys restricted to public Supabase anon key |
| **Law 1** | Pages never implement business logic; custody engine in `src/lib/` and atomic Postgres RPCs | Custody fail-closed RPCs; `test:server-contracts` PASS |
| **Law 3** | Terminal actions only; quotes/bookings terminated via cancellation reasons, never deleted | Soft-delete and audit trail certified in `check:lifecycle` L31 |
| **Law 4** | Immutable payments; corrections require reverse-ledger rows | Ledger assertion in `src/__tests__/e2e/coreRentalLoopHardening.test.tsx` |
| **Law 5** | Security deposits are liabilities; never added to revenue or reducing outstanding | Verified in `src/lib/damage.ts` and `floor-loop.test.tsx` |
| **Law 6** | Money-blindness on warehouse floor; zero rupee figures in DOM or payloads | Certified in `floorRoleMoneyBlindnessAudit.test.ts` (13/13 pass) |
| **Law 14** | Touch ergonomics: floor verbs $\ge 56\text{px}$, standard controls $\ge 44\text{px}$ | Certified in `src/__tests__/e2e/week3StaffAndDeviceAcceptance.test.tsx` |
| **WCAG AA** | Theme contrast ratio $\ge 4.5:1$ on text and $\ge 3:1$ on graphic controls across light & dark | `npm run check:contrast`: 97/97 compliant |

---

## 4. Contingency & Fallback Strategy

1. **Dual-Entry Operating Window:**
   - From December 15 to December 31, counter staff maintain Booqable alongside Babin Rentals OS as an independent reference.
   - Any booking discrepancy is cross-referenced using `docs/verification/CUTOVER_DRY_RUN_PROTOCOL.md`.
2. **15-Minute Rehearsed Rollback:**
   - In the event of a P0 defect on Day X, Babin Dulal issues the rollback order.
   - Operations immediately revert to Booqable and Option A tabular CSV backups per `docs/live/DISASTER_RECOVERY_RUNBOOK.md`.
3. **Escalation & Emergency Contacts:**
   - Primary Operational Lead: Babin Dulal (Owner) — Mobile: +977-980XXXXXXX
   - Technical Escalation: Babin Engineering Team (Antigravity Harness & GitHub CI)

# AGENTS.md — Babin Rentals OS

React 18 · TS 5.7 strict · Vite 5 · Tailwind v4 · Supabase Postgres + RLS · Dexie (IndexedDB outbox) · PGlite (in-process Postgres for DB gates).

## Start here (authority order)

`docs/00_READ_FIRST.md` → `CLAUDE.md` → `docs/PERMISSIONS.md` (§3/§4/§6 matrix) → `RULINGS-*.md` (newest first) → `docs/PRODUCT_RULES.md` → `docs/CURRENT_STATE.md` → `PROGRESS.md` → `PLAN.md` *(go-live roadmap, re-created 26 Oct 2026; task cards in `docs/plans/`)* → Foundation Spec. Where specs conflict, Foundation wins; where permissions conflict, `PERMISSIONS.md` wins and **stricter wins** (B-1). Never read `src/archive/` or dated `docs/audits/` as current truth.

- Never invent a product decision. Mark `TODO(decision)`, log in `docs/OPEN_DECISIONS.md`, index it in `PLAN.md` §4.2, work on something unblocked.
- Session end: update `PROGRESS.md` (newest first, Did / Ruled / Verified) with `## Completion` + `## Remaining` blocks. Run `npm run completion` — never hand-type a percentage. Run `npm run lint:progress` yourself — it enforces the blocks (CI is off).

## Parallel work (PLAN.md §6 — ruled 26 Oct 2026)

- **Lanes:** **Codex-1 = lane A** (T0, T1 code, T2 floor, T9 cutover, then T8) · **Gemini = lane B** (T4, T5, then T6 Nepali) · **Codex-2 = lane C** (T3 booking & money, T7 online booking). Claude reviews at 7:38 AM and 7:38 PM NPT and never pushes; Babin merges locally.
- **One agent per checkout.** Each lane works in its own git worktree on its own branch: `lane-<a|b|c>/<card-id>-<slug>` (e.g. `lane-a/T2-01-camera-evidence`). Never edit another lane's open card files.
- **Your task is a card** in `docs/plans/T*.md`; its prompt is `docs/plans/prompts/<card-id>.md`. Set the card to `doing` in your first commit and tick it when done.
- **Migrations:** claim the next free number in `docs/plans/MIGRATION_LEDGER.md` in your first commit. Never apply anything to live Supabase (N-5).
- **Shared files** (`PLAN.md`, `docs/PERMISSIONS.md`, `src/lib/rbac.ts`, `src/actions/core.ts`, `src/lib/money.ts`, `src/lib/pricingPipeline.ts`): change one only when your card says so, and say so in your report.
- **Nepali (T6)** converts a module only when no open lane A or C card touches that module.
- **Database first:** a permission or gate changes in Postgres (migration + lifecycle step) before the UI offers it (P2, P3, N-3).
- **Done means:** real data, permissions enforced in the database, five screen states (loading, empty, error, restricted, offline), phone/tablet/desktop, the screen check in `docs/USABILITY_TESTS.md` §1 passed on every changed screen, local gates green, merged by Babin, PROGRESS logged. A screen that only looks finished is not done (Law 16).

## Commands

```bash
cp .env.example .env.local   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, then restart Vite
npm run dev                  # live Supabase, :3000
npm run dev:mock             # vite --mode mock, VITE_DATA_SOURCE=mock local corpus
npm run dev:local            # vite --mode localdb
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint src --max-warnings 0 (src only; archive/scripts/supabase excluded)
npm test                     # full suite: forces mock transport and masks any live .env.local credentials (T0-10); -- --live requires explicit intent
npx vitest run <path>        # single file, e.g. npx vitest run src/__tests__/e2e/tier1-features.test.tsx
npm run build                # tsc --noEmit && vite build → dist/
```

Verification order for any change: `typecheck → test → check:pglite + check:lifecycle → build`. **GitHub CI is off since 26 Oct 2026** (billing; Babin ruled W75 — `RULINGS-2026-10-26-workflow.md`): run **every step it ran, in its order**, yourself before you report a card done, and paste the results into PROGRESS.md — the list is in `docs/plans/README.md` ("Gates every card must pass"): typecheck, lint, `npm test` (T0-10 makes mock the default even when `.env.local` points at live; do not use `--live` for ordinary gates), `check:pglite`, financial integrity, `check:security`, `check:lifecycle`, `test:server-contracts`, `test:partial-return`, `lint:progress`, the receipt test, `lint:shell`, `lint:ui-copy`, `check:contrast`, build (coverage before each live batch). The workflow file `.github/workflows/ci.yml` stays as the reference list.

DB / lifecycle gates (allowed in `opencode.jsonc`, never prompt-blocked):
```bash
npm run check:pglite        # rebuild all migrations from scratch in PGlite, no Docker/network
npm run check:lifecycle     # 18-step booking lifecycle through real Postgres + RLS
npm run check:contrast      # WCAG AA on shipped theme.css, light + dark
npm run check:db / check:rebuild / check:dump
npm run db:start | db:stop
npm run db:apply            # LOCAL stack only (scripts/apply-migrations-local.mjs)
npm run db:rebuild          # supabase db reset --no-seed + local apply
npm run db:types            # regen src/types/database.ts
```

## Hard prohibitions

- **N-5: never push a migration to live Supabase.** `supabase db push` (any spelling) and `npm run db:apply --remote` are denied in `opencode.jsonc`. Write it, number it (`supabase/migrations/`), verify locally (`check:pglite` + `check:lifecycle` both green = `Verified` per R-35) — Babin applies after [`../archive/BACKUP_PROTOCOL.md`](../archive/BACKUP_PROTOCOL.md). Never `supabase db reset` against production. `PROGRESS.md` must say WRITTEN vs VERIFIED vs APPLIED vs PRODUCTION-VERIFIED.
- **Anon key only in the client.** Every `VITE_*` var is inlined into the bundle at build time and is public (View Source). Never a service key, JWT secret, or credential in code, logs, or commits (N-8). `docker run -e` on a built image does nothing — values must exist at `npm run build`.
- Env changes require a Vite restart. `VITE_DEV_AUTH_BYPASS=true` skips login as seeded Owner but is double-gated on `import.meta.env.DEV` (dead code in prod).
- No `any` in `src/` (`@typescript-eslint/no-explicit-any: error`); relaxed only in `*.test.*`. `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` are on — index access needs guards.

## Architecture (what filenames don't tell you)

- `@/` → `src/`. Entrypoints: `src/main.tsx` → `src/App.tsx` (route table: `Shell` + `BookingShell`; `/today`+`/dashboard` both mount Today; `/rentals/new` redirects to `/rentals?action=new`).
- **Law 1: pages never implement business logic.** Engines own it: `src/lib/` (money, pricingPipeline, rentalDays/operationalDay, bs, rbac, workflow, gates). Writes go through `src/actions/` (per-domain folders + `core.ts`; a stub refuses rather than faking). Components present/collect only.
- **Custody transitions are fail-closed online RPCs, never queued offline** (R-40): `apply_booking_stage_transition()` validates gates, mints reservations (GiST exclusion), transitions stage, audits — caller reads `bookings.stage` back with `queueOnFailure: false`. Only non-custodial events (scans, notes, queue stamps) use the Dexie outbox (`src/lib/offlineQueue.ts`, `dataAccess.ts`) with `client_uuid` idempotency keys on every write.
- Atomic RPCs: `create_booking(jsonb)` (booking + lines + crew + transport, no partials, R-43), `next_document_number()` (BK-/INV-/PAY-, monotonic Law 7).
- `src/archive/` is Law 3 (nothing is deleted): kept but excluded from tsconfig, eslint, and vitest. Restoring = move back into `src/modules` + re-add route.
- Build has **two entry documents** (`index.html` ops app, `marketing.html` public site) with isolated CSS. Host must rewrite unknown paths to `/index.html` (`vercel.json` / `nginx.conf` `try_files`); without it deep links 404 in prod while working in dev. `vite.config.ts`: `sourcemap: false` pinned (do not flip — leaks source paths), PWA `globPatterns` must keep `woff,woff2` or offline Nepali fonts break.
- `packages/design-tokens/` is the token source; `src/styles/theme.css` is the runtime layer. Breakpoints `768 / 1280` live in `src/lib/breakpoints.ts`, mirrored by `styles/responsive.css` + `index.html` pre-paint script — a test asserts all three agree, so change all three together.

## Money, dates, roles (will fail review if wrong)

- **Integer paisa only** (`src/lib/money.ts`): `rupees()` / `price()` / `formatMoney()` (lakh grouping `1,85,000`, half-up rounded at each displayed step). Never `float`/`numeric`/`parseFloat` for amounts; never recompute pricing in a component. §2.8 reference case is asserted at module load (`REFERENCE_CASE_ERROR` → error screen, not throw).
- Deposits are liabilities: never in Rental Total, never reduce Outstanding (Law 5). Payments immutable: corrections are reversal rows (Law 4). Discount gate is removed (D3) — only arithmetic validity remains (0–100%).
- Store AD in UTC (`timestamptz`); BS rendered via `src/lib/bs.ts` only. Operational day 06:00→06:00 NPT (`rentalDaysBetween`, `KATHMANDU_SHIFT_OFFSET_MS`).
- Money-blind roles (`Warehouse`, `Technician`, `Driver`, `Client`): enforced by RLS/`auth_can_view_money()`, mirrored in UI via `canViewMoney`/`useRoleMoney`/`isMoneySurface`. Never leak figures in HTML or payloads. Word "customer" appears nowhere — always "clients". Status = icon + label + colour, never colour alone. Errors inline; toasts for successes only. Touch targets ≥44px (56px primary floor verbs). Icons Tabler outline 2px. Fonts self-hosted `.woff2`: Outfit (display), Source Sans 3 (body), JetBrains Mono (every number), Asar/Hind (Nepali).

## Tests

- `vitest.config.ts` is deliberately separate from `vite.config.ts` (no PWA/Tailwind in test runs). Default env `node`; UI suites opt into jsdom per-file via `// @vitest-environment jsdom`. `testTimeout/hookTimeout 20s` is contention headroom, not a slow-test budget — `src/lib` engine suites run in ms.
- Coverage (`npm run test:coverage`) only measures `src/lib/**/*.ts`. E2E tiers in `src/__tests__/e2e/` (`tier1-features`, `tier2-boundaries`, `tier3-cross-feature`, `tier4-scenarios`) are opaque-box: roles/labels/text/user events, never internals. Green unit tests alone never certify a migration — R-35 requires `check:pglite` + `check:lifecycle` green together.

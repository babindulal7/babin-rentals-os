# T4-08 review fixes — R1 to R5

**Agent:** Gemini (lane B) · **Size:** S · **[go-live]** · **Found by:** Claude's review of `main` on 1 Nov 2026 — [`RULINGS-2026-11-01.md`](../../../RULINGS-2026-11-01.md), last section · **Card:** T4-08 in [`docs/plans/T4_SHARED_TOOLS.md`](../T4_SHARED_TOOLS.md)

> Paste everything below the line into **Gemini**, working in lane B's own git worktree.

---

You are working on **Babin Rentals OS** (React 18 + TypeScript + Vite + Tailwind v4 + Supabase).
Your task is five review findings on code lane B already merged: the one-time rider link (T4-08, migration
`0190`) and one red gate that came in with the shift-handover hardening. Start a branch
`lane-b/T4-08-review-fixes` from the latest `main` in your own worktree; never share a checkout with another agent.

## Read first
1. `AGENTS.md` and `CLAUDE.md` (laws, N-1…N-8).
2. `RULINGS-2026-11-01.md` — the section "Review of T4-08 and the shift money boundary" (R1–R5).
3. `docs/PERMISSIONS.md` §7.1 (Hired Rider Link) and `supabase/migrations/0190_one_time_rider_links.sql`,
   `supabase/functions/rider-link/index.ts`, `src/lib/queries/riderLink.ts`, lifecycle step **L47** in `scripts/e2e-lifecycle.mjs`.
4. `docs/ONLINE_BOOKING_SPEC.md` §12 test **D-10.6** — your R1 fix must make that test pass.

## Why this matters
Online booking (T7) opens email sign-up to the public. From that day any stranger holds an `authenticated`
session, so anything granted to `authenticated` is reachable by strangers. The rider RPCs are meant to be
reached only through the `rider-link` Edge Function.

## The five fixes — do them in this order

**R5 — fix the red gate first (one line).** `npm run typecheck` fails on `main`:
`src/components/teamNotes/TeamNotesPanel.tsx(17,10) TS6133 'actionCtx' is declared but its value is never read`
(from `b92cf581`). Remove the unused `actionCtx` helper, or use it if it was meant to be used. Commit this on its own
so Babin can merge it first. Done when `npm run typecheck` exits 0.

**R1 — rider RPCs are service-role only.** `get_rider_job_by_token`, `rider_mark_picked_up` and
`rider_complete_delivery` are `grant execute … to authenticated, service_role`, yet the Edge Function calls them
with the service role. Change the grants to **`service_role` only** and keep `revoke … from public, anon, authenticated`.
Also stop staff reading the credential: the staff SELECT policy on `delivery_job_links` exposes `token_hash`, and these RPCs
take the hash as the credential. Expose staff the link without the hash (a column-level grant that omits `token_hash`,
or a view `delivery_job_links_staff_v` without it — your choice, but a direct `select token_hash` as Coordinator or Warehouse must be refused).
Update the post-condition block at the end of 0190 so it also asserts `authenticated` cannot execute the three rider RPCs.
Update **L47** accordingly: it currently calls the rider RPCs as an ordinary signed-in session, which will now be refused. The harness's `as(role, fn)` only does `set role authenticated`, so it has no service-role mode — **first check whether a `service_role` role exists in the PGlite harness** (0190 already grants to it and passes, so it probably does). If it does, add a small `asService(fn)` helper (`set role service_role`) and run the rider flow through it; either way assert the grants directly with `has_function_privilege('authenticated', …, 'EXECUTE') = false` and `has_function_privilege('service_role', …, 'EXECUTE') = true`.

**R3 — the server makes the token.** Today `generateRiderRawToken()` runs in the browser and only its hash is sent, so the server
cannot know the token is strong. Change `create_rider_link` to **generate the token itself**, store only its SHA-256, and **return the raw token once** in the result. **Use core functions, not pgcrypto:** `pgcrypto` lives in the `extensions` schema (migration 0041) and these functions run with `search_path = public, pg_temp`, so an unqualified `gen_random_bytes()` will not resolve. Build the token as `replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')` (well over 128 bits) and hash it as `encode(sha256(convert_to(v_token, 'UTF8')), 'hex')` — that is byte-for-byte what the Edge Function and the lifecycle test already compute with SHA-256 hex. (If you prefer pgcrypto, call it as `extensions.gen_random_bytes`.)
The browser then builds
`/rider/<rawToken>` from that result and never generates or hashes anything. Remove `generateRiderRawToken`/`hashRiderToken`
from the real path (the mock path may keep a local generator). The raw token must not be written to any table, `audit_events` or log.

**R2 — `client_uuid` (Law 8).** Add `client_uuid uuid not null unique` to `delivery_job_links` and a `p_client_uuid` argument to
`create_rider_link`. A replay with the same key must **not** create a second link: it returns the existing link id and
`already_issued: true` **without** a raw token (the original token was shown once and is not stored), and the screen says
"Link already created — revoke it to issue a new one". Two taps on the button must give one live link.

**R4 — optional, only if cheap.** The rider-facing RPCs raise different messages for unknown / revoked / expired / completed
links. Do this **in the `rider-link` Edge Function, not in SQL**: map every `42501` from these RPCs to one generic message for the rider ("This link is no longer valid") and log the specific reason server-side with the link id only — **never the token, hash, phone or name**. Do not try to write an audit row from inside the RPC for these refusals: a `raise exception` rolls back anything written in the same transaction, so the row would never exist. Skip this if it needs more than the Edge Function.

**Migration:** `0190` has not been applied to live (live tops out at `0156` — check `docs/live/schema_migrations_*.txt`).
If that is still true, **edit `0190` in place** rather than adding a number; if anything shows it was applied
anywhere, stop and claim the next free number in `docs/plans/MIGRATION_LEDGER.md` instead (the ledger's
"next free number" line is out of date — check the migrations folder and the ledger table).
A migration counts as Verified only when `npm run check:pglite` **and** `npm run check:lifecycle` are green in the same run (R-35).

**Needs first:** none.

## Done when
1. `npm run typecheck` exits 0 (R5).
2. As a Coordinator and as Warehouse, `select token_hash from delivery_job_links` is refused; as any `authenticated` session,
   executing the three rider RPCs is refused **at the grant** (not by "invalid token"); through the `rider-link` Edge Function the
   whole rider flow (open → picked up → delivered) still works (R1).
3. `create_rider_link` returns a server-made token once; no table or audit row contains it; the browser never hashes (R3).
4. Calling `create_rider_link` twice with one `client_uuid` leaves exactly one live link (R2).
5. L47 covers 2–4 and is green; money blindness (Law 6) for the rider payload is unchanged.
6. `docs/PERMISSIONS.md` §7.1 still tells the truth after your change (B-3).

## Rules you must not break
- Pages never hold business logic; engines in `src/lib/` and actions in `src/actions/` own it (Law 1).
- Money is integer paisa through `src/lib/money.ts`. Deposits never touch Rental Total or Outstanding (Law 5). Payments are never edited — corrections are reversal rows (Law 4).
- Warehouse, Technician, Driver and Client never receive money in the DOM or in a payload (Law 6) — enforced in Postgres, mirrored in the UI.
- Nothing is deleted; every entity has a named terminal action (Law 3). Every write carries a `client_uuid` (Law 8).
- Store dates as AD/UTC; render BS only through `src/lib/bs.ts`. The rental day runs 06:00 → 06:00 NPT.
- Errors inline, success toasts only; never colour alone; 44 px touch targets (56 px for floor verbs); no platform branch in a layout; the word "customer" never appears in the UI — they are clients.
- Permissions: stricter wins (B-1). Change Postgres first and never make `rbac.ts` more permissive than RLS (N-3). A changed permission cell updates `docs/PERMISSIONS.md` and the T-1 fixture in the same commit (B-3).
- Never apply anything to the live Supabase project (N-5). Never print or commit a credential (N-8).
- Stay inside this card. Do not edit files another lane has open. Touch the shared files (`PLAN.md`, `docs/PERMISSIONS.md`, `src/lib/rbac.ts`, `src/actions/core.ts`, `src/lib/money.ts`, `src/lib/pricingPipeline.ts`) only if this card needs it, and say so in your report.
- Never invent a product decision: write `TODO(decision)`, add it to `docs/OPEN_DECISIONS.md`, and carry on with the rest.

## Check before you say it is done (GitHub CI is off — this is the gate)
The steps `.github/workflows/ci.yml` ran, in its order (CI is off; this list is the gate):

```bash
npm run typecheck
npm run lint
VITE_DATA_SOURCE=mock npm test        # PowerShell: $env:VITE_DATA_SOURCE='mock'; npm test
npm run check:pglite                  # with check:lifecycle green in the same run = migration Verified (R-35)
node scripts/test-booking-financial-integrity.mjs
npm run check:security
npm run check:lifecycle
npm run test:server-contracts
npm run test:partial-return
npm run lint:progress
node --test scripts/test-receipt.test.mjs
npm run lint:shell
npm run lint:ui-copy
npm run check:contrast
npm run build
```

Then run `npm run dev:mock` and drive every screen you changed at 375, 820 and 1440 px, as at least
one money role (Owner or Coordinator) and one money-blind role (Warehouse) where the screen is
role-dependent. On each changed screen, run the **screen check** in `docs/USABILITY_TESTS.md` §1
(which screen, which booking, where am I, next action, search and exit, nothing claims a save that
did not happen, touch, forgiving forms) and write the result in your PROGRESS entry.

## Finish
1. In `docs/plans/T4_SHARED_TOOLS.md`, add one line under T4-08: `review fixes R1–R5 — ready, awaiting merge (lane-b/T4-08-review-fixes)`.
2. Add a `PROGRESS.md` entry at the top: **Did / Ruled / Verified**, the Completion block printed by
   `npm run completion`, and a Remaining block. Run `npm run lint:progress`.
3. Commit on your branch — R5 as its **own commit**. Do not merge — Babin merges locally.
4. Report back in this shape (Claude reviews it at the next check-in):
   - **Branch and commits**
   - **What changed** (files)
   - **How it was verified** (each command and its result; for R1 the direct-call refusals and the Edge Function flow)
   - **Not done** (and why), **Waiting on Babin**, **New TODO(decision)**

# CLAUDE TASK 03 — PR #35 Review Blockers and Rider-Link Security

Reviewer: Claude (read-only on GitHub; nothing pushed, merged, commented or deployed; live Supabase untouched).
Review date: 1 Nov 2026. Evidence labels: **VERIFIED** (read in source and/or executed), **FAILED**, **UNVERIFIED**, **PROPOSED**.

## 0. Facts refreshed at start of review

| Item | Value | Label |
|---|---|---|
| `origin/main` | `a32a6d0d67d5e7ddfed5acd6693f6146d220fa82` (matches the assignment) | VERIFIED (`git fetch`) |
| PR #35 head | `17e4f1e797ad995ea7e4a656431cd5138d572779`, branch `fix/2026-11-01-rider-crypto-and-regression-gates` | VERIFIED (`git ls-remote`; see caveat) |
| Merge base | `f2632b19` — PR is 9 commits ahead and 19 files behind `main` | VERIFIED |
| Draft / mergeable flags | Not re-checked. `gh` is not authenticated here and the PR page was not fetched. The branch-to-PR mapping rests on the branch name and the assignment. | UNVERIFIED |
| Actions run 41290665633 | `WebFetch` returned HTTP 404 (private repo or not visible). No result retrieved. | UNVERIFIED |

---

## 1. Executive assessment

**Is PR #35 safe to merge? No — not as it stands. It becomes safe to merge after one mechanical conflict resolution and two small additions (§7), and once `main`'s own broken typecheck is fixed (BLD-1: `tsc` is red on `main` because of an unused helper in `TeamNotesPanel.tsx`, which blocks the merge gate for every branch). Separately, the rider-link feature itself must not be released: it carries four P1 defects that PR #35 neither introduces nor fixes.**

1. **PR #35's own content is good and non-regressive.** The two rider-crypto changes are correct. The three test/doc alignments match shipped behaviour. Targeted tests: 46/46 pass on the PR head; on `main` the three tests PR #35 repairs fail.
2. **It does not merge cleanly.** Three files conflict with the copy-cleanup commit `966cd441`, which is already on `main` (§2). The overlap is the same 4 lines on both sides, so resolution is trivial and safe.
3. **One of the two "security" tests proves nothing.** The SHA-256 test passes on the *old* weak code (§3.1). The fail-closed hash branch the PR adds has no test.
4. **The rider-link feature has real defects** that are independent of PR #35 (§4): the rider sees an error screen after a *successful* delivery; the bearer token goes to Sentry; the `token_hash` is itself a usable credential for any signed-in staff session; the direct-RPC fallback replays writes and hides the real reason a link is dead.
5. **Shift-handover money isolation (migration 0186) holds at the database level** for what is tested and what I could verify by reading. Gaps are test coverage and free-text notes (§5), not a confirmed leak.

**Recommendation: REQUEST CHANGES on PR #35. BLOCK release of rider links** until the P1s in §4 are closed (§9).

---

## 2. Exact merge conflicts and overlapping changes

`git merge-tree --write-tree origin/main 17e4f1e7` → **3 content conflicts, 1 clean overlap.**

| File | Main's `966cd441` text | PR #35 text | Result |
|---|---|---|---|
| `src/modules/notes/InternalNotesPage.tsx:816` | `Database Live Sync · Archive` | `Changes sync across devices · Notes are archived, not deleted` | **CONFLICT** |
| `src/modules/settings/sections/LegacyExportControl.tsx:115` | `…Data stays on this device — nothing is deleted or auto-imported.` | `Exports a JSON + CSV bundle. Data stays on this device and is never deleted or imported automatically.` | **CONFLICT** |
| `src/modules/today/LegacyExportCard.tsx:110` | `Bytes stay on this device — nothing is deleted. …` | `Your old data stays on this device and is not deleted. You can also download it later from Settings ▸ System.` | **CONFLICT** |
| `src/modules/settings/sections/System.tsx` | `…before starting fresh.` | identical | clean (auto-merges) |

Both sides remove the same internal codes (`Law 3`, `D28`). The PR text additionally removes remaining jargon ("Database Live Sync", "Bytes"), so **resolve every conflict to the PR side**. Everything else the PR touches (5 files: `riderLink.ts`, `riderLink.test.ts`, `rentalMoreActionsRegistry.ts` + test, `useNewRentalHooks.test.tsx`) does not overlap with anything `main` changed since the merge base.

**Nothing from `main` is overwritten** by the PR: I built `main` + the PR's 9 files in a scratch copy and diffed it against a `main` export — exactly 8 files differ (System.tsx is already identical). **VERIFIED.**

`main`-only work PR #35 must not regress (all untouched by the PR): `0186_shift_handovers.sql`, `shiftHandover.ts`, `src/actions/shifts/*`, `ShiftHandoverPanel.tsx`, `HandoverSheet.tsx`, `TeamNotesPanel.tsx`, `rbac.ts`, `e2e-lifecycle.mjs`, `PROGRESS.md`.

Housekeeping: the PR does not touch `PROGRESS.md`, which the repo rules require at session end. **P2.**

---

## 3. File-by-file findings

Line numbers refer to the PR head (`17e4f1e7`) unless stated; for `riderLink.ts` lines ≥ 85 they differ from `main` by a few lines.

### 3.1 `src/lib/queries/riderLink.ts` + `__tests__/riderLink.test.ts` (the PR's security change)

| # | Check | Result |
|---|---|---|
| 1 | Token uses secure randomness — `generateRiderRawToken` L87–98 throws if `crypto.getRandomValues` is missing; 16 bytes → 32 hex | **VERIFIED.** Old code fell back to `Date.now()+Math.random()` (guessable). Fix is correct. |
| 2 | SHA-256 never simulated — `hashRiderToken` L103–124: `crypto.subtle` first; `node:crypto` only under `IS_MOCK`; otherwise throws | **VERIFIED by execution** (probe: with `subtle` removed and `IS_MOCK=false` it rejects with "Secure SHA-256 hashing is unavailable"). Old 32-bit-hash simulation is gone. |
| 3 | Do the PR's tests prove it? | **Partly FAILED.** I ran the PR's new tests against `main`'s *old* implementation: the RNG test **fails** (good — it detects the bug); the "uses the real SHA-256 algorithm" test **passes on the old code** (it only exercises the `crypto.subtle` path that was never broken). **The fail-closed hash branch (L113–123) has no test in the PR.** My probe shows it works; the PR should carry that test (§6). |
| 4 | Hash computed before the Edge call — L330, L372, L419 | **P2.** In a non-secure context (plain `http://` LAN preview) the client throws before the Edge Function is tried, although the Edge Function hashes server-side and does not need the client hash. Compute the hash lazily only if a fallback is kept (see next row). |
| 5 | Edge failure → direct RPC fallback — L345–354, L383–389, L436–446 | **P1 (SEC-2).** See §4. The rider RPCs are not executable by `anon` (0190 L460–470), so for a real, signed-out rider the fallback can only ever fail with *permission denied* — which then **replaces the Edge Function's real reason** (revoked / expired / completed). For a signed-in staff browser it silently re-sends the write outside the Edge path. Confirmed by probes P3–P5. |
| 6 | Mock leakage — `IS_MOCK` L115, 165, 214, 237, 289, 362, 408 | `IS_MOCK` defaults to `false` (`src/lib/supabase.ts:42–43`, "default is `live`"); mock rider data and `localStorage` raw tokens (L55–82, L168–179) are mock-only. **VERIFIED by reading.** A mock-mode `vite build` (executed, exit 0) prints `Module "node:crypto" has been externalized for browser compatibility, imported by src/lib/queries/riderLink.ts` — so the import is bundled as a browser stub (a warning, not an error; in a browser it can only reach the caught "unavailable" branch). Whether it is stripped from a **production-mode** bundle is **UNVERIFIED** (no `--mode production` build run). |
| 7 | `canIssueRiderLink` L130–133 hard-codes a role list instead of an `rbac.ts` capability | P2 (drift risk vs the DB list at 0190 L65). Roles match today: Owner, Admin, Manager, Coordinator, Warehouse. |

### 3.2 `supabase/functions/rider-link/index.ts` (not changed by the PR)

- Uses the `service_role` client (L41) and hashes the token server-side (L54). Correct design; this is the only path a signed-out rider can use. **VERIFIED by reading.** Deployed state: **UNVERIFIED** (no function entry in `supabase/config.toml`, so the default JWT check applies; the app's anon key satisfies it).
- **P2:** L83–86, L113–116, L130–134 return raw `error.message` / exception text (Postgres internals) to an unauthenticated caller. Map to fixed messages.
- **P2:** L11 imports `@supabase/supabase-js@2` from `esm.sh` unpinned — pin an exact version.
- **P2:** CORS `*` (L14) and no rate limiting on a public endpoint. Acceptable against a 128-bit token, but `deliver` accepts an unbounded `signature_svg` (L96, L105–110).
- Status mapping by substring (L62–64) is fragile but not a vulnerability.

### 3.3 `supabase/migrations/0190_one_time_rider_links.sql` (not changed by the PR; ledger still says "claimed")

| Check | Result |
|---|---|
| Token scoped to exactly one job | **VERIFIED.** Every rider RPC resolves `token_hash → link → job_id`; no job parameter. Lifecycle step (`e2e-lifecycle.mjs:4187–4355`) covers read/pickup/deliver on that job. |
| Expired / revoked / completed cannot mutate | **VERIFIED (read).** All three RPCs check `revoked_at` (L220, 308, 375), `expires_at` (L224, 309, 376), `completed_at` (L228, 310, 377) under `FOR UPDATE`. Lifecycle covers re-read after completion, revoked pickup, expired read. |
| Rider payload money-blind | **VERIFIED (read).** L270–288 returns booking no., addresses, contact, item names and quantities, no price/deposit/fee column. Lifecycle asserts a money-term denylist. Residual risk **UNVERIFIED**: free text (`delivery_jobs.last_note` L286, line descriptions L259) can contain a figure typed by staff and is passed to the rider verbatim (P2). |
| Repeat submissions | Pickup is idempotent (L319–321 returns success). **Delivery repeat raises "already completed"** — safe (no double write) but a rider whose first request succeeded and whose response was lost sees an error. No `client_uuid` on rider writes. P2. |
| Anon grants | **VERIFIED.** Table and all five functions are revoked from `anon`/`public`; the `DO` block at L473–488 fails the migration otherwise. |
| **Authenticated grants** | **P1 (SEC-1).** `grant select on delivery_job_links to authenticated` (L32) exposes the `token_hash` *column* to every staff role the policy allows (L34–45), and the three rider RPCs are granted to `authenticated` (L466–468) and **accept the hash, not the raw token**. So the hash is a working credential: any Owner/Admin/branch Manager/Coordinator/Warehouse can mark pickup or deliver as the rider. The audit rows then attribute the action to the link *creator* (L338, L439) with the role hard-coded `'Coordinator'` (L440). This contradicts `docs/PERMISSIONS.md` §7.1 ("Direct table access is denied to anon and authenticated … all mutations are governed by security-definer RPCs"). B-1: stricter wins. |
| State preconditions | P2: pickup (L315–328) and delivery (L382–388) don't require the job to be in the preceding workflow state — a `Scheduled` job can go straight to `In Transit`/`Delivered`. Confirm against the delivery workflow ruling before changing. |
| Unbounded inputs | P2: `p_signature_svg` / `p_photo_url` stored whole in `delivery_job_events.metadata` (L420–421) with no length or scheme check. |
| Several live links per job | P2: `create_rider_link` never supersedes an earlier active link for the same job. |

### 3.4 `src/modules/operations/RiderDeliveryPage.tsx` (not changed by the PR)

- **P1 (FUNC-1) — success shown as failure.** `handleComplete` (L131–154) sets `deliverySuccess` then calls `loadJob()` (L148). The link is now completed, so `fetchRiderJobByToken` throws "already completed", `error` is set, and the error branch (L175) renders before the success branch (L193). **Reproduced by execution** against the real mock-mode functions: the final screen reads "Delivery Link Inactive — This delivery has already been completed." A rider who sees that will retry or phone the shop. Existing page tests mock `fetchRiderJobByToken`, so they cannot see it.
- **P2:** `alert()` for errors (L125, 135, 150) breaks "errors inline, toasts for successes only".
- **P2:** the call number is hard-coded and inconsistent: `href="tel:9851000000"` but text `01-4412345` (L186).
- **P2:** the "photo" is `URL.createObjectURL(file)` (L160–161) — a `blob:` URL valid only in the rider's own browser. It is sent as `photo_url`, so the event records `has_photo: true` for evidence staff can never open.
- Signature is a PNG data URL wrapped in an `<svg>` (L104–106); size is unbounded (see 3.3).

### 3.5 `src/modules/operations/SendToRiderModal.tsx`

Calls `createRiderLink` with the signed-in role; raw token held only in component state; link shared via clipboard/WhatsApp. No money fields. **VERIFIED by reading**; no defect found.

### 3.6 Outside the listed files but on the token's path

- **P1 (SEC-3) — bearer token sent to a third party.** `src/lib/monitoring.ts:162` (`pagePath()` → `location.pathname`) is sent as `request.url` (L236) on every reported error. On `/rider/:token` that is the live credential. Scrub `/rider/<token>` to `/rider/[redacted]` before sending.
- `Referrer-Policy: same-origin` is set (`vercel.json:37`, `nginx.conf:59`) — OK.

### 3.7 PR #35 regression fixes

| Change | Verdict |
|---|---|
| New Rental defaults 06:00–06:00 (`useNewRentalHooks.test.tsx`) | **Legitimate.** Source defaults are `RENTAL_DAY_CLOCK = '06:00'` (`useNewRentalTiming.ts:52`), matching AGENTS.md "operational day 06:00→06:00". On `main` the test fails (expects 09:00); on the PR it passes. Not weakened. |
| Sixth Rentals action group, Re-book (`rentalMoreActionsRegistry.test.ts`) | **Intentional.** `rebook` is real in source (`rentalMoreActionsRegistry.ts:33, 533–540`, added by T3-01 `fc10acb9`). Test now asserts all six ids in order — stricter than before. Two stale leftovers: header comment at `rentalMoreActionsRegistry.ts:176` still says "5 action groups"; `RentalMoreActions.test.tsx:99` title says "5 action groups" (it passes because it only checks content). P2 cosmetic. |
| Staff-facing copy | No developer references remain in the four files after the PR (see §2). `check-ui-copy.mjs` on the merged tree: 0 violations (§6). |
| Weakened tests? | None found. Every changed assertion tightens or corrects to shipped behaviour. The only weak test is the SHA-256 one (3.1 #3). |

---

## 4. Security defects, ranked

No unauthenticated-attacker P0 was found. Ranking assumes the feature is not yet live (migration 0190 is not applied; the Edge Function is not confirmed deployed).

### P1 — must fix before rider links are released

| ID | Defect | Evidence | Class |
|---|---|---|---|
| **SEC-1** | **FIXED on branch `claude/pr35-rider-link-security-8bf9b6` by migration 0192 (written + verified locally, not applied): rider RPCs `service_role` only, `token_hash` unreadable by `authenticated`, audit role is the issuer's real role. Lifecycle L47 steps 11–12 fail without it. As found:** `token_hash` is a credential: readable by staff (`0190:32–45`) and accepted by `authenticated`-executable rider RPCs (`0190:466–468`); actions are audited as the link creator with role `'Coordinator'` (`0190:338, 439–440`). Contradicts PERMISSIONS §7.1. | Read | VERIFIED |
| **SEC-2** | **FIXED on branch `claude/pr35-rider-link-security-8bf9b6`: the three rider calls use the Edge Function only, show its own error, never replay a write; `riderLinkEdge.test.ts` (6 of 8 fail on the old code). As found:** Client falls back to direct RPC when the Edge Function fails (`riderLink.ts:345–354, 383–389, 436–446`): replays writes, masks the real reason, and is dead code for a signed-out rider. | Probes P3–P5 executed | VERIFIED |
| **SEC-3** | **FIXED on branch `claude/pr35-rider-link-security-8bf9b6`: `redactSensitivePath` in `monitoring.ts`; `monitoring.redaction.test.ts` fails on the old code (end-to-end leak test included). As found:** Rider token reaches Sentry via the page path (`monitoring.ts:162, 236`). | Read | VERIFIED |
| **FUNC-1** | **FIXED on branch `claude/pr35-rider-link-security-8bf9b6`: no re-fetch after a successful delivery; `RiderDeliveryPage.flow.test.tsx` (2 of 3 fail on the old page); driven in a real browser. As found:** Rider sees "Delivery Link Inactive" after a successful delivery (`RiderDeliveryPage.tsx:148, 175, 193`). | Executed | VERIFIED |
| **INT-1** | **FIXED on branch `claude/pr35-rider-link-security-8bf9b6` (not on `main`): `DeliveryWorkspace.tsx` re-merged from T4-01 + T4-08, `LiveTransportPlans.tsx` reverted to T4-01, regression tests added; the 2 `DeliveryWorkspace` tests pass. Description of the defect as found:** The T4-01 delivery-dispatch UI was dropped, and in live mode the rider link cannot work end to end. Commit `0168a0c6` ("claim(migration): 0190 for T4-08", merged by `7267c167`) rewrote `DeliveryWorkspace.tsx` (−675/+455 lines vs T4-01 `65cc99b8`): `fetchDeliveries`, `createDeliveryJob`, `assignDeliveryDriver`, `transitionDeliveryJob` and the loading state are gone; nothing in `src` outside their own definitions calls them. `DeliveryWorkspace()` is now `IS_MOCK ? <MockDeliveryWorkspace/> : <LiveTransportPlans/>` (`DeliveryWorkspace.tsx:48–49`). The live component reads `booking_transport_v` (the `booking_transport` table, `0077:361`) and passes `riderModalTarget.id` to `SendToRiderModal` as `jobId` (`LiveTransportPlans.tsx:521–524`), but `create_rider_link(p_job_id)` looks the id up in `delivery_jobs` (`0190:69`) and would raise "Delivery job not found". Migration 0187's RPCs and L45 still pass, so the database side is intact; only the UI is disconnected. Evidence: the two T4-01 `DeliveryWorkspace` tests pass at `65cc99b8` and fail identically on `main` and every later tree (executed). The live-environment failure of `create_rider_link` is by reading only (no hosted run). | Read + executed | VERIFIED (regression); live consequence UNVERIFIED |
| **BLD-1** | `main` fails `tsc` (unused `actionCtx`, `TeamNotesPanel.tsx:17`), so `npm run build` fails. Not a rider-link or PR #35 defect, but no PR can show a green typecheck/build until it is fixed. | Executed | VERIFIED |

### P2

SEC-4 Edge Function leaks raw DB errors and uses unpinned `esm.sh` import (3.2). SEC-5 unbounded `signature_svg`/`photo_url` stored in event metadata (3.3). SEC-6 no state precondition on pickup/deliver; audit actor/role misattributed (3.3). SEC-7 client hashes before the Edge call (3.1 #4). SEC-8 free-text `last_note` reaches the rider; free-text handover notes reach money-blind roles (§5). FUNC-2 `blob:` photo proof is not evidence (3.4). UX-1 `alert()` and mismatched phone (3.4). PROC-1 PROGRESS.md not updated by the PR; MIGRATION_LEDGER row 0190 still "claimed".

---

## 5. Shift-handover integration (merged in `a32a6d0d`) — reported separately from PR #35

**Verdict: no cash leak found at the database level for Warehouse, Technician, Driver or Client. Test coverage is thinner than its name implies.**

- `shift_handovers` has **no cash columns**; cash lives in `shift_handover_finances` with RLS `auth_can_view_money()` for select and insert (`0186:57–90`). **VERIFIED (read).**
- `shift_handovers_v` masks cash/status/variance with `CASE WHEN auth_can_view_money()` and filters `auth_is_staff()` (`0186:94–148`). `auth_can_view_money()` is `role NOT IN (Warehouse, Technician, Driver, Client)` (`0018:224–230`).
- The helper cannot return NULL (which would silently skip PL/pgSQL `IF NOT …` guards): `auth_user_role()` falls back to `'Client'` for deactivated or unknown users (`0120:32–49`). **VERIFIED (read)** — a deactivated staff account becomes a non-staff Client and is refused.
- `create_shift_handover` refuses cash input from money-blind roles and nulls the returned composite (`0186:~280–365`); `acknowledge`/`archive` mask the same way. Updates and deletes are revoked; delete trigger and field-protection trigger are present.
- Cash audit rows (written by `log_audit_event_actor` on the finance table) land in `audit_events`, readable only by Owner/Admin/Manager (`0018:179–184`) — all money-visible. No leak path.
- **P2 (test gap):** the "9-role" suite `src/actions/shifts/__tests__/shiftMoneyIsolation.test.ts` mocks `supabase.rpc` (L12–26). It proves client-side masking and permission checks, not database isolation. The database lifecycle step (`e2e-lifecycle.mjs:3519–3706`) exercises only Warehouse, Coordinator and Manager. **Technician, Driver and Client have no database-level assertion.** The code paths treat them identically (same helper), so I do not expect a leak, but "nine-role money isolation" is **not demonstrated at the DB layer**.
- **P2 (design gap):** `notes`, `acknowledgement_note` and `open_items` are free text that any staff role (including Warehouse) can read. A Coordinator who types "Rs 200 short" shares a figure with a money-blind role; nothing prevents it. In mock mode the seed notes themselves contain rupee figures and are not masked (`shiftHandover.ts` seed records and mock read). Needs a ruling (TODO(decision)) before it is "fixed" — I have not invented one.
- Re-check on `main` HEAD: all 67 shift-action unit tests pass (executed, §6). Note the same commit that added them (`b92cf581`) broke `tsc` (BLD-1, §6).

---

## 6. CI and gate results

**Commit SHAs:** `main` = `a32a6d0d`; PR head = `17e4f1e7`; simulated merge = `main` + the PR's 9 files (scratch tree, conflicts resolved to the PR side).

GitHub Actions run 41290665633: **UNVERIFIED** (HTTP 404; `gh` unauthenticated). Per `CLAUDE.md` W75, GitHub CI is off; the local gates are the merge gate, so an Actions result would not have been authoritative anyway.

| Gate | `main` a32a6d0d | PR head 17e4f1e7 | Merged (simulated) |
|---|---|---|---|
| Targeted tests (rider, rider page, shift actions, registry, rental-more-actions, new-rental hooks) | **FAIL — 3 failed / 108 passed** (registry ×2, hooks ×1; the exact tests PR #35 repairs) | **PASS — 46/46** (5 files) | not separately run |
| Typecheck (`tsc --noEmit`) | **FAIL** by identity (see below) | NOT RUN | **FAIL — 1 error**: `src/components/teamNotes/TeamNotesPanel.tsx(17,10): TS6133 'actionCtx' is declared but its value is never read` (executed, 18m54s) |
| Source lint (`eslint src`) | NOT RUN | NOT RUN | NOT RUN |
| Full mock test suite | NOT RUN | NOT RUN | NOT RUN |
| Database migration rebuild (`check:pglite`) | NOT RUN | NOT RUN | NOT RUN |
| Financial integrity | NOT RUN | NOT RUN | NOT RUN |
| Authenticated security (`check:security`) | NOT RUN | NOT RUN | NOT RUN |
| Booking lifecycle (`check:lifecycle`) | NOT RUN | NOT RUN | NOT RUN |
| UI-copy lint (`check-ui-copy.mjs`) | NOT RUN | NOT RUN | **PASS — 0 violations** (executed) |
| Production build (`tsc --noEmit && vite build`) | **FAIL** (derived: step 1 is the failing typecheck; `vite build` not reached) | NOT RUN | **FAIL** (derived, same reason) |

**The typecheck failure is on `main`, not caused by PR #35.** `TeamNotesPanel.tsx` is not in the PR's file list; the merged tree's copy is byte-identical to `main`'s, so `main` `a32a6d0d` fails the same way. Cause: commit `b92cf581` (shift-money hardening) replaced the call `actionCtx(user)` with an inline `useMemo` but left the now-unused helper at `TeamNotesPanel.tsx:17–19`. The repo's own rule B-4 ("tsc 0 … a ruling that breaks a gate is not a ruling, it is a bug") applies: `main` currently cannot pass `npm run build`. **P1 / BLD-1.** Fix: delete lines 17–19 and the orphaned `ActionContext` import. **Applied afterwards on branch `claude/pr35-rider-link-security-8bf9b6` (not on `main`, not pushed); `tsc --noEmit` exits 0 there (executed).** It still has to be merged to `main` by you. Side finding from the same run, present on an untouched `main` export: `src/actions/notes` test "allows Warehouse and Driver staff roles to create notes" fails because `rbac.canCreateTeamNote` (`rbac.ts:713`) admits only Owner/Admin/Manager/Coordinator — the open team-note ruling (T-4). **Resolved afterwards:** Babin ruled "Coordinator and up" (`RULINGS-2026-11-01.md` R-0111-1); migration 0191 plus test, lifecycle L42, fixture and PERMISSIONS aligned on this branch (`check:pglite` 191/191 and `check:lifecycle` 47/47 green in the same run).

**6b. Full gate run afterwards — branch `c3cb9429` (= `main` `a32a6d0d` + the BLD-1 fix, team-note ruling and composer change; PR #35 is *not* in it), clean copy, executed:**

| Gate | Result |
|---|---|
| typecheck / `npm run build` | **PASS** (BLD-1 fixed; build exit 0) |
| lint, `lint:progress`, `lint:shell`, `lint:ui-copy`, `check:contrast` | **PASS** |
| `check:pglite` 191/191, `check:lifecycle` 47/47 (same run) | **PASS** |
| financial integrity, `check:security`, `test:partial-return` 58/58, receipt test | **PASS** |
| `test:server-contracts` | **FAIL** — 1 assertion; identical on untouched `main` (expects `GATE:unit.retire.active_reservation`, DB raises `…active_status`) |
| Full mock suite | **FAIL — 6401/6413**: 3 are PR #35's own repairs; 2 `DeliveryWorkspace` (T4-01) fail identically on untouched `main`; 7 `realWorkspaceGuidance` are load timeouts that pass alone |
| `test:coverage` | NOT RUN |

**Latest run — `df7d6bff` (PR #35 merged, SEC-1/2/3, FUNC-1, INT-1, 0191, 0192): every gate in the list PASSES, including `test:server-contracts`, the full suite (6438/6438) and `test:coverage` (6438/6438, exit 0); `npm run completion` exits 0.** Nothing was pushed, and 0191/0192 are written and verified locally only (not applied). The paragraph below is the earlier run, kept as history.

**Re-run on `5046a9af` (after the INT-1 fix):** every gate above is unchanged except the suite — the 2 `DeliveryWorkspace` failures are gone (6401/6415: 3 are PR #35's repairs, 11 are load timeouts in `listPageToolbars.render` and `realWorkspaceGuidance` that pass 15/15 twice when re-run on the same commit). `test:server-contracts` still fails on the same single assertion. The suite was not seen fully green in one run, so "all gates green" is still not claimable.

So on top of what this review found, **`main` already has two red gates unrelated to PR #35**: `test:server-contracts` and the two `DeliveryWorkspace` tests. The `DeliveryWorkspace` failure was investigated afterwards and is **not a stale test**: it is a real regression that also affects rider links (INT-1, §4). `test:server-contracts` was a stale assertion (migration 0188 makes the status gate answer first); Babin ruled "fix the test" and it now passes 58/58 on the branch. "All gates green" cannot be claimed for `main` today. PR #35 itself was **not** re-run through the full suite (only its targeted files, §6 table above).

Why so many NOT RUN above (earlier, before §6b): the review machine was saturated by other sessions (a fresh `npm ci` in the review worktree failed twice with `ENOTEMPTY`; I fell back to the parent checkout's `node_modules` via a junction, vitest 3.2.7). A full-repo `tsc` took over ten minutes. "NOT RUN" means exactly that — it is not a pass. **No gate in this table that reads NOT RUN or UNVERIFIED may be cited as green.**

Probe tests I executed in scratch copies (not committed, not part of the repo):

| Probe | Outcome |
|---|---|
| PR's new rider tests vs. old implementation | RNG test fails (valid); SHA-256 test passes on old code (does not prove the fix) |
| Production mode, `subtle` absent | `hashRiderToken` rejects — fail-closed works |
| Production mode, Edge returns error | `fetchRiderJobByToken` calls RPC and surfaces "permission denied", masking the true reason (SEC-2) |
| Edge delivery error | `rider_complete_delivery` RPC is called a second time (SEC-2) |
| Real mock-mode rider flow, pickup → deliver | Final screen is "Delivery Link Inactive" (FUNC-1) |

---

## 7. Minimal conflict-resolution patch instructions (for the implementation agent) — PROPOSED

> **Executed locally afterwards:** PR #35 head `17e4f1e7` was merged into `claude/pr35-rider-link-security-8bf9b6` with the three conflicts resolved per hunk to the PR side, the missing fail-closed hash test added (`riderLinkProduction.test.ts`) and the stale wording fixed. Focused tests 1,008/1,008, `tsc` 0, ui-copy 0, eslint clean. Full gates not yet re-run on the merged result. Nothing pushed.

Work in a fresh worktree/branch; do not edit `main`.

```bash
git fetch origin
git switch -c lane-x/pr35-rebase origin/fix/2026-11-01-rider-crypto-and-regression-gates
git rebase origin/main
# conflicts appear in exactly 3 files; during a rebase "theirs" is the PR commit
git checkout --theirs -- \
  src/modules/notes/InternalNotesPage.tsx \
  src/modules/settings/sections/LegacyExportControl.tsx \
  src/modules/today/LegacyExportCard.tsx
git add -u && git rebase --continue          # repeat if a commit re-conflicts; System.tsx is already identical
git diff origin/main --stat                  # expect exactly the 8 files listed in §2 (System.tsx drops out)
```

Then, in the same branch and before merge:

1. **Add the missing hash test** to `src/lib/queries/__tests__/riderLink.test.ts`: `vi.mock('../../supabase', () => ({ IS_MOCK: false, … }))`, stub `crypto` without `subtle`, expect `hashRiderToken` to reject with `/Secure SHA-256 hashing is unavailable/`. (A working version is in §6's probe description.) Keep the existing known-answer test.
2. Fix the stale "5 action groups" wording at `rentalMoreActionsRegistry.ts:176` and the title at `RentalMoreActions.test.tsx:99`.
3. Add the `PROGRESS.md` entry (Did / Ruled / Verified, `## Completion`, `## Remaining`); run `npm run completion` and `npm run lint:progress`.
4. Run the full list in `docs/plans/README.md` "Gates every card must pass", in order, with `VITE_DATA_SOURCE=mock npm test`, and paste real results.

Do **not** put the P1 rider fixes in this PR; keep PR #35 mergeable on its own (§8, tasks A–D).

---

## 8. Independent tasks for Codex / Copilot — PROPOSED

Each is a separate card, branch and worktree; claim migration numbers in `docs/plans/MIGRATION_LEDGER.md` first; never apply to live Supabase (N-5).

| Task | Scope | Done when |
|---|---|---|
| **A — Rider RPC lockdown (SEC-1, migration)** | New migration: `revoke execute` on `get_rider_job_by_token`, `rider_mark_picked_up`, `rider_complete_delivery` from `authenticated` (keep `service_role`); replace table-wide select with a column grant or a `delivery_job_links_v` view that omits `token_hash`; stop writing `'Coordinator'` as audit role — add an explicit rider actor marker. | `check:pglite` + `check:lifecycle` green together; new lifecycle assertions: Warehouse/Manager/Owner cannot execute rider RPCs or select `token_hash`; `service_role` can. |
| **B — Remove the client RPC fallback (SEC-2, SEC-7)** | In `riderLink.ts`, delete the three direct-RPC fallbacks and the up-front hashing; surface the Edge Function's own status/message (410 → "revoked/expired/completed"). | Tests with `IS_MOCK=false` mocked: Edge 410 → specific message, RPC never called; Edge failure on deliver → no second write. |
| **C — Rider page success state (FUNC-1, UX-1, FUNC-2)** | After a successful `deliver`, render the success state without re-fetching (or have `get_job` return the completed job to its own link); inline errors, no `alert()`; single shop phone constant; either upload the photo to storage or hide the control until it can be stored. | Page test that drives the real `riderLink` mock layer pickup → deliver and asserts "Delivery Complete". |
| **D — Token-safe monitoring (SEC-3)** | In `monitoring.ts`, redact `/rider/<token>` (and any other bearer path segment) in `pagePath()`. | Unit test: path `/rider/abc123…` is sent as `/rider/[redacted]`. |
| **E — Edge Function hardening (SEC-4, SEC-5)** | Fixed error messages; pin `supabase-js` version; cap `signature_svg` and `photo_url` length and require `data:image/` / https scheme; consider per-IP rate limit. | Function tests or documented manual check. |
| **H — Restore the T4-01 dispatch UI (INT-1)** | Re-apply the T4-01 data wiring of `DeliveryWorkspace.tsx` from `65cc99b8` (`fetchDeliveries(role)`, the three delivery actions, loading/error states, Driver isolation) on top of today's file, keeping T4-08's Send-to-rider entry; pass a real `delivery_jobs.id` to `SendToRiderModal`; decide what `LiveTransportPlans` is for once dispatch is on jobs. Lane B owns these files — coordinate, do not edit another lane's open card. | The 2 `DeliveryWorkspace` tests pass; a lifecycle or integration check creates a job through the UI path and issues a rider link for it. |
| **G — Unbreak `main` typecheck (BLD-1)** | Delete the unused `actionCtx` helper at `src/components/teamNotes/TeamNotesPanel.tsx:17–19` (and any import it orphans). Land first, on `main`, so every other branch can show a green `tsc`. | `npm run typecheck` exit 0 and `npm run build` exit 0. |
| **F — Shift handover DB coverage** | Extend the lifecycle step to Technician, Driver and Client: view returns nulls, finance table returns 0 rows, create with cash is refused. Open `TODO(decision)` in `OPEN_DECISIONS.md` for free-text money in notes. | Lifecycle green with the added roles. |

---

## 9. Final recommendation and remaining release blockers

**PR #35: REQUEST CHANGES.** Resolve the three conflicts to the PR side (§7), add the missing fail-closed hash test, update `PROGRESS.md`, run the local gates. After that it is a safe, strictly-improving merge.

**Rider-link feature release: BLOCK** until tasks A–D are merged and re-verified.

Remaining release blockers (all independent of PR #35 unless noted):

0. BLD-1 — `tsc`/`npm run build` red on `main` (task G). Fix first.
1. SEC-1 — rider RPCs/`token_hash` reachable by `authenticated` (task A).
2. SEC-2 — direct-RPC fallback (task B).
3. SEC-3 — token to Sentry (task D).
4. FUNC-1 — success shown as failure (task C).
4b. INT-1 — the live UI creates no `delivery_jobs` and hands the rider modal a non-job id, so rider links cannot be issued end to end (task H).
5. Migration 0190 is "claimed" in the ledger, not applied, not confirmed in PROGRESS; the Edge Function deployment is unconfirmed.
6. The full gate list was run on branch `c3cb9429` (§6b) but **not** on the merged PR #35 result: re-run it after the PR is rebased. On `main` itself two gates are red independent of the PR (`test:server-contracts`, 2 `DeliveryWorkspace` tests); both are fixed on the branch. `test:coverage` was not run.
7. Production build: BLD-1 is fixed on `c3cb9429` and `npm run build` exits 0 there; it is still not on `main`. Whether `import('node:crypto')` is removed from a production-mode bundle remains unverified.
8. Hosted/device/offline acceptance remain open per `docs/CURRENT_STATE.md`; production stays HOLD.

### What I did not do
No push, merge, comment, deployment or live-database action. No role permission was widened. Scratch copies and probe tests live only in the session scratchpad; the only file written inside the repository worktree is this report.

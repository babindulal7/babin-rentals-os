# PLAN.md — Babin Rentals OS: the road to go-live

**Version 1.3 · 26 Oct 2026 (9 Kartik 2083) · Owner: Babin Dulal · Status: ACTIVE**

*v1.3 (evening): merges the second workflow package (v3: the fuller CI-off check list, T0-10/T0-11, the richer evidence card (T2-18), T2-17, T9-09, the usability guide) with the v2 lane choices; T2-02 to T2-05 and T2-07 are built on `main`. Babin asked Claude to choose who does what, so [L12](RULINGS-2026-10-26-workflow.md) moves T8 to Codex-1 and keeps two writing cards with Claude.*

*v1.1 (afternoon): Babin's workflow round — [`RULINGS-2026-10-26-workflow.md`](RULINGS-2026-10-26-workflow.md) W1–W91 —
adds 32 cards to T0–T9, sets the agent lanes (Codex-1 · Gemini · Codex-2, Claude reviews), turns CI off
in favour of local checks, and makes Claude read-only on GitHub.*

> **This is a new file.** The PLAN.md that existed before October is not in the repository and
> is **not** reconstructed here. Babin ruled on 26 Oct 2026 that the new master roadmap becomes
> PLAN.md (`RULINGS-2026-10-26.md` S4). Old citations such as "PLAN.md §4.31" are handled in §8.

**What this file is:** the one ordered plan for finishing the app — the finish line, the tracks,
the calendar, the decisions index and the way agents work. **What it is not:** a rulebook. Laws
live in [`docs/PRODUCT_RULES.md`](docs/PRODUCT_RULES.md); permissions in
[`docs/PERMISSIONS.md`](docs/PERMISSIONS.md); dated decisions in `RULINGS-*.md`. Where this file
disagrees with any of those, they win (authority order: [`docs/00_READ_FIRST.md`](docs/00_READ_FIRST.md)).

The build-ready work lives in [`docs/plans/`](docs/plans/README.md) — one file per track, each
task a card with files, database work, acceptance checks and size.

---

## §0 Laws

The laws are in [`docs/PRODUCT_RULES.md`](docs/PRODUCT_RULES.md) (Laws 1–16, permission laws
P1–P10). The ten most easily broken are listed in [`CLAUDE.md`](CLAUDE.md). The boundaries an
agent may never cross without Babin's explicit word (N-1 … N-8, e.g. **never apply a migration
to the live project**) are in `CLAUDE.md` → "Authority to resolve conflicts".

The #1 product priority stays **ease of use — fewest taps (R-39)**. Every task below inherits it.

---

## §1 The finish line

**Go-live (day X)** = the day staff take **every new rental** in the OS. **Switch-off** = Booqable
cancelled **before its renewal on 20 Mar 2027 (6 Chaitra 2083)** (S8).

Go-live happens only when all ten are true:

| # | On go-live day | Track |
|---|---|---|
| G1 | Live database carries every verified migration, applied by Babin after a backup and a staging rehearsal; nine-role checks pass on staging; live smoke tests pass. | T1 |
| G2 | The full floor loop runs on real devices with real data: book → pack (camera photos) → hand over (one drawn signature, ID or cash deposit, collectors list, gates) → return (damage photos) → reset ("needed next", self-QC when alone) → invoice → payment → close; staff switch users on shared devices by name + PIN; scanning any label shows who has the item. | T2, T1-15 |
| G3 | Booking and money rules are in: re-book, paste a WhatsApp list, per-product deposits entered, cancellation tiers set, non-VAT bills classified, draft invoice from Confirm numbered on full payment, change/extend confirmed bookings, share documents, who-owes list, find and availability in two taps, opening balances in daily closing. | T3 |
| G4 | Delivery dispatch with zone fees and one-time rider links, shared team notes and shared shift handover (three shifts) work across devices. | T4 |
| G5 | In-app notifications, phone pop-ups, the approvals inbox, role home screens, the emailed morning digest, and the automatic client emails (pickup/return reminders and receipts, late return, damage notice, payment reminders) work from `@babinrentals.com`. | T5 |
| G6 | Every staff screen is in Nepali, approved by Babin, switchable per user. | T6 |
| G7 | Online booking is live at `book.babinrentals.com`: verified-email accounts, public daily rates, staff-confirmed requests, online payment (Fonepay at minimum; eSewa and Khalti when their merchant accounts are open). Cross-client test D-5 passes. | T7 |
| G8 | Membership plans are loaded with proration and renewal; crew overtime and TDS work; staff renting gets the 20% staff discount. | T8 |
| G9 | Booqable data is imported, open Booqable rentals block availability in the OS, and the trial has reconciled. | T9 |
| G10 | Hosting on Cloudflare Pages, error monitoring on, backups scheduled, rollback written down. | T1 |

Anything not on this list waits until after go-live ([`T10`](docs/plans/T10_AFTER_GO_LIVE.md)).

---

## §2 Where the build stands — measured 26 Oct 2026

Measured on a clean clone of `main` at `34cce2d` (Linux, Node 22). Nothing below is copied from an
older receipt.

| Gate | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | **0 errors** |
| Migrations rebuilt from scratch (`check:pglite`) | **174 / 174**, 0 anon-readable views, 0 unauthorized anon RPCs, 93 definer functions pinned |
| Booking lifecycle through Postgres + RLS (`check:lifecycle`) | **33 / 33 green** |
| Unit and screen tests (`vitest`, `VITE_DATA_SOURCE=mock` as in CI) | **5,739 / 5,739 passed** in 463 files |
| Actions implemented (`npm run completion`) | **55 / 58** — the 3 missing are inspection stubs nothing calls |
| Routed screens on the database | **50 / 60** — 0 on seed data; the other 10 are sign-in, 404, onboarding and three static pages |
| Capabilities mapped | **48 / 48** |
| GitHub CI | **Off.** No run has passed since 15 Oct 19:23 UTC; the run on PR #29 (25 Oct) shows GitHub refusing to start the job for a billing reason. Babin ruled CI stays off; local checks are the gate (W75, §6.4). |

What stops go-live today:

1. **Not released.** Per the 17 Oct read-only ledger, live Supabase stops at `0164`; **19 migrations
   (0157–0177)** wait, plus 7 rename mismatches and 2 unexplained live rows (`npm run db:plan`).
   No staging project, no fresh backup, no nine-role check on real logins, Storage scoping not
   accepted on a hosted project. Never driven on a physical phone, iPad, scanner or offline.
2. **The floor loop is not finished live.** Camera upload (T2-01), drawn signatures (T2-02), the
   ID-card deposit (T2-03), the Gate 1 override (T2-04) and Technician floor verbs (T2-05) are built
   on `main` (26 Oct) but not on staging or live; still open: evidence leftovers (T2-18), collectors and
   ID on file (T2-12), repair clearance, printing, offline.
3. **About 280 "not built / not tracked yet" markers on ~50 screens** (photo upload, printing,
   delivery, maintenance job detail, warehouse transfers, expense reversal …).
4. **Browser-only features refuse on the live app:** Productions, Team Notes, Shift Handover,
   Warranty claims, Coupons, Delivery.
5. **Not started:** notifications and email, online booking and payments, full Nepali (only the
   switch exists; ~4,400 distinct screen strings measured), Booqable cutover tooling.
6. **Process:** this file was missing; 90 remote branches and 9 open PRs; several agents edited
   one checkout at once, so verification receipts kept going stale.

---

## §3 Tracks

| ID | Track | Delivers | Go-live? | Lane · agent | Size* |
|---|---|---|---|---|---|
| [T0](docs/plans/T0_REPO_HYGIENE.md) | Repo & process hygiene | PR/branch triage, doc truth, test runner default (tests never use live settings), CI off, one gate command | Yes (week 1) | A · Codex-1 + Babin | 4 |
| [T1](docs/plans/T1_RELEASE.md) | Release & infrastructure | Backup, staging, migrations live, hosting, email DNS, monitoring, switch user by PIN | Yes | A · Codex-1 + Babin | 18 |
| [T2](docs/plans/T2_FLOOR.md) | Floor loop completion | Camera evidence (first part built 26 Oct; T2-16 and T2-18 finish it), saving a unit's details, signatures, ID deposit, collectors, overrides, Technician, repair clearance, self-QC, Reset priority, printing, scanner, scan → item card, offline, devices | Yes | A · Codex-1 | 33 (5 built) |
| [T3](docs/plans/T3_BOOKING_MONEY.md) | Booking & money rules | Re-book, paste a list, fully booked options, deposits, cancellation tiers, non-VAT bills, draft invoice at Confirm, change/extend, share, who owes, find/availability, balances, accountant pack, expenses | Yes | C · Codex-2 | 45 |
| [T4](docs/plans/T4_SHARED_TOOLS.md) | Shared operations tools | Delivery dispatch, zones, rider links, team notes, shift handover, old-data export | Yes | B · Gemini | 17 |
| [T5](docs/plans/T5_NOTIFICATIONS.md) | Notifications & email | In-app centre, email service, digest, automatic client emails, payment reminders, pop-ups, approvals, role homes | Yes | B · Gemini | 22 |
| [T6](docs/plans/T6_NEPALI.md) | Nepali language | Glossary, string catalogue, approved Nepali, layout pass | Yes | B · Gemini | 22 |
| [T7](docs/plans/T7_ONLINE_BOOKING.md) | Online booking & payments | Public catalogue (show-online flags), client accounts with ID, requests (12 h notice, 1 h answer), Fonepay/eSewa/Khalti | Yes | C · Codex-2 | 32 |
| [T8](docs/plans/T8_MEMBERSHIP_CREW.md) | Membership & crew | Plans, proration, renewal, overtime, TDS, staff discount | Yes | A · Codex-1 | 14 |
| [T9](docs/plans/T9_CUTOVER.md) | Booqable cutover | Import, holds, trial, day X, archive, cancel, monthly usability tests | Yes | A · Codex-1 + Babin | 10 |
| [T10](docs/plans/T10_AFTER_GO_LIVE.md) | After go-live | Productions, coupons, warranty, ROI/depreciation, admin tools, width | No | — | — |

\* Size = estimated agent build sessions (one focused session ≈ one task branch). Total for go-live
≈ **215 sessions in ~13 weeks** — about **5–6 sessions a week per lane** across three lanes
(by 26 Oct evening, after T2-02 to T2-05 and T2-07 landed and T8 moved to lane A: lane A ≈ 72, lane B ≈ 61, lane C ≈ 75, plus two writing cards for Claude; §6).
Cards tagged **[soon]** may slip to the first two weeks after day X if a lane falls behind; untagged
and **[go-live]** cards may not. Owner time is listed separately in
[`docs/plans/BABIN_ACTIONS.md`](docs/plans/BABIN_ACTIONS.md).

**Dependencies (read top to bottom):**

```
T0 ─▶ everything
T1 staging ─▶ T2/T3/T4/T5/T7/T8 acceptance on staging ─▶ T1 live apply batches
T1 email DNS ─▶ T5 email ─▶ T7 client sign-up emails
T2 evidence upload ─▶ T2 signatures, T2 ID deposit photo, T4 delivery proof, T7 portal documents
T6 glossary ─▶ T6 waves ─▶ (T7 and T5 client-facing Nepali)
T9 holds import ─▶ T9 trial ─▶ day X ─▶ T9 run-off ─▶ Booqable cancelled
```

---

## §4 Decisions

### §4.1 Ruled on 26 Oct 2026

Babin answered 54 questions in 15 tappable rounds. All are recorded in
[`RULINGS-2026-10-26.md`](RULINGS-2026-10-26.md): scope rulings **S1–S15** and decisions
**D1–D34**. Each track cites the ones it uses. Six change permission cells or gates (D1, D2, D3,
D29, D30, D34); those cells change in `docs/PERMISSIONS.md` **in the same commit as the code**
(B-3), not before — until then a "ruled, not yet in code" box at the top of PERMISSIONS.md lists
them.

Afternoon round: [`RULINGS-2026-10-26-workflow.md`](RULINGS-2026-10-26-workflow.md) — **W1–W91** (the
daily workflow and how we build) and Claude's resolutions **L1–L12**. W43 (self-QC), W49 (rider
links), W53 (switch user by PIN) and W88 (desk staff change confirmed bookings) change permission
cells or gates when their cards land (B-3).

### §4.2 Still open

Each has a ⭐ default the build may use until Babin answers (CLAUDE.md B-5). Full text and history
stay in [`docs/OPEN_DECISIONS.md`](docs/OPEN_DECISIONS.md).

| ID | Question | ⭐ Default until answered | Blocks |
|---|---|---|---|
| O-1 | Where does `babinrentals.com` point once Booqable's store is switched off? (S15 keeps the root as is, but its current content is the Booqable store.) | Redirect the root to `book.babinrentals.com` | T9-08 |
| O-2 | Refund policy for an online advance when staff cannot confirm the request. | Full refund to the same wallet within 3 working days | T7-07 |
| O-3 | Can a client pay the **security deposit** online, or only the rental advance? | Advance only; deposit (cash or ID) at handover | T7-05 |
| O-4 | Morning digest send time. | 05:30 NPT, before the 06:00 rental day | T5-04 |
| O-5 | TDS rate on crew payouts. | Accountant to supply; payouts show "TDS: rate not set" until then | T8-08 |
| O-6 | Is IRD-certified e-billing required? (D14) | Accountant to confirm by 30 Nov | T3-05 |
| O-7 | How non-VAT bills appear in the VAT register and returns. | Separate section "Non-VAT bills"; accountant confirms | T3-04 |
| O-8 | *(replaced by O-16)* | — | — |
| O-9 | Membership plan table content (D32). | Babin sends it; plans stay empty until then | T8-01 |
| O-10 | Cancellation tier figures (D12). | Babin enters them in Settings; until then no fee is suggested | T3-03 |
| O-11 | Rental agreement terms text. | Babin supplies; current template wording until then | T3-06 |
| O-12 | A plan downgrade where the unused-days credit is larger than the new fee. | The rest becomes the client's account credit, not cash | T8-03 |
| O-13 | What a cancellation fee % is taken from. | The booking's rental total before VAT | T3-03 |
| O-14 | A numbered (fully paid) invoice that later changes — extension, late fee, damage (W17). | Accountant decides: second invoice or credit note; until then the app blocks the change with a clear message | T3-14 step 4 |
| O-15 | Fee for each delivery zone (W48, L6). | Rs 3,500 for each valley zone; outside the valley quoted | T4-07 |
| O-16 | Label printer and Bluetooth scanner models (W54, S14). | Claude proposes 2–3 of each with Nepal prices at a check-in; Babin buys | T2-08, T2-09 |
| O-17 | VAT timing: may the tax invoice wait until the client pays in full (W16), even for credit clients who pay weeks later? [VAT Act 2052 §6](https://nepallaws.com/Laws/value-added-tax-act-2052/section-6-place-and-time-of-supply/) puts the time of a supply at the earliest of invoice, service or payment, with its own rule for part payments | As ruled (number on full payment) until the accountant answers; if the invoice must come earlier, the numbering moment becomes one setting. The numbering step ships only after the answer | T3-14 |

### §4.3 How a new decision gets in

Mark the code `TODO(decision)`, add the full entry to `docs/OPEN_DECISIONS.md`, add one row to
§4.2 here, and work on something unblocked. Never invent a product decision.

---

## §5 Calendar

Dates in AD with BS (computed with `src/lib/bs.ts`).

| Milestone | By | What is true |
|---|---|---|
| **M0** | 1 Nov 2026 · 16 Kartik 2083 | This plan merged; T0 done; Babin's week-1 actions started (accounts, backup, merchant applications). |
| **M1** | 22 Nov · 6 Mangsir | **Live batch 0** (0163 alone — closes six anonymous RPCs). Staging rehearses 0157–0177; nine role seats pass; Cloudflare staging behind Access; email domain verified. |
| **M2** | 6 Dec · 20 Mangsir | **Live batch 1 applied by Babin** (the rest of 0157–0177, after a fresh backup). Camera evidence, signatures, ID deposit on staging. Glossary approved. |
| **M3** | 3 Jan 2027 · 19 Poush | Go-live features complete on staging (T2–T5, T8, T3); Fonepay online payment working on staging; Nepali wave 1 (floor) approved. **Live batch 2.** |
| **M4** | 10 Jan · 26 Poush | Device day (iPhone 17 Pro, M4 iPad Pro, Bluetooth scanner, airplane mode) with **usability round 1** (T9-09); D-5 green; security review closed; Booqable data imported and holds live. **Live batch 3.** |
| **Trial** | 11–31 Jan · 27 Poush–17 Magh | Every real job entered in both systems; daily reconcile; Booqable stays master. Nepali waves 2–4 land during the trial; staff switch language as each wave is approved. **Usability round 2 on Wed 20 Jan · 6 Magh** ⭐. |
| **Go / no-go** | 29 Jan · 15 Magh | Babin decides against the §1 list. Nepali 100% approved. |
| **X — go-live** | **Mon 1 Feb · 18 Magh** | New rentals OS-only; online booking live; Booqable store stops taking bookings. |
| **M6** | 1 Mar · 17 Falgun | Last Booqable rental returned and closed; Booqable data archived. |
| **M7** | 10 Mar · 26 Falgun | Booqable cancelled — 10 days before the 20 Mar renewal. |

**Every day:** Claude check-ins at **7:38 AM and 7:38 PM** NPT (W77 — Babin asked for 8; the scheduler runs slightly early) — what changed on GitHub, the fast
checks re-run on `main`, what looks wrong, and the next prompt to paste.

**Every month after X:** usability round on the first Sunday, 11:00–13:00 ⭐ (`docs/USABILITY_TESTS.md`, T9-09).

**Slack:** X may slip to 15 Feb (3 Falgun) and still meet the deadline, provided the last open
Booqable rental ends by 10 Mar. If T7 payments lag, go live with Fonepay only — never let a
missing wallet hold X.

---

## §6 How agents work

Ruled 26 Oct afternoon (W74–W78, W90, L5).

1. **Who builds, who reviews.** **Codex and Gemini build** on Babin's computer. **Claude reviews**
   and never writes to GitHub: it reads the repository, checks every new commit at **7:38 AM and
   7:38 PM** NPT, re-runs the fast checks, and sends Babin a short summary with links, problems and the next
   prompt. Claude's own work (plans, prompts, patches) arrives **as files** that Babin applies.
2. **Three lanes, one agent each, each in its own git worktree** — never two agents in one checkout
   (the 23 Oct "source changed during verification" failures came from that):
   - **Lane A · Codex-1:** T0 (code cards), T1 (code cards), T2 floor, T9 cutover tooling, **then T8 membership & crew** (L12).
   - **Lane B · Gemini:** T4 shared tools, T5 notifications & email, then T6
     Nepali waves (glossary and machinery early).
   - **Lane C · Codex-2:** T3 booking & money, then T7 online booking & payments.
   - **Claude's own cards (arrive as files, Babin approves):** T6-01 Nepali glossary draft and
     T7-01 online-booking spec. Everything else Claude does is review.
   - **Why this split (L12):** money, permission and security cards (T2-03, T3, T7, T8) go to the Codex
     lanes because they end in Postgres migrations that must pass `check:pglite` + `check:lifecycle`;
     Gemini takes the high-volume UI and text work (delivery, notes, notification screens, Nepali
     extraction) where its large context helps; Claude reads every migration and every money or
     permission diff before Babin merges.
3. **One card = one branch.** Branch name `lane-<a|b|c>/<card-id>-<slug>`, e.g.
   `lane-a/T2-01-camera-evidence`. Each card has a ready prompt in
   [`docs/plans/prompts/`](docs/plans/prompts/README.md) — paste it into the lane's agent.
4. **CI is off; these local checks are the gate** (W75). Before an agent says a card is done, and
   again before Babin merges it locally, run **every step `.github/workflows/ci.yml` ran, in its
   order** — use `npm run gates` after T0-11 merges (draft stacked on T0-10); its
   command list must match `.github/workflows/ci.yml`, and `npm run gates -- --quick` skips coverage
   only, so it is not a full release gate. The step-by-step list is in
   [`docs/plans/README.md`](docs/plans/README.md): typecheck · lint · tests (mock data) · migrations from scratch · financial integrity ·
   security · lifecycle · server contracts · partial Return · lint:progress · receipt test · page
   shell · UI copy · contrast · build (coverage before each live batch). SQL changes need
   `check:pglite` and `check:lifecycle` green in the same run (R-35 "Verified"). Drive the changed
   screen in `npm run dev:mock` at 375 / 820 / 1440. Paste the results into the card's PROGRESS entry.
5. **Migration numbers are claimed, not guessed.** Claim the next free number in
   [`docs/plans/MIGRATION_LEDGER.md`](docs/plans/MIGRATION_LEDGER.md) in the branch's first commit.
   If two branches collide, the later merge renumbers (as 0175 → 0177 did).
6. **Files no lane may edit without saying so in its prompt:** `PLAN.md`, `docs/PERMISSIONS.md`,
   `src/lib/rbac.ts`, `src/actions/core.ts`, `src/lib/money.ts`, `src/lib/pricingPipeline.ts`.
   A card that must change one says so; the lane merges it before another lane touches the file.
   **Nepali extraction (T6) touches every screen:** Gemini converts a module only when no open
   card in lanes A or C touches that module's files — the T6 prompts list which modules are free.
7. **Database first.** A permission or gate changes in Postgres (migration + lifecycle step) before
   the UI offers it (P2, P3, N-3).
8. **Live database:** agents write, number and verify migrations; **Babin applies** them in the
   planned batches after a backup (N-5). Staging gets every migration first.
9. **Every card ends with a `PROGRESS.md` entry** (Did / Ruled / Verified, a Completion block
   printed by `npm run completion`, a Remaining block — `npm run lint:progress` checks both), and
   ticks its card in the track file.
10. **Done means:** real data, permissions enforced in the database, the five screen states
    (loading, empty, error, restricted, offline), phone/tablet/desktop, the **screen check** in
    [`docs/USABILITY_TESTS.md`](docs/USABILITY_TESTS.md) §1 passed on every changed screen, tests,
    merged by Babin, PROGRESS logged. A screen that only *looks* finished is not done (Law 16).

---

## §7 Risks

| Risk | Watch for | Response |
|---|---|---|
| Agents collide in one checkout | Receipts "source changed during verification" | §6.1 lanes and worktrees; ledger for migration numbers |
| Nepali approval volume (~4,400+ strings) | Babin approvals fall behind the waves | Glossary first; highest-traffic screens first; ~2 h/day of approvals for three weeks |
| eSewa / Khalti onboarding is slow | No sandbox credentials by M3 | Apply in week 1; go live with Fonepay; add wallets after X |
| 19+ migrations onto a live database with real data | Staging failures, rename mismatches | Backup + restore drill, staging first, three small live batches, rollback notes |
| Double booking during the change-over | OS does not see open Booqable rentals | T9-02 imports Booqable holds daily until the last one ends |
| Photo storage growth | Storage quota warnings | Compress on device (⭐ long edge 1600 px); monthly size check |
| One person approves everything | Owner actions slip | [`BABIN_ACTIONS.md`](docs/plans/BABIN_ACTIONS.md) has dated owner tasks |
| Scope creep | New ideas land in go-live tracks | Anything not in §1 goes to T10 |
| CI is off | A merge breaks `main` unnoticed | Local gates before every merge (§6.4); Claude re-runs the fast checks on `main` twice a day and reports red at once |
| Automatic client emails go wrong | Wrong time, wrong client, an amount before approval | Server-built emails only (never browser text); one send per booking + event; the T5-06 register and its test; staging dry run with test clients |
| ~215 sessions for go-live | A lane falls behind | [soon] cards slip first; Claude flags a lane more than a week behind at a check-in |

---

## §8 Old PLAN.md citations

Code comments and older docs cite sections of the previous PLAN.md (§0, §4.0b, §4.2, §4.12, §4.16,
§4.23, §4.26, §4.29, §4.31, §4.34, §4.38a/b, §4.49–§4.65, "Phase 6", "Phase 9"). That file is not
in the repository. Read such a citation as **historical**; do not guess what the old section said.
The ones that matter now:

| Old citation | Current home |
|---|---|
| §0 (laws) | `docs/PRODUCT_RULES.md`; this file §0 |
| §4 (open decisions) | this file §4 and `docs/OPEN_DECISIONS.md` |
| §4.12 (TDS) | D25 → T8-08 |
| §4.26 (Nepali coverage gate) | `src/lib/i18n.ts` `canEnable()`; T6 |
| §4.31 (one photo per booking at Pack and Handover) | Still in force (S5); upload built in T2-01 |
| §4.34 (BS table) | `src/lib/bs.ts` covers BS 2078–2095 (to April 2039 AD) |
| §4.38a (breakpoints 768 / 1280) | `PRODUCT_RULES.md` Law 14 |
| §4.49 (consumables) | `OPEN_DECISIONS.md` §4 — resolved, Option A |
| §4.64 (a)–(e) | D9, D10, D8, D7, D17 |
| §4.65 (a)–(c) | D5, D2, D1 |
| Phase 6 (five screen states) | §6.8 here; T10 for the remaining secondary screens |
| Phase 9 (offline) | T2-10, T2-11 |

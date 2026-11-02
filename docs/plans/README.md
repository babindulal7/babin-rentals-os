# docs/plans — build-ready plans for go-live

The master roadmap is [`/PLAN.md`](../../PLAN.md). This folder holds one plan per track. Each
task is a **card** an agent can pick up and finish on one branch. Every card has a ready
copy-paste prompt in [`prompts/`](prompts/README.md).

| Track | File | Lane · agent | Go-live? |
|---|---|---|---|
| T0 Repo & process hygiene | [T0_REPO_HYGIENE.md](T0_REPO_HYGIENE.md) | A · Codex-1 + Babin | Yes — week 1 |
| T1 Release & infrastructure | [T1_RELEASE.md](T1_RELEASE.md) | A · Codex-1 + Babin | Yes |
| T2 Floor loop completion | [T2_FLOOR.md](T2_FLOOR.md) | A · Codex-1 | Yes |
| T3 Booking & money rules | [T3_BOOKING_MONEY.md](T3_BOOKING_MONEY.md) | C · Codex-2 | Yes |
| T4 Shared operations tools | [T4_SHARED_TOOLS.md](T4_SHARED_TOOLS.md) | B · Gemini | Yes |
| T5 Notifications & email | [T5_NOTIFICATIONS.md](T5_NOTIFICATIONS.md) | B · Gemini | Yes |
| T6 Nepali language | [T6_NEPALI.md](T6_NEPALI.md) | B · Gemini | Yes |
| T7 Online booking & payments | [T7_ONLINE_BOOKING.md](T7_ONLINE_BOOKING.md) | C · Codex-2 | Yes |
| T8 Membership & crew | [T8_MEMBERSHIP_CREW.md](T8_MEMBERSHIP_CREW.md) | A · Codex-1 | Yes |
| T9 Booqable cutover | [T9_CUTOVER.md](T9_CUTOVER.md) | A · Codex-1 + Babin | Yes |
| T10 After go-live | [T10_AFTER_GO_LIVE.md](T10_AFTER_GO_LIVE.md) | — | No |
| Owner checklist | [BABIN_ACTIONS.md](BABIN_ACTIONS.md) | Babin | — |
| Migration numbers | [MIGRATION_LEDGER.md](MIGRATION_LEDGER.md) | all | — |
| Agent prompts | [prompts/](prompts/README.md) | all | — |
| Usability tests and the screen check | [../USABILITY_TESTS.md](../USABILITY_TESTS.md) | all · Babin | — |

---

## Who does what (PLAN.md §6, ruled 26 Oct)

- **Codex-1 (lane A), Gemini (lane B), Codex-2 (lane C)** build, each in its own git worktree on
  Babin's computer.
- **Babin** merges locally, applies migrations to live after a backup, and does the owner tasks.
- **Claude** reviews: reads GitHub at 7:38 AM and 7:38 PM NPT, re-runs the fast checks on `main`, and
  sends a short summary, problems and the next prompt. Claude never pushes; its work arrives as files.

## Picking the next task

1. Open your lane's tracks. Take the **first card whose status is `todo` and whose `Needs` are all
   `done`**. Within a track, cards are in build order. Cards tagged **[go-live] · slips first** (the
   27 Oct Booqable round) come after the untagged and plain **[go-live]** cards of the same track, and
   are the first to move after day X if the lane falls behind (B56). Cards tagged **[soon]** come last
   unless the prompt says otherwise.
2. Paste the card's prompt from [`prompts/`](prompts/README.md) into your agent.
3. Set the card's status to `doing` with your branch name in your first commit.
4. Work in **your own worktree** (`git worktree add ../bro-lane-a lane-a/T2-01-camera-evidence`).
   Never share a checkout with another agent.
5. When Babin merges it, set the card to `done` with the date.

## Card format

```
### T2-01 · Camera evidence upload            status: todo · size: L · lane A · [go-live]
What     — one to three lines.
Why      — the ruling or lock it serves (RULINGS-2026-10-26 Dx, …-workflow Wx, …-27-booqable Bx/Kx, an older ruling, a law).
Where    — files, tables, RPCs.
Database — "none", or "migration: claim in MIGRATION_LEDGER.md" + what it does.
Done when — numbered acceptance checks: tests, gates, screens driven, roles tried.
Needs    — cards or Babin actions that must be done first.
```

Sizes: **S** ≤ 1 session · **M** 2–3 · **L** 4–6 · **XL** 7+. A session is one focused agent
run that ends in a branch ready to merge and a PROGRESS.md entry.

## Gates every card must pass (CI runs these on the self-hosted runner when it is open — you still run them, 2 Nov C2)

The same steps `.github/workflows/ci.yml` ran, in its order (T0-11 turns this into one command).
A gate that is skipped is how a red check reaches `main` — on 26 Oct the UI-copy check went red
that way.

```bash
npm run typecheck
npm run lint
npm test                             # T0-10 branch: mock is forced by runner even if .env.local points at live
npm run check:pglite                  # with check:lifecycle, both green in one run = migration Verified (R-35)
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
npm run test:coverage                # T0-10 branch: mock is forced (long)
```

PowerShell and Git Bash use the same commands; the test runner forces mock mode. `npm test -- --live` is an explicit dangerous opt-in, reserved for a separately isolated test project — never production.

Then drive the changed screen in `npm run dev:mock` at **375, 820 and 1440 px**, as each role the
card names, and run the **screen check** in [`docs/USABILITY_TESTS.md`](../USABILITY_TESTS.md) §1 —
which screen, which booking, where am I, the next action, search and exit, nothing claiming a save
that did not happen, touch, forgiving forms. Write the result in the PROGRESS entry. A card may also
carry **Build notes** — patterns from the reference books (`docs/USABILITY_TESTS.md` §5).

A migration is **Verified** only with both DB gates green in one run; it reaches the live project
only through Babin's apply batches (N-5).

## Words used in these plans

- **Staging** — the separate Supabase project from T1-02, restored from a live backup.
- **Live** — Supabase project `sxguwvgoserhdolewibb`. Agents never write to it.
- **Batch** — a set of verified migrations Babin applies to live in one session (T1-10).
- **Day X** — go-live, Mon 1 Feb 2027 (18 Magh 2083).
- **Check-in** — Claude's twice-daily review message (7:38 AM and 7:38 PM NPT).
- **⭐** — a business figure taken as a default until Babin changes it (CLAUDE.md B-5).
- **[go-live] / [soon]** — must be done by day X / may slip to the first two weeks after it.

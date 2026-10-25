# docs/plans — build-ready plans for go-live

The master roadmap is [`/PLAN.md`](../../PLAN.md). This folder holds one plan per track. Each
task is a **card** an agent can pick up and finish in one branch and one pull request.

| Track | File | Lane | Go-live? |
|---|---|---|---|
| T0 Repo & process hygiene | [T0_REPO_HYGIENE.md](T0_REPO_HYGIENE.md) | A | Yes — week 1 |
| T1 Release & infrastructure | [T1_RELEASE.md](T1_RELEASE.md) | A | Yes |
| T2 Floor loop completion | [T2_FLOOR.md](T2_FLOOR.md) | A | Yes |
| T3 Booking & money rules | [T3_BOOKING_MONEY.md](T3_BOOKING_MONEY.md) | B | Yes |
| T4 Shared operations tools | [T4_SHARED_TOOLS.md](T4_SHARED_TOOLS.md) | B | Yes |
| T5 Notifications & email | [T5_NOTIFICATIONS.md](T5_NOTIFICATIONS.md) | B | Yes |
| T6 Nepali language | [T6_NEPALI.md](T6_NEPALI.md) | C | Yes |
| T7 Online booking & payments | [T7_ONLINE_BOOKING.md](T7_ONLINE_BOOKING.md) | C | Yes |
| T8 Membership & crew | [T8_MEMBERSHIP_CREW.md](T8_MEMBERSHIP_CREW.md) | B | Yes |
| T9 Booqable cutover | [T9_CUTOVER.md](T9_CUTOVER.md) | A | Yes |
| T10 After go-live | [T10_AFTER_GO_LIVE.md](T10_AFTER_GO_LIVE.md) | — | No |
| Owner checklist | [BABIN_ACTIONS.md](BABIN_ACTIONS.md) | Babin | — |
| Migration numbers | [MIGRATION_LEDGER.md](MIGRATION_LEDGER.md) | all | — |

---

## Picking the next task

1. Open your lane's tracks. Take the **first card whose status is `todo` and whose `Needs` are all
   `done`**. Within a track, cards are in build order.
2. Set the card's status to `doing` and your branch name in your first commit.
3. Work in **your own worktree** (`git worktree add ../bro-lane-a lane-a/T2-01-camera-evidence`).
   Never share a checkout with another agent.
4. When the PR merges, set the card to `done` with the PR number and the date.

## Card format

```
### T2-01 · Camera evidence upload            status: todo · size: L · lane A
What     — one to three lines.
Why      — the ruling or lock it serves (RULINGS-2026-10-26 Dx, an older ruling, a law).
Where    — files, tables, RPCs.
Database — "none", or "migration: claim in MIGRATION_LEDGER.md" + what it does.
Done when — numbered acceptance checks: tests, gates, screens driven, roles tried.
Needs    — cards or Babin actions that must be done first.
```

Sizes: **S** ≤ 1 session · **M** 2–3 · **L** 4–6 · **XL** 7+. A session is one focused agent
run that ends in a PR and a PROGRESS.md entry.

## Gates every card must pass

```bash
npm run typecheck
VITE_DATA_SOURCE=mock npm test        # CI runs the suite in mock mode; without it ~130 files fail on missing env
npm run check:pglite && npm run check:lifecycle   # only if SQL changed — both, same run (R-35)
npm run lint
npm run build
```

Then drive the changed screen in `npm run dev:mock` at **375, 820 and 1440 px**, as each role the
card names. A migration is **Verified** only with both DB gates green in one run; it reaches the
live project only through Babin's apply batches (N-5).

## Words used in these plans

- **Staging** — the separate Supabase project from T1-02, restored from a live backup.
- **Live** — Supabase project `sxguwvgoserhdolewibb`. Agents never write to it.
- **Batch** — a set of verified migrations Babin applies to live in one session (T1-10).
- **Day X** — go-live, Mon 1 Feb 2027 (18 Magh 2083).
- **⭐** — a business figure taken as a default until Babin changes it (CLAUDE.md B-5).

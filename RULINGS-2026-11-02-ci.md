# Rulings — 2 November 2026: CI is back on, on a self-hosted runner

**Source:** Babin Dulal, in a Claude Code session on 2 Nov 2026: "Ci turn on and run this", after
adding a self-hosted runner to `babindulal7/babin-rentals-os`. Supersedes **W75**
(`RULINGS-2026-10-26-workflow.md`, "keep CI off") — W75 existed because GitHub-hosted minutes were
blocked by billing; a runner on Babin's own Windows PC has no such limit.

**Scope:** `.github/workflows/ci.yml` and the documents that said CI is off. No application code,
migration, permission cell, setting or live database changed (N-5 untouched).

---

## Decisions

| # | Question | Decision | Why | Changed where | Revert |
|---|---|---|---|---|---|
| C1 | Is GitHub CI on? | **Yes.** `ci.yml` runs on every push and pull request, and by hand (`workflow_dispatch`), on the self-hosted runner `[self-hosted, Windows, X64]`. | The billing block was on GitHub-hosted runners only. | `ci.yml` `on:` and `runs-on:` | set `runs-on: ubuntu-latest` (needs billing) or disable the workflow in GitHub |
| C2 | Are the local gates still required? | **Yes, unchanged.** An agent still runs every gate before it says a card is done. A green CI run adds a second check; it never replaces the first (B-1, stricter wins). | The runner is a PC that may be asleep or offline; a queued job proves nothing. | `PLAN.md` §6.4, `AGENTS.md`, `CLAUDE.md` | remove the "CI also runs" clause |
| C3 | Pull requests from forks | **Skipped.** The job's `if:` runs a pull request only when its head repository is this repository. | A self-hosted runner executes the workflow on Babin's machine; fork code must never reach it. | `ci.yml` job `if:` | delete the `if:` line (do not, while the repo can receive fork PRs) |
| C4 | Job time limit | **120 minutes** (was 35). | First self-hosted run: `npm ci` 22 min and typecheck 9 min, cancelled at 35 min before the test step. Second run: 48 min total, all gates green. | `ci.yml` `timeout-minutes` | set it back to 35 (the run then fails by timeout on a slow host) |
| C5 | Runner as a service | **Not yet.** The runner is started by hand with `.\run.cmd` in `C:\actions-runner`; CI only runs while that window is open. | Registering it as a Windows service needs an administrator shell and a fresh token — Babin's action (N-8). | — | — |

## Evidence

The first run (35-minute limit) was cancelled before the test step. The second run, after C4,
finished with `Job result after all job steps finish: Succeeded` in the runner's own log
(`C:\actions-runner\_diag`), about 48 minutes, on branch
`claude/equipment-draft-preview-rename-a5f063`. Every gate in `ci.yml` ran in order, coverage and the
artifact uploads included. That is the runner's log, not GitHub's run page, and it covers that branch
only — `main` has not yet run CI.

## Open

- Babin merges the branch so CI runs on `main`.
- Runner as a Windows service (C5).
- GitHub-side: the Actions tab's CI workflow must stay enabled (W75 had it disabled).

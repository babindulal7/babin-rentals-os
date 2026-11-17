# Babin Rentals OS — Safe Windows Desktop Sync

**Scope:** Windows PC 1 and Windows PC 2 only. **Status: draft PR; not merged or installed on either computer.**

This tool prepares both Windows development machines to fetch `main` every 15 minutes. It updates the local `main` branch **only** after all safeguards pass. GitHub does not install Windows scheduled tasks remotely: each computer needs a one-time local setup after this PR is approved and merged.

## Safety requirements

The `sync.mjs` script:

1. Validates that `origin` points to `babindulal7/babin-rentals-os`.
2. Fetches `origin/main` without modifying local working files.
3. Refuses to modify checkout contents inside a CI runner.
4. Updates **only** a clean local `main` checkout, never an agent/feature branch or a dirty checkout.
5. Refuses to advance local `main` if it has unique commits or diverges.
6. Requires **successful, completed push-to-main GitHub Actions CI on the exact remote SHA**; no success, no update.
7. Rechecks branch and working tree before `git merge --ff-only <SHA>`.

It does not stash, reset, force-pull, rebase, run SQL, update live Supabase, modify the application release, merge PRs, install dependencies, or build Electron executables.

**Known limitation:** If self-hosted CI is offline, queued, red or unverifiable, auto-update is deliberately blocked. Fetching still occurs. Do not label a desktop updated based only on a FETCHED log line.

## Before installing — both Windows PCs

- Use a separate normal development clone, **not** a self-hosted GitHub Actions runner's `_work` folder or an active agent checkout.
- Install Git, Node.js and GitHub CLI (`gh`) in the Windows account that will run the scheduled task.
- Sign in using `gh auth login`; verify `gh auth status` and `git fetch origin main`.
- Review, verify and merge the draft PR after completing repository-required checks. Do **not** merge it just to activate the installer.
- On each PC, check out a clean `main` development checkout before installing. If local changes exist, commit them to a feature branch/worktree, **not** a forced reset or blind stash.

## One-time setup on Windows PC 1

Open PowerShell in the **normal development clone**:

```powershell
gh auth login
gh auth status
git fetch origin main
node tools/workstation-sync/sync.mjs                 # fetch-only dry run
node --test tools/workstation-sync/sync.test.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\workstation-sync\install-windows.ps1 -RepoPath "$PWD"
```

The script creates a per-user Task Scheduler job named `Babin Rentals OS Safe Sync`, running every **15 minutes**, and writes a log to `%LOCALAPPDATA%\BabinRentalsOS\sync.log`.

## Repeat on Windows PC 2

Perform the **same setup in PC 2's own normal development clone and Windows user account**. Do not copy `node_modules`, runner workspaces or `.env.local` from PC 1. Both machines share the GitHub repository, not a local filesystem.

## Verify after installation (on each PC)

```powershell
schtasks /Query /TN "Babin Rentals OS Safe Sync" /V /FO LIST
Get-Content "$env:LOCALAPPDATA\BabinRentalsOS\sync.log" -Tail 30
git status
git rev-parse --short HEAD
git rev-parse --short origin/main
```

`FETCHED`: fetched GitHub only; `SKIPPED`: protected checkout or CI unavailable; `UPDATED`: successfully fast-forwarded; `CURRENT`: already at the target SHA; `ERROR`: needs attention.

Before claiming both desktops synchronized, compare the two PCs' `git rev-parse HEAD` results **after** each has confirmed an `UPDATED` or `CURRENT` log entry.

## Remove the task (each PC)

```powershell
schtasks /Delete /TN "Babin Rentals OS Safe Sync" /F
```

Removing the task stops future scheduled attempts. It does not rewrite or roll back source code.

## Owner acceptance checklist

- [ ] All repository-prescribed gates pass on this PR head.
- [ ] Windows PC 1: validate PowerShell installer syntax, task creation, non-admin user context and logs.
- [ ] Windows PC 2: repeat independent installation, task inspection and logs.
- [ ] Dirty `main`, feature branches, diverged `main`, and failed or missing CI each produce safe `SKIPPED` results.
- [ ] Clean behind-`main` with matching successful CI produces `UPDATED`; verify `HEAD` on both PCs.
- [ ] Neither PC's task runs inside a GitHub self-hosted runner workspace or touches a live database.

**Out of scope:** app deployment, GitHub runner allocation and repair, release builds, database migrations, Windows app auto-updates, and automatic PR merges. Active per-agent worktrees should remain on separate branches.

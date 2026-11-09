# Babin Rentals OS — Safe Workstation Sync

**Scope:** Two Windows development PCs + one Mac mini M4. **Proposed in a draft PR, not installed on any machine.** GitHub cannot remotely install Task Scheduler or launchd jobs. After owner review/merge, install once on each device using the instructions below.

## Safety and behaviour

Every 15 minutes each computer fetches origin/main without changing the working tree. With --apply, it will update only if:

1. The configured GitHub origin is exactly babindulal7/babin-rentals-os.
2. It is a normal developer checkout, **not** a GitHub Actions/CI workspace.
3. It is on main with **no modified or untracked files**.
4. Local main is strictly behind origin/main (not ahead or diverged).
5. The GitHub Actions **CI** workflow for the exact remote SHA, triggered by a **push to main**, has finished **successfully**.
6. Rechecking local branch/status shows no changes during the CI lookup.

Only then does it execute git merge --ff-only using the verified commit SHA. It never resets, stashes, rebases, force-pulls, edits live Supabase, merges PRs, switches branches, or deploys.

**Fail-closed policy:** Missing, queued, failed, or unverifiable CI means **SKIPPED**; it will fetch but not update. The current private repository's CI is self-hosted and may be unavailable, so the conservative gate can intentionally block auto-updates. Do not bypass by forcing pulls. Running this sync also does **not** run npm ci, install a new Electron binary, build, or release the application.

## Prerequisites on all three computers

- A developer clone of the repository, **separate from any Actions runner _work directory** and from active per-agent worktrees.
- Git, Node.js and GitHub CLI (gh). Authenticate with gh auth login once under **the same user account** that runs the scheduled task; ensure git fetch origin main also works. Never put a token or secret in this repository.
- A clean main checkout for auto-updates. Other feature branches remain untouched.
- Computer must be powered on and online to sync.

## Safe manual verification

From the repo folder:

~~~bash
node tools/workstation-sync/sync.mjs            # fetch only
node tools/workstation-sync/sync.mjs --apply    # green-CI fast-forward only
node --test tools/workstation-sync/sync.test.mjs
git status
git rev-parse main
~~~

Possible logs: FETCHED, CURRENT, SKIPPED, UPDATED, ERROR. SKIPPED is intentional for dirty branches, off-main worktrees and missing/failed CI.

## Windows PC 1 and Windows PC 2

In a PowerShell terminal from the clone (under your normal user account):

~~~powershell
gh auth login
git fetch origin main
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\workstation-sync\install-windows.ps1 -RepoPath (Get-Location).Path
~~~

The installer creates a Windows Task Scheduler job named **Babin Rentals OS Safe Sync**, running every 15 minutes. Its local launcher and log live under %LOCALAPPDATA%\BabinRentalsOS. It does not install/modify GitHub self-hosted runner services.

Inspect:

~~~powershell
schtasks /Query /TN "Babin Rentals OS Safe Sync" /V /FO LIST
Get-Content "$env:LOCALAPPDATA\BabinRentalsOS\sync.log" -Tail 25
~~~

Remove:

~~~powershell
schtasks /Delete /TN "Babin Rentals OS Safe Sync" /F
~~~

## Mac mini M4

In Terminal under the logged-in normal Mac user:

~~~bash
gh auth login
git fetch origin main
bash tools/workstation-sync/install-macos.sh "$PWD"
~~~

This creates ~/Library/LaunchAgents/com.babinrentals.os-safe-sync.plist, repeating every 900 seconds. An interactive GUI login is needed to install the user agent.

Inspect:

~~~bash
launchctl print "gui/$(id -u)/com.babinrentals.os-safe-sync"
tail -n 25 "$HOME/Library/Logs/babin-os-safe-sync.log"
~~~

Remove:

~~~bash
launchctl bootout "gui/$(id -u)/com.babinrentals.os-safe-sync"
rm "$HOME/Library/LaunchAgents/com.babinrentals.os-safe-sync.plist"
~~~

## Review / acceptance checklist

- [ ] Owner reviews PR and merges after repository local gates; no automated merge or deployment.
- [ ] Manually test the script on Windows and macOS (the installers cannot be executed from a cloud chat).
- [ ] Verify the normal user has working git and gh authentication on both Windows PCs and Mac mini.
- [ ] Install scheduler on each PC/Mac separately; confirm logs after one scheduled run.
- [ ] A dirty main, a feature branch, a diverged main, and a CI failure all safely SKIP.
- [ ] Clean behind-main with exact green main-push CI fast-forwards and leaves every feature branch alone.
- [ ] Verify all three intended main checkouts report the same SHA after a green run.

**Out of scope:** GitHub Actions runner allocation/configuration, deployed app updates, GitHub PR merges, database changes, production operations, secrets, and automatic npm/build/test actions. Workstations holding active agent edits should remain on their own branches/worktrees.

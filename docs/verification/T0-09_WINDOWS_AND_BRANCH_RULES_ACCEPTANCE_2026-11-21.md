# T0-09 — Windows local-gate receipt and GitHub branch-rule handoff

**Reviewed:** 21 Nov 2026, NPT. **Card stays:** `acceptance_pending`.

## Verified remotely (not a local test)

- PR [#289](https://github.com/babindulal7/babin-rentals-os/pull/289), code head `79412c80ff94a0ff786a86a1b6483eecbd58af83`, completed required PR check successfully in [run 44879407845](https://github.com/babindulal7/babin-rentals-os/actions/runs/44879407845).
- Corresponding merged main `f3c47aff9c777b202722a6b4ecd82d11a9fefcd7` passed both main jobs in [run 44881270551](https://github.com/babindulal7/babin-rentals-os/actions/runs/44881270551).
- Latest source inspected for this handoff `04746df2ef225057ec25f36c19e9eb9f389b3f26`, both jobs completed **success** in [run 44893568676](https://github.com/babindulal7/babin-rentals-os/actions/runs/44893568676).
- GitHub main branch metadata returned `protected:false` and accessible repository rulesets list `[]`; branch protection detail endpoint returned 403 to this GitHub connection. **No enforced merge gate has been proven.**

## Step A — Owner/admin GitHub settings

**This cannot be executed by the currently connected ChatGPT GitHub tools:** they support branch/ruleset read, not creating/updating branch protection. The owner must use the GitHub UI with admin access:

1. Open https://github.com/babindulal7/babin-rentals-os/settings/rules (or Settings → Branches → Branch protection rules, depending on available UI), and create an **active** rule targeting exactly `main`.
2. Enable **Require a pull request before merging** (and a reviewed approval per owner policy).
3. Enable **Require status checks to pass before merging**, select **`typecheck · test · build`** from the repository's GitHub Actions checks, and require up-to-date checks when GitHub permits.
4. **Do NOT** set **`Mac · full CI (main)`** as a PR-required check: that job is intentionally skipped on PRs. Verify it separately after merge on the main SHA.
5. Restrict force pushes and branch deletions; avoid bypass exceptions unless specifically owner-approved and audited. Save/activate the rule.
6. Confirm `main` shows the enforced rule in the admin UI and, if the integration allows, branch metadata reports `protected:true`. Preserve a dated **redacted** screenshot of required-check names, targeting and enforcement; no secrets.
7. Review CI docs-only `paths-ignore` behavior to ensure protection does not deadlock Markdown-only PRs. For docs-only PRs, require a separately approved check strategy instead of silently disabling code PR verification.

**Do not** change Supabase, payment systems, Vite env variables, deployment or the Mac runner setup as part of this settings task.

## Step B — Independent Windows verification (manual; do not claim run here)

Run in a safe PowerShell window on a Windows development machine with the repository checkout and Node installed. The cloned working tree must contain **no live .env files or service keys**. This uses a separate **detached worktree**, preserving existing development branches.

```powershell
# Start from the existing repository checkout.
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw "Fetch failed" }
$sha = (git rev-parse origin/main).Trim()
if ($LASTEXITCODE -ne 0) { throw "Cannot pin main" }
$dir = "..\babin-t009-acceptance-$($sha.Substring(0,8))"
if (Test-Path $dir) { throw "Safety stop: acceptance worktree already exists" }
git worktree add --detach $dir $sha
if ($LASTEXITCODE -ne 0) { throw "Worktree creation failed" }
Push-Location $dir
try {
    if (Test-Path ".env.local") { throw "Safety stop: .env.local found" }
    $env:VITE_DATA_SOURCE = "mock"
    Remove-Item Env:VITE_SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
    Write-Host "PINNED HEAD: $sha"
    node --version
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    node --test scripts/run-gates.test.mjs scripts/local-api-guard.test.mjs scripts/test-receipt.test.mjs
    if ($LASTEXITCODE -ne 0) { throw "Gate-parity smoke failed" }
    npm run gates
    if ($LASTEXITCODE -ne 0) { throw "At least one mandatory local gate failed" }
    Write-Host "Independent full local gates passed on $sha"
} finally {
    Pop-Location
}
```

**Receipt format:** date/time in NPT, exact 40-character SHA, Node/npm versions, OS, `npm ci` exit status, local test counts, `npm run gates` **all 18 gate names and results**, signed/reviewed by Windows agent; redact any secret or client data before attaching to a PR. A queued run, previous SHA, `--quick` or red step **cannot** pass acceptance.

**GitHub UI settings and Windows commands were not executed in the ChatGPT container.** A GitHub clone from the ChatGPT environment failed DNS resolution; this document is a reproducible handoff, not fabricated local verification.

## Final status

**T0-09 remains `acceptance_pending`** until an admin confirms protection is active and the independent local and owner reviews are documented. CI is green, but green CI alone does not prove GitHub enforces it.

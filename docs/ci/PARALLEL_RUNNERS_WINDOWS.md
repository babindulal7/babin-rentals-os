# Windows Parallel Self-Hosted Runner Installation & Scaling Guide

## 1. Overview & Objectives

Babin Rentals OS relies on a native Windows x64 self-hosted runner to execute the full verification suite (`.github/workflows/ci.yml`), including PGlite in-process database migrations, authenticated RLS security checks, booking lifecycle tests, financial integrity tests, build bundling, and coverage calculation.

Previously, two issues caused severe queue congestion on the single runner:
1. **Duplicate CI execution:** Every branch push (`push: branches: ['**']`) and every pull request event (`pull_request`) scheduled independent, identical full-suite jobs for the same commit.
2. **Serial execution:** With only one runner instance (`DESKTOP-99FC3AO`), parallel pull requests queued sequentially.

This document outlines:
- System hardware diagnostics and resource headroom analysis.
- The workflow deduplication fix implemented in `.github/workflows/ci.yml`.
- Step-by-step, owner-authorized instructions for safely provisioning a second runner (`BABIN-CI-2`) in an isolated directory.

---

## 2. Hardware Diagnostics & Resource Evaluation

Diagnostics performed on the host PC via Windows PowerShell:

```powershell
Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory
Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize
Get-PSDrive C | Select-Object Name,Free,Used
```

### Measured Hardware Baseline

| Resource | Metric / Specification | Status & Evaluation |
|---|---|---|
| **CPU** | 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz | 4 physical cores, 8 logical processors. Sufficient for 1-2 Node/V8 jobs. |
| **Total Physical RAM** | 15.73 GB (~16 GB) | Fixed capacity on host. |
| **Free Physical RAM** | ~0.39 GB (~400 MB) | **CRITICAL WARNING:** Host memory is heavily utilized under current desktop workload. |
| **Total Disk Space (C:)** | 237.09 GB | Host NVMe drive. |
| **Free Disk Space (C:)** | 33.74 GB | Headroom exists for one additional runner directory (~5-10 GB for repo + `node_modules` + cache). |
| **Used Disk Space (C:)** | 203.35 GB | Requires periodic workspace pruning (`_work`). |

### Sizing & Performance Caveat

> [!WARNING]
> **RAM Contention Risk on a Single Machine:**
> A full run of the Babin Rentals OS suite executes TypeScript typecheck (`tsc --noEmit`), Vite production build, Vitest mock engine tests, PGlite in-process Postgres instance, and V8 coverage instrumentation. During peak test execution, Node.js worker processes can consume 3–6 GB of memory per run.
> 
> Because the current host has 15.73 GB total RAM with less than 1 GB currently free, running two full CI jobs concurrently on this single PC risks heavy disk paging (swap thrashing), sluggishness, or process terminations.
> 
> **Recommendation:**
> - If adding a second runner on this PC, benchmark carefully and close background applications.
> - If memory pressure causes timeout errors (>30s) or OS slowdowns, do **not** raise timeouts or weaken quality gates. Instead, revert to 1 local runner or install Runner #2 on a separate physical machine or dedicated VM.

---

## 3. Existing Runner Configuration

- **Installation Directory:** `C:\actions-runner`
- **Runner Agent Name:** `DESKTOP-99FC3AO` (Agent ID 21, Pool: Default)
- **Runner Software Version:** `2.338.2` (64-bit Windows)
- **Current Mode:** Interactive listener process (`Runner.Listener.exe` / `Runner.Worker.exe`), launched via `run.cmd`
- **Labels:** `[self-hosted, Windows, X64]`
- **Target Repository:** `https://github.com/babindulal7/babin-rentals-os`
- **Work Directory:** `C:\actions-runner\_work`

The existing `C:\actions-runner` directory, credentials, and processes must remain untouched during the setup of any additional runner.

---

## 4. Change A: Workflow Deduplication (Implemented)

In `.github/workflows/ci.yml`:

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

### Verification & Semantics:
1. **Push to `main`:** Runs exactly once upon merge/push to `main`.
2. **Open / Sync PR:** Runs once for the PR head commit (including draft PRs).
3. **Repeated push to the same PR:** Cancels obsolete in-progress runs for that PR (`${{ github.workflow }}-${{ github.event.pull_request.number }}`), saving runner cycles.
4. **Independent PRs:** Have distinct concurrency groups (`CI-101`, `CI-102`), so they do not cancel each other and can execute concurrently when multiple runners are online.
5. **Non-PR branches:** Do not trigger automatic duplicate runs on push, preventing double-queuing.
6. **Manual checks:** Can still be triggered on any branch using `workflow_dispatch`.
7. **Fork Security:** Untrusted pull requests from external forks remain forbidden on the self-hosted runner via the gate:
   ```yaml
   if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
   ```

---

## 5. Change B: Safe Installation Plan for Runner #2 (`BABIN-CI-2`)

> [!IMPORTANT]
> **Owner Authorization Required:**
> Do not execute automatic runner installation or service modification without explicit owner authorization. Follow these steps in an elevated PowerShell session on the target Windows host.

### Step 1: Obtain a Fresh Runner Registration Token
1. Open the GitHub repository in your browser:
   `https://github.com/babindulal7/babin-rentals-os/settings/actions/runners/new?arch=x64&os=win`
2. Select **Windows** and **x64**.
3. Note the short-lived registration token displayed in the UI (tokens expire after 1 hour). Never commit this token or expose it in pull requests or chat.

### Step 2: Prepare Isolated Directory
Create a dedicated directory `C:\actions-runner-2`. It must be completely separate from `C:\actions-runner`:

```powershell
# Create new isolated directory
New-Item -ItemType Directory -Path "C:\actions-runner-2" -Force
Set-Location -Path "C:\actions-runner-2"

# Use the existing cached runner zip from C:\actions-runner or download fresh
if (Test-Path "C:\actions-runner\actions-runner-win-x64-2.338.0.zip") {
    Copy-Item "C:\actions-runner\actions-runner-win-x64-2.338.0.zip" "C:\actions-runner-2\"
    Expand-Archive -Path ".\actions-runner-win-x64-2.338.0.zip" -DestinationPath . -Force
} else {
    Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-win-x64-2.338.0.zip -OutFile "actions-runner-win-x64-2.338.0.zip"
    Expand-Archive -Path ".\actions-runner-win-x64-2.338.0.zip" -DestinationPath . -Force
}
```

### Step 3: Configure Runner #2
Run `config.cmd` to register the runner with the specific name `BABIN-CI-2`:

```powershell
Set-Location -Path "C:\actions-runner-2"

# Execute configuration with the fresh short-lived token from Step 1
.\config.cmd --url https://github.com/babindulal7/babin-rentals-os `
             --token <SHORT_LIVED_TOKEN_FROM_GITHUB_UI> `
             --name "BABIN-CI-2" `
             --work "_work" `
             --labels "self-hosted,Windows,X64" `
             --unattended
```

*Note: Keep the standard labels `[self-hosted, Windows, X64]` so that either runner can naturally pick up queued verification jobs without changing the workflow file.*

### Step 4: Run the Second Runner
Depending on owner preference:

**Option 1: Interactive Execution (Matching Runner #1)**
```powershell
Set-Location -Path "C:\actions-runner-2"
.\run.cmd
```

**Option 2: Windows Service Setup (Persistent)**
If running as a background Windows service, check the configuration prompt options provided by the runner package or register via:
```powershell
# If using Windows service mode, configure under an authorized service account:
# .\config.cmd --runasservice
```

---

## 6. Verification & Contention Troubleshooting

### Acceptance Checks
1. In GitHub UI (`Settings -> Actions -> Runners`), both `DESKTOP-99FC3AO` and `BABIN-CI-2` show as **Idle / Online**.
2. When two distinct PRs are opened, GitHub Actions assigns Job 1 to `DESKTOP-99FC3AO` and Job 2 to `BABIN-CI-2`.
3. Open Task Manager or PowerShell `Get-Process` to monitor CPU and Memory usage during simultaneous runs.

### If Performance Degrades or Jobs Fail
If memory pressure causes OOM crashes, Node timeouts, or database connection drops:
1. Stop `BABIN-CI-2` (`Ctrl+C` or stop the service).
2. Remove runner registration:
   ```powershell
   Set-Location -Path "C:\actions-runner-2"
   .\config.cmd remove --token <REMOVAL_TOKEN_FROM_GITHUB_UI>
   ```
3. Deploy `BABIN-CI-2` on a second physical machine or dedicated VM following the same steps.

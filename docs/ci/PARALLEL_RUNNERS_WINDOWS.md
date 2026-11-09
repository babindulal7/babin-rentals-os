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
| **CPU** | 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz | 4 physical cores, 8 logical processors. Parallel performance must be measured. |
| **Total Physical RAM** | 15.73 GB (~16 GB) | Fixed capacity on host. |
| **Free Physical RAM** | ~0.39 GB (~400 MB) in one diagnostic snapshot | **Recheck under load.** Free memory is not a continuous measurement. |
| **Total Disk Space (C:)** | 237.09 GB | Host NVMe drive. |
| **Free Disk Space (C:)** | 33.74 GB | Headroom exists for one additional runner directory (~5-10 GB for repo + `node_modules` + cache). |
| **Used Disk Space (C:)** | 203.35 GB | Requires periodic workspace pruning (`_work`). |

### Sizing & Performance Caveat

> [!WARNING]
> **RAM Contention Risk on a Single Machine:**
> A full run of the Babin Rentals OS suite executes TypeScript typecheck (`tsc --noEmit`), Vite production build, Vitest mock engine tests, PGlite in-process Postgres instance, and V8 coverage instrumentation. During peak test execution, Node.js worker processes can consume 3–6 GB of memory per run.
> 
> This 16 GB host had less than 1 GB free at one observed moment. This does **not** prove that two runners are unsafe if the desktop is currently stable. Monitor memory, paging and full-job completion while running two jobs; do not add a third runner until sustained stability is proven.
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
  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

### Verification & Semantics:
1. **Push to `main`:** Runs exactly once upon merge/push to `main`.
2. **Open / Sync PR:** Runs once for the PR head commit (including draft PRs).
3. **Repeated push to the same PR:** Cancels obsolete in-progress runs for that PR (`${{ github.workflow }}-${{ github.event.pull_request.number }}`), saving runner cycles.
4. **Independent PRs:** Have distinct concurrency groups (`CI-101`, `CI-102`), so they do not cancel each other and can execute concurrently when multiple runners are online.
5. **Non-PR branches:** Do not trigger automatic duplicate runs on push, preventing double-queuing.
6. **Manual checks:** Can still be triggered on any branch using `workflow_dispatch`, with their own event-specific concurrency group. Manual runs on `main` must not cancel the required push CI run.
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

### Step 2: Install a Separate Runner (Only If Not Already Installed)
**Important:** If `BABIN-CI-2` is already registered and executing jobs, **do not reinstall or reconfigure it**. Use section 6 to verify it instead.

For a fresh installation, prepare `C:\actions-runner-2` as a completely isolated directory. Download the **current Windows x64 runner package** via GitHub repository **Settings → Actions → Runners → New self-hosted runner** and follow its generated extraction and checksum verification instructions. Do **not** use a hardcoded historical package version or copy a running runner's credentials/work folder. Never overwrite `C:\actions-runner` or its existing listener.

### Step 3: Configure Runner #2
Follow the fresh `config.cmd` instructions GitHub generates. Give the new runner the unique name `BABIN-CI-2`, use its **own** `_work` folder, and retain the automatic `self-hosted`, `Windows` and `X64` labels. Never publish the registration/removal token or the runner credentials files (`.runner`, `.credentials`, `.credentials_rsaparams`).

### Step 4: Choose Interactive or Service Mode During Setup
- **Interactive:** run `.\run.cmd` from the separate `C:\actions-runner-2` directory after registration, following GitHub's instructions.
- **Windows service:** choose the Windows service option **during runner configuration**, following the official prompt/installation process. Do not assume executing `config.cmd --runasservice` later installs a service.
- **Already configured:** if a change to service mode is needed, do not reconfigure a busy runner. Stop Runner #2 only and use GitHub's supported removal/re-registration procedure with fresh authorization. Leave Runner #1 untouched.

Service installation is optional and must be explicitly authorized by the owner.

---

## 6. Verification & Contention Troubleshooting

### Acceptance Checks
1. In GitHub UI (`Settings -> Actions -> Runners`), both `DESKTOP-99FC3AO` and `BABIN-CI-2` show as **Idle / Online**.
2. For two concurrent PR jobs, inspect each job's runner assignment in the GitHub Actions UI or the runner logs. Some connected APIs omit runner identities.
3. Use Task Manager to monitor CPU, available RAM, paging and disk I/O under simultaneous load. Both jobs must **complete successfully** before considering the setup verified.

### If Performance Degrades or Jobs Fail
If memory pressure causes out-of-memory crashes, Node timeouts, or database errors:
1. Stop only `BABIN-CI-2` (`Ctrl+C` or stop its service) once it is safe.
2. Diagnose whether the failure is infrastructure contention or a real test failure; do not weaken quality gates.
3. If relocating Runner #2, follow GitHub's authorized removal process and set it up on a separate machine. Leave Runner #1 untouched.

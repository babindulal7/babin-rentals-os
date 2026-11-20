# T0-09 — CI Policy Reconciliation (21 November 2026)

**Scope:** documentation, verification policy and roadmap metadata only. **No workflow disabled/enabled, settings modified, runners reconfigured, branch protection changed, PR merged, or database accessed.**

## 1. Why the card had become inconsistent

The original `T0-09` card in `docs/plans/T0_REPO_HYGIENE.md` told the owner to disable CI on billing grounds based on **October 2026** experience (W75), and rely solely on local tests.

That is superseded by the later **9 November 2026** owner ruling (R-9.9), already recorded in `AGENTS.md`: **GitHub CI remains a required merge gate alongside local tests**. The actual `.github/workflows/ci.yml` currently has PR, main push and manual triggers and runs on a self-hosted Mac runner.

## 2. Evidence — public GitHub state, not claimed historical test results

- `main` audited at `48c7f24f70a7b5317c65f81b2136ffa7370696e3` (merge PR #260).
- The required pull-request job for [PR #263](https://github.com/babindulal7/babin-rentals-os/pull/263), head `eaf6a274c4ba913695eb30161fe63e339416d5f5`, was **in progress** on [workflow run #44797221866](https://github.com/babindulal7/babin-rentals-os/actions/runs/44797221866) when inspected.
- `in_progress` proves workflow execution, **not that CI passed**. Skipped, pending or failed steps are not green verification.
- `AGENTS.md` also already says required GitHub CI and local gates are separate pre-merge requirements.
- Existing `.github/workflows/ci.yml` excludes docs-only modifications from automatic triggers. Such a skipped workflow should **not** be misrepresented as passing; verify whether branch protection requires it before any merge.

## 3. Adopted operational interpretation — no account-settings changes

1. Keep required CI workflows enabled and avoid canceling main release verification.
2. Keep each PR head exact: green on an old SHA cannot certify a changed head.
3. Run the corresponding local verification steps independently before proposing completion.
4. Prefer queued/running jobs to finish; handle red jobs by reviewing failure logs and fixing the cause, not relaxing required gates.
5. After merge, verify the latest `main` SHA and its required main checks separately.
6. If GitHub billing, Actions quota or self-hosted runner availability blocks checks, preserve PRs as **pending**, diagnose the cause, and request owner action only if required. Never silently downgrade policy to CI-off.
7. No agent is authorized by this policy to deploy, mutate Supabase, apply migrations, alter live settings or skip production controls.

## 4. T0-09 acceptance checklist (not yet satisfied)

- [x] Superseded CI-off instruction identified in roadmap and corrected on a draft documentation branch.
- [x] CI workflow triggers and current PR-run existence verified from repository metadata.
- [x] Local-plus-required-CI merge gate documented in `AGENTS.md`.
- [ ] A current-head eligible code PR completes with all required checks green; record job IDs, exact SHA and conclusions.
- [ ] Required main workflow completes successfully on its exact main SHA.
- [ ] Independently confirm branch protection/required workflow settings and effective runner capacity; do not infer from a queued run.
- [ ] Owner accepts the reconciled policy if a changed GitHub settings action is needed.

**Recommended roadmap status:** `acceptance_pending` until all outstanding acceptance proofs exist. Historical W75 is superseded by later R-9.9; it is **not** an instruction to disable GitHub CI today.

## 5. Evidence rule for follow-up

Each acceptance report must specify: PR number, exact head SHA, workflow run link, job names, check conclusions, relevant local commands and observed results, reviewer, and an explicit statement that neither staging nor production was changed. A local screenshot or agent narrative without verifiable check results is insufficient.

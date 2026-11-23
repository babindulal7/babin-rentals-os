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
- [x] A current-head eligible code PR completes with all required checks green; exact-head PR #289 `79412c80ff94a0ff786a86a1b6483eecbd58af83` passed required `typecheck · test · build` in [run 44879407845](https://github.com/babindulal7/babin-rentals-os/actions/runs/44879407845). The main-only job was skipped as expected on this PR.
- [x] Corresponding merged main and refreshed current main checks completed successfully: merge SHA `f3c47aff9c777b202722a6b4ecd82d11a9fefcd7` passed [run 44881270551](https://github.com/babindulal7/babin-rentals-os/actions/runs/44881270551); latest inspected main SHA `04746df2ef225057ec25f36c19e9eb9f389b3f26` passed both `typecheck · test · build` and `Mac · full CI (main)` in [run 44893568676](https://github.com/babindulal7/babin-rentals-os/actions/runs/44893568676).
- [ ] Independently confirm branch protection/required workflow settings and effective runner capacity; do not infer from a queued run.
- [ ] Owner accepts the reconciled policy if a changed GitHub settings action is needed.

**Recommended roadmap status:** `acceptance_pending` until all outstanding acceptance proofs exist. Historical W75 is superseded by later R-9.9; it is **not** an instruction to disable GitHub CI today.

## 5. Follow-up verification — green CI does not mean enforced merge gates (21 Nov 2026)

**Read-only GitHub evidence, exact at inspection:** `main@04746df2ef225057ec25f36c19e9eb9f389b3f26`.

| Evidence | Observation |
| --- | --- |
| Fix PR | [#289](https://github.com/babindulal7/babin-rentals-os/pull/289) merged; head `79412c80ff94a0ff786a86a1b6483eecbd58af83`; corresponding merged main SHA `f3c47aff9c777b202722a6b4ecd82d11a9fefcd7` |
| PR-head required check | [Run 44879407845](https://github.com/babindulal7/babin-rentals-os/actions/runs/44879407845), `typecheck · test · build` **success** on exact PR head; main-only job skipped on a PR (expected) |
| Merged-main required checks | [Run 44881270551](https://github.com/babindulal7/babin-rentals-os/actions/runs/44881270551): both `typecheck · test · build` **success** and `Mac · full CI (main)` **success** |
| Most recent checked main | [Run 44893568676](https://github.com/babindulal7/babin-rentals-os/actions/runs/44893568676) on `04746df2...`: **both** main CI jobs completed successfully, including full Mac verification; zero failed job steps |
| Local gate source | `scripts/run-gates.mjs` now contains 18 commands including `db:plan:selftest` immediately after `check:pglite`; 18-gate parity regression merged through #289 |
| Independent review | [PR #289 Codex code-review receipt](https://github.com/babindulal7/babin-rentals-os/pull/289) had no unresolved findings on `79412c8`; this does not substitute for an independent local `npm run gates` receipt or owner acceptance |
| GitHub enforcement | GitHub public branch metadata returned **`protected: false`** for `main`; accessible repository rulesets collection returned **`[]`**. The direct branch-protection detail endpoint returned **403** to this connector. This **does not establish any enforced required-check protection**; do not claim checks block merges or direct pushes solely because runs are green |

### Outstanding release-control gates (HOLD)

1. **Owner-controlled policy enforcement:** have the owner/admin inspect repository Settings → Branches / Rules and protect `main` with the **PR-eligible** required check `typecheck · test · build`, or an independently verified equivalent rule. The `Mac · full CI (main)` job is intentionally skipped on PRs, so **do not** require it as a PR merge check; verify that full job on the merged main SHA separately. GitHub policy changes require explicit separate authorization. Confirm the settings from an authorized admin view and record the result; a 403 read is not a pass.
2. **Independent local verification receipt:** run `npm run gates` against a clean exact-head checkout (safe mock/isolated PGlite only) and retain sanitized command output, exit code, Node version and SHA; never point scripts at production.
3. **Owner acceptance:** record Babin's sign-off on the effective protection/enforcement settings. His 9 Nov ruling already adopted the **CI-on** policy; it does not by itself prove enforcement in GitHub settings.
4. **No silent promotion:** T0-09 stays `acceptance_pending` until the above evidence is reviewable. This audit itself is docs-only, may not trigger CI due paths-ignore and never certifies a new source build. No runner job was manually dispatched; no branch policy, staging, Supabase, credentials, payments or production settings were changed.

## 6. Evidence rule for follow-up

Each acceptance report must specify: PR number, exact head SHA, workflow run link, job names, check conclusions, relevant local commands and observed results, reviewer, and an explicit statement that neither staging nor production was changed. A local screenshot or agent narrative without verifiable check results is insufficient.

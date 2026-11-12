# Agent workflow — one shared policy

**Status:** current as of 4 Nov 2026. Sections 2, 4, 5 and 9 restate rules that already exist and cite them. Section 3
scopes two older rules (W74 and `PERMISSIONS.md` §15) so they stop appearing to contradict each other. Anything marked
**PROPOSAL — NOT YET APPROVED** (sections 6 and 8) is a recommendation from the
[4 Nov rule audit](audits/RULE_CONFLICT_AUDIT_2026-11-04.md); it becomes the rule only when Babin merges this file. Nothing here changes a law, a permission, a gate or a business
figure, and nothing here replaces `docs/PERMISSIONS.md` §15 (B-1 to B-7, N-1 to N-8), which stay word-for-word
in `PERMISSIONS.md` and `CLAUDE.md`.

Every tool — Claude Code, Codex, Gemini, a cloud chat — reads this file first. Tool-specific files
(`AGENTS.md`, `CLAUDE.md`, ignored local configs) point here and must not contradict it.

## 1. What this file settles

The audit found the same question answered differently in different files: who wins when documents disagree, whether
CI is on, who may push, which checks are required, what "done" means. This file gives one answer to each and links to
the rule it comes from. Older rulings are history and stay as written; see section 7.

## 2. Which source wins — by topic

Use the first row that answers. Do not build a second ordering.

| Question | Source that decides | Tie-break |
|---|---|---|
| Who may do what (roles, capabilities, approvals) | [`PERMISSIONS.md`](PERMISSIONS.md) | **Stricter wins** (B-1): deny over allow, database over UI, fewer roles over more |
| A business choice (price, tax, cancellation, deposit, delivery, membership) | The newest explicit owner ruling in `RULINGS-*.md` | If no ruling answers it: **NEEDS OWNER DECISION** — never invent (see section 9) |
| A product invariant (the Laws) | [`PRODUCT_RULES.md`](PRODUCT_RULES.md) | A newer ruling that names the Law |
| What actually runs today | The code, plus gates you ran on the exact commit | A passing run on an older commit proves nothing about this one |
| A domain concept (what a "booking" is) | The Foundation Specification | It never overrides a permission, an invariant or a ruling |
| The state of the build | [`PROGRESS.md`](../PROGRESS.md) and [`CURRENT_STATE.md`](CURRENT_STATE.md) | Dated audits are history, never current truth |

`00_READ_FIRST.md` §1 remains the reading order for documents. Silence is not supersession (B-7).

## 3. Who may do what

Authority to **decide** a conflict (`PERMISSIONS.md` §15) and ability to **write to GitHub** (ruling W74) are different
questions. Both stay in force.

| Actor | May | May not |
|---|---|---|
| Claude Code, Codex or Gemini running **locally in an authorized worktree** | Create a new branch, commit, push that branch, open a **draft** PR, edit docs and code inside the task | Push `main`, merge any PR, enable auto-merge, release, deploy |
| A **cloud chat** session (Claude or ChatGPT) | Read, review, suggest, hand over patches and prompts as files (W74) | Push, open or close PRs, comment — unless the owner states otherwise for that session, or the connector's permissions allow it |
| **Babin** | Merge, apply migrations to live after the backup, cancel Booqable, approve spending | — |

Never, for any agent and whatever a document says: apply a migration to live Supabase, edit live data or RLS, change a
credential or billing, merge, deploy, or print/log/commit a secret (N-5, N-8). Decisions that touch the N-1 to N-8
boundaries need Babin's explicit word.

## 4. Working safely

- **One agent per checkout.** Each task gets its own worktree and branch from a freshly fetched `origin/main`.
- Do not edit another agent's worktree or uncommitted changes. Do not use `git reset --hard`, `git checkout --`,
  `git clean` or a force-push. Do not delete branches automatically.
- Before editing a shared file (`PLAN.md`, `docs/PERMISSIONS.md`, `src/lib/rbac.ts`, `src/actions/core.ts`,
  `src/lib/money.ts`, `src/lib/pricingPipeline.ts`, `docs/plans/*`), list the open branches that touch it
  (`git diff --name-only origin/main...<branch>`) and leave lines another open PR already rewrites.
- Claim a migration number in [`plans/MIGRATION_LEDGER.md`](plans/MIGRATION_LEDGER.md) before writing SQL. Write it,
  number it, test it locally, do not run it against a remote project.
- Local config (`.claude/`, `.cursor/`, `.opencode/`, `.env*`) is ignored by Git and stays that way. Policy lives in
  tracked files; never copy a credential, token or database URL into a commit, a log or a PR.

## 5. Verification — one gate, bound to a commit

**The executable gate is `npm run gates`.** Its ordered list is `scripts/run-gates.mjs`, and a drift guard makes it a hard
error if that list differs from `.github/workflows/ci.yml` (same commands, same order). **The hosted gate is `ci.yml`.**
Do not keep a third list in a document; link here.

| Run | Command | What it proves |
|---|---|---|
| Quick | `npm run gates -- --quick` | Everything except coverage. **Not** a release pass |
| Full | `npm run gates` | All 17 steps, coverage included. The pre-push check |
| Hosted | `ci.yml` on the owner's runner | The same 17 commands plus `npm ci` and the artifact uploads |

The 17 steps, in order: typecheck, lint, local API verification guards, tests (mock), migrations from scratch (PGlite),
booking and invoice financial integrity, authenticated security regressions, lifecycle, server contracts, partial return,
progress blocks, receipt integrity, page-shell invariants, UI-copy, contrast, build, coverage. A migration is **Verified**
only when `check:pglite` and `check:lifecycle` are both green in the same run (R-35).

How to state a result: **commit SHA, command, environment, outcome.** A green run on an old commit or an old PR head does
not certify a newer commit, a newer base, or the PR's merge commit. A push run and a pull-request run are different runs;
the pull-request run tests the merge with the current base. A cancelled, skipped or queued job is not a pass. If the
runner is offline, CI queues; report it as queued and do not move the job to a paid hosted runner. Never remove, skip,
stub or weaken a gate to get green. Tests use the mock backend or in-process PGlite; no CI step reads live Supabase.

## 6. Is CI on? — what is true, and what is proposed

**Fact (4 Nov):** `ci.yml` runs on `push` (all branches), `pull_request` and `workflow_dispatch`, on a self-hosted
Windows runner, with a fork-PR guard. The 26 Oct decision that CI is off (**W75**, `RULINGS-2026-10-26-workflow.md`) was
made when GitHub-hosted minutes were billing-blocked; it is history and is not erased.

**PROPOSAL — NOT YET APPROVED (owner decision).** Current rule: *CI runs on the owner's self-hosted runner. Run
`npm run gates` locally before pushing. A complete CI run on the same head, with the PR's merge commit, is the
merge-readiness evidence wherever it is available; when it is not, say so and do not claim a pass.* No owner
ruling in the repository states this yet; the audit lists the evidence. Until the owner approves the wording, the local
gate list in section 5 is required and a green CI run is supporting evidence.

**Separate PR, not this one:** a push-and-pull-request pair runs the full suite twice on one machine. A change to
`ci.yml` triggers must keep the fork guard and `workflow_dispatch`, and must update `scripts/run-gates.mjs` in the same
PR, because its drift guard fails on a reordered or changed `npm ci` line.

## 7. History is kept

W74 (cloud chat is read-only on GitHub), W75 (CI off), the S8 Booqable date and every older ruling stay verbatim. A newer
dated ruling supersedes them in current guidance only when an owner ruling says so; this file never rewrites one. Where
current guidance differs from a historical statement, the document says "historical, 26 Oct 2026" and links here.

## 8. Definition of done, and card status

A card is `done` only when its work is **merged** (`plans/README.md`), the gates in section 5 passed on the merged
commit, and `PROGRESS.md` records how it was verified.

**PROPOSAL — NOT YET APPROVED.** Use these states in status text so a readiness count cannot treat unmerged work as finished:

`TODO` → `IN PROGRESS` → `DRAFT PR` → `REVIEWED` (gates green on the PR head and merge commit) → `MERGED` → `STAGING-ACCEPTED`
→ `LIVE-ACCEPTED`. In the existing card vocabulary: `todo` = TODO, `doing` = IN PROGRESS to REVIEWED (say which, with the branch and
SHA), `done` = MERGED or later. A card with an open branch is `doing`. Staging and live acceptance are recorded in
`PROGRESS.md`, not in the card word. Fix cards one at a time with a branch name and SHA; never bulk-edit statuses.

## 9. Release, staging and migrations

Unchanged and not weakened: Babin applies migrations to live after the backup, after a staging rehearsal and with real
nine-role and RLS tests; rollback is written first; a PR that passes does not authorize a deploy or a migration. The
release HOLD stands until the documented gates are met. Staging that costs money needs its own approval.

When a rule is missing: record `TODO(decision)`, add it to [`OPEN_DECISIONS.md`](OPEN_DECISIONS.md), index it in `PLAN.md`
§4.2, and work on something unblocked. A draft ruling is labelled **PROPOSAL — NOT YET APPROVED**, never presented as approved.

## 10. Keeping this honest

`node scripts/check-rule-consistency.mjs` (read-only, no dependencies) checks three things: the 15 B/N rows in
`PERMISSIONS.md` §15 are identical in `CLAUDE.md`; every command in `scripts/run-gates.mjs` appears in the gate list in
`docs/plans/README.md` (and every `npm run` gate is named in `AGENTS.md`); and the relative links in this file and the
audit resolve. It is not part of `ci.yml` or `npm run gates`.

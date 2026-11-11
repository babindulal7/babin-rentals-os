> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Evidence Date:** 2026-11-04 (Asia/Kathmandu)
> **Status:** POINT-IN-TIME RECORD — re-run the checks before relying on any line number or count
>
> This is a dated measurement of how the repository's rules disagree with each other and with what
> actually runs. It does not override [`docs/PERMISSIONS.md`](../PERMISSIONS.md), a newer ruling, or fresh
> gate output. Current guidance is [`docs/AGENT_WORKFLOW.md`](../AGENT_WORKFLOW.md).

# Rule collision audit — 4 Nov 2026

**Evidence base:** `origin/main` = `c5902fbc924d5523fbf5d2b4192dd7d44f79180d` (fetched 2026-11-04; identical to the
reference point named in the task). Every `file:line` below is against that commit unless it names a branch.
This audit changed no rule; it records them.

## 0. What could and could not be checked

| Evidence source | Result |
|---|---|
| Local git (`origin/main` and 143 remote branches) | Read in full; used for every line citation |
| The self-hosted runner's own diagnostic logs on the owner's PC (79 jobs at the last refresh) | Read; run IDs, SHAs, events, results and failing steps below come from here |
| GitHub web/API (PR list, issues, Actions UI, workflow enabled state, branch protection, auto-merge) | **UNVERIFIED.** `gh` is not logged in and the in-app browser is not signed in (the private repo returns 404). No credentials were requested. PR numbers (#69, #77, #83) are matched to branches by content and by the runner's `refs/pull/N/merge` entries, not read from GitHub |
| Ignored local agent files | Inventoried by name and size only; no contents copied (section 7) |

## 1. Baseline

| Item | Value |
|---|---|
| Edit worktree | `docs/rules-consolidation-20261104`, created from `origin/main` @ `c5902fbc`, clean at creation |
| Other worktrees | 44 folders under `.claude/worktrees`, plus worktrees on the Desktop and in a Codex home. At least 7 of them, and the main checkout, have uncommitted changes (the listing was truncated by the tool). **None was touched** |
| Remote branches not merged into `main` | 118 of 143 |
| Branches that rewrite files this PR also edits | `docs/owner-rulings-2026-11-02` (PLAN.md, BABIN_ACTIONS.md, OPEN_DECISIONS.md, the T3 card, a new rulings file), `perf/ci-one-run-per-pr-offline-install` (ci.yml only), `fix/main-green-20261103` (Header.tsx, ScreenLock.tsx, a test, PROGRESS.md) |
| Latest rulings file merged on `main` | `RULINGS-2026-11-01.md`. `RULINGS-2026-11-02-OWNER.md` exists only on the owner-rulings branch (unmerged) |

## 2. Result in one table

| Status | Rows |
|---|---|
| CONFIRMED collision or stale instruction | C1 C2 C3 C4 C5 C6 C7 C8 C9 X1 X2 (11) |
| NEEDS OWNER DECISION (also shown on rows above) | C1 policy wording · C7 cut-over timeline · C11 business figures (3) |
| NOT A CONFLICT | C10 · X3 · X4 (3) |
| LOCAL-ONLY (no conflict found) | persona packs and user-level rules inside C9 (1) |
| UNVERIFIED | GitHub-side state: workflow enabled, auto-merge, branch protection, PR and issue contents (1) |

## 3. Conflict matrix

`A` and `B` are the two sources that disagree. "Actual behavior" is what runs or exists, not what a document says.

| ID | Topic | Source A | Source B / evidence | Actual behavior | Risk | Recommended single rule | Status |
|---|---|---|---|---|---|---|---|
| C1 | CI off vs CI running | `AGENTS.md:10,39`; `CLAUDE.md:35`; `PLAN.md:10,81,110,267,309`; `docs/CURRENT_STATE.md:10-12`; `docs/plans/README.md:63`; `docs/plans/BABIN_ACTIONS.md:14-15`; `T0_REPO_HYGIENE.md:109-116`; W75 `RULINGS-2026-10-26-workflow.md:161` | `.github/workflows/ci.yml:7-12` triggers on push, pull_request and workflow_dispatch; `ci.yml:29` runs on `[self-hosted, Windows, X64]`; the runner executed 79 jobs (section 4) | CI is enabled and running. 63 of 79 jobs failed, 11 passed. The unchecked owner task "Disable the GitHub CI workflow" (`BABIN_ACTIONS.md:14`) was evidently not done | An agent reading `AGENTS.md:39` believes CI is only a reference list and may skip the full gate list | Keep W75 as the historical 26 Oct decision. Current text: CI runs on the owner's self-hosted runner; the local `npm run gates` run is the pre-push check; a complete CI run on the **same head** is the merge-readiness evidence where it is available. **PROPOSAL, NOT YET APPROVED** | CONFIRMED · policy NEEDS OWNER DECISION |
| C2 | Who may edit or push | `CLAUDE.md:32-34`, `AGENTS.md:14`, `PLAN.md:242-244`, `docs/plans/README.md:32-33` (W74: a cloud Claude chat is read-only, never pushes) | `docs/PERMISSIONS.md:81,741` and `CLAUDE.md:69` (Claude Code **or a chat session** may make any change needed to resolve a conflict, "in a migration file") | Both are in force. One is authority to **decide**, the other is the **ability to push**; they were written on 7 Sep and 26 Oct and nothing says which governs a given session. Local Claude Code sessions already push branches | A cloud session could read §15 as permission to push; a local session could read W74 as a ban on its own branch | Scope, do not erase: §15 governs what may be decided; W74 and the connector's permissions govern whether a session may write to GitHub. Local Claude Code in an authorized worktree: new branches and draft PRs, never `main`, never merge. Cloud chat: read-only unless the owner says otherwise | CONFIRMED |
| C3 | Authority hierarchies | `docs/00_READ_FIRST.md:9-22` (10 levels; Foundation 9th, below PLAN.md) | `AGENTS.md:7` and `CLAUDE.md:56` ("Foundation wins"); `CLAUDE.md:109-120` (6 levels, cites `MASTER.md`); `docs/PERMISSIONS.md:75` (permissions supersede Foundation §08) | Four orderings. `MASTER.md` is not tracked in the repo. "Foundation wins" contradicts both `00_READ_FIRST.md` and `PERMISSIONS.md:75` | A reader can resolve the same conflict four ways | One topic-sensitive rule: who may do what → `PERMISSIONS.md`, stricter wins (B-1); business choices → newest explicit owner ruling; invariants → `PRODUCT_RULES.md`; observed behavior → code plus freshly run gates; Foundation only for domain concepts and never over security or a ruling. Dated audits never override current evidence | CONFIRMED |
| C4 | Verification contract | `docs/plans/README.md:72-89` (16 commands) and `AGENTS.md:39` (a 4-step "order" plus a 15-item list) | `ci.yml:56-149` (17 commands); `scripts/run-gates.mjs:15-33`, which hard-fails on any drift from `ci.yml` (`:39-57`) | CI and `npm run gates` are identical and ordered (guard-enforced). Both doc lists **omit `test:local-api-guards`**, which CI and `gates` run. `README.md:65` still treats T0-10 and T0-11 as unmerged though they merged (PRs #64, #65) | An agent following the doc skips a gate CI enforces | One executable gate (`npm run gates`, full) and one hosted gate (`ci.yml`); quick = skips coverage only and is not a release pass. Docs link to the mapping in `AGENT_WORKFLOW.md` instead of keeping a third list | CONFIRMED |
| C5 | Duplicate runs and runner contention | `ci.yml:7-10` push `**` plus pull_request; `ci.yml:16-18` concurrency `ci-${{ github.ref }}` | Runner log: push run `41581943444` (`24b2dc5c`) and PR run `41581948902` (`fd826cd3`) both ran the full suite on the same content; 29 PR runs and 47 push runs on one desktop | A push and its PR have different `github.ref` values, so they never cancel each other | Queueing on one machine; a stalled install cancelled a PR run after 2h42m (`41545398265`) | Recommend a **separate** CI PR. The existing candidate (`perf/ci-one-run-per-pr-offline-install`, likely #77) keeps the fork guard, dispatch, permissions and runner labels, but running the real `assertMatchesCi` against its `ci.yml` **fails** ("expected npm ci setup before the verification gates"), so `npm run gates` would exit 2 until `run-gates.mjs` is updated in the same PR | CONFIRMED |
| C6 | "Done" vs merged | `docs/plans/README.md:46` (set `done` only when Babin merges) | Cards: T8-01 "done — awaiting merge" (`T8_MEMBERSHIP_CREW.md:25`); T2-07 (`T2_FLOOR.md:221`), T2-08 (`:233`), T4-09 (`T4_SHARED_TOOLS.md:160`), T8-06 (`T8_MEMBERSHIP_CREW.md:86`), T4-04 (`:65`), T4-05 (`:78`) are marked done while their branch has commits not on `main`. Opposite case: T0-10 (`T0_REPO_HYGIENE.md:122`) and T0-11 (`:139`) say `doing` but #64 and #65 are merged | 154 cards: 41 done, 108 todo, 4 doing, 1 written. 10 card/branch pairs say done with an unmerged branch (patch-id check) | A readiness count inflates | The six-state model in `AGENT_WORKFLOW.md`. Fix cards one at a time with a SHA; do not bulk-edit. For T2-07, T2-08, T4-09 and T8-06, whether the feature reached `main` by another route is **UNVERIFIED**; T4-07's card is consistent (`34e58b8b`) | CONFIRMED · T8-01, T0-10, T0-11 corrected in this PR (evidence in section 6) · others UNVERIFIED |
| C7 | Booqable deadline | `PLAN.md:233`; `BABIN_ACTIONS.md:130`; `T9_CUTOVER.md:11,20,107`; merged ruling S8 `RULINGS-2026-10-26.md:27` ("20 Mar 2027") | `PLAN.md:42,225` already say 18 Feb 2027 and cite S8; the unmerged `RULINGS-2026-11-02-OWNER.md` records the owner's 18 Feb correction | `main` contradicts itself. The 18 Feb date has **no merged ruling behind it**; `PLAN.md:42` cites S8, which says 20 Mar | Cancelling or planning on the wrong date | Planning constraint is 18 Feb 2027 (owner statement; unmerged ruling on the owner-rulings branch). S8 stays verbatim as history. Do **not** cancel anything; verify the billing account first. `BABIN_ACTIONS.md` is fixed by the owner-rulings branch, so this PR does not touch it | CONFIRMED · cut-over timeline NEEDS OWNER DECISION |
| C8 | Migration numbers | `docs/plans/MIGRATION_LEDGER.md:15` ("Next free: 0210") | 207 files on `main`, highest `0209`; two files numbered `0188` (`0188_smart_reservation_holds.sql`, `0188_staff_renting_gear.sql`); ledger row 0188 lists only the first (`:29`); ledger row 0200 says `claimed` (`:41`) though `0200_draft_at_confirm_and_resync.sql` is on `main` | "Next free 0210" is correct. The ledger lags the files. 19 unmerged-branch files reuse numbers already on `main`; the only current one is `fix/t4-09-route-branch-hardening-0209`, which adds a second `0209` | A duplicate number breaks an ordered apply | Audit only: no renumbering. Ledger status follows the file; the later merge renumbers (ledger rule 4, `:11-12`) | CONFIRMED |
| C9 | Ignored local rules vs tracked rules | `.gitignore:24,25,45,86,87` ignores `.cursor/`, `.opencode/`, `.claude/`, `.specify/`; `AGENTS.md:41,55` say `supabase db push` is "denied in `opencode.jsonc`" | `opencode.jsonc` was never committed and is absent from the checkout; `.agents/skills/**` (172 files, 7 design skills) **is** tracked | The deny list N-5 is said to rely on is not in the repository, and `.claude/` holds only `launch.json`. `.cursor/rules` (282 persona files, none `alwaysApply: true`) and `.opencode/agents` (about 283) are generic personas; `.opencode/goals` has 2 session JSONs | N-5 is enforced by instruction text, not by a shipped control | Tracked portable policy in `docs/AGENT_WORKFLOW.md`; do not copy ignored configs into Git. Whether a user-level deny list exists elsewhere is UNVERIFIED | CONFIRMED (dangling reference) · rest LOCAL-ONLY |
| C10 | Can any rule lead to deploy or migrate? | `AGENTS.md:48,55`; `CLAUDE.md:30,102` (N-5) | No tracked rule says "apply or deploy when green" | N-5 and the staging and backup rules stand; `AGENTS.md:48` is explicitly local-only | See C9: the mechanical deny is not shipped | Keep N-5 word-for-word; the release HOLD stands | NOT A CONFLICT |
| C11 | Business figures vs newer owner rulings | `PLAN.md:191` (O-10 "until then no fee is suggested"), `:196` (O-15 "Rs 3,500 per valley zone"), `:201` (O-20 Elite negotiated); `T4_SHARED_TOOLS.md:111,114,130` | Unmerged `RULINGS-2026-11-02-OWNER.md`: cancellation Option A, scooter 150/250, Elite fixed fee | The older figures remain on `main` until that branch merges | Wrong default shown to an implementer | No edit here. Merge the owner-rulings branch; the figures stay NEEDS OWNER DECISION until then. Cancellation VAT, invoice timing (O-17) and the van fees are still open | NEEDS OWNER DECISION |
| X1 | `main` itself is red | Latest `main` push run `41623069673` (`c5902fbc`) | `src/modules/auth/ScreenLock.tsx:288` still calls `window.confirm`; `c5902fbc` fixed only `Header.tsx` | Fails at "Page shell design invariants". `fix/main-green-20261103` now conflicts with `c5902fbc` on `Header.tsx` | Every branch inherits the red | Not a rules edit. The one-file fix (`48c372dd`, run `41785629736`, all 22 steps green) is merged into this branch so its CI can pass on its own, and it is also a separate branch `fix/screenlock-native-confirm-20261104`. It reaches `main` only when Babin merges one of them | CONFIRMED on `main` · fix included here |
| X2 | Stale header in the workflow | `ci.yml:3-6` ("the four steps") | `ci.yml:56-149` has 17 commands | Cosmetic | Misleads a reader | Left untouched: `ci.yml` is out of scope for this PR | CONFIRMED |
| X3 | Two audit folders | `00_READ_FIRST.md:64` lists `docs/audits/` | `docs/audit/` (files 01 to 05) also exists | Both are historical | Low | Note only | NOT A CONFLICT |
| X4 | Is the §15 mirror in sync? | `docs/PERMISSIONS.md:754-780` | `CLAUDE.md:82-105` | All 15 rows (B-1 to B-7, N-1 to N-8) are byte-identical; only headings differ | None | Keep word-for-word; `scripts/check-rule-consistency.mjs` now checks it | NOT A CONFLICT |

## 4. CI evidence (runner log, not GitHub's UI)

79 jobs: 11 succeeded, 63 failed, 5 cancelled; 49 push, 29 pull_request, 1 workflow_dispatch (refreshed after the ScreenLock fix run).

| Failing step (63 failures) | Count |
|---|---|
| Typecheck | 42 |
| Page shell design invariants (`lint:shell`) | 12 |
| Test (offline mock backend) | 4 |
| Lint source | 3 |
| Server contracts · "Preflight · page shell design invariants" | 1 each |

Pushes to `main`: `a4372434` failed at lint:shell · `39b053d0` failed at Typecheck (and again on a manual dispatch) · `34e58b8b` failed at lint:shell · `c5902fbc` failed at lint:shell. All 11 successes were on branches or PR-merge refs (for example `41541633909`, `41581943444`, PR-merge run `41581948902`, and `41785629736` for the ScreenLock fix at `48c372dd`); **none was a push to `main`**. The docs branch's own first run (`41716047570`, `9bede5f0`) failed at `lint:shell` for the inherited `ScreenLock.tsx:288` reason, before the fix was merged into it. Most Typecheck failures are branches built on a `main` that was itself red, so a complete run on the same head is only meaningful on a fresh base.

## 5. Gate mapping (read-only)

| `ci.yml` command (line) | `npm run gates` label | In `docs/plans/README.md` list | In `AGENTS.md:39` list |
|---|---|---|---|
| `npm run typecheck` (59) | Typecheck | yes | yes |
| `npm run lint` (63) | Lint source | yes | yes |
| `npm run test:local-api-guards` (68) | Local API verification safety guards | **no** | **no** |
| `npm run test` (73) | Test (offline mock backend) | yes | yes |
| `npm run check:pglite` (80) | Migrations build from scratch | yes | yes |
| `node scripts/test-booking-financial-integrity.mjs` (83) | Booking and invoice financial integrity | yes | yes |
| `npm run check:security` (96) | Authenticated security and branch-Reset regressions | yes | yes |
| `npm run check:lifecycle` (99) | Lifecycle | yes | yes |
| `npm run test:server-contracts` (102) | Record sections, equipment lifecycle and membership RPC contracts | yes | yes |
| `npm run test:partial-return` (105) | Verified partial serial and quantity Return reservations | yes | yes |
| `npm run lint:progress` (110) | PROGRESS.md carries Completion and Remaining | yes | yes |
| `node --test scripts/test-receipt.test.mjs` (113) | Completion receipt integrity | yes | yes |
| `npm run lint:shell` (117) | Page shell design invariants | yes | yes |
| `npm run lint:ui-copy` (120) | Staff UI contains no developer notes | yes | yes |
| `npm run check:contrast` (133) | Contrast (WCAG AA, light + dark) | yes | yes |
| `npm run build` (144) | Build | yes | yes |
| `npm run test:coverage` (149) | Coverage (offline mock backend) | yes | "before each live batch" |

## 6. Task-card status mismatches (evidence, not edits)

| Card | Text | Evidence | Verdict |
|---|---|---|---|
| T8-01 | "done — awaiting merge" (`T8_MEMBERSHIP_CREW.md:25`) | `0195_load_membership_plans.sql` reached `main` with `0370cb23` (1 Nov); the branch has 2 commits not on `main` by patch-id | **Corrected in this PR** to "merged on `main` 1 Nov (`0370cb23`); the lane branch is superseded" |
| T0-10, T0-11 | "doing … pending" (`T0_REPO_HYGIENE.md:122,139`) | PRs #64 (`673ef99a`) and #65 (`144e8d0f`) are merged 2 Nov; `scripts/run-tests.mjs` and `scripts/run-gates.mjs` are on `main` | **Corrected in this PR** to done, with those SHAs |
| T0-09 | `todo`, owner disables the workflow (`T0_REPO_HYGIENE.md:109-116`) | The workflow is enabled and running | Overtaken by events; owner decision (C1) |
| T2-07, T2-08, T4-09, T8-06 | "done" | `fix/*` branches carry 5, 4, 4 and 4 commits not on `main` (patch-id) | UNVERIFIED whether the feature is on `main` another way |
| T4-04, T4-05 | "done" | `0185_team_notes.sql` and `0186_shift_handovers.sql` are on `main`; the lane-b branches have 2 commits each not on `main` | Likely landed another way; UNVERIFIED |
| T4-07 | "done — closed on `main` 3 Nov" | `34e58b8b` on `main`; the older `fix/T4-07…0205` branch (16 commits) is not merged | Consistent; branch superseded |

## 7. Ignored and local-only inventory (no contents copied)

| Location (relative) | What it holds | Steers an agent here? |
|---|---|---|
| `.claude/` | `launch.json` and the worktree folders. No `settings.json` | No project rules |
| `.cursor/rules/*.mdc` | 282 generic persona files; none `alwaysApply: true` | Only if invoked by hand |
| `.opencode/agents/` | about 283 persona files | Only if invoked |
| `.opencode/goals/`, `goal-locks/` | 2 session goal files (28 Oct, 31 Oct), 1 lock | Session state, not rules |
| `opencode.jsonc`, `CLAUDE.local.md`, `GEMINI.md`, `.specify/`, `.mcp.json` | Absent | n/a |
| Tracked `.agents/skills/**` | 172 files, design skills (brand, design-system, slides, ui-styling, ui-ux-pro-max and others) | Yes if loaded; none states a Babin product rule |
| User-level Claude rules (outside the repo, **not edited**) | Generic rule packs (agents, testing, git workflow, security) | Yes for that user; not tracked, so not portable |

## 8. Owner decisions still open (none invented here)

1. **CI policy wording (C1):** is "CI runs on the self-hosted runner; a complete same-head run blocks merge where available" the rule? Until you say yes it is a proposal in `AGENT_WORKFLOW.md`.
2. **Booqable cut-over timeline (C7):** a safe last-rental date before 18 Feb 2027; do not cancel before the billing terms are checked.
3. **Merge the owner-rulings branch** so C7 and C11 stop contradicting `main`.
4. **Business figures (C11):** accountant answers on VAT timing (O-17), cancellation-fee VAT, non-VAT classification, van fees, the Elite fee.
5. **Auto-merge and branch protection:** PR #70 merged one minute after its last push, before CI finished; whether auto-merge is on is UNVERIFIED from here.

## 9. Left untouched on purpose

`.github/workflows/ci.yml` · `docs/PERMISSIONS.md` (§15 byte-for-byte) · `CLAUDE.md` §15 · `docs/plans/BABIN_ACTIONS.md` (the owner-rulings branch edits the same lines) · `docs/plans/T9_CUTOVER.md` and `PLAN.md:233` (cut-over dates need a decision) · every migration and ledger row · every card status except the three corrected in section 6 · `RULINGS-*.md` (historical, including W74, W75 and S8).

## 10. How this audit was produced

Commands were read-only: `git fetch origin --prune`, `git ls-tree`, `git show`, `git grep`, `git cherry`, `git merge-base --is-ancestor`, `git diff`, and two local scripts that read the runner's diagnostic logs and the task cards. A first scan reported `ci.yml` "absent" on `main`; that was a Git-Bash path-conversion artifact, and it was re-verified present at every commit from `a4372434` to `c5902fbc`. No push to `main`, merge, deploy, migration, credential or billing action was taken.

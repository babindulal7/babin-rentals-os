# T0 — Repo & process hygiene


**Goal:** before feature work fans out into three lanes, make the repository safe for parallel
agents and make its documents tell the truth. **Lane A · Codex-1 + Babin · week 1 (by 1 Nov 2026 · 16 Kartik 2083).**

**Exit:** one roadmap (PLAN.md) merged; open PRs and branches triaged; `npm test` passes on a
fresh clone without hand-set environment; root clutter archived; stale "current" claims fixed.

---

### T0-01 · Merge the plan pack            status: done (PR #29, merged 26 Oct 2026 01:22 NPT) · size: S · lane A
**What** — Merge `PLAN.md`, `docs/plans/`, `RULINGS-2026-10-26.md` and the pointer updates.
**Why** — S2–S4.
**Where** — this PR.
**Database** — none.
**Done when** — 1) PR merged to `main`; 2) `CLAUDE.md`, `AGENTS.md`, `docs/00_READ_FIRST.md` point
at the new PLAN.md; 3) `npm run lint:progress` exits 0.
**Needs** — Babin's review of the PR.

### T0-02 · Test runner works on a fresh clone            status: done (26 Oct, `3fca220`) · size: S · lane A
**What** — `scripts/run-tests.mjs` sets `VITE_DATA_SOURCE=mock` when neither it nor
`VITE_SUPABASE_URL` is set, and prints which data source it used. Same for `test:coverage`.
**Why** — On 26 Oct a plain `npx vitest run` on a fresh clone failed **132 of 463 files** on
"Missing VITE_SUPABASE_URL", while the same suite passes in CI because CI sets the variable. A red
suite that is really a missing variable wastes every new session's first hour.
**Where** — `scripts/run-tests.mjs`, `AGENTS.md` "Commands".
**Database** — none.
**Done when** — 1) `rm .env.local; npm test` passes; 2) with `VITE_SUPABASE_URL` set, the runner
does **not** force mock; 3) receipt records the data source.
**Needs** — none.

### T0-03 · Open pull request triage            status: done — PR #165 merged; all open PRs resolved and verified on main (HOST_OPS_AND_SECURITY_ACCEPTANCE_2026-11-22.md) · size: M · Babin + Codex-1 (local)
**30 Oct triage** — [Evidence and reconciliation queue](../verification/PR_TRIAGE_2026-10-30.md).
Closed #24 (fix implemented independently on main) and #25 (history preserved by #26).
Retained #7/#23/#26 for reconciliation under this card; #30 belongs to T2-15 and
#31 to T2-09 (GitHub confirms #31 merged at closeout). Rebase/integration of retained changes is still pending; this card
stays doing. The original nine-PR list below is historical.
**What** — For each open PR decide: merged elsewhere → close with a pointer; superseded → close
with the superseding commit; still needed → rebase onto `main` and assign to a card.
**Why** — Nine open PRs (#6, #7, #17, #19, #23, #24, #25, #26, #28) carry work that may or may not
be on `main`. Example: #24 (daily-closing approval) was integrated on 24 Oct per PROGRESS.md.
**Where** — GitHub; record the outcome in `PROGRESS.md`.
**Database** — none.
**Done when** — 1) every PR is closed or linked to a card; 2) for each closed PR, the diff that
mattered is shown to exist on `main` (file + line), not assumed. Claude does the reading and sends
the list (W74 — Claude never closes or pushes); Babin or a local agent closes the PRs.
**Needs** — none.

### T0-04 · Branch triage            status: doing — 345 remote branch snapshot, 37 zero-ahead candidates verified, owner approval for deletion pending · size: M · Babin + Codex-1 (local)
**What** — An updated [read-only 21 Nov 2026 inventory](../verification/REMOTE_BRANCH_AUDIT_2026-11-21.md) found **345 remote branches including main**; 37 older candidates are verified as exactly zero ahead, and 10 branches head open PRs. Classification of all other branches is not yet complete. Never execute cleanup based on the outdated ~90-branch estimate. For each remote branch: inspect commits not on `main` (`git log --oneline main..origin/<branch>`). Classify as active PR, verified-merged, unmerged, protected/recovery, or unresolved. **Do not delete any branch or push archive tags** without a specific owner-approved cleanup list, independently verified SHA and safe retention plan. Proposed archival tags and deletions must be documented first; execution is a separate owner-gated action.
**Why** — Branch sprawl hides unmerged work; tags keep it (Law 3 spirit) without the noise.
**Where** — git remote; `docs/archive/BRANCHES_2026-10.md`.
**Database** — none.
**Done when** — 1) complete inventory classifies all remote branches against a fresh `main` and open-PR list; 2) owner explicitly authorizes each proposed archival/deletion batch; 3) any unmerged branch to delete has a verified durable archive reference and independent reviewer receipt; 4) only after authorized cleanup, inspect `git ls-remote --heads origin` to confirm intended remaining branches. **This audit-only PR satisfies neither owner approval nor deletion completion.**
**Needs** — Babin's OK to delete branches (GitHub settings may protect some).

### T0-05 · Documents tell the truth            status: done (26 Oct, `3fca220`) · size: S · lane A
**What** — Already done in the plan PR: banners on `docs/REMAINING_WORK.md` and
`docs/CURRENT_STATE.md` pointing at PLAN.md; `docs/OPEN_DECISIONS.md` maps every entry closed by
RULINGS-2026-10-26; the stale "BS table stops at 2083" corrected (it covers 2078–2095). Still to do:
1) `README.md` — move the "16 Aug 2026" status table and the token-drift section under a
"Historical" heading and put a three-line current status at the top that points at PLAN.md and
CURRENT_STATE.md; 2) `docs/WORKFLOWS.md`, `docs/ARCHITECTURE.md`, `docs/UI_UX_RULES.md` — read once
for present-tense claims older than 20 Oct and date or correct them.
**Why** — 00_READ_FIRST Rules 3–4: no stale count presented as current.
**Where** — the documents named.
**Database** — none.
**Done when** — no document in the 00_READ_FIRST "Active Truth" rows states a count or status
that the 26 Oct measurement contradicts.
**Needs** — T0-01.

### T0-06 · Archive root clutter            status: done · size: S · lane A
**What** — Move generated or one-off files out of the repository root into `docs/archive/`:
`repomix-output.xml` (1.2 MB), `repomix-part2.xml` (0.8 MB), `err.txt` (empty),
`.coss-search-verify.mjs`, and dated reports that are not authorities
(`AUDIT_WORKTREE_PROGRESS.md`, `BEFORE_AFTER_VISUAL_MATRIX.md`, `SHELL_PHASE1_*.md`,
`PREMIUM_*.md`, `PRESET_MANIFEST.md`, `CLEAN_SOURCE_MANIFEST.md`, `LOCAL_IMPLEMENTATION_LOG.md`),
plus the files added to the root on 26 Oct (`31552cd`): `UX_AUDIT_LOCAL.md`, `UX_REVIEW_LOCAL.md`, and the
root copy of `BABIN_RENTALS_MODERN_WEB_DESIGN_KNOWLEDGE_ATLAS.md` (identical to the one in `docs/`).
Fix every link that pointed at them. Add `repomix-*.xml` to `.gitignore`.
**Why** — The root should show what an agent must read: README, CLAUDE, AGENTS, PLAN, PROGRESS,
RULINGS. Nothing is deleted (moved, Law 3 spirit).
**Where** — repository root; `.gitignore`.
**Database** — none.
**Done when** — 1) root holds only config, the governance files and RULINGS; 2) a link checker over
`*.md` finds no broken relative link introduced by the move.
**Needs** — T0-03 (some PRs may touch those files).

### T0-07 · Retire the three dead inspection stubs            status: done (26 Oct, `3fca220`) · size: S · lane A
**What** — Move `src/actions/inspections/{startInspection,passInspection,failInspection}.ts` (and
their tests, if any) to `src/archive/actions/inspections/`. Inspection lives inside the Return
workspace; nothing calls these three.
**Why** — They are the only unimplemented actions; leaving them makes the Backend counter read
55/58 forever.
**Where** — `src/actions/inspections/`, `src/actions/index.ts` (if it re-exports them),
`EVENT_TYPES` (keep the event names).
**Database** — none.
**Done when** — 1) `npm run completion` shows Backend 55/55; 2) typecheck and suite green;
3) grep finds no import of the moved files.
**Needs** — none.

### T0-08 · Lanes and worktrees in AGENTS.md            status: done (26 Oct — AGENTS.md on main `3fca220`; lanes, agents and local gates added by the workflow package) · size: S · lane A
**What** — Add PLAN.md §6 (lanes, agents, worktrees, branch names, migration ledger, local gates)
to `AGENTS.md` so Codex and Gemini follow the same protocol.
**Why** — Several agents edited one checkout on 21–25 Oct and invalidated each other's receipts.
**Where** — `AGENTS.md`.
**Database** — none.
**Done when** — AGENTS.md has a "Parallel work" section that matches PLAN.md §6.
**Needs** — T0-01.

### T0-09 · Active CI + independent local gates            status: acceptance_pending — PR #289 merged; exact-head CI passes, but main has no branch protection or ruleset enforcing the required check (checked 22 Nov 2026: GitHub reports Branch not protected); owner action: require typecheck · test · build on main · size: S · Babin + agents
**What** — Reconcile superseded Oct 26 W75 `keep CI off` guidance with Babin's later Nov 9 R-9.9 ruling: **keep GitHub CI enabled**. Every same-repository PR runs required CI checks; push to `main` runs main checks, and manual dispatch is available. Self-hosted Mac/Windows runners are capacity constraints, **not** reasons to disable verification. Agents must run local gates (see `AGENTS.md` and `npm run gates`) and record results before proposing a merge; GitHub's required current-head CI must also pass. Never merge on stale-head or merely queued/running/skipped results, and never silently disable required checks or required main builds.
**Why** — The historical CI-disabled/billing workaround is outdated. An actual PR-head CI run was observed in progress 21 Nov 2026; both local verification and independent GitHub checks are necessary for safe production work.
**Where** — `.github/workflows/ci.yml`, `AGENTS.md` Verification order, GitHub Actions, and [`T0-09_CI_POLICY_RECONCILIATION_2026-11-21.md`](../verification/T0-09_CI_POLICY_RECONCILIATION_2026-11-21.md).
**Database** — none; policy/documentation only, no workflow setting or remote mutation.
**Done when** — 1) exact-head required CI runs on an eligible current code PR and returns green, not merely queued; 2) required `main` job(s) pass on the corresponding merged SHA; 3) local verification outputs are recorded without leaked credentials; 4) workflow state/runners verified with no disabled required checks; 5) Babin accepts the current enabled-CI policy and the old W75 card is recognized as superseded, not re-enabled.
**Needs** — current CI run completion, owner confirmation on any GitHub billing/branch protection control outside this documentation PR.

### T0-10 · Tests never run with live settings            status: done — merged on `main` 2 Nov 2026 (#64, `673ef99a`); status corrected 4 Nov after the rule audit · size: S · lane A · [go-live]
**What** — Since T0-02 (`3fca220`), `scripts/run-tests.mjs` picks mock data only when no
`VITE_SUPABASE_URL` is found — and it reads `.env.local`. On a computer that runs the app against
live (a `.env.local` with the live URL), `npm test` therefore runs with **live** settings, and Vitest
loads the same file into `import.meta.env`. Tests must never depend on that file. Make the runner use
mock data unless it is started with `--live` (print the data source either way), so the gate is just
`npm test` on every computer and every shell (PowerShell has no `VAR=value cmd` form). Until this
ships, run `VITE_DATA_SOURCE=mock npm test` (Git Bash) or `$env:VITE_DATA_SOURCE='mock'; npm test`
(PowerShell).
**Why** — Claude's review of `3fca220`; T1-04 (live still has six business functions anyone can call
without signing in until batch 0); B-1 (the safer default wins).
**Where** — `scripts/run-tests.mjs`; the gate lines in `AGENTS.md`, `docs/plans/README.md`, `PLAN.md` §6.
**Database** — none.
**Done when** — 1) with a `.env.local` holding a live URL, `npm test` prints "data source=mock" and
passes; 2) `npm test -- --live` prints "data source=live"; 3) the docs show plain `npm test`.
**Needs** — none.

### T0-11 · One command for the local gate            status: done — merged on `main` 2 Nov 2026 (#65, `144e8d0f`); `npm run gates` and its CI drift guard are on `main`; status corrected 4 Nov after the rule audit · size: S · lane A · [go-live]
**What** — Add `npm run gates`: runs every step of `.github/workflows/ci.yml` in its order (the list
in `docs/plans/README.md`), with mock data for the tests, stops at the first red step, and ends with
a one-screen summary (step · pass/fail · time). `npm run gates -- --quick` skips coverage. Then the
docs, the prompts and the check-in say just `npm run gates`.
**Why** — W75 (CI off, local checks are the gate) and R-39 (fewest steps): on 26 Oct `3fca220`
reached `main` with `lint:ui-copy` red because that step was not in the short list people ran.
**Where** — `scripts/run-gates.mjs` (new), `package.json`, `AGENTS.md`, `docs/plans/README.md`,
`PLAN.md` §6.4.
**Database** — none.
**Done when** — 1) `npm run gates` on `main` runs the same steps as `ci.yml` and exits 0 only when all
pass; 2) a seeded UI-copy violation makes it stop at that step with the file and line; 3) works in Git
Bash and PowerShell.
**Needs** — T0-10.

### T0-12 · Resolve the 5 November rules and application conflicts            status: done — merged on main; migration 0225 and lifecycle step L63 verified; authority order harmonized (HOST_OPS_AND_SECURITY_ACCEPTANCE_2026-11-22.md) · size: L · lane A · [go-live]
**What** — Repair translation approval, whole-app activation and account language preferences; reconcile conflicting authority text, floor permission descriptions, task statuses/dependencies and current-state navigation.
**Why** — Babin requested every finding in the 5 Nov conflict audit fixed; his interactive answers establish ruling precedence, whole-app Nepali acceptance and owner decisions.
**Where** — `src/lib/i18n.ts`, language readiness/preference/glossary modules, auth/settings integration, first-run scheduling in App.tsx/useFirstRun.ts, Owner glossary Settings control and action, review scripts/tests, `src/i18n/`, `AGENTS.md`, `CLAUDE.md`, `docs/00_READ_FIRST.md`, `docs/PERMISSIONS.md`, `PLAN.md`, affected task cards, current-state/navigation docs and verification report. Shared files authorized here: `PLAN.md`, `docs/PERMISSIONS.md`, `src/lib/rbac.ts`, `src/actions/core.ts`, `src/types/database.ts` for the Owner-only glossary capability/contract. No money-engine changes.
**Database** — account language uses self-owned Auth metadata. Owner-approved shared glossary revisions require migration 0225, claimed in the ledger before SQL. Append-only revisions, idempotent Owner-only RPC, staff-only text reads and local lifecycle/permission proof. C-7 authorizes only this migration after backup and combined-source verification.
**Done when** — draft exports remain pending, import records explicit reviewer/date and exact text; language activation requires all module conversions/reviews/layout checks and owner approval; user choices follow their own account; docs use one authority/status contract; regression tests and local gates pass; screen checks recorded; Babin merges. Unperformed owner/device acceptance remains pending.
**Needs** — the three original owner answers, plus Owner-only immediate approved glossary editing, all received 5 Nov 2026.

# T0 — Repo & process hygiene

**Goal:** before feature work fans out into three lanes, make the repository safe for parallel
agents and make its documents tell the truth. **Lane A · week 1 (by 1 Nov 2026 · 16 Kartik 2083).**

**Exit:** one roadmap (PLAN.md) merged; open PRs and branches triaged; `npm test` passes on a
fresh clone without hand-set environment; root clutter archived; stale "current" claims fixed.

---

### T0-01 · Merge the plan pack            status: done · size: S · lane A
**What** — Merge `PLAN.md`, `docs/plans/`, `RULINGS-2026-10-26.md` and the pointer updates.
**Why** — S2–S4.
**Where** — this PR.
**Database** — none.
**Done when** — 1) PR merged to `main`; 2) `CLAUDE.md`, `AGENTS.md`, `docs/00_READ_FIRST.md` point
at the new PLAN.md; 3) `npm run lint:progress` exits 0.
**Needs** — Babin's review of the PR.

### T0-02 · Test runner works on a fresh clone            status: done · size: S · lane A
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

### T0-03 · Open pull request triage            status: todo · size: M · lane A
**What** — For each open PR decide: merged elsewhere → close with a pointer; superseded → close
with the superseding commit; still needed → rebase onto `main` and assign to a card.
**Why** — Nine open PRs (#6, #7, #17, #19, #23, #24, #25, #26, #28) carry work that may or may not
be on `main`. Example: #24 (daily-closing approval) was integrated on 24 Oct per PROGRESS.md.
**Where** — GitHub; record the outcome in `PROGRESS.md`.
**Database** — none.
**Done when** — 1) every PR is closed or linked to a card; 2) for each closed PR, the diff that
mattered is shown to exist on `main` (file + line), not assumed.
**Needs** — none.

### T0-04 · Branch triage            status: todo · size: M · lane A
**What** — For each of the ~90 remote branches: list commits not on `main`
(`git log --oneline main..origin/<branch>`). Merged → delete the branch. Unmerged → tag it
`archive/<branch>` then delete the branch, and list the tags in `docs/archive/BRANCHES_2026-10.md`.
**Why** — Branch sprawl hides unmerged work; tags keep it (Law 3 spirit) without the noise.
**Where** — git remote; `docs/archive/BRANCHES_2026-10.md`.
**Database** — none.
**Done when** — 1) `git ls-remote --heads origin` lists only `main` and live lane branches;
2) every deleted unmerged branch has an `archive/` tag.
**Needs** — Babin's OK to delete branches (GitHub settings may protect some).

### T0-05 · Documents tell the truth            status: done · size: S · lane A
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

### T0-06 · Archive root clutter            status: todo · size: S · lane A
**What** — Move generated or one-off files out of the repository root into `docs/archive/`:
`repomix-output.xml` (1.2 MB), `repomix-part2.xml` (0.8 MB), `err.txt` (empty),
`.coss-search-verify.mjs`, and dated reports that are not authorities
(`AUDIT_WORKTREE_PROGRESS.md`, `BEFORE_AFTER_VISUAL_MATRIX.md`, `SHELL_PHASE1_*.md`,
`PREMIUM_*.md`, `PRESET_MANIFEST.md`, `CLEAN_SOURCE_MANIFEST.md`, `LOCAL_IMPLEMENTATION_LOG.md`).
Fix every link that pointed at them. Add `repomix-*.xml` to `.gitignore`.
**Why** — The root should show what an agent must read: README, CLAUDE, AGENTS, PLAN, PROGRESS,
RULINGS. Nothing is deleted (moved, Law 3 spirit).
**Where** — repository root; `.gitignore`.
**Database** — none.
**Done when** — 1) root holds only config, the governance files and RULINGS; 2) a link checker over
`*.md` finds no broken relative link introduced by the move.
**Needs** — T0-03 (some PRs may touch those files).

### T0-07 · Retire the three dead inspection stubs            status: done · size: S · lane A
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

### T0-08 · Lanes and worktrees in AGENTS.md            status: done · size: S · lane A
**What** — Add PLAN.md §6 (lanes, worktrees, branch names, migration ledger) to `AGENTS.md` so
non-Claude agents (Codex, Gemini, Antigravity) follow the same protocol.
**Why** — Several agents edited one checkout on 21–25 Oct and invalidated each other's receipts.
**Where** — `AGENTS.md`.
**Database** — none.
**Done when** — AGENTS.md has a "Parallel work" section that matches PLAN.md §6 word for word.
**Needs** — T0-01.

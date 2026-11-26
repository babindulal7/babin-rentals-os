# Antigravity handoff: what is on the local branch and what is not pushed

**Written:** 18 Nov 2026, from the worktree `C:\Users\use\Desktop\babin-rentals-os\.worktrees\tds-rulings`.
**Status:** written only. Nothing committed, nothing pushed. Babin decides when to push (CLAUDE.md: Babin merges; Antigravity builds locally).

## 1. Where the work is

| Branch | Local tip | Ahead of origin/main | On origin? | What it holds |
|---|---|---|---|---|
| `lane-b/tds-ledger-client-deduction` | `445575a3` | 13 commits | No | TDS ledger, client TDS recording screen, all TDS rulings and docs |
| `docs/tds-rulings-2026-11-17` | `3c3a17dc` | 7 commits | No | Earlier TDS ruling docs (R-17.x) |
| `docs/rulings-2026-11-09` | `3cf59d70` | 1 commit | No | Rulings 9 Nov |
| `docs/owner-rulings-2026-11-09` | `33d9ba5a` | 6 commits | No | Owner rulings 9 Nov |
| `fix/unit-tests-mock-env` | `8a312849` | 2 commits | Yes, same tip | Unit test mock fix; draft PR not opened |

**Important:** `lane-b/tds-ledger-client-deduction` is **not** descended from `origin/main`. The histories diverged, so it cannot fast-forward or merge cleanly into `main`. Resolve that before a PR (rebase onto current `main` or cherry-pick), with Babin's approval.

## 2. Commits on the TDS branch, newest first

- `445575a3` docs(decisions): van fee, Elite fee, payment buttons, document texts (R-18.4 to R-18.7)
- `8b0b7218` docs(finance): TDS once per invoice, crew direction, per-payout split (R-18.1 to R-18.3); ruling comment in `0240`; Gemini handoff added
- `a6eb8736` feat(finance): Client TDS recording and reversing screen
- `9bb60d85`, `34f66d79`, `7abf2cd1`: TDS ledger, client-deducted TDS, migration claim `0240`
- Older: `3c3a17dc` down to `c50423b2`, `8e47f260`, `8ad230a6`, `825fab14` (rulings and build card)

## 3. Uncommitted in the worktree (untracked)

- `docs/plans/ANTIGRAVITY_HANDOFF.md` (this file)
- Nothing else. The rest of the 18 Nov work is committed.

## 4. Rulings to know (all dated 17–18 Nov 2026)

- **R-17.1–R-17.5:** TDS rates and bases (client 1.5% before VAT; crew freelancer 15%; staff 1% is a separate income-tax line; supplier 1.5/15/15/1.5%).
- **R-18.1:** one client TDS deduction per invoice.
- **R-18.2:** crew freelancer TDS goes in `tds_ledger` as direction `Crew Deducted`.
- **R-18.3:** freelancer vs staff is chosen per crew payout (no profile flag).
- **R-18.4:** van delivery fee per zone is set later in Settings, empty until entered.
- **R-18.5:** Elite fee is negotiated per client (supersedes 2 Nov "fixed fee").
- **R-18.6:** payment buttons are four plus More (Card and Cheque under More). **Not built.**
- **R-18.7:** agreement terms and other texts are pasted or uploaded in Settings. Card: `docs/plans/SETTINGS_DOCUMENT_TEXTS_CARD.md`. **Not built.**

- **R-18.8:** no printer screen; documents print from the PDF directly.
- **R-18.9:** Owner and Admin may edit document texts in Settings (permission change with the code, B-3).
- **R-18.10:** issued documents keep the text they were issued with.

Full text: `RULINGS-2026-11-17.md` and `RULINGS-2026-11-18.md`.

*Update 19 Nov:* `CLAUDE.md` now says CI is a merge gate (R-9.9). Run the local gates before every push and verify the required checks on the PR head. This file was written before that change.

## 5. Build status

- **Built and checked locally:** migration `0240` (TDS ledger, client TDS), the client TDS screen (Booking Detail → Client TDS), lifecycle step L82.
- **Verified:** `check:pglite` 236/236 and `check:lifecycle` 74/74, re-run 18 Nov after a comment-only edit. Unit suite receipt is from 17 Nov (7243/7243); not re-run after the 18 Nov edits.
- **Not built:** supplier TDS (S3), crew payout TDS and staff 1% line (S4), accountant TDS report and IRD deposit tracking (S5), payment buttons (R-18.6), Settings document texts (R-18.7).
- **Next slice:** S3 supplier TDS. Full brief: `docs/plans/TDS_GEMINI_HANDOFF.md`.

## 6. Do not do without Babin

- **Do not apply `0228` or `0240` to any live Supabase project.** Babin applies them after the backup (N-5).
- **Do not push or merge** unless Babin asks. Do not open PRs without Babin's yes.
- **Do not commit or print credentials** (N-8). See section 7.

## 7. Credential issue to fix first

The `origin` remote URL in this worktree has a GitHub token embedded in it (`https://x-access-token:…@github.com/…`). That is a credential in plain text in `.git/config`. Ask Babin to:

1. Rotate that token in GitHub.
2. Change the remote to the plain URL `https://github.com/babindulal7/babin-rentals-os.git`.
3. Sign in with the GitHub CLI (`gh auth login`) or a credential helper, so no token sits in the URL.

Do not paste the token into any file, commit or message.

`gh` is **not** logged in on this machine, so no PR can be opened until that is done.

## 8. Open items for Babin (not for Antigravity to decide)

- O-9: membership plan table (Babin sends it).
- O-16: printer setting. Babin says one exists in Settings; none found in `src/`.
- O-6, O-7, O-14, O-17: accountant.
- Crew payout TDS and the staff 1% line are ruled but unbuilt (S4).

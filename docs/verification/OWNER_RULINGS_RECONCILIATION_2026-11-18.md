# Owner rulings reconciliation — 18 November 2026

**Status:** review evidence only; **not** a policy change, owner approval, production migration, legal opinion or permission change.
**Scope:** PR #194 (head `33d9ba5`) versus existing `main` at `c29cb2120c20`, including the already-committed `RULINGS-2026-11-09.md` and `docs/OPEN_DECISIONS.md`.
**Merge strategy:** retain current main's original ruling statements and existing records; append only the documented R-9.9 CI-on policy to `RULINGS-2026-11-09.md` and reconcile divergent interpretations in this separate, non-operational record. The old PR branch's conflicting file versions are superseded by the current main tree plus these two intentional documentation edits.
**No live change:** do not activate website/portal toggles, permission changes, Supabase migrations, cancellation fees, delivery tariffs or tax settings from this document.

## Existing authoritative record preserved

- `RULINGS-2026-11-09.md` on main already records **R-9.1–R-9.4** and explicitly describes work for R-9.2 (`0228_membership_change_keep_join_date.sql`, `UpgradeTierModal`, `changeMembership`). The old PR #194 says the database impact still needs investigation. **Keep main's existing account**, and verify actual schema/deployment separately.
- R-9.3 describes day-rate pay and no automatic hours-based overtime calculation; approved added days remain separately recorded.
- R-9.4's configured per-zone transport fee starts empty. No hard-coded figure is authorized here.
- The 2 November owner register in `docs/OPEN_DECISIONS.md` includes a *specific* Option A cancellation formula and a fixed-but-unset Elite membership fee. Do not silently overwrite these with contradictory draft text from PR #194.

## Divergences requiring explicit reconciliation

| Subject | Main / earlier recorded position | Unmerged PR #194 position | Safe disposition |
|---|---|---|---|
| **O-10 cancellation** | 2 Nov record specifies notice windows and rental-day/pre-VAT charges for confirmed bookings; status says not implemented | R-9.6 proposes selectable policies with figures deferred and no fee until configured; R-9.19 says one active policy | **Unresolved policy conflict.** No automatic rate/fee change. Record the later proposal for explicit owner confirmation against the 2 Nov rule before changing Settings, contracts or tests |
| **O-15 delivery rates** | 2 Nov record includes scooter inside/outside NPR 150/250 and per-zone configuration; R-9.4 describes an unset per-zone setting | R-9.5 proposes four zones; R-9.18 a zone-by-vehicle grid; R-9.20 says every outside-valley delivery is quoted per trip | **Do not assert 12 fixed values.** If the later R-9.18/R-9.20 scheme is confirmed, it implies **3 valley zones × 3 vehicle categories = 9 configurable prices**, with all outside-valley trips quoted individually. Confirm compatibility with the earlier scooter rule and actual deployed pricing before implementing |
| **O-20 Elite membership fee** | 2 Nov record says fixed annual fee, amount still open | R-9.7 says negotiated per client | **Unresolved later-vs-earlier decision:** confirm which rule supersedes before applying membership price/renewal changes |
| **R-9.2 membership term** | Main reports the migration and UI/action path already written (not applied live) | Branch says DB impact still to be checked | Preserve main's implementation record; verify migration/app state independently |
| **Crew overtime** | Day rate; approved additional days, not calculated from hours (R-9.3 and D24) | R-9.21 clarifies half/full overtime days can be entered and charged to the client / paid to crew | Compatible as a candidate clarification, but requires acceptance and client/crew approval workflow review; do not infer hourly automation |
| **R-9.9 CI** | Confirmed 9 Nov owner instruction; previously missing from existing main ruling file | CI is ON, an exact-commit merge gate | A narrow R-9.9 addendum is now proposed in this PR; align remaining guidance through reviewed #193; do not bypass missing PR CI evidence |

## Other unmerged interview notes

The previous #194 branch also proposed R-9.8 (assigned-trip Driver handover), R-9.10 (Manager purchase threshold), R-9.11 (expense/write-off thresholds), R-9.12 (Accounts payment reversals), R-9.13 (Coordinator access to crew pay and catalogue editing), R-9.14 (agreement drafting/legal review), R-9.15 (online-booking defaults), R-9.16 (Settings/audit details) and R-9.17 (digest, credit and payment defaults). These notes are **preserved as review candidates** in the former PR history, **not yet adopted by this reconciliation file**. Each permission or finance change needs verified explicit owner wording, the current `docs/PERMISSIONS.md` comparison, backend enforcement and tests before it can become a live requirement.

## Accountant-owned decisions — not resolved here

O-5 crew payout TDS, O-6 IRD e-billing, O-7 non-VAT entries, O-14 numbered invoice changes, O-17 VAT timing, cancellation fee VAT and invoice layout. **Deadline recorded in PR #194: 30 Nov 2026.** Do not convert speculative accounting answers into application defaults.

## Review gates for PR #194

1. Confirm `docs/OPEN_DECISIONS.md`, `PLAN.md` and `PROGRESS.md` are unchanged from pinned main. In `RULINGS-2026-11-09.md` only the narrow R-9.9 addendum may be added; preserve R-9.1–R-9.4 word-for-word.
2. Ensure the diff contains only this memo and the R-9.9 addendum; `git diff --check`, `npm run lint:progress` and exact-head checks wherever the workflow supports them. Absence of a docs-only run is **not** green CI.
3. Treat each contradiction above as unresolved until direct source/owner validation. Do not label this memo an approved business-policy update or implementation complete.
4. Preserve all nine confirmed open-vs-review blockers as such; keep this PR in draft until document review and checks complete.

# Rulings — 14 October 2026 — UI copy repair (build-time, PERMISSIONS.md §15)

Branch `claude/fix-mangled-ui-copy`. Copy only: no behaviour, permission, schema, migration or gate
change. Logged here, in `PROGRESS.md` under *Ruled*, and as `RULING 2026-10-14:` comments at the
sites where a developer note was moved out of the rendered text (B-2). Companion to
`RULINGS-2026-10-14.md` on the floor-workflow branch (PR #5). Flip a row by its number.

**The defect.** An earlier bulk "UI copy" edit wrapped developer prose in comments and pasted
replacement text after them. Where the hidden part was the start of a sentence, or a `(§x.y)`
reference, the screen shows a fragment ("a bundle needs at least one…"), a space before the
punctuation ("…sections ."), a dangling dash, or an untrue statement. It affected JSX text and
string literals (`note:` / `reason:` / error messages) alike.

| # | Ruling | Why | Revert |
|---|---|---|---|
| C14-1 | Broken JSX sentences restored: Add Bundle (8 places), Bundles (2), Add Equipment, stock-unit, relationship and purchase sections, Calendar, Report Catalog (2), Pulse. Lowercase fragments capitalised, stray spaces before `.`/`,` removed, dangling "—" removed, the report-catalog paragraph rewritten ("…were removed: there are no leads, campaigns, conversion or acquisition records."). | The rendered text was broken; the meaning is unchanged. | Restore the previous strings. |
| C14-2 | Developer notes rendered to staff rewritten as plain copy, the detail kept in a comment: Tools (storage, battery and rental-price panels; favourites, backup, registry, alerts and shortcut notes; "What Tools owns"), the tool-group notes and unavailable-tool reasons in `data/tools.ts`, the Today "Deposit Pending" reason (it named the `bookings.deposit_required` column), and the Inventory brand / purchase-price filter reasons (they named columns and migration line numbers). | Staff saw column names, migration references, "asks Babin directly", "the spec's last line". The house lint (`lint:ui-copy`) exists to keep developer text out of the UI; these slipped past its token list. | Restore the previous strings from the comments. |
| C14-3 | A space before the closing punctuation removed in string literals that followed a stripped `(§x)` — including five user-facing error messages in `lib/gates.ts` and notes in `data/expenseReports.ts`, Add Bundle and the inventory sections. | Visible typo on every occurrence. | Re-insert the space. |
| C14-4 | The close-gate blocker label in `lib/workflow.ts` is capitalised ("All four close gates must pass"). | It renders as a sentence. | Lower-case it. |

Not changed, logged for a decision: Tools ▸ Cinematography Suite still shows a developer disposition
table ("Where the render's fifteen categories went", with `§` references). Removing a whole card is
a product call, not a copy repair. The four floor workspaces were left alone on this branch; their
broken sentences are fixed in PR #5.

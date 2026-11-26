# Release blocker register — 19 November 2026

Scope: local main `44300a17e01705676cd0c21b9518edf23a9a0fda`; production remains HOLD. This is a starting register, not a release certification. Card statuses and PR descriptions are reports, not independent acceptance proof.

| Priority | Work | Current evidence / next action |
|---|---|---|
| Immediate | Exposed GitHub credential | 18 Nov handover reports a token appeared in a remote URL and tool output. Owner must revoke it and replace authentication; do not print the URL. Revocation not verified. |
| Block staging 0241 | Table privacy and credit authorization | Draft PR #225 proposes table ACL/RLS fixes; issue #226 identifies a SECURITY DEFINER credit path that may allow Coordinator to approve credit. Both require independent review, database role tests, and hosted JWT acceptance before 0241 rollout. PR reports affected tables absent from both environments on 18 Nov; not independently checked here. |
| Release foundation | Backup, staging and ledger | T1-01–05 remain open. Existing staging is documented as blank; validate current status, prepare synthetic rehearsal, fresh validated backup and restore, reconcile ledger and complete role tests. Babin applies live migrations. |
| Source gates | Current local and CI proof | Full local gates were interrupted during typecheck; no result is claimed. Completion initially reported stale/incomplete receipts. GitHub combined-status endpoint returned no status entries; this does not establish required check-run results. Obtain exact-head CI evidence. |
| Staff operations | Floor, money and shared tools | T2-18 and T2-17 are doing; T3-13, T3-14, T3-16 and T3-20 remain open; T4-08 is ready awaiting merge. Verify card dependencies and existing PRs before implementing. Many merged cards still need staging acceptance. |
| Public launch | Website, portal, payments | T7-02–09, T7-10 and T7-11 remain open in the plan. PRs #156 and #157 are open; assess their actual implementation and security before reuse. Prove client isolation, atomic confirmation and provider reconciliation. |
| Language and devices | Nepali and floor acceptance | T6-04–09 are acceptance_pending; owner language review and real-device checks remain. Perform phone, iPad, desktop, scanner and offline workflows with staff. |
| Cutover | Booqable import and rehearsal | T9-01–09 remain open. Reconcile catalogue, clients and active holds, run trial and restore/rollback rehearsal. PR #220 describes a March cancellation timeline conflicting with the 18 February renewal; reconcile before using. |
| Owner inputs | Business and compliance | Confirm outstanding roster, partners, agreement, invoice sample and accountant answers against newest rulings. Do not implement unresolved financial decisions by assumption. |

Sources: `docs/plans/UNIFIED_LAUNCH_2027-02-18.md`, T1/T2/T3/T4/T6/T7/T9 cards, `CODEX-HANDOVER-2026-11-18.md` in the original checkout, and read-only GitHub issue #226 / PR search on 19 Nov. No hosted mutations performed.

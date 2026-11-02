# Owner decisions — 2 November 2026

**Source:** Babin's direct answers in ChatGPT on 2 November 2026 to the review of pending Babin Rentals OS decisions. **Authority:** owner business instructions, not a legal opinion. This file records decisions without changing pricing, SQL, roles, taxes, or live systems.

**Release gate:** docs-only pending-review change. Do not infer authorization to merge other PRs, deploy, apply production migrations, open a paid staging project, incur hosting charges, cancel Booqable, or create financial documents. Implementers must use the normal one-card-per-PR review and tests. Updated owner policy is not proof that existing code implements it.

## Answered owner rules

| Ref | Owner ruling | Engineering and safety note |
| --- | --- | --- |
| T3-14 / O-14 | When an invoice is **already issued**, create a **separate additional invoice** for subsequent additional charges. While a bill is still **unissued/draft**, add changes to the **same bill**. | Do not rewrite/renumber an issued invoice. Corrections/reductions/voids may require credit-note or reversal treatment; accountant to verify. Do not change tax timing or auto-numbering until O-17 is confirmed. |
| Launch scope | **Staged rollout is approved in principle.** | Prioritize verified internal floor/booking/finance workflows; keep Booqable authoritative during trial. Changing the mandatory online-portal day-X scope in PLAN.md requires a reviewed roadmap decision; do not silently weaken security or release gates. |
| T9 / renewal | **Booqable renewal: 18 February 2027.** | Owner correction supersedes the March 20 text in the older action checklist. Check actual billing and cancellation terms; do not cancel automatically. |
| T4-07 / O-15 | **Scooter delivery: inside NPR 150, outside NPR 250.** | Interpret inside/outside as the requested labels for now; the boundary (Ring Road vs Kathmandu Valley) needs confirmation before shipping. No quote for outside-valley/far valley is implied. |
| T4-07 / O-15 | **Van fees must be configurable in Settings by vehicle type and zone**, as with scooter. | Van inside/outside amounts not supplied. Use Owner/Admin/Manager authorized settings and server-side money masking. Do not substitute legacy Rs 3,500 default. |
| T8-01/T8-03 / O-20 | **Elite membership has a fixed fee, not individually negotiated pricing.** | Specific annual NPR amount not supplied. Do not enroll/renew Elite for an assumed zero amount. Existing no-unknown-fee gate remains until fixed amount set. |
| T5-04 / O-4 | **Morning digest at 05:30 Asia/Kathmandu** | Existing default approved; use operational-day rules. |
| T8-08 / O-5 | **1.5% TDS for services** | Owner's rate instruction; validate whether each crew/service payout legally qualifies and how withholding is reported with accountant before making automated tax filings or payouts. |
| T3-05 / O-6 | Owner believes **IRD-certified electronic billing is not needed**. | Keep compliance verification with accountant/IRD as a launch check; owner preference alone cannot decide statutory obligations. |
| T3-04 / O-7 | An expressly designated **Non-VAT bill charges no VAT**. | Keep separate non-VAT register/total; do not use zero numeric VAT as proof that a transaction legally qualifies for non-VAT treatment; accountant validates classification and return format. |
| T3-06 / O-11 | **Agreement approach approved**. | Exact final agreement terms and signed sample have not been provided; retain review gate, including signing by an authorized person. |
| T8-03 / O-12 | Excess unused-term membership credit on downgrade **remains account credit, not a cash payout**. | Existing default confirmed. |
| T2-09 / O-16 | **Scanner / label-printer selection approved in principle**. | Exact models and purchase prices were not specified; only order after a concrete compatible shortlist is selected. |
| Lanes A/B/C | **All three development lanes may proceed** with their assigned independent tasks. | Approval is for source work, not production migration, merge, billing, staging expense, or deployment. |

## Cancellation policy — owner answer received, timing requires clarification (T3-03; O-10/O-13)

Babin specified all of these:
- Charge **one rental day's fee** for a cancellation **within 24 hours**.
- A **50% cancellation charge** for a case described as **"more than 2 days"**.
- Staff may **override** a suggested cancellation fee.

The exact reference point of "more than 2 days" (before pickup? after booking?) and the fee for cancellations between 24 and 48 hours are **not defined** by that answer. "One-day charge" must use the authoritative day-pricing engine; do not invent a flat amount. Leave unconfirmed tier thresholds unconfigured rather than charging silently. Existing plan default for percentage-fee base is booking rental total before VAT, pending any later explicit change. Existing RBAC must still restrict who can override charges; require reason and audit, and preserve immutable payment/refund reversal behavior. VAT treatment of a cancellation fee still needs accountant approval.

## Required follow-up decisions / verification (do not guess)

1. **O-17 — tax-invoice issuance timing:** must a VAT invoice be issued at first advance, at handover, or at full payment? Confirm with accountant under applicable Nepal law. This is **different** from the answered rule for *additional bills after issuance*.
2. **Cancellation:** Is 50% for cancellation **more than 48 hours before pickup**? What fee applies **24–48 hours before pickup**, and what are exact authorized override roles? Owner must specify.
3. **Elite annual fixed fee:** supply the NPR amount and whether VAT applies.
4. **Delivery:** define inside/outside boundary; provide van prices for each configured area and how far-valley/out-of-valley quotes work.
5. **IRD and non-VAT:** accountant must verify e-billing applicability, eligible non-VAT supplies, invoice layout, cancellation VAT, and crew/service 1.5% withholding treatment before live release.
6. **Staging budget:** user explicitly approved development lanes but **did not separately approve any paid staging cost** in this answer. A costed staging resource requires its own approval.
7. **Agreement / scanner:** obtain exact contract text and final compatible printer/scanner model choices.
8. **Go-live plan:** review the staged-launch scope against the current hard G7 online-payment gate and the confirmed **18 February 2027** renewal. Do not assume a revised cutover date until agreed.

## Next engineering steps

- Lane A: work on current-main T1-15 security isolation, repo/local verification, migration ledger and floor/device acceptance. No old PIN branch wholesale merge.
- Lane B: implement safe vehicle-type × area delivery-fee configuration, financial masking and operations workflow; no customer-facing van fee until set.
- Lane C: separate draft-invoice changes from newly issued supplementary invoices, prepare cancellation tier UX with unconfigured gaps, and retain financial compliance gate. Do not overwrite issued invoices.
- Update PLAN.md, docs/OPEN_DECISIONS.md, track cards, PROGRESS.md **Ruled**, and inline code comments when the corresponding code is implemented/reviewed. This standalone evidence note is **not** an implementation or release receipt.

## Unchanged safety gates

Latest production release HOLD and GitHub CI infrastructure issue remain open. No source verification or production-schema assertions are made by this document. See GitHub issues #56, #62, #66 and #67.

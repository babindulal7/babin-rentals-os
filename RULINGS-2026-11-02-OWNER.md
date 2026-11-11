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

## Cancellation policy — Option A approved, 2 November 2026 (T3-03 / O-10 / O-13)

**Owner acceptance:** Babin replied "OK" to the immediately preceding recommended **Option A** (international-style) and earlier clarified that "more than 2 days" describes **booking rental duration**, and "within 24 hours" means **the final 24 hours before scheduled rental/pickup start** (not 24 hours after reservation creation). The following is the policy to implement **on confirmed bookings before scheduled start**, subject to reviews below.

| Time remaining until scheduled rental start | Booking duration 1–2 rental days | Booking duration >2 rental days |
| --- | --- | --- |
| **More than 48 hours** | **Free** | **Free** |
| **More than 24 hours and up to 48 hours** | **Free** | **50% of rental subtotal before VAT** |
| **Final 24 hours (including exact 24-hour mark)** | **One rental day's charge** | **Higher of one rental day's charge OR 50% of rental subtotal before VAT** |

- **Draft/unconfirmed bookings:** free cancellation (no reserved stock). Active/handed-over bookings, no-shows, sub-rent third-party commitments, and early returns require their respective separate policies; do not reuse this pre-start cancellation table after handover.
- **Base:** fee percent uses the booking's **equipment rental subtotal before VAT**, not deposits, VAT, or delivery/crew/pass-through charges. The single-day fee comes from the canonical booking-day pricing engine using the booking's applicable rate and discounts; do not create a hard-coded Rs amount or double charge the one day plus 50%. If a fee-base/discount mismatch appears, send it for policy review rather than invent pricing.
- **Time and boundaries:** compute against the **scheduled booking start timestamp in Kathmandu local context**; store server-side unambiguous timestamps and reject stale client clock assumptions. Exactly 48 hours is in the 50% window for >2-day bookings; exactly 24 hours is in the final-24-hour window. Duration **exactly 2 days** is not >2 days.
- **Overrides:** authorized staff may lower/waive suggested fees with a required reason and audit. Keep existing role/approval controls; do not grant every staff role money-changing permissions from this statement alone.
- **Finance:** show the fee and refund/remaining advance clearly before confirmation. Use immutable ledger/refund reversal rows, do not modify past payments or an issued invoice. VAT/tax treatment of the cancellation fee and tax-invoice timing **still require accountant confirmation**.
- **Examples:** 5 × Rs 3,500 = Rs 17,500 rental: cancel 72 h out → Rs 0; 36 h → Rs 8,750; 12 h → max(Rs 3,500, Rs 8,750) = **Rs 8,750**. A 2-day booking 36 h out → Rs 0; cancelled 12 h out → one rental day's charge. Prices shown before VAT.
- **Delivery:** implementation is still **TODO**. No pricing code, migrations, settings, or live data were changed by this documentation PR.

## Required follow-up decisions / verification (do not guess)

1. **O-17 — tax-invoice issuance timing:** must a VAT invoice be issued at first advance, at handover, or at full payment? Confirm with accountant under applicable Nepal law. This is **different** from the answered rule for *additional bills after issuance*.
2. **Cancellation:** **O-10 policy is now answered** by approved Option A above. Development must verify the canonical equipment-rental subtotal/day rate, correct time boundaries, authorized override permissions, advance reversals, and VAT treatment with the accountant before go-live. No new policy question is needed for 24/48-hour precedence.
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

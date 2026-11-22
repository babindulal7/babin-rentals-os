# First launch scope — 22 November 2026

**Sources:** owner decisions in chat on 22 Nov 2026, recorded in [`RULINGS-2026-11-22.md`](../../RULINGS-2026-11-22.md); the 20 Nov launch-scope ruling in [`T1_RELEASE.md`](T1_RELEASE.md); the go-live finish line in [`PLAN.md`](../../PLAN.md) §1 (G1–G10).

This plan narrows the first launch. It does not change any card's status, and it does not move any decision that is still open.

## Scope of first launch

- **Staff use a desktop or counter browser** with manual search. No Bluetooth, scanner, iPad or printers (R-22.5).
- **Roles staffed:** Owner, Admin, Coordinator, Warehouse, Technician, Driver and Client. No Accountant seat. Manager-level approvals route to the Owner once the Settings choice is built (R-22.1, O-33).
- **Payments are entered manually.** Online payments, payment links, refunds and the online pay-balance step are held (R-22.2).
- **Money shows in whole rupees**, with no paisa (R-22.3).
- **Booqable is not used for testing** (R-22.4).

## By surface

| Surface | Marked done on `main` | Still open for launch |
|---|---|---|
| Staff app (desktop) | Floor loop, money, approvals, role home, settings, Nepali | T2-14 manual search acceptance · T1-14 desktop performance · T9-07 desk and manual training · T9-09 usability rounds |
| Today operations | Approvals inbox, who owes, morning digest, phone pop-ups | Manager→Owner setting (R-22.1, O-33) · phone pop-up check on a real phone browser |
| Calendar | Availability, downtime, turnaround, overbooking, day start, phone calendar export | T9-02 only if Booqable rentals are open at go-live (O-32) |
| Client portal | Accounts, My bookings, recommended items | T7-14 away switch acceptance · online pay-balance held (R-22.2) |
| Website | Catalogue, options, analytics, store links, booking requests | T7-01 spec review · T7-09 Turnstile configuration (owner) · T1-09 email domain |
| Money and accounts | Invoices, manual payments, who owes | T3-06 and T3-23 accountant review (O-31) · 0263 paisa fix review (R-22.3) |

"Marked done" means the card is `done` on `main`. Hosted staging and owner sign-off are recorded per card, not here.

## Held for launch (not blockers)

T7-05 Fonepay · T7-06 eSewa and Khalti · T7-07 refunds and reconciliation · T7-15 payment links (R-22.2).

## Phase 2 (after go-live, hardware)

T2-14 scanner acceptance · T2-19 iPad acceptance · T2-11 device day · the hardware parts of T9-07.

## Live gates (owner-run; the agent prepares runbooks)

- Backup and restore drill, and the backup routine (T1-01, T1-12).
- Hosting on Cloudflare Pages (T1-07) and error monitoring (T1-08).
- Live batches: migrations applied by Babin after a backup (T1-10, N-5).
- Live smoke test per role (T1-11) and real staff accounts (T1-13).
- Email from `@babinrentals.com` (T1-09).
- MFA activation for money roles (owner).

## Cutover (owner decisions)

T9-03 trial · T9-04 go/no-go · T9-05 day X · T9-06 run-off. T9-01 import and T9-02 holds only if O-32 says Booqable rentals are open at go-live.

## After go-live

- T9-08: archive Booqable, then cancel, before the 18 Feb 2027 renewal (PLAN §1).
- T3-05: IRD e-billing check. It is not in the launch ruling, so the owner confirms whether it is needed.

## Open decisions

- **O-31** Accountant review at launch (T3-06, T3-23).
- **O-32** Booqable rentals open at go-live (T9-02, T9-05).
- **O-33** Which Manager-level approvals the Settings choice covers, and its default (T3-29, T5-10).

## Batches of five

Start one batch at a time. A batch finishes with a receipt per card and a PROGRESS entry.

1. **Staff desktop:** T2-14 manual path, T1-14 performance, T9-07 desk training, T9-09 usability plan, T7-14 away switch.
2. **Website and portal:** T7-01 spec review, T7-09 Turnstile checklist, T4-08 rider link check, T1-09 email domain check, T7-11 launch checklist.
3. **Money:** 0263 review and staging check (R-22.3), manual payment entry check, T1-01 and T1-12 backup plan, T3-06 and T3-23 once O-31 is answered.
4. **Manager→Owner setting:** build after O-33 is answered. Settings choice, routing and tests.
5. **Live gates:** T1-07, T1-08, T1-10, T1-11, T1-13.

Then the cutover (T9-03 to T9-06), and the after-go-live list.

## Update: open decisions answered (22 Nov 2026)

- **O-31 answered:** launch without an accountant review (R-22.6). The paper VAT invoice reference capture stays a launch requirement. T3-06 and T3-23 keep their status.
- **O-32 answered:** no Booqable rentals open on day X (R-22.7). T9-02 is removed from the day-X list.
- **O-33 answered in part:** four approval types route to the Owner (R-22.8). The setting's default is still open, so the build waits for that answer.

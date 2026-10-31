# Agent prompts — one per card

Generated 26 Oct 2026 from the cards in `docs/plans/T*.md`. **The card is the source of truth:**
when a card changes, Claude sends updated prompts at a check-in (or edit the prompt to match).
Each file is copy-paste ready — open it, copy everything below the line, paste it into the lane's agent.

**How to run a lane:** take the first card in your lane's table whose *Needs* are done, paste its
prompt, let the agent finish, run the gates yourself (PLAN.md §6.4), merge locally, then move on.
Claude reviews the merged work at 7:38 AM and 7:38 PM NPT and tells you what to fix or paste next.

## Lane A · Codex-1 — T0, T1, T2, T9, then T8

| Card | Title | Size | Priority |
|---|---|---|---|
| [T0-03](T0-03.md) | Open pull request triage | M | go-live |
| [T0-04](T0-04.md) | Branch triage | M | go-live |
| [T0-06](T0-06.md) | Archive root clutter | S | go-live |
| [T0-10](T0-10.md) | Tests never run with live settings | S | go-live |
| [T0-11](T0-11.md) | One command for the local gate | S | go-live |
| [T1-01](T1-01.md) | Fresh production backup + restore drill | S | go-live |
| [T1-02](T1-02.md) | Staging project | M | go-live |
| [T1-03](T1-03.md) | Settle the ledger before anything is applied | M | go-live |
| [T1-04](T1-04.md) | Batch 0 — close the six anonymous RPCs first | S | go-live |
| [T1-05](T1-05.md) | Nine role seats + read-only role harness | M | go-live |
| [T1-06](T1-06.md) | Storage scoping accepted on staging | M | go-live |
| [T1-07](T1-07.md) | Hosting on Cloudflare Pages | M | go-live |
| [T1-08](T1-08.md) | Error monitoring | S | go-live |
| [T1-09](T1-09.md) | Email from @babinrentals.com | M | go-live |
| [T1-10](T1-10.md) | Live batches (Babin applies) | S each | go-live |
| [T1-11](T1-11.md) | Live smoke test per role | S each | go-live |
| [T1-12](T1-12.md) | Backups and recovery as a routine | S | go-live |
| [T1-13](T1-13.md) | Real staff accounts on live | S | go-live |
| [T1-14](T1-14.md) | Performance on real devices | M | go-live |
| [T1-15](T1-15.md) | Switch user with name + PIN | L | go-live |
| [T2-18](T2-18.md) | Finish evidence capture (what T2-16 left) | L | go-live |
| [T2-17](T2-17.md) | Save a unit's details | M | go-live |
| [T2-06](T2-06.md) | Repair job closes the damage | L | go-live |
| [T2-08](T2-08.md) | Floor printing | M | go-live |
| [T2-09](T2-09.md) | Bluetooth scanner at the packing bench | S | go-live |
| [T2-10](T2-10.md) | Offline outbox for scans and ticks | M | go-live |
| [T2-12](T2-12.md) | Client collectors and ID on file | M | go-live |
| [T2-13](T2-13.md) | Self-QC when alone | S | go-live |
| [T2-14](T2-14.md) | Scan a label → item card | M | go-live |
| [T2-15](T2-15.md) | Damage found during reset | S | soon |
| [T2-11](T2-11.md) | Device day | M | go-live |
| [T9-01](T9-01.md) | Bring the catalogue and clients across | M | go-live |
| [T9-02](T9-02.md) | Booqable rentals block the OS calendar | M | go-live |
| [T9-03](T9-03.md) | The trial | M | go-live |
| [T9-05](T9-05.md) | Day X | S | go-live |
| [T9-07](T9-07.md) | Staff training | S | go-live |
| [T9-08](T9-08.md) | Archive Booqable, then cancel | S | go-live |
| [T8-01](T8-01.md) | Load Babin's plans | S | go-live |
| [T8-02](T8-02.md) | Plans admin screen | M | go-live |
| [T8-03](T8-03.md) | Change plan with credit for unused days | M | go-live |
| [T8-04](T8-04.md) | Renew a lapsed membership | S | go-live |
| [T8-05](T8-05.md) | Member benefits at booking | M | go-live |
| [T8-06](T8-06.md) | Crew overtime: half or full day | M | go-live |
| [T8-07](T8-07.md) | Timesheet by the day | S | go-live |
| [T8-08](T8-08.md) | TDS on crew payouts | M | go-live |
| [T8-09](T8-09.md) | Staff renting gear | S | go-live |

## Lane B · Gemini — T4, T5, then T6

| Card | Title | Size | Priority |
|---|---|---|---|
| [T4-01](T4-01.md) | Delivery dispatch on the database | L | go-live |
| [T4-02](T4-02.md) | Reschedule a delivery | S | go-live |
| [T4-03](T4-03.md) | Proof of delivery | S | go-live |
| [T4-04](T4-04.md) | Team notes on the database | M | go-live |
| [T4-05](T4-05.md) | Shift handover on the database | M | go-live |
| [T4-06](T4-06.md) | Export old browser-only entries | S | go-live |
| [T4-07](T4-07.md) | Delivery zones and fees | S | go-live |
| [T4-08](T4-08.md) | One-time rider link | L | go-live |
| [T5-01](T5-01.md) | Notification records | M | go-live |
| [T5-02](T5-02.md) | Notification centre | M | go-live |
| [T5-03](T5-03.md) | Email sending service | M | go-live |
| [T5-04](T5-04.md) | Morning digest | M | go-live |
| [T5-05](T5-05.md) | Notification preferences | S | go-live |
| [T5-07](T5-07.md) | Automatic client emails | L | go-live |
| [T5-08](T5-08.md) | Payment reminders | M | go-live |
| [T5-09](T5-09.md) | Phone pop-ups | M | go-live |
| [T5-10](T5-10.md) | Approvals inbox | M | go-live |
| [T5-11](T5-11.md) | Each role opens on its own tasks | M | go-live |
| [T5-06](T5-06.md) | Client message register | S | go-live |
| [T6-02](T6-02.md) | String catalogue and lint | L | go-live |
| [T6-03](T6-03.md) | Review sheets | S | go-live |
| [T6-04](T6-04.md) | Wave 1 — the floor | L | go-live |
| [T6-05](T6-05.md) | Wave 2 — the desk | L | go-live |
| [T6-06](T6-06.md) | Wave 3 — back office | L | go-live |
| [T6-07](T6-07.md) | Wave 4 — reports, settings, admin | L | go-live |
| [T6-08](T6-08.md) | Nepali layout pass | M | go-live |
| [T6-09](T6-09.md) | Switch it on | S | go-live |

## Lane C · Codex-2 — T3, then T7

| Card | Title | Size | Priority |
|---|---|---|---|
| [T3-01](T3-01.md) | Re-book | M | go-live |
| [T3-02](T3-02.md) | Deposits per product, entered before go-live | M | go-live |
| [T3-03](T3-03.md) | Cancellation fee tiers | M | go-live |
| [T3-04](T3-04.md) | Non-VAT bills | M | go-live |
| [T3-06](T3-06.md) | Invoice and agreement documents | M | go-live |
| [T3-07](T3-07.md) | Opening balances and daily closing carry-forward | M | go-live |
| [T3-08](T3-08.md) | Equipment form: one page, seven sections | S | go-live |
| [T3-09](T3-09.md) | Structure-priced bookings reproduce on the invoice | S | go-live |
| [T3-10](T3-10.md) | After-hours line | S | go-live |
| [T3-11](T3-11.md) | Late fee — acceptance only | S | go-live |
| [T3-12](T3-12.md) | Paste a WhatsApp gear list | M | go-live |
| [T3-13](T3-13.md) | Fully booked → similar item or sub-rent | M | go-live |
| [T3-14](T3-14.md) | Draft invoice at Confirm, number on full payment | L | go-live |
| [T3-14a](T3-14a.md) | Harden the invoice write path (audit F2/F5/F4) — no decision needed | M | go-live |
| [T3-14b](T3-14b.md) | Confirm creates the Draft, Draft follows the booking — no decision needed | L | go-live |
| [T3-14c](T3-14c.md) | Number on settlement — **BLOCKED**, do not paste until O-14 + O-17 are answered | L | blocked |
| [T3-15](T3-15.md) | Payment method default | S | go-live |
| [T3-16](T3-16.md) | Share documents in one tap | M | go-live |
| [T3-17](T3-17.md) | Extend in two taps | S | go-live |
| [T3-18](T3-18.md) | Change a confirmed booking | L | go-live |
| [T3-19](T3-19.md) | Add gear by scanning in New Rental | S | soon |
| [T3-20](T3-20.md) | Who owes | M | go-live |
| [T3-21](T3-21.md) | Find anything in one box | M | go-live |
| [T3-22](T3-22.md) | Availability in two taps | S | go-live |
| [T3-23](T3-23.md) | Monthly pack for the accountant | M | soon |
| [T3-24](T3-24.md) | Quick expense with a bill photo | M | soon |
| [T7-02](T7-02.md) | Booking site and public catalogue | L | go-live |
| [T7-03](T7-03.md) | Client accounts by verified email | L | go-live |
| [T7-04](T7-04.md) | Requests and the staff queue | L | go-live |
| [T7-05](T7-05.md) | Online payment — Fonepay first | L | go-live |
| [T7-06](T7-06.md) | eSewa and Khalti | M each | go-live |
| [T7-07](T7-07.md) | Refunds and reconciliation | M | go-live |
| [T7-08](T7-08.md) | My bookings | M | go-live |
| [T7-09](T7-09.md) | Bot and abuse protection | S | go-live |
| [T7-10](T7-10.md) | Security review — the N-7 gate | M | go-live |
| [T7-11](T7-11.md) | Launch | S | go-live |

## Claude cards (arrive as files — no prompt needed)

| Card | Title | Who |
|---|---|---|
| T6-01 | Glossary first — Claude drafts the ~200 terms | Claude drafts · Babin approves |
| T7-01 | Online booking spec | Claude writes · Babin approves |

## Owner cards (Babin, staff, accountant)

| Card | Title | Who |
|---|---|---|
| [T0-09](T0-09.md) | CI off: local checks are the gate | Babin |
| [T3-05](T3-05.md) | IRD e-billing check | Babin + accountant |
| [T9-04](T9-04.md) | Go / no-go | Babin |
| [T9-06](T9-06.md) | Run-off | staff |
| [T9-09](T9-09.md) | Usability test rounds | Babin + staff |

## Already done

- T0-01 · Merge the plan pack — done (PR #29, merged 26 Oct 2026 01:22 NPT)
- T0-02 · Test runner works on a fresh clone — done (26 Oct, `3fca220`)
- T0-05 · Documents tell the truth — done (26 Oct, `3fca220`)
- T0-07 · Retire the three dead inspection stubs — done (26 Oct, `3fca220`)
- T0-08 · Lanes and worktrees in AGENTS.md — done (26 Oct — AGENTS.md on main `3fca220`; lanes, agents and local gates added by the workflow package)
- T2-02 · T2-03 · T2-04 · T2-05 · T2-07 — built on `main` 26 Oct (T2-02: the receiver picker comes with T2-12)
- T2-01 · Camera evidence upload — done in part (26 Oct, `3fca220`) — the rest is T2-18 (T2-16 built the photo rules)

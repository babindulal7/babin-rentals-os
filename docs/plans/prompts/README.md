# Agent prompts — one per card

Generated 31 Oct 2026 from the cards in `docs/plans/T*.md` (`main` at `9e219db` plus the 31 Oct package). **The card is the source of truth:**
when a card changes, Claude sends updated prompts at a check-in (or edit the prompt to match).
Each file is copy-paste ready — open it, copy everything below the line, paste it into the lane's agent.

**How to run a lane:** take the first card in your lane's table whose *Needs* are done, paste its
prompt, let the agent finish, run the gates yourself (PLAN.md §6.4), merge locally, then move on.
Claude reviews the merged work at 7:38 AM and 7:38 PM NPT and tells you what to fix or paste next.

**Priority:** inside each track, *go-live* cards come first, then *go-live · slips first* (the 27 Oct Booqable
round — the first to move after day X if the lane is behind, B56), then *soon*. The tables keep build order
within each priority.

## Lane A · Codex-1 — T0, T1, T2, T9, then T8

| Card | Title | Size | Priority |
|---|---|---|---|
| [T0-03](T0-03.md) | Open pull request triage | M | go-live |
| [T0-04](T0-04.md) | Branch triage | M | go-live |
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
| [T1-16](T1-16.md) | Settings switches that save nothing | S | go-live |
| [T1-17](T1-17.md) | Two-step sign-in for every money role | L | go-live · slips first |
| [T1-18](T1-18.md) | Sign-in history and new-device email | M | go-live · slips first |
| [T2-18](T2-18.md) | Finish evidence capture (what T2-16 left) | L | go-live |
| [T2-17](T2-17.md) | Save a unit's details | M | go-live |
| [T2-09](T2-09.md) | Bluetooth scanner at the packing bench | S | go-live |
| [T2-25](T2-25.md) | Print every line; the pick list from the booking | S | go-live |
| [T2-11](T2-11.md) | Device day | M | go-live |
| [T2-19](T2-19.md) | Signature at Return when damage is found | S | go-live · slips first |
| [T2-20](T2-20.md) | Floor adds consumables at Pack and Handover | S | go-live · slips first |
| [T2-21](T2-21.md) | Planned downtime with a reason | M | go-live · slips first |
| [T2-22](T2-22.md) | Time between rentals: account-wide or per product | M | go-live · slips first |
| [T2-23](T2-23.md) | Allow overbooking on chosen products | M | go-live · slips first |
| [T2-24](T2-24.md) | Temporary stock from partners | L | go-live · slips first |
| [T2-15](T2-15.md) | Damage found during reset | S | soon |
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
| [T8-09](T8-09.md) | Staff renting gear | S | go-live |

## Lane B · Gemini — T4, T5, then T6

| Card | Title | Size | Priority |
|---|---|---|---|
| [T4-02](T4-02.md) | Reschedule a delivery | S | go-live |
| [T4-03](T4-03.md) | Proof of delivery | S | go-live |
| [T4-07](T4-07.md) | Delivery zones and fees | S | go-live |
| [T4-08](T4-08.md) | One-time rider link | L | go-live |
| [T4-09](T4-09.md) | Delivery route: suggested order and map links | M | go-live · slips first |
| [T4-10](T4-10.md) | Jobs in phone calendars | M | go-live · slips first |
| [T4-11](T4-11.md) | Report a problem | M | go-live · slips first |
| [T4-12](T4-12.md) | Bulk edit products | L | go-live · slips first |
| [T4-08 fixes](T4-08-fixes.md) | Review fixes R1–R5 on the rider link and the red typecheck | S | go-live |
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
| [T5-12](T5-12.md) | Offer emails to clients | L | go-live · slips first |
| [T5-13](T5-13.md) | Edit email and document texts | M | go-live · slips first |
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
| [T3-14b](T3-14b.md) | Confirm creates the Draft, Draft follows the booking — no decision needed | L | go-live |
| [T3-14c](T3-14c.md) | Number on settlement — **BLOCKED**, do not paste until O-14 + O-17 are answered | L | blocked |
| [T3-15](T3-15.md) | Payment method default | S | go-live |
| [T3-16](T3-16.md) | Share documents in one tap | M | go-live |
| [T3-17](T3-17.md) | Extend in two taps | S | go-live |
| [T3-18](T3-18.md) | Change a confirmed booking | L | go-live |
| [T3-20](T3-20.md) | Who owes | M | go-live |
| [T3-21](T3-21.md) | Find anything in one box | M | go-live |
| [T3-22](T3-22.md) | Availability in two taps | S | go-live |
| [T3-25](T3-25.md) | Tags on bookings | S | go-live · slips first |
| [T3-26](T3-26.md) | Project name and shoot location on every booking | S | go-live · slips first |
| [T3-27](T3-27.md) | Pro forma invoice from the draft | S | go-live · slips first |
| [T3-28](T3-28.md) | Rental day start as a setting | L | go-live · slips first |
| [T3-29](T3-29.md) | Extension clash: the Manager decides | M | go-live · slips first |
| [T3-30](T3-30.md) | Consumables: unit price, add at the desk, restock, low stock | M | go-live · slips first |
| [T3-31](T3-31.md) | Counter sale | M | go-live · slips first |
| [T3-19](T3-19.md) | Add gear by scanning in New Rental | S | soon |
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
| [T7-12](T7-12.md) | Recommended items | M | go-live · slips first |
| [T7-13](T7-13.md) | Products with options on one page | M | go-live · slips first |
| [T7-14](T7-14.md) | "Away" switch for online booking | S | go-live · slips first |
| [T7-15](T7-15.md) | Payment link from any booking | M | go-live · slips first |
| [T7-16](T7-16.md) | Store analytics: GA4 and Meta Pixel | S | go-live · slips first |
| [T7-17](T7-17.md) | Old store links open the same item | S | go-live · slips first |

## Claude cards (arrive as files — no prompt needed)

| Card | Title | Who |
|---|---|---|
| T6-01 | Glossary first | Claude drafts (arrives as a file) · Babin approves |
| T7-01 | Online booking spec | Claude writes (arrives as a file) |

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
- T0-06 · Archive root clutter — done
- T0-07 · Retire the three dead inspection stubs — done (26 Oct, `3fca220`)
- T0-08 · Lanes and worktrees in AGENTS.md — done (26 Oct — AGENTS.md on main `3fca220`; lanes, agents and local gates added by the workflow package)
- T2-01 · Camera evidence upload — done in part (26 Oct, `3fca220`) — the rest is T2-18 (T2-16 built the photo rules)
- T2-02 · Drawn signatures — done (built 26 Oct; terms line + checkbox already in the sign modal; the receiver-from-collectors picker lands with T2-12)
- T2-03 · ID card as the deposit — done
- T2-04 · Gate 1 override by any handover staff — done
- T2-05 · Technician can do every floor verb — done
- T2-06 · Repair job closes the damage — done — awaiting merge (lane-a/T2-06-repair-job-closes-the-damage)
- T2-07 · Reset "Needed next" — done
- T2-08 · Floor printing — done
- T2-10 · Offline outbox for scans and ticks — done
- T2-12 · Client collectors and ID on file — done — awaiting merge (lane-a/T2-12-client-collectors-and-id-on-file)
- T2-13 · Self-QC when alone — done — awaiting merge (lane-a/T2-13-self-qc-when-alone)
- T2-14 · Scan a label → item card — done — awaiting merge (lane-a/T2-14-scan-a-label-to-item-card)
- T2-16 · Photo rules from W27: several photos, size caps, HEIC — done — awaiting merge (lane-a/T2-16-photo-rules-w27)
- T3-01 · Re-book — done (merged 31 Oct, `7250c42`)
- T4-01 · Delivery dispatch on the database — done — awaiting merge (lane-b/T4-01-delivery-dispatch-on-the-database)
- T4-04 · Team notes on the database — done
- T4-05 · Shift handover on the database — done
- T4-06 · Export old browser-only entries — done
- T8-08 · TDS on crew payouts — done — awaiting merge (lane-a/T8-08-tds-on-crew-payouts)
- T3-14a · Harden the invoice write path (audit F2/F5/F4) — done (merged, migration 0193)

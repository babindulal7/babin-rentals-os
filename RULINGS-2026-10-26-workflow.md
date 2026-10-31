# Rulings — 26 October 2026 (afternoon): the daily workflow, and how we build

**Source:** Babin Dulal, second question round of the day (26 rounds, ~100 questions, 11:39–13:00
NPT), asked to make the workflow "smooth and fast and easy". Answers typed by Babin (the "Other"
field) are quoted verbatim. Where an answer needed a reading, the reading is stated and marked
*(reading)*. Where Babin had no preference, Claude chose under CLAUDE.md "Build-time authority" and
the row is marked **Claude** with its revert.

**Scope:** product and process decisions only. No code, migration or permission changed in this
package. Per W74 this package is delivered **as files**; Babin applies it locally. Cards named in
the last column are in [`docs/plans/`](docs/plans/README.md); their copy-paste agent prompts are in
[`docs/plans/prompts/`](docs/plans/prompts/README.md).

Earlier rulings of the day: [`RULINGS-2026-10-26.md`](RULINGS-2026-10-26.md) (S1–S15, D1–D34).

---

## A. The shape of the day

| # | Question | Answer | Changes |
|---|---|---|---|
| W1 | Where bookings come from | "Mix whats app phone call and online sometimes walkin" | Paste-a-list (W9) and Share (W19) are go-live |
| W2 | When the counter is busiest | Early morning 5–9 AM, evening 5–11 PM, late night ("Late night for some returns") | Role homes (W61), alerts (W62) |
| W3 | Pickups and returns per day | **10–20 each** (settles the 27 Jul "~20 + ~20, confirm" ⭐) | Sizing only |
| W32 | Shifts | "Ive added another shift now 10pm to 7am" — **three shifts: 06:00–15:00, 14:00–23:00, 22:00–07:00**, overlaps 14–15, 22–23, 06–07 | T4-05, T3-07 |
| W56 | Staff using the app daily | **More than 10** | T1-15 (switch user), T1-13 |

## B. Booking desk

| # | Question | Answer | Changes |
|---|---|---|---|
| W4 | Who takes bookings | A mix of staff | — |
| W5 | Quote first or book straight away | About half and half — New Rental keeps **Save as quote** and **Confirm** equally one tap | T3-01 note |
| W6 | Lead time | "Mix but 1-2 days most for small items and 3-7 for big bookings and for film more than week" | — |
| W7 | Typical length | "Its also mix" | Claude: L1 → T3-01 |
| W8 | Fastest ways to add gear | All four: search by name, scan the item's code, pick a bundle, copy a past booking | T3-01, T3-19 |
| W9 | Paste a WhatsApp gear list | **Yes** — the app suggests a match per line; staff confirm before anything is added | T3-12 |
| W10 | Item fully booked for the dates | **Show both:** a similar item we own and sub-rent from a partner (settles the 27 Jul ⭐) | T3-13 |
| W11 | Bookings that are mostly bundles | About half | — |
| W40 | Who can extend | **Any desk staff** — already true today (`rental.extend` = booking-desk roles) | T3-17 |
| W41 | Price of extra days | "Staff choose each time" | T3-17 |
| W86 | Is gear held while a booking waits for its advance (draft) | **No — held only after Confirm** (as now) | — |
| W82 | Advance not paid yet | "Hold and stays in draft or staff can confirm with warning" *(reading, with W86: the booking stays a quote with no hold; staff may Confirm anyway and see a warning — the 21 Jul soft gate)* | T3-14 |
| W87 | Client wants more gear mid-rental | "Staff choose" — add to the same booking, or a new booking linked to it | T3-18 |
| W88 | Who may change items or dates after Confirm | **Any desk staff** | T3-18 |

## C. Money and invoices

| # | Question | Answer | Changes |
|---|---|---|---|
| W12 | When the advance is paid | Varies a lot | — |
| W13 | Most common payment method | "Mix" | Claude: L2 → T3-15 |
| W14 | Credit clients | "1 and 2" — **many production houses and a few trusted clients** pay after the shoot | T3-20 |
| W15 | When the invoice is made | **Automatically at Confirm** — as a **draft** (no number) that follows booking changes | T3-14 |
| W16 | When it gets its final number | **Only on full payment** | T3-14 |
| W17 | A numbered invoice then changes (extension, late fee, damage) | "Ask the accountant first" | PLAN §4.2 O-14 |
| W18 | Chasing unpaid credit | "Reminders after booking complection, than 5 days 10 days every 5 days gap" — at completion, then day 5, day 10, then every 5 days | T5-08 |
| W19 | How quotes and invoices go to clients | All four: WhatsApp PDF, WhatsApp text or screenshot, email PDF, printed | T3-16 |
| W83 | Deposit refund method | Staff choose each time | T3-07 note |
| W59 | Cash count and daily closing | "We can choose in settings" — per shift or once a day | T3-07 |
| W81 | Monthly pack for the accountant | All four: Sales/VAT register, payments and refunds, expenses with bill photos, crew payouts with TDS | T3-23 |
| W89 | Who records expenses | "Mix" — each person at the time with a bill photo, or Accounts weekly | T3-24 |
| W68 | Staff renting gear | **Normal client + 20% staff discount** | T8-09 |

## D. Client messages

Supersedes the 21 Jul lock "comms are draft-only, never auto-sent" **for the events below only**.

| # | Question | Answer | Changes |
|---|---|---|---|
| W20 | Booking confirmation | "Send via email and then WhatsApp is option", then **staff tap Send** | T3-16, T5-07 |
| W21 | Automatic client emails | "Stap tap send but for pickup and about 2 hours before return late return, return and for any danages and loss msg shoud go to costumer via email automatically" — **automatic emails:** pickup reminder, pickup receipt, return reminder (~2 h before), late return, return receipt, damage or loss notice | T5-07 |
| W37 | Pickup reminder time | "Pick up is 6am and return is 6 am next day so 2 hours before pickup" — **2 h before pickup**; return reminder 2 h before return | T5-07 |
| W22 | Client has no email | **WhatsApp draft for staff** (same text, one tap to send) | T5-07 |
| W23 | Damage email | **Notice now, amount later:** "found, under review" with photos; the charge only after a manager approves (PERMISSIONS §7 P1) | T5-07 |
| W18b | Payment reminders | **Automatic email; staff can pause a client** | T5-08 |
| W60 | WhatsApp Business API | **No** — client messages by automatic email, WhatsApp stays a draft staff send | T5 |
| W80 | Email language | **English** | T5-07 |

## E. Floor

| # | Question | Answer | Changes |
|---|---|---|---|
| W24 | When packing happens | Mix | — |
| W25 | Labels on items | "Some items but im planning now" | T2-09 |
| W71 | What a label carries | **QR code + asset code** | T2-08 |
| W72 | Deadline to label everything | "We can do scan and manual as well" — **no deadline**; every floor screen keeps manual tick beside scanning | T2-09 |
| W26 | Who packs | Any floor staff | — |
| W27 | Photos | "We can updoad mutiple photos but shoftware converts its size", then: "For damage up to 10 mb others 3mb" — **several photos allowed; the app shrinks damage photos to ≤ 10 MB and all others to ≤ 3 MB** | T2-01 |
| W28 | Who collects | "All of these, often" — client, someone they send, or our delivery | T2-12 |
| W34 | Save each client's usual collectors | **Yes** — name, phone, ID photo; picked at handover | T2-12 |
| W29 | How often the agreement is signed | No preference | Claude: L3 |
| W30 | Check items together at the counter | No preference | Claude: L4 |
| W31 | When returns arrive | **Early morning, before 6 AM** | Role homes (W61) |
| W33 | Return check | **Full check, client present** (as locked 27 Jul) | — |
| W35 | Partial returns | Sometimes (built: 0176/0177) | — |
| W36 | Extensions | Both: asked before the return time, and just returned late | T3-17 |
| W38 | Late return alert and email | **Both at 30 minutes**, when the free grace ends | T5-07, T5-09 |
| W39 | Who is told as a return gets later | **Everyone at once** (replaces the 28 Jul ladder proposal) | T5-09 |
| W42 | Who resets | Any floor staff | — |
| W43 | QC after cleaning | **Same person is OK when alone.** Today the database refuses it (`cleaning_queue_entries` CHECK `qc_by <> cleaned_by`, 0003) | T2-13 |
| W44 | Damage found at cleaning, client gone | **Claim from the client** by default | T2-15 *(card id corrected 31 Oct; was T2-16)* |
| W45 | Time to reset one booking | Under 30 min — the "Needed next" window stays 4 h ⭐ | — |

## F. Delivery

| # | Question | Answer | Changes |
|---|---|---|---|
| W46 | Deliveries a day | **5 or more** | T4 |
| W47 | Who delivers | "For now hired rider but we are planning to buy scooter and e van" | T4-01 vehicle field |
| W48 | Delivery fee | **By area / zone**; zones: "You can do research" | T4-07 |
| W49 | How riders use the app | **One-time link per job** — no login, no money shown, stops working once delivered | T4-08 |
| W85 | Delivery on online bookings | **Yes, with the zone fee** | T7-04 |

## G. Clients and ID

| # | Question | Answer | Changes |
|---|---|---|---|
| W50 | ID on file before the first rental | **Yes, always** | T2-12, T7-03 |
| W51 | Reuse the ID photo | "Id can be government it doesn't expire" — **store once, reuse**; expiry recorded only when the document has one | T2-12 |
| W84 | Online clients' ID | **Upload when requesting** | T7-03 |

## H. Devices, staff, approvals, screens

| # | Question | Answer | Changes |
|---|---|---|---|
| W52 | Devices | Desktop PC at the counter, laptop, iPad/tablet on the floor, staff phones | T2-11 |
| W53 | Switching users on a shared device | **Tap name + 4-digit PIN** | T1-15 |
| W54 | Printers | A4 printer + label printer (QR labels) | T2-08 |
| W55 | Shop internet | Drops sometimes — offline scanning (T2-10) is go-live critical | T2-10 |
| W57 | Approver when Babin is away | **A manager** | T5-10 |
| W58 | How approvals reach Babin | "WhatsApp message", then W60 (no WhatsApp API) — *(reading: app alert + email)* | T5-10 |
| W61 | First screen | **Each role's own tasks** | T5-11 |
| W79 | Owner's first screen | All four: approvals waiting, today's money (collected, owed, deposits), late/blocked/damaged, business pulse | T5-11 |
| W62 | Pop-up alerts on phones | All four: late returns, new online requests, online payments, damage found | T5-09 |
| W91 | What else slows the shop | All four: **finding a booking fast, checking availability, knowing who has which item, who paid / who owes** | T3-21, T3-22, T2-14, T3-20 |

## I. Online booking

| # | Question | Answer | Changes |
|---|---|---|---|
| W63 | Minimum notice | **12 hours** | T7-04 |
| W64 | What can be booked online | "Every thing sith rate but we will choose what to show and what to hide, some items are only for some gears we will list but it should not appear in single book shoud appear in bundle" — **per product: Show online on/off, and "only inside bundles"** | T7-02 |
| W65 | Online payment amount | **The advance rule** (full < Rs 5,000; Rs 5,000 min over 5,000; 50% over 10,000) | T7-05 |
| W66 | Answer promise | **1 hour, any time** (the shop is staffed around the clock, W32) | T7-04 |

## J. Other modules

| # | Question | Answer | Changes |
|---|---|---|---|
| W67 | Nepali | Some floor staff will use it; **scope stays every staff screen at go-live** (S6 reaffirmed) | T6 |
| W69 | Sub-renting | A few times a month | T3-13 |
| W70 | Crew on bookings | "Often bundles and big booking" | — |

## K. How we build

| # | Question | Answer | Changes |
|---|---|---|---|
| W73 | How Babin checks finished work | **Short summary + link** | Check-ins |
| W74 | Who pushes and merges | "Iwill do it locally you can only read there learn about updates and suggest me", then **"Files only, never push"** — Claude reads GitHub, reviews, suggests and sends files; Babin and the local agents commit, push and merge | PLAN §6 |
| W75 | CI (stopped by GitHub billing) | **Keep CI off; local checks are the gate.** Babin disables the workflow in GitHub (Actions → CI → ⋯ → Disable workflow) | PLAN §6, AGENTS.md |
| W76 | Agents | **Claude + Codex / Gemini** | PLAN §6 |
| W90 | Who does what | "You decide codex and gemini build and you review it" | PLAN §6 lanes |
| W77 | Claude's check-ins | "8pm and 8am 2 time" — twice a day, read new commits, re-run the fast gates on `main`, send suggestions | Scheduled tasks |
| W78 | Prompts per card | **Yes, one per card** | `docs/plans/prompts/` |

## L. Claude's resolutions (no preference given, or a default needed)

| # | Resolution | Why | Revert |
|---|---|---|---|
| L1 | New Rental opens with **tomorrow 06:00 → the next day 06:00** and quick length chips **1 day · 2 days · 3 days · 1 week** | W6/W7 "mix"; the 06:00 rental day; R-39 defaults are doctrine | change the default in `NewRental.tsx` (T3-01) |
| L2 | Record Payment preselects **the method this client used last**; a new client gets no preselection and four one-tap method buttons | W13 "mix": a fixed default would be wrong half the time | preselect Bank Transfer again |
| L3 | **One signature per handover, every booking.** The database already requires a signature in each handover session (`gate.handover.agreement_unsigned`, 0171 line ~503). The person collecting signs once under the item list and the rental terms ("received for <client>, under the rental terms"), so that one signature is both the receipt and the agreement — no second signature. The terms text (O-11) must say it may be signed by the client or on the client's behalf | W29 no preference; the stricter rule (every booking) is kept and no step is added (R-39) | separate the two signatures in T2-02 |
| L4 | Handover keeps **"Mark all picked up"** in one tap, with item-by-item still possible | W30 no preference; built 25 Oct | — |
| L5 | Lanes: **Codex-1 = Lane A** (T0 code, T1 code, T2, T9) · **Gemini = Lane B** (T4, T5, then T6; T8 moved to lane A by L12) · **Codex-2 = Lane C** (T3, T7). Claude reviews twice daily | W90 | edit PLAN §6 |
| L6 | Delivery zones (researched; fees are Babin's): **Inside Ring Road · Outside Ring Road, inside the valley · Far valley (Bhaktapur town, Godawari, valley edges) · Outside the valley (quoted per trip).** Fee ⭐ Rs 3,500 for each valley zone until Babin sets them — the only fee in any source | W48 "You can do research" | edit the Settings zone table |
| L7 | Self-QC is allowed **only** with an "I am alone on shift" tick, recorded as self-checked in the audit; a second person is still asked for when one is signed in on the same shift | W43; keeps the trail honest | restore the CHECK |
| L8 | T2-01 (pushed 26 Oct, `3fca220`) is **done in part**; what its Done-when still lacks moves to new card **T2-18** (T2-16, built since, covers the several-photos and size items) (offline message that claims a save, per-unit damage photos, several photos per pick, damage-photo size, error shown as "0 photos", Evidence-page stage mapping, session ownership) | Claude's review of `3fca220`; log verification, not intention (CLAUDE.md) | set T2-01 back to `done`, drop T2-16 |
| L9 | New card **T0-10**: the test runner uses mock data unless started with `--live`; until then the gate keeps `VITE_DATA_SOURCE=mock` | `3fca220`'s runner reads `.env.local` and runs with live settings when it holds a URL; B-1 (the safer default) | drop T0-10, restore the plain `npm test` lines |
| L10 | **Usability tests and the screen check** (`docs/USABILITY_TESTS.md`, card T9-09): three staff watched on staging at device day (10 Jan), mid-trial (⭐ 20 Jan) and ⭐ the first Sunday of each month; every card that changes a screen passes the screen check. Build notes from the other books (search, scanning, imports, errors, state) go on the cards they shape | Babin, 26 Oct: "Add and also read books" — from Krug, *Don't Make Me Think, Revisited* ch. 6 and 9–12; R-39 counts taps but cannot see confusion | delete `docs/USABILITY_TESTS.md`, T9-09 and the build-note lines |
| L11 | New card **T2-17**: the unit editor saves asset tag, serial and rack/shelf/bin for real; **status and condition stay read-only** there (status is engine-owned, `gate.unit_status.direct_write` 0114; condition at intake only, PERMISSIONS §3.1) | `AssetDetail.tsx:223` still says nothing is persisted (Law 16); B-1, the stricter reading | make condition editable in T2-17 |
| L12 | Lane changes (Babin: "choose which AI does what", under W90). **T8 membership & crew moves from Gemini to Codex-1** — it is proration, overtime and TDS arithmetic that must pass the database gates, and lane A freed capacity when T2-01/02/04/05 landed; **Gemini keeps T4, T5, T6**. **Claude writes two non-code cards as files: T6-01 (Nepali glossary draft) and T7-01 (online booking spec).** Claude still reviews every card twice daily and reads every migration and every money/permission diff before Babin merges. T2-01 gets a delta card **T2-16** (W27 rules), because it was built before W27 | W90 | revert: put T8 back under lane B (card headers, prompts `T8-*`, PLAN §3/§6, AGENTS), delete T2-16 only if T2-01 is rebuilt to W27 |

## M. What this settles from earlier

- 27 Jul ⭐ "confirm ~20 + ~20 a day" → W3 (10–20 each).
- 27 Jul ⭐ "fully booked: sub-rent is the only way past?" → W10 (show both).
- 28 Jul ⭐ overdue escalation ladder (1 h → 24 h → 48 h) → W39 (everyone at once).
- Cleaning v3.1 ⭐ "can the cleaner QC their own work when alone" → W43 (yes); "damage after inspection: claim, absorb or insurance" → W44 (claim).
- 21 Jul "comms draft-only, never auto-sent" → narrowed by W21/W18b: the listed client emails are automatic; WhatsApp stays draft.
- Operations manual shift times (06–15, 14–23) → W32 adds 22:00–07:00.

## N. Still open after this round

Added to `PLAN.md` §4.2: **O-14** (accountant: a numbered invoice that later changes), **O-15**
(fees per delivery zone), **O-16** (label printer and Bluetooth scanner models — Claude proposes,
replaces O-8), **O-17** (accountant: whether the VAT invoice may wait until full payment, W16 —
[VAT Act 2052 §6](https://nepallaws.com/Laws/value-added-tax-act-2052/section-6-place-and-time-of-supply/) sets the time of a supply at the earliest of the invoice, the service or the payment,
with its own rule for part payments, so an advance or the handover may already require the invoice;
Claude is not a tax adviser, so this goes to the accountant before T3-14's numbering step ships).

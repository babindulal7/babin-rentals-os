# Rulings — 27 October 2026: what to take from the Booqable study

**Source:** Babin Dulal, question round of 27 Oct 2026 (56 questions in 14 tappable rounds), after
Claude compared Babin's Booqable study with the app on `main` `6f01439`. Babin's chosen option is in
**bold**; answers he typed (the "Other" field) are quoted verbatim. The questions are summarised in
Claude's words. Where an answer needed a reading, the reading is stated and marked *(reading)*. Where
Babin left a gap, Claude chose under CLAUDE.md "Build-time authority" and the row is in section G with
its revert. **Written 27 Oct; delivered 31 Oct, rebased onto `main` `9e219db`** — card numbers and code
facts below are checked against that commit.

**The study (not in the repo):** `scrape.zip` from 3 Oct 2026 — `BOOQABLE-AUDIT/` (executive summary,
the systems and logic notes, the recommendations folder) and `booqable-research/` (inventory, rentals,
financial, documents, the ten trial tests and a copy of Booqable's public help centre). Most of what
the study lists as "must have" is already in the app (saved views, merge clients, maintenance holds,
bundles, pricing structures, reports, the audit trail). This round is about the gaps that were left.

**Scope:** product and process decisions only. No code, migration, permission or setting changed in
this package. Per W74 it is delivered **as files**; Babin applies it locally. Cards named in the last
column are in [`docs/plans/`](docs/plans/README.md), with a copy-paste prompt each in
[`docs/plans/prompts/`](docs/plans/prompts/README.md).

**Timing (B53–B56):** Babin marked every item below as needed for day X, and chose what gives way if
the agents fall behind: **the extras move after day X**. So every new card of this round is tagged
**[go-live] · slips first** — built after the plain go-live cards of its track, and the first to move
past 1 Feb if a lane is behind (PLAN.md §3, §7). Two small cards are plain **[go-live]** instead:
T1-16 (K2), which stops Settings claiming what it does not do, and T2-25, which makes the paper packing
list print every line (and adds B15's pick list from the booking).

Earlier rulings: [`RULINGS-2026-10-26.md`](RULINGS-2026-10-26.md) (S1–S15, D1–D34) and
[`RULINGS-2026-10-26-workflow.md`](RULINGS-2026-10-26-workflow.md) (W1–W91, L1–L12).

---

## A. The online store (`book.babinrentals.com`)

| # | Question | Answer | Changes |
|---|---|---|---|
| B1 | "Often rented with" items on a product | "Autometic fill and if it is wrong staff can choose" — *(reading)* the list fills itself from past bookings; staff can replace it on any product | T7-12 |
| B2 | Products that come in options (lens mount, size, length) | **One page, pick an option** | T7-13 |
| B3 | Store categories | **Same as now** — the app's two levels, plus Bundle Deals | T7-02 |
| B4 | Old Booqable store links (Google results, Instagram, WhatsApp chats) | **Open the same item** on the new site | T7-17 (T9-01 records the old slugs) |
| B5 | What `babinrentals.com` shows once the Booqable store closes (O-1) | "Both, decide later" — *(reading)* **redirect the root to `book.babinrentals.com` at day X**; build a full company website **after go-live** | O-1 closed; T9-08; T10 |
| B6 | Closed days for online requests | **Only an "Away" switch** — no closed-days calendar | T7-14 |
| B7 | How availability shows online | **Dates first, then yes / no** for each item | T7-02 |
| B8 | Extra questions at checkout | **Production / project name**, **Shoot location**, and "After booking google review link and at the booking fone pay api for payment" | T7-04, T3-26; the review link is B9; Fonepay is T7-05 (unchanged) |
| B9 | When the Google review link is sent | **After the return is done** | T5-07 |
| B37 | Store analytics | **GA4 + Meta Pixel** | T7-16 |
| B38 | Can a client pay the security deposit online (O-3)? | **No — the deposit is taken at handover** (cash or ID) | O-3 closed; T7-05 unchanged |
| B39 | An online advance when the booking cannot go ahead (O-2) | "If client choose the booking its already available but if other shooting is out side valley and date extends then we will try to sub rent if its not aviable then we will suggest near the product items if its not then we refund fully but cilent can keep it as credit" — *(reading)* a booking the client chose was available; if it becomes impossible (an earlier job outside the valley runs late), staff **1) try to sub-rent, 2) offer the nearest similar item, 3) otherwise refund in full — or the client keeps it as account credit, the client's choice** | O-2 closed; T7-07, T3-29 |
| B45 | Product photos from Booqable | **Start fresh** — not imported | T9-01 |
| B49 | Where the new product photos come from | "We can pick online" — *(reading)* official product photos chosen online by Babin | BABIN_ACTIONS (by ⭐ 15 Jan) |

## B. Stock tools

| # | Question | Answer | Changes |
|---|---|---|---|
| B10 | Planned downtime (a unit out for a known period) | **Yes, with a reason list** | T2-21 |
| B11 | Prep time between rentals | "Put in settings and we can switch" — *(reading)* a Settings switch chooses **the account-wide turnaround (as now)** or **each product's own prep and cleaning minutes** (fields already on the equipment form) | T2-22 |
| B12 | Booking more than we own | "Put in per items settings" — an **"Allow overbooking" switch on each product**, off by default | T2-23 |
| B13 | Partner gear we hold for a period | **Temporary stock** | T2-24 |
| B36 | When the temporary stock period ends | **A "return to partner" task** | T2-24 |
| B47 | Recording what a partner charges | **Yes — per day or a fixed amount** | T2-24 |
| B14 | Consumables (tape, gels, batteries) | **Yes, with a stock count** | T3-30 (settles OPEN_DECISIONS §4 as Option A) |
| B35 | Who adds consumables to a booking | "Both" — the desk and the floor | T3-30, T2-20 |
| B46 | Walk-in counter sale (no rental) | **Yes** | T3-31 |
| B51 | Who rings up a counter sale | **Anyone — the floor starts it, the desk takes payment** | T3-31 |
| B15 | Pick list | **A4, one per booking** | T2-25 (the T2-08 packing list printed in full, from the booking too, with a QR) |
| B32 | Bulk changes on many products | **Show online, category, rates by % (Owner only), print labels**, and "Others as well tax and other things" | T4-12 |
| B33 | More bulk fields | **VAT, deposit, prep / overbooking, recommended items**, and "Others as well" | T4-12 |

## C. Bookings and money

| # | Question | Answer | Changes |
|---|---|---|---|
| B16 | Labels on bookings | **Free tags** | T3-25 |
| B52 | Project name | **On every booking and every invoice** | T3-26 |
| B17 | Payment link | **From any booking** | T7-15 |
| B18 | Pro forma invoice | **Yes, from the draft invoice** | T3-27 |
| B19 | A signature at Return | **Only when damage is found** | T2-19 |
| B41 | An extension that clashes with the next booking of the same item | **The Manager decides** | T3-29 |
| B42 | Warning on the booking put at risk | **As soon as it is known** | T3-29 |
| B24 | The 06:00 → 06:00 rental day | "A setting now" | T3-28 |
| B25 | Bookings already made when the day start changes | **Keep their prices** | T3-28 |
| B26 | Who may change the day start | **Owner and Admin** | T3-28 |

## D. Sign-in and security

| # | Question | Answer | Changes |
|---|---|---|---|
| B21 | Two-step sign-in | "2 and pin option quick sign in" — *(reading)* option 2: **every role that sees money** (Owner, Admin, Manager, Coordinator, Accounts) uses a second step; the **PIN stays the quick way in** on a device that person has already signed in on (T1-15) | T1-17 |
| B40 | How often the second step is asked | **Every 30 days** on each device | T1-17 |
| B22 | Sign-in history | **Owner and Admin** can see it | T1-18 |
| B23 | Email on a sign-in from a new device | **Only for Owner and Admin accounts** | T1-18 |
| B20 | Editing the wording of emails and documents | **Yes, in Settings — Owner and Admin** | T5-13 |

## E. Team tools

| # | Question | Answer | Changes |
|---|---|---|---|
| B27 | A "Report a problem" button | **Yes** | T4-11 |
| B48 | Keep it after go-live | **Yes** | T4-11 |
| B28 | Jobs in phone calendars | **Every staff member** | T4-10 |
| B29 | What a calendar entry shows | **Booking number, time, client name** | T4-10 |
| B30 | Delivery route | **Suggested order + Google Maps links** | T4-09 |
| B31 | Offer emails (newsletter) | **At go-live** | T5-12 |
| B34 | Who gets offer emails | **Every client with an email, with an unsubscribe link** | T5-12 |
| B43 | Who may send them | **Owner, Admin, Manager** | T5-12 |
| B50 | Where they are sent from | **From the app** | T5-12 |
| B44 | An AI helper | **After go-live, read-only** | T10 |

## F. Day X

| # | Question | Answer | Changes |
|---|---|---|---|
| B53 | Which stock tools day X needs | **All of them** (planned downtime, prep time, overbooking per item, temporary stock) | PLAN §3 |
| B54 | Which of these day X needs | **All:** consumables, delivery route, phone calendars, sign-in history | PLAN §3 |
| B55 | Which of these day X needs | **All:** payment link, pro forma, tags, analytics | PLAN §3 |
| B56 | If the agents fall behind, what gives way first | **Move the extras after day X** (Recommended) | Every card of this round tagged **[go-live] · slips first**; PLAN §3, §7 |

## G. Claude's resolutions (gaps, review findings, defaults)

Reply with a K-number to flip one. *(The first draft of 27 Oct had five more rows — T0-10, T0-11, the
usability guide, T2-17 and the evidence fixes. They reached `main` on 31 Oct with the 26 Oct package
(`a8611ca`) as L8–L11 of `RULINGS-2026-10-26-workflow.md` and cards T0-10, T0-11, T2-17, T2-18 and
T9-09, so they are not repeated here; the rest were renumbered K1–K7.)*

| # | Resolution | Why | Revert |
|---|---|---|---|
| K1 | **Where the new cards go.** Stock tools (T2-21…T2-24) in **lane A**, because lane A already owns the floor transition function that mints reservations (0179–0181) and one lane should own every availability change for stock; store (old links included), money and the day-start setting in **lane C**; route, phone calendars, report a problem, bulk edit, offer emails and editable texts in **lane B**. Open work after this round on `main` `9e219db`, counted by script at the middle of each size range (S 1 · M 2.5 · L 5): lane A ≈ 92, B ≈ 85, C ≈ 106 sessions — of which ≈ 22, 20 and 26 are slips-first | W90 ("you decide"), L8 (money, permission and engine cards to the Codex lanes; high-volume screen and text work to Gemini) | move a card's track and regenerate its prompt |
| K2 | **Settings switches that save nothing** (T1-16, plain [go-live] — not a slips-first extra): "Two-factor authentication — Required for Owner and Admin roles", "Shared-device screen lock", "Return reminders", "Payment reminders", "Low stock alerts", "Daily digest" flip only a local value (`Switch` in `settings/sections/shared.tsx`). Until each card that makes it real lands, the row shows **"Not built yet"** with the card id and cannot be flipped. The "Allow overbooking" switch is kept in one browser only (`lib/bookingRules.ts`, localStorage) — it is replaced by the per-product switch (B12, T2-23) | Law 16; a switch that says two-step sign-in is on while it is not is a security claim the app cannot keep | restore the switches |
| K3 | **Day-start setting (B24–B26):** each booking **stores the day start it was made with**, so its days and prices never change afterwards (B25); a change applies to bookings created after it, from the next day start; the setting row is writable by Owner and Admin only, in Postgres, with an audit row; the operational day (Today, overdue, daily closing) follows the same setting, because it is one boundary today (`rentalDays.ts`) | `rentalDays.ts` itself says a change "is a migration-and-reprice question, not a display one"; B-1 | make the setting display-only |
| K4 | **Overbooking (B12):** a quantity booked beyond stock on a product that allows it **reserves no unit** — the line is marked **short** and shows the T3-13 choices (similar item or sub-rent) on the booking and on Today until it is covered. The database guard against two bookings on one unit (GiST exclusion) is **never** bypassed. Turning the switch on is a product edit (Owner · Admin · Manager); confirming a short line needs no extra approval, but it is audited | the guard is what kept double bookings out (R-35 note in CLAUDE.md); B-1 | let a flagged product reserve past stock |
| K5 | **Phone calendar feed (B28–B29):** one secret subscribe link per person; each entry shows booking number, time and client name only — **no amounts, no phone numbers, no addresses**; Driver and Technician see only jobs assigned to them; the person and Owner/Admin can **revoke** the link at once (a new link replaces it); links stop working when the person is deactivated | Law 6; a calendar link is readable by anyone who holds it | widen the entry text |
| K6 | **Offer emails (B31, B34, B43, B50):** every offer email carries an **unsubscribe link** and the one-click `List-Unsubscribe` header; an opted-out client (`client_marketing_consents`) is never sent another; a preview and a test send to the sender come first; WhatsApp offers stay **draft-only** (21 Jul rule) | B34 asks for unsubscribe; large mail providers expect one-click unsubscribe from bulk senders | send without the header |
| K7 | **PERMISSIONS housekeeping:** D1, D2, D3 and W43 leave the "ruled, not yet in code" box — they landed with 0179–0181 and 0183 and their §2 / §4.2 / §6.1 rows; the two cells that still described the old rule are corrected: §3.1 W2 ("Cannot override receiver-verification") and §4.2 `rental.pickup.override_receiver` (M+) now read "any staff allowed to hand over (C+ · Warehouse · Technician), reason ≥ 10 characters (D2, 0179)"; W2 also names Technician, as the §3 grid already does (D3) | B-3 (the document moves with the code); the stale cells contradicted §6.1 and the database | restore the two cell texts |

## H. What this settles from earlier

- **O-1** (what `babinrentals.com` shows) → B5. **O-2** (an online advance that cannot be used) → B39.
  **O-3** (deposit online) → B38. All three leave PLAN §4.2.
- **S15** "`babinrentals.com` stays as is" → narrowed by B5: the root redirects to the booking site at
  day X; a full website follows after go-live.
- **OPEN_DECISIONS §4 consumables** ("resolved as Option A … Babin may still flip to Option B") → B14
  confirms Option A with a stock count; 0141/0142 stay.
- **21 Jul "comms draft-only, never auto-sent"** → narrowed again: offer emails are sent from the app
  by email (B50), to clients who have not unsubscribed; WhatsApp stays draft-only.
- **The account-wide "Allow overbooking" switch** (one browser, localStorage) → replaced by the switch
  on each product (B12, K2, T2-23).
- **The Settings row "Two-factor authentication — Required for Owner and Admin roles"** → B21: every
  money role, built in T1-17; until then the row says "Not built yet" (K2, T1-16).

## I. Cautions Claude raised

- **Offer emails to every client:** keep the unsubscribe link in every email and honour it at once
  (K6). Claude is not a lawyer; if a client complains, stop and ask a lawyer about Nepal's Privacy
  Act 2075 before the next send.
- **Product photos:** use official manufacturer press images (or your own photos), and keep a note of
  where each came from; do not copy another rental shop's photos.
- **The day-start setting** is a large engine change (pricing, availability, Today, daily closing).
  It is a slips-first card with a design note first (T3-28); if it is late, 06:00 stays fixed and
  nothing else waits for it.

## J. Still open after this round

Nothing new from this round, and the accountant's questions are unchanged. PLAN.md §4.2 keeps O-4 …
O-17 (except O-8, already replaced) with their ⭐ defaults, plus **O-18** — the switch-user PIN length
(4 or 6 digits), raised by the T1-15 design note on 28 Oct, and **O-19** — who may write team notes
(T4-04), raised by Claude's review on 31 Oct. Both were indexed on 31 Oct.

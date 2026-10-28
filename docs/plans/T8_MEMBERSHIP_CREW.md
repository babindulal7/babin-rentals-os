# T8 — Membership & crew

**Goal:** memberships are live on day one with Babin's real plans, fair plan changes and renewals;
crew bookings bill and pay overtime and withhold TDS. **Lane A · Codex-1 (moved from Gemini, L8).** Rulings: D21–D25, D32, W68; 21 Jul and
28 Jul membership locks (discount %, priority booking, pay-later credit, benefits vary by level);
Law 10 (discounts ungated); PERMISSIONS §5 (crew payout rates and TDS: Owner, Admin, Manager,
Accounts only).

**Exit (G8):** the plans Babin sends are live; enrol, change (with credit for unused days) and renew
work and are audited; a booking for a member applies the plan's discounts; a crew line can carry
half- or full-day overtime that appears on the client bill and the crew payout; payouts show gross,
TDS and net to money roles only.

**What exists:** `membership_plans` (level is a fixed list: Academy, Creator, Cinematographer,
Production Alliance, Elite — one plan per level; label: Access Member, Partner, Elite Member; annual
fee, individual and bundle discount %, monthly booking limit, simultaneous rental limit, authorised
users, default credit limit, term months, perks: Priority Booking, Dedicated Manager, Company
Billing, Credit Terms, VIP Support, Custom Solutions). Actions `enrollMembership` (0173) and
`changeMembership` (0174). No screen to create or retire a plan. Crew: `bookCrew`, crew lines,
`crew_shoot_days.overtime_approved_by`; Crew Assist shows "TDS — not tracked yet"; the timesheet
estimates pay hourly with a hard-coded 8 hours (`src/lib/queries/timesheet.ts`, TODO(decision)).

---

### T8-01 · Load Babin's plans            status: todo · size: S · lane A + Babin
**What** — Babin sends one row per plan with exactly these columns: level (one of the five), label,
annual fee (NPR), individual discount %, bundle discount %, monthly booking limit, simultaneous
rental limit, authorised users, default credit limit (NPR), term (months), perks (from the six).
If he wants names outside the five levels, claim a migration that **adds** enum values (never
renames). Load through the T8-02 screen, or a reviewed one-off script on staging then live.
**Why** — D21, D32.
**Where** — `membership_plans`; `docs/plans/BABIN_ACTIONS.md` has the blank table.
**Database** — data; migration only for new level names.
**Done when** — plans visible on staging and live; Babin confirms the screen matches his table.
**Needs** — Babin's table (O-9).

### T8-02 · Plans admin screen            status: todo · size: M · lane A
**What** — Clients ▸ Memberships ▸ Plans: list, create, edit, **retire** (never delete — Law 3) for
Owner, Admin, Manager. A retired plan keeps its members until their term ends; it cannot take new
members.
**Why** — No screen exists; plans will change after go-live.
**Where** — `src/modules/clients/*`, `src/lib/queries/membership.ts`, new action.
**Database** — migration (claim number) for an audited `save_membership_plan` RPC if direct writes
are not already covered by RLS + audit trigger.
**Done when** — Coordinator sees plans read-only; Manager can retire; audit rows exist.
**Needs** — none.

### T8-03 · Change plan with credit for unused days            status: todo · size: M · lane A
**What** — Changing plan mid-term starts a **new term from today** and credits the **unused days of
the old plan** toward the new fee (D22): credit = old fee × days left ÷ days in old term (integer
paisa, half-up). The new fee due = new fee − credit, never below zero; ⭐ if the credit is larger
(a downgrade), the rest becomes the client's account credit, not cash. The change screen shows the
working (old fee, days left, credit, new fee, due). Merge the two write paths (0173 enrol vs 0174
change) behind one stricter rule set (refuse retired plans, deactivated clients, same plan) —
OPEN_DECISIONS §20.
**Why** — D22.
**Where** — `src/actions/clients/changeMembership.ts`, `enrollMembership.ts`,
`0174_change_client_membership.sql` successor, client page "Change plan".
**Database** — migration (claim number): replace `change_client_membership` with the credit
calculation; lifecycle step with a worked example (fee 12,000, 4 of 12 months left → credit 4,000).
**Done when** — the worked example matches to the paisa; audit holds old plan, new plan, credit.
**Needs** — T8-01.

### T8-04 · Renew a lapsed membership            status: todo · size: S · lane A
**What** — "Renew" on a lapsed (or ending) membership: charges the plan fee, starts a new term from
the renewal date, keeps history; Coordinator and above (D23).
**Why** — D23 (OPEN_DECISIONS §20 — today the function refuses "already on this plan").
**Where** — same files as T8-03.
**Database** — migration (claim number) — may share T8-03's.
**Done when** — a lapsed member renews; history shows both terms.
**Needs** — T8-03.

### T8-05 · Member benefits at booking            status: todo · size: M · lane A
**What** — In New Rental, a member's plan discounts apply automatically (individual % on items,
bundle % on bundles; stacking per the 21 Jul bundle lock), shown as a line staff can see and
remove (Law 10, no approval). Monthly booking limit and simultaneous rental limit warn at
confirm; Priority Booking marks the booking; Credit Terms follow the credit approval already in
Clients (separate from membership).
**Why** — 21 Jul / 28 Jul membership locks.
**Where** — `src/lib/pricingPipeline.ts`, `src/lib/bookingDiscountRows.ts`, `NewRental.tsx`.
**Database** — none expected.
**Done when** — a member booking on staging shows the right discount lines and totals; a non-member
shows none.
**Needs** — T8-01.

### T8-06 · Crew overtime: half or full day            status: todo · size: M · lane A
**What** — On a crew line, per shoot day, staff add **+½ day or +1 day overtime**. It is added to the
**client bill** (as a crew charge) and to the **crew member's payout** at the same day rate (D24).
Recorded who added it (`overtime_approved_by`). Coordinator sees the billed amount only (PERMISSIONS
§5); payout figures are for money roles.
**Why** — D24.
**Where** — `src/modules/rentals/booking/CrewSection.tsx`, `src/actions/crew/bookCrew.ts`,
`src/modules/crew/CrewBooking.tsx`, `crew_shoot_days`.
**Database** — migration (claim number) if the shoot-day row needs an overtime-fraction column.
**Done when** — a 3-day crew line with +½ on day 2 bills 3.5 days and pays 3.5 days; invoice and
payout agree.
**Needs** — none.

### T8-07 · Timesheet by the day            status: todo · size: S · lane A
**What** — Replace the hourly estimate (`STANDARD_DAY_HOURS = 8`) with days × day rate + recorded
overtime days. Hours stay visible as information only.
**Why** — D24 closes OPEN_DECISIONS §18.
**Where** — `src/lib/queries/timesheet.ts`, `src/modules/crew/TimesheetTab.tsx`.
**Database** — none.
**Done when** — no "Estimated pay" label remains; totals match Crew Assist payouts.
**Needs** — T8-06.

### T8-08 · TDS on crew payouts            status: todo · size: M · lane A + accountant
**What** — Settings ▸ Financial ▸ "TDS on crew payouts" (rate set by the accountant — O-5). Crew
payouts show **gross, TDS, net**; a TDS report per month for the accountant. Until a rate is set,
payouts show "TDS: rate not set". Money roles only (PERMISSIONS §5).
**Why** — D25 (§4.12).
**Where** — `src/modules/crew/CrewBooking.tsx` (~lines 329–341), settings table, reports.
**Database** — migration (claim number) if payouts need stored TDS figures (they should — a later
rate change must not rewrite past payouts).
**Done when** — a payout with a set rate stores and shows gross/TDS/net; changing the rate later
does not alter it.
**Needs** — accountant's rate (O-5).

### T8-09 · Staff renting gear            status: done — awaiting merge (lane-a/T8-09-staff-renting-gear) · size: S · lane A · [go-live]
**What** — A client can be marked **Staff** (linked to the staff member's user). A Staff client's
bookings get a **20% staff discount** line automatically (W68), shown and removable like any other
discount (Law 10 — no approval gate). Everything else is a normal client booking: deposit, ID on
file, invoice, payments. Today one staff member already rents as a client.
**Why** — W68.
**Where** — client record, `src/lib/bookingDiscountRows.ts`, `src/lib/pricingPipeline.ts`,
Settings ▸ Financial (staff discount % = 20, editable).
**Database** — migration (claim a number) only if a `is_staff_client` / linked-user column is needed.
**Done when** — a Staff client's booking shows the 20% line; changing the setting changes new bookings
only.
**Needs** — none.

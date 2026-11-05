# Babin Rentals OS â€” PERMISSIONS
**v1.0 Â· 22 Bhadra 2083 BS Â· 7 Sep 2026**
Location: `docs/PERMISSIONS.md` (beside Foundation v3.0 and UI_UX.md)

> ## â³ Ruled 26â€“27 Oct 2026, not yet in code â€” these cells change when their task lands
>
> Babin's rulings in [`RULINGS-2026-10-26.md`](../RULINGS-2026-10-26.md),
> [`RULINGS-2026-10-26-workflow.md`](../RULINGS-2026-10-26-workflow.md) and
> [`RULINGS-2026-10-27-booqable.md`](../RULINGS-2026-10-27-booqable.md) change the cells below.
> Per B-3 each one is edited **in the same commit as its code, migration and T-1 fixture**, so until
> then the tables in this file still describe what runs. Do not build against the new cells early,
> and do not treat the old cells as the owner's intent.
>
> | Ruling | Cell(s) that will change | Task |
> |---|---|---|
> | D29 | Â§7 "no public signup" â†’ client sign-up by verified email (one-time code) | T7-03 |
> | D34 | Â§5 "Rental rates â€¦ Client: on request/quote only" and Â§7 "no catalogue in v1" â†’ public daily rates | T7-02 |
> | D30 | Â§7 client writes: add "pay online" (advance or invoice balance) | T7-05 |
> | W49 | Â§3/Â§7 new access path: a one-time, job-scoped delivery link for a hired rider â€” no login, no money, expires | T4-08 |
> | W53 | Sign-in: switch user on a shared device by name + PIN (4 or 6 digits â€” O-18), restoring that person's own session (not the screen-lock curtain) | T1-15 |
> | W88 | Â§4 new capability `rental.change`: booking-desk roles change items and dates after Confirm (today quote-only edits + extend) | T3-18 |
> | W68 | Â§6.1 note: a Staff client's 20% discount is an ordinary discount line (Law 10, ungated) | T8-09 |
> | B19 | Â§6.1 new row `gate.return.damage_unsigned`: a Return with a flagged unit needs a signature or a recorded refusal (reason â‰¥ 10 chars), by any staff allowed to do Return | T2-19 |
> | B21, B40 | Â§5 mechanics: once Owner arms it, money rows and money writes need the second sign-in step (`aal2`) for Owner Â· Admin Â· Manager Â· Coordinator Â· Accounts; asked again every 30 days per device; Warehouse Â· Technician Â· Driver unchanged | T1-17 |
> | B22, B23 | Â§4.10 new capability: read sign-in history â€” Owner Â· Admin; new-device email for Owner and Admin accounts only | T1-18 |
> | B26 | Â§4.10 new capability: change the rental day start â€” Owner Â· Admin | T3-28 |
> | B20 | Â§4.10 new capability: edit email and document texts â€” Owner Â· Admin | T5-13 |
> | B32 | Â§4.4 / Â§6.1: change rates by a percentage in bulk â€” **Owner only**; every other bulk field follows the existing section-save cells (0173) | T4-12 |
> | B12 (K4) | Â§4.4: "Allow overbooking" per product â€” the product-edit roles; a short line confirms with no extra approval, audited | T2-23 |
> | B10 | Â§4.3: planned downtime â€” the `maintenance.create` roles (C+ Â· Floor) | T2-21 |
> | B13, B47 | Â§5 new row: what a partner charges for temporary stock â€” money roles only | T2-24 |
> | B35, B51 | Â§3.1 / Â§4.1: floor roles add consumable lines at Pack and Handover and start a counter sale â€” never shown a price; money roles take payment | T2-20, T3-30, T3-31 |
> | B41 | Â§6.1 new row `gate.extend.clash`: an extension into another booking's dates needs an Owner Â· Admin Â· Manager decision | T3-29 |
> | B43 | Â§4.8 / Â§8.2: send offer emails â€” Owner Â· Admin Â· Manager | T5-12 |
> | B17 | Â§4.6 / Â§7: payment link â€” money roles make it; its public page takes payment for that booking only, amount set by the server | T7-15 |
> | B28, B29 | Â§3 new access path: a personal calendar link per staff member â€” number, time, client name only; Driver and Technician see only their own jobs | T4-10 |
> | B27 | Report a problem â€” any staff writes; each sees their own; Owner Â· Admin read all | T4-11 |
>
> *Landed and removed from this box (K7): D1 (0181, Â§6.1), D2 (0179, Â§6.1, Â§3.1 W2, Â§4.2),
> D3 (0180, Â§2, Â§3, Â§4.2), W43 (0183, Â§6.1 `gate.reset.qc_self_check`).*

> ## â›” VERIFIED 7 Sep 2026 â€” read Â§16 before building from Â§4, Â§5, Â§9 or Â§12
>
> Filed and then checked against the code, the repo migrations and the live database the same
> day. **The rulings are sound and are not in question** â€” Admin âŠ‡ Manager, the payment soft
> gate, client create/block, the Owner-only list, the â­ defaults. What did not survive is the
> repo-side layer:
>
> - **Â§4's âœ“ column is 26% accurate.** Of 31 rows marked "already declared in the repo", 7 name
>   a string that exists nowhere and 16 more name a real string with a different role set.
>   **14 capability strings that live in the code appear nowhere in Â§4** â€” including
>   `operations.perform`, which four implemented floor actions declare.
> - **Two rows grant Admin what the live database refuses** (Â§4.3 `purchase.approve`, and damage
>   approval in Â§4.3/Â§6.1/T-9). Per Â§0 the stricter side wins, so both are corrected below â€”
>   the one place the schema implements an approval ladder, it is Owner Â· Manager, not M+.
> - **Â§5's enforcement is described in the present tense but is not live.** The live ledger runs
>   â€¦0077, 0078, then jumps to **0089**; 0079â€“0088 and 0090â€“0096 are unapplied, including 0092,
>   the money-column write trigger Â§5 item 3 cites. All 26 `_v` views are INSERT-able by `anon`,
>   so the column masking of item 2 is writable-through today.
> - **One live defect this document would have shipped:** `case.resolve` resolves to
>   `isStaff()`, so Warehouse, Technician and Driver can set a damage disposition **and cost**
>   right now. That is a money write by a money-blind role â€” P4 and N-1, not a gap.
>
> Full table with evidence in **Â§16**. Corrected rows below carry â›” inline. Version is **v1.2**;
> the header's v1.0 and Â§14's v1.1 entry both predate this pass.

> One document owns who may do what. Every module spec, every RLS policy, every `rbac.ts` check reads from here. Where code disagrees with this document, the **code is the defect** â€” unless the disagreement is a DB policy that is *stricter*, in which case this document is amended to match (a UI gate more permissive than RLS is the dangerous direction).

---

## 0. Precedence and scope

| Rule | Statement |
|---|---|
| Authority | This file supersedes every role/permission table inside module specs: Foundation v1.x Â§08, Administration v3.1 Â§1/Â§7, the 22 Jul RBAC grid, Automation/Communication v3.1 permission tables, Crew v3.2 Â§permissions, Handover v1.1 Â§13, Finance v2.1 Â§RBAC. Those sections become one line: *"Permissions: see PERMISSIONS.md Â§4."* â›” **Scoped 8 Sep:** every spec named here (Foundation, Administration v3.1, Crew v3.2, Handover v1.1, Finance v2.1, the 22 Jul grid) lives in `ARCHIVE/mds and photos/` **outside this repo** and is already retired by being there â€” there is nothing in the repo to rewrite. The one in-repo set that *looks* like a target, `docs/pages/*.md`, is **not** one: it records what the code gates on with a `file:line` per predicate, and Â§16 measured this document's own catalogue at 26% against it. Replacing those Gates tables with a pointer would delete the better source. They carry a cross-reference instead. |
| Newest wins | Per RULINGS-2026-09-04 â€” this is the newest ruling on permissions. Silence elsewhere is not supersession. |
| Role set | **9 roles as in code**: `Owner Â· Admin Â· Manager Â· Coordinator Â· Warehouse Â· Technician Â· Accounts Â· Driver Â· Client`. Values stay Capitalised in the `system_role` enum; nothing is renamed. |
| Scope | Every module â€” built, light-v1 and parked (Crew Assist full, Communication Center, Automation Center, AI Assistant, Client Portal). Parked modules inherit their cells when built; nobody re-decides them. |
| Fixed in v1 | The matrix is **code + RLS**, not data. Settings â–¸ People & Access *shows* it read-only. Changing a cell is a migration + `rbac.ts` edit + test update, exactly like a numbering format. (An editable matrix UI would be the Numbering editor again â€” a saved-looking screen that changes nothing or breaks a policy.) |
| Vocabulary | "Client", never "customer". Money renders `Rs 1,23,456`. Booking numbers `#<n>`. |
| Build-time authority | **Claude may resolve any conflict, gap or ambiguity it meets while building â€” in this document, a spec, code or a migration â€” without stopping to ask**, under the conditions in Â§15. Every such decision is logged as a ruling Babin can flip. |

---

## 1. Ten permission laws

These sit beside PLAN.md's 17. Numbered P1â€“P10 so they can be cited.

| # | Law | Why |
|---|---|---|
| **P1** | **Deny by default.** A capability not mapped in `checkCapability` denies every role including Owner. An unidentified session resolves to `Client` and reads nothing staff-side. | Already the code's behaviour since 11 Aug; this makes it a law so nobody "fixes" it. |
| **P2** | **Enforce in Postgres, mirror in UI.** RLS + write triggers are the enforcement. `rbac.ts` exists so screens can hide and disable *before* the DB refuses â€” never as the only check. | Law 6 lesson: three Handover revisions hid money in the UI and the role still saw it. |
| **P3** | **UI âŠ† DB.** For every capability, the roles `rbac.ts` allows must be a subset of the roles the RLS policy admits. Test-asserted (Â§12). | A UI that offers what the DB refuses produces a "saved" toast on a failed write. |
| **P4** | **Money-blind is a role property, not a screen property.** `Warehouse Â· Technician Â· Driver Â· Client` never receive an amount â€” not in a row, a gate checklist, a hover card, a CSV, a WhatsApp template or the DOM. Omit, never blank. | Foundation v1.3, Law 6, `auth_can_view_money()`. |
| **P5** | **Nothing is deleted, so nothing has a Delete permission.** Archive / Void / Reverse / Deactivate are the verbs. The only true deletes: an unused template, an unstarted draft. | Law 3. |
| **P6** | **Every override writes audit.** Overbooking override, gate override, block, merge, reversal, counter reset, restore â€” each carries actor, role, reason (â‰¥10 chars where stated) and the record. Audit is append-only for everyone including Owner. | 21 Jul, Admin v3.3 Â§26. |
| **P7** | **Approval follows the ladder.** `Owner > Admin > Manager > (Coordinator = Accounts) > (Warehouse = Technician = Driver) > Client`. A role can approve only what this document names; nobody approves their own submission. | His ruling 7 Sep: Admin is the boss; Manager runs daily operations and reports. |
| **P8** | **Floor identity is a PIN, not a role.** On shared floor devices `staff_auth_pins` identifies *who* performed the verb; it never widens *what* the device's role may do. | `staff_auth_pins` exists; audit needs a person per row (Cleaning v3.1). |
| **P9** | **Client is external.** `auth_is_staff()` is false for `Client`. Client reads only rows joined to its own `client_id`. Client has exactly four write actions (Â§7). Staff directory (`staff_directory_v`) is readable by all internal staff roles via `auth_is_staff()`, strictly closed to Client and anon (Babin ruling 3 Oct 2026, 0148). | 22 Jul portal upgrade, 4 Aug one-page portal, 3 Oct ruling. |
| **P10** | **A denial is quiet unless the user is acting.** Hidden from nav (âœ•), rendered without the gated part (â—), or a disabled primary naming the gate. Never a toast, never "permission denied" for money â€” the figure simply is not there. | Ease of use wins conflicts (29 Aug). `PageBody` order: restricted â†’ error â†’ loading â†’ empty â†’ children. |

---

## 2. The nine roles

| Role | Who this is at Babin | One-line grant | Money |
|---|---|---|---|
| **Owner** | Babin | Everything, plus the Owner-only list (Â§6.2). | All |
| **Admin** | The boss / deputy owner | Everything **Manager** can do **plus** system: users (up to Manager), Settings writes, branches, integrations, backups (run), Automation. Not the Owner-only list. | All |
| **Manager** | Runs daily operations and reports | All floor verbs, all approvals under threshold, block/merge clients, overbooking override, payment reversals, cancel after Packed, Reports in full. **Settings view only.** No users, no integrations, no backups. | All |
| **Coordinator** | Rental coordinator / front desk (Sales folded in) | Bookings end to end (create Â· confirm Â· edit Â· extend Â· cancel before Packed), Clients create/edit, **Payments full** (records advance and more â€” 22 Jul), Quotes/Invoices/Agreements generation, comms drafts, Sub-rental + Suppliers. Floor verbs allowed. | **Booking money + client balance/deposit only.** No purchase cost, ROI, utilisation %, P&L, payout rates. |
| **Warehouse** | Floor staff, equipment caretaker | Pack Â· Handover Â· Return Â· Reset; scan; stock check; equipment identity/units/location/labels; raise damage/missing/maintenance; create a booking (no discount line); walk-in client (commercial section not rendered); submit own expenses. | **None.** Gate checklist reads "Payment required" with no amount. |
| **Technician** | AC / prep technician | All four floor verbs: Pack, Handover, Return, Reset (D3, 26 Oct 2026); scan; Maintenance jobs and Cases (write), equipment condition at intake. | None |
| **Accounts** | Accountant | Finance in full: record payments, issue/void invoices with credit note, expenses entry + approval under threshold, deposit refund confirmation, VAT/registers, all Reports. Suppliers (with Coordinator). Crew payouts + TDS. **No payment reversals** (â­ Â§13). No floor verbs, no booking edits. | All |
| **Driver** | Delivery / logistics | Own assigned trips: read booking header, items, destination, receiver phone/address **inside the trip only**. Submit own fuel/transport expenses. Nothing else. | None |
| **Client** | External â€” a production house's people | Portal only (Â§7). | Own invoices/payments/deposit only |

**Staff** = every role except Client.

### 2.1 What separates Admin from Manager (his 7 Sep ruling)

```
Admin   = boss         â†’ Manager's grant + system configuration
Manager = daily ops    â†’ floor, approvals under threshold, reports; reads Settings, cannot write them
```

If a future rule needs "the boss but not the owner", it goes to Admin. If it needs "whoever is running the floor today", it goes to Manager. Owner-only items never move down (Â§6.2).

---

## 3. Module Ã— role grid

Legend: **âœ…** Full Â· **ðŸ‘** View Â· **â—** Limited (explained in Â§3.1 by code) Â· **âœ•** None â€” hidden from nav and unroutable (direct URL â†’ `RestrictedState`).

| Module / surface | Owner | Admin | Manager | Coord. | Ware-house | Tech. | Accounts | Driver | Client |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Dashboard** (jobs only, no money KPIs) | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | ðŸ‘ | â— D1 | âœ• |
| **New Rental** (full page) | âœ… | âœ… | âœ… | âœ… | â— W1 | âœ• | âœ• | âœ• | âœ• |
| **Operations â€” Pack** | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | âœ• | âœ• | âœ• |
| **Operations â€” Handover** | âœ… | âœ… | âœ… | âœ… | â— W2 | â— W2 | âœ• | â— D2 | âœ• |
| **Operations â€” Return & triage** | âœ… | âœ… | âœ… | âœ… | â— W3 | â— W3 | âœ• | â— D2 | âœ• |
| **Operations â€” Reset** | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | âœ• | âœ• | âœ• |
| **Operations â€” Cases** (damage/missing) | âœ… | âœ… | âœ… | â— C1 | â— W4 | â— W4 | â— A1 | âœ• | â— P1 |
| **Rentals â€” Bookings** | âœ… | âœ… | âœ… | âœ… | â— W5 | ðŸ‘ | â— A2 | â— D3 | â— P2 |
| **Rentals â€” Productions** | âœ… | âœ… | âœ… | âœ… | ðŸ‘ | ðŸ‘ | ðŸ‘ | âœ• | âœ• |
| **Rentals â€” Sub-Rental + Suppliers** | âœ… | âœ… | âœ… | âœ… | ðŸ‘ | ðŸ‘ | âœ… | âœ• | âœ• |
| **Calendar** | âœ… | âœ… | âœ… | âœ… | ðŸ‘ | ðŸ‘ | ðŸ‘ | â— D1 | âœ• |
| **Crew Assist** (light v1 â†’ full, parked) | âœ… | âœ… | âœ… | â— C2 | âœ• | âœ• | â— A3 | âœ• | âœ• |
| **Inventory â€” Equipment** | âœ… | âœ… | âœ… | â— C3 | â— W6 | â— T1 | â— A4 | âœ• | âœ• |
| **Inventory â€” Bundles** | âœ… | âœ… | âœ… | â— C3 | â— W7 | ðŸ‘ | ðŸ‘ | âœ• | âœ• |
| **Inventory â€” Stock Check** | âœ… | âœ… | âœ… | ðŸ‘ | âœ… | âœ… | ðŸ‘ | âœ• | âœ• |
| **Inventory â€” Maintenance** | âœ… | âœ… | âœ… | ðŸ‘ | â— W8 | âœ… | â— A4 | âœ• | âœ• |
| **Inventory â€” Purchase Requests** | âœ… | âœ… | â— M1 | â— C4 | â— W9 | â— W9 | ðŸ‘ | âœ• | âœ• |
| **Clients** | âœ… | âœ… | âœ… | â— C5 | â— W10 | â— T2 | â— A5 | â— D4 | â— P3 |
| **Finance â€” Dashboard** | âœ… | âœ… | âœ… | âœ• | âœ• | âœ• | âœ… | âœ• | âœ• |
| **Finance â€” Invoices** | âœ… | âœ… | âœ… | â— C6 | âœ• | âœ• | âœ… | âœ• | â— P4 |
| **Finance â€” Payments** | âœ… | âœ… | âœ… | âœ… | âœ• | âœ• | â— A6 | âœ• | â— P4 |
| **Finance â€” Expenses** | âœ… | âœ… | âœ… | â— E1 | â— E2 | â— E2 | âœ… | â— E2 | âœ• |
| **Finance â€” Documents** | âœ… | âœ… | âœ… | âœ… | â— W11 | ðŸ‘ | âœ… | âœ• | â— P5 |
| **Reports** | âœ… | âœ… | âœ… | â— C7 | â— W12 | â— W12 | âœ… | âœ• | âœ• |
| **Tools â€” calculators** | âœ… | âœ… | âœ… | âœ… | â— W13 | â— W13 | âœ… | âœ• | âœ• |
| **Tools â€” Admin: Audit Log** | ðŸ‘ | ðŸ‘ | ðŸ‘ | âœ• | âœ• | âœ• | ðŸ‘ | âœ• | âœ• |
| **Tools â€” Admin: Backup & Restore** | âœ… | â— AD1 | âœ• | âœ• | âœ• | âœ• | âœ• | âœ• | âœ• |
| **Tools â€” Admin: Numbering** | âœ… | ðŸ‘ | ðŸ‘ | âœ• | âœ• | âœ• | ðŸ‘ | âœ• | âœ• |
| **Settings â€” General** | âœ… | âœ… | ðŸ‘ | ðŸ‘ | âœ• | âœ• | ðŸ‘ | âœ• | âœ• |
| **Settings â€” Financial** (money-gated tab) | âœ… | âœ… | ðŸ‘ | âœ• | âœ• | âœ• | ðŸ‘ | âœ• | âœ• |
| **Settings â€” People & Access** | âœ… | â— AD2 | ðŸ‘ | âœ• | âœ• | âœ• | âœ• | âœ• | âœ• |
| **Settings â€” Branches** | âœ… | âœ… | ðŸ‘ | âœ• | âœ• | âœ• | âœ• | âœ• | âœ• |
| **Own profile** (theme, text size, language, PIN) | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… |
| **Communication Center** (parked) | âœ… | âœ… | âœ… | â— C8 | â— W14 | âœ• | â— A7 | âœ• | âœ• |
| **Automation Center** (parked) | âœ… | âœ… | ðŸ‘ | âœ• | âœ• | âœ• | âœ• | âœ• | âœ• |
| **Notifications** (own inbox) | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… | âœ… |
| **AI Assistant** (roadmap) | â— AI | â— AI | â— AI | â— AI | â— AI | âœ• | â— AI | âœ• | âœ• |
| **Client Portal** | âœ• | âœ• | âœ• | âœ• | âœ• | âœ• | âœ• | âœ• | âœ… |

Staff never see the Client Portal as themselves; a Coordinator opening it uses "View as client" from the client record (read-only, audited).

### 3.1 Limited cells explained

| Code | Role | What "Limited" means |
|---|---|---|
| **W1** | Warehouse | May create and confirm a booking (matches applied RLS `bookings_insert`, `booking_stage_transitions_insert`). Cannot add a discount line (`booking_discounts_money_blind`) â€” the whole RPC is rejected, never silently dropped. Pricing rail, totals and advance figures not rendered. |
| **W2** | Warehouse Â· Technician (D3) | Completes handover sessions: scan, checklist, signatures, evidence. Payment/deposit gates render **pass/fail with no amount**. May release with payment outstanding **after the warning, logged** (his ruling; 21 Jul soft gate). May override receiver-verification with a reason of at least 10 characters (D2, 0179; corrected 27 Oct, K7). |
| **W3** | Warehouse Â· Technician | Full return triage (scan-in, OK/Flag, Damage photo, Missing note, condition). Enters damage description/evidence/severity â€” **no cost field**. Deductions and refund figures not rendered. |
| **W4** | Warehouse Â· Technician | Raise a case, add evidence and notes. Cannot set disposition, cost or close. |
| **W5** | Warehouse | List and detail without money; row action = the next floor verb only. No cancel, extend, edit dates. |
| **W6** | Warehouse | Add equipment (Quick Add name + serial), edit identity/units/location/condition-at-intake, print labels, move rack/shelf/case. **Purchase and Pricing sections not rendered.** No retire or bulk stock adjustment. |
| **W7** | Warehouse | Sees bundle contents and per-model availability; rates and savings hidden; cannot edit bundles. |
| **W8** | Warehouse | Create a maintenance job (item â†’ Maintenance, blocks availability). Cannot approve cost or clear. |
| **W9** | Warehouse Â· Technician | Draft a purchase request; cannot approve. |
| **W10** | Warehouse | Directory names/phones for the walk-in and floor; **create walk-in client with Â§3 Commercial not rendered** (membership None, credit Rs 0). No balances, deposits, credit, PAN/ID documents. |
| **W11** | Warehouse | Operational documents (packing list, delivery note, agreement for signature) with **prices suppressed**. No invoices, receipts, quotes. |
| **W12** | Warehouse Â· Technician | Operational reports only (pickups, returns, overdue counts, packing, inspections, maintenance/downtime). **No Rs, no utilisation %, no ROI.** |
| **W13** | Warehouse Â· Technician | Camera/lens/production calculators and depreciation *tool* for own use; finance calculators (rental price, VAT, profit, depreciation values) not rendered. |
| **W14** | Warehouse | Read conversations attached to a booking they are working; send **lifecycle** WhatsApp/SMS drafts (ready/pickup-tomorrow/return-reminder). Money templates (receipt, balance due) not offered. |
| **T1** | Technician | Equipment view + edit condition/meter counters/service notes; create maintenance job; no purchase, pricing, retire, location changes beyond Workshop. |
| **T2** | Technician | Client name and booking reference only (for cases). No contact details, no money. |
| **D1** | Driver | Own assigned trips for the day/period only. |
| **D2** | Driver | **Read-only** on trips/transport (migration 0014). Sees items, destination, receiver name; receiver phone/address **only while the trip is assigned and open**. Completing a delivery handover at the client site is â­ (Â§13 D-a). |
| **D3** | Driver | Booking header and item list of assigned trips. No money, no edits. |
| **D4** | Driver | Contact fields inside the trip only; no directory access. |
| **C1** | Coordinator | Raise and follow cases, attach evidence, propose disposition; cannot approve cost (Manager+). |
| **C2** | Coordinator | Add caretaker/crew as a priced line, book crew, see **billed** rate. Payout rate hidden (â­ Â§13 K-a). Cannot override a crew conflict or approve timesheets. |
| **C3** | Coordinator | Full equipment/bundle view with **rental rates, deposit, replacement value** (booking money). Purchase cost, book value, ROI, utilisation hidden. No create/edit of equipment or bundles (â­ Â§13 I-a). |
| **C4** | Coordinator | Draft purchase requests (from unmet demand / sub-rent events). No approval. |
| **C5** | Coordinator | Create and edit clients incl. membership; sees outstanding, deposit held, credit limit. **Credit-limit override and payment-terms beyond Immediate need Manager+ approval.** Cannot block or merge. |
| **C6** | Coordinator | Create Draft invoice from a booking, issue it, generate receipt. Cannot void (Manager+ / Accounts). |
| **C7** | Coordinator | Rentals, Clients, Operations, Fulfillment, Discounts reports with **booking money**. No P&L, cash flow, working capital, expenses, VAT, equipment ROI/utilisation, staff reports. |
| **C8** | Coordinator | Inbox two-way conversations; all templates incl. money ones (booking money); Broadcasts drafts only; no channel settings. |
| **A1** | Accounts | View cases; record recovery/absorbed amounts once disposition is approved. No disposition. |
| **A2** | Accounts | Booking read with full money; create/issue/void invoice; no booking edits, no floor verbs. |
| **A3** | Accounts | Payouts, TDS, crew PAN/ID documents (with Owner). No booking of crew. |
| **A4** | Accounts | Equipment/maintenance view **with purchase cost, book value, depreciation, maintenance cost**. No edits. |
| **A5** | Accounts | Client view with full financials; edit **payment terms and VAT profile**; no block/merge, no membership edits. |
| **A6** | Accounts | Record payments, refunds, deposit refund confirmation, credit/debit notes. **No reversal entries** (Owner/Admin/Manager). |
| **A7** | Accounts | Send payment receipt / balance-due drafts; read finance-related conversations. |
| **E1** | Coordinator | Submit expenses; view all; no approval. |
| **E2** | Warehouse Â· Technician Â· Driver | **Submit-only**: own fuel/supplies/transport claims; sees own submissions with the amount entered and nothing else. |
| **M1** | Manager | Approve purchase requests **under Rs 50,000**; above â†’ Owner (â­ threshold Â§13). |
| **AD1** | Admin | Run and schedule backups, view backup health. **Restore is Owner-only** (Â§6.2). |
| **AD2** | Admin | Create/deactivate users and assign roles **up to Manager**. Granting or revoking Admin is Owner-only. Sees the read-only matrix. |
| **AI** | money-blind roles get the money-blind agent | Four role-gated agents (Rental Â· Warehouse Â· Maintenance Â· Finance). No panel ships until backed by real computation (Law 16). AI is never Tier 1 (Â§8.3). |
| **P1â€“P5** | Client | See Â§7. |

---

## 4. Capability catalogue

Module specs name **capabilities**, never roles (Administration v3.1 rule). Every action in `src/actions/**` declares exactly **one** capability from this table; `checkCapability` in `core.ts` maps each to the role list below. **Code** column: âœ“ = string already declared in the repo (16 Aug mapping) Â· â—‹ = verify name or add.

Ladder shorthand: `M+` = Owner Â· Admin Â· Manager. `C+` = M+ Â· Coordinator. `Floor` = Warehouse Â· Technician. `Money` = Owner Â· Admin Â· Manager Â· Accounts.

### 4.1 Rentals

| Capability | Roles | DB enforcement | Code |
|---|---|---|---|
| `rental.draft` | C+ Â· Warehouse | `bookings_insert` | âœ“ |
| `rental.create` | C+ Â· Warehouse | `bookings_insert`, `booking_lines_all`, `booking_line_units_all`, `create_booking()` security INVOKER | âœ“ |
| `rental.confirm` | C+ Â· Warehouse | `booking_stage_transitions_insert` â€” and, since R-26, that same INSERT writes the booking's `inventory_reservations` rows (`0100`, trigger, SECURITY INVOKER). The five roles this policy admits are exactly the five `inventory_reservations_all` admits, so confirming and holding are one permission and one transaction. | âœ“ |
| `rental.discount` | C+ (Coordinator included) | `booking_discounts_money_blind` refuses Floor. **Ungated in amount** (31 Aug): no cap, no reason, no approver. | â—‹ split from `rental.create` |
| `rental.extend` | C+ | invoice update in place; blocked on collision with next booking (system, not role) | âœ“ |
| `rental.update_project` | C+ Â· Warehouse (UI offers edit to C+; floor views) | narrow `project_type`/`project_type_other` text edit via `updateBookingProject`; audited oldâ†’new; 0102 money trigger untouched | â—‹ |
| `rental.cancel` (before Packed) | C+ | stage-transition policy; cancellation fee tiers from Settings | âœ“ |
| `rental.cancel` (Packed or later) | M+ | reason â‰¥10 chars, audited | âœ“ (same string; stage checked in engine) |
| `rental.override_overbooking` | M+ | releases the **losing** reservation (`released_at` + `override_records` row + reason â‰¥10 chars) and re-runs the transition; the GiST constraint is never disabled and never `deferrable` (R-26, 8 Sep) | â—‹ |
| `rental.reopen` (stage-only, invoice untouched) | M+ | `apply_booking_stage_transition` fix per SPEC-P0-2 | â—‹ |
| `rental.revert` | M+ | Online; own branch for Manager; Booked/Packed to earlier Quote/Booked only; no handover, including partial pickup; reason â‰¥10 chars; atomic audit + transition (O16-3) | âœ“ locally VERIFIED (0167); not APPLIED live |
| `rental.archive` | M+ | Online; own branch for Manager; Closed/Cancelled only; reason â‰¥10 chars; retained searchable history (O16-3) | âœ“ locally VERIFIED (0167); not APPLIED live |
| `rental.close` (auto-suggest, manual confirm) | C+ Â· Accounts | close gates: outstanding 0 + deposit resolved + no open case + no pending damage | â—‹ |
| `subrental.create` | C+ | â€” | âœ“ |
| `supplier.manage` | C+ Â· Accounts | 22 Jul lock (c) | â—‹ |
| `production.manage` | C+ | light record | â—‹ |

### 4.2 Floor (Operations)

**24 October 2026 â€” approved guarded-pair integration:** the site boundary below applies in addition to every existing Â§3/Â§4 role restriction; no role cell is widened. Regression fixtures for the boundary live in `check-astra-phase0.mjs`, `test-operations-grants.mjs` and `test-reset-branch-boundary.mjs`, all required by the CI security gate.

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `rental.pack` | C+ Â· Warehouse Â· Technician | D3 (26 Oct 2026) admits Technician to pack gear | â—‹ (packRental) |
| `rental.pickup` (= Handover session) | C+ Â· Warehouse Â· Technician | soft gate: any of these may release with payment outstanding **after warning, logged** (D3 admits Tech) | âœ“ |
| `rental.pickup.override_receiver` | C+ Â· Warehouse Â· Technician â€” any staff allowed to hand over (D2, 0179; corrected 27 Oct, K7) | receiver-verification gate, reason â‰¥10 | â—‹ |
| `rental.return` (triage) | C+ Â· Floor | shared triage (21 Jul) | âœ“ |
| `rental.reset` | C+ Â· Floor | non-blocking stage | â—‹ (completeReset) |
| `inspection.record` | C+ Â· Floor | condition, evidence, severity â€” **no cost** for Floor | âœ“ (`inspection.*`) |
| `evidence.capture` | all staff on the job | mandatory on Damaged/Lost lines | â—‹ |
| `evidence.review` (accept/reject match, archive with reason) | M+ | soft-delete only | âœ“ |
| `scan` | all staff | identity by PIN (P8) | â—‹ |

**Branch scoping â€” RULING 2026-10-23 (P0-B second half, migration 0171).** The four
floor grants above carry a **site dimension** in the database, on top of the role
matrix this table states: `operations_grants` rows narrow `pack Â· handover Â· return Â·
reset` per user, per branch. **Narrowing-only** â€” a staff member with no grant rows
keeps exactly the roles above at every branch, so an empty table is a no-op and
applying 0171 changes nothing until an Owner/Admin issues a first grant. A user with
any grant history is scoped: only an ACTIVE grant for the booking's branch passes,
fail-closed inside `apply_booking_stage_transition()` for the three custody verbs and
asked early by `runFloorVerb` step 1b for all four. Migration 0172 additionally
enforces Reset queue/task writes through restrictive RLS, checking old and new
scope on reassignment. Linked items use booking branch; unbooked items use the
unit's current warehouse branch (`warehouse_id â†’ warehouses.branch_id`), not the
actor's home branch or unit's separate branch. Unknown identity/site denies.
Queue insertion, including Return's automatic cleaning enqueue, requires Reset
scope too; a Return grant alone cannot authorize it. Revoking the
last active grant scopes a user to nothing â€” never back to global. No Â§3 cell and no
role set above changed.

**Verified partial Return â€” 25 October 2026 (0177, local source only).** The same
Return role ceiling and booking-branch grant constrain direct receipt writes and
the money-free `read_verified_return_quantities` RPC. Usable serials and verified
quantity receipts release only their own reservation when their Return session
is persisted Completed; an interrupted open session retains its holds. Completed
Return seals cannot reopen or accept new receipt facts. Quantity history is
private, bounded by the booked quantity, and unavailable history blocks receipt
entry. A Reset completion stamp cannot clear a recorded QC defect. These are
enforcement repairs to existing rules, with no permission widening or hosted
application; N-5 still applies.

Grant administration is Owner/Admin only; Admin cannot issue/revoke grants for
Owner/Admin targets (including self). Direct table writes remain revoked from
authenticated roles. Approval is local source integration only; N-5 still applies.

### 4.3 Cases, Maintenance, Purchase

**Preventive maintenance â€” R-28 (8 Sep 2026).** A unit is due for service when
either its elapsed-time interval or its usage interval since the last completed
`Preventive Service` job is reached, whichever comes first. Due-ness **warns
only** â€” the unit stays bookable â€” and the intervals live on the **product
model**. Nothing is stored: `product_units_service_v` derives it at read time.

| Capability | Roles | DB enforcement | Code |
|---|---|---|---|
| `inventory.edit_service_plan` | Owner Â· Admin Â· Manager | the three intervals + grace on `products`; `products_update` policy | â—‹ |
| `inventory.record_meter` | M+ Â· Warehouse Â· Technician | `product_units.meter_hours` / `meter_hours_recorded_at`, written at intake and at Return only | â—‹ |
| `inventory.edit_product_aliases` | C+ Â· Warehouse | `product_aliases` `select`/`insert`/`update` policies (0223, T3-12) â€” one spelling maps to one product, `delete` revoked for every role (Law 3); the `remember_product_alias` RPC re-checks the same five and pins `search_path`. Rides `canWriteBookingDesk`: storing a spelling is narrower than the booking write these five already hold (N-3). No money column, so no Law 6 mask. | âœ“ |
| view `product_units_service_v` | all staff | carries no money column, so no Law 6 mask is needed â€” the view is money-free by construction | â—‹ |


| Capability | Roles | Notes | Code |
|---|---|---|---|
| `case.create` | C+ Â· Floor | Damage needs 1 photo; Missing needs a note | â—‹ |
| `case.resolve` (disposition, cost) | âœ… **FIXED 8 Sep (R-25) â€” Owner Â· Manager under Rs 25,000; Owner at or above.** Admin is refused by `auth_can_approve_damage()` on live and by 0057 in the repo. `core.ts` now returns `canApproveDamage(role, 'Manager')` â€” its first caller. The role band is the widest legal set; the Rs 25,000 threshold stays in `lib/damage`'s `approverFor()` and in the DB function, so UI âŠ† DB (P3) holds. Eight tests lock the roles; 6 of them fail if the old mapping returns. | `auth_can_approve_damage(charge)` | âœ… string and roles both correct |
| `case.record_recovery` | Money | recovered / absorbed / insurance | â—‹ |
| `writeoff.approve` | M+ under threshold Â· Owner above | â­ threshold Â§13 | â—‹ |
| `maintenance.create` | C+ Â· Floor | item â†’ Maintenance, blocks availability | âœ“ (`maintenance.*`) |
| `maintenance.work` (job updates, parts) | M+ Â· Technician | 21 Jul shared-triage lock, 0014 | âœ“ |
| `maintenance.approve_cost` | M+ (â­ Rs 25,000 proposed) | | â—‹ |
| `maintenance.clear` (back to In Stock) | M+ Â· Technician | | â—‹ |
| `purchase.draft` | C+ Â· Floor | | â—‹ |
| `purchase.approve` | â›” **CORRECTED â€” Owner Â· Manager.** Admin is refused by both `canApprovePurchase` (`rbac.ts`) and live `auth_can_approve_purchase()`. No Rs 50,000 branch exists anywhere in the capability path; the threshold is aspirational. | `auth_can_approve_purchase()` | âœ“ string Â· â›” roles |

### 4.4 Inventory

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `inventory.view` | all staff | money columns per Â§5 | âœ“ |
| `inventory.create` (Quick Add) | M+ Â· Warehouse | â­ Coordinator I-a | âœ“ |
| `inventory.edit_identity` (name, serial, tag, location, condition-at-intake, labels) | M+ Â· Warehouse Â· Technician (condition/meters only) | | âœ“ |
| `inventory.edit_pricing` (rates, deposit, min days) | M+ | Coordinator view | âœ“ |
| `inventory.edit_purchase` (purchase price, replacement value, supplier, warranty, depreciation) | M+ Â· Accounts | | âœ“ |
| `inventory.retire` / `inventory.dispose` | M+ (Owner above write-off threshold) | never delete | âœ“ |
| `bundle.manage` | M+ | â­ Coordinator I-a | â—‹ (createBundle) |
| `stockcheck.run` | M+ Â· Floor | Unverified never auto-Missing; "Confirm missing" opens a case | â—‹ |
| `stockcheck.confirm_missing` | M+ Â· Warehouse | | â—‹ |
| `inventory.stock_adjust` | Owner Â· Admin Â· Manager | `adjust_stock()` enforces role, actor, non-zero signed delta, reason â‰¥10, non-negative result, idempotent `client_uuid`; `stock_adjustments` is append-only | âœ“ |

### 4.5 Clients

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `client.create` | C+ Â· **Warehouse (walk-in, Commercial section not rendered)** | his ruling 7 Sep; CSV imports require C+ (creation âˆ© full client-contact access, Â§4.5); Warehouse keeps walk-in intake only | âœ“ |
| `client.update` | C+ Â· Accounts (payment terms, VAT profile only) | | âœ“ |
| `client.block` / `client.unblock` | **Owner Â· Admin Â· Manager** | reason from list, audited; existing bookings continue | âœ“ |
| `client.merge` | M+ | redirect record, sums balances, reversible 30 days, blocked with open booking/case | âœ“ |
| `client.change_membership` | **Owner Â· Admin Â· Manager Â· Coordinator** | puts a client on a membership plan, or moves them to another (one atomic, audited, idempotent write â€” `change_client_membership`, 0174); mirrors `client_memberships_all` (0037); **Accounts (A5: "no membership edits") and Warehouse are refused**, which is why this is not `client.update`; records no fee; 22 Oct ruling | âœ“ |
| `credit.override` (limit above membership default, terms beyond Immediate) | M+ | reason â‰¥10 | âœ“ |
| `client.view_pii` (phone, email, address, PAN/ID docs) | C+ Â· Accounts always Â· **Driver inside assigned trip only** | HIS v2.1 gate | â—‹ |
| `client.view_as` (open portal as this client, read-only) | C+ | audited | â—‹ |

### 4.6 Finance

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `money.view` | Owner Â· Admin Â· Manager Â· Accounts (all) Â· Coordinator (booking money + client balance/deposit) | `auth_can_view_money()`; Coordinator scoping is column-level (Â§5) | âœ“ |
| `payment.record` | C+ Â· Accounts | immutable row | â—‹ (recordPayment) |
| `payment.refund` | M+ Â· Accounts | capped at paid amount; deposit refund only when outstanding = 0 | â—‹ |
| `payment.reverse` | **Owner Â· Admin Â· Manager** | reversal row referencing original + reason; Accounts â­ F-a | â—‹ |
| `invoice.create` / `invoice.issue` | C+ Â· Accounts | Draft until return; issued once (4 Sep rulings) | â—‹ |
| `invoice.void` (+ credit note) | M+ Â· Accounts | issued invoices immutable; â­ S1-a default: Owner Â· Admin Â· Manager Â· Accounts (R-05). Coordinator excluded. | âœ“ |
| `deposit.confirm_refund` | M+ Â· Accounts | accountant confirms auto-calculated refund (21 Jul) | â—‹ |
| `deposit.release` | M+ Â· Accounts | never automated (Tier 3) | â—‹ |
| `closing.approve` (sign off the Daily Closing) | M+ Â· Accounts | INSERT gated by `daily_closings_finance_insert` = `auth_is_finance_or_admin()` (0078 policy, 0117 predicate, R-05). **Coordinator excluded** â€” reads the figures, cannot sign (RULINGS-2026-10-18 #1). Refused offline. Owner/Manager-only reading still open (Â§4.40(a)). | âœ“ |
| `expense.submit` | all staff | own claims for Floor/Driver | â—‹ |
| `expense.approve` | M+ Â· Accounts (â­ Rs 25,000 threshold; above â†’ Owner) | never own submission | â—‹ |
| `expense.reverse` | M+ Â· Accounts | posted expenses reverse, drafts discard | â—‹ |
| `document.create` (quote, invoice, receipt, agreement, packing list, delivery note) | C+ Â· Accounts Â· Warehouse (packing list, delivery note, agreement only) | prices suppressed for Warehouse | âœ“ |
| `document.void` | M+ Â· Accounts | | â—‹ |
| `report.view_operational` | all staff except Driver | | â—‹ |
| `report.view_money` | Money Â· Coordinator (booking-money reports only, Â§3.1 C7) | Reports read, never compute | â—‹ |
| `report.export` | roles that can view the report | export carries no column the role cannot see on screen | â—‹ |

### 4.7 Crew (light v1; full module parked)

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `crew.view` | C+ Â· Accounts | | â—‹ |
| `crew.assign` / `crew.book` | C+ | caretaker as priced line | âœ“ |
| `crew.override_conflict` | M+ | hard block otherwise, reason logged | â—‹ |
| `crew.approve_timesheet` | M+ | payout gated on approved timesheet | â—‹ |
| `finance.view_cost` (crew payout rates) | Money | Coordinator sees billed only â­ K-a | â—‹ |
| `finance.pay` (payouts, TDS) | M+ Â· Accounts | | â—‹ |
| `admin.view_pii` (crew citizenship/passport/licence/medical) | **Owner Â· Accounts** | never exported, never on a call sheet; every access audited | â—‹ |

### 4.8 Communication (parked; wa.me deep links live now)

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `comms.read` | C+ Â· Accounts Â· Warehouse (own booking threads) | | â—‹ |
| `comms.draft_lifecycle` | all staff except Driver | confirmed / ready / pickup-tomorrow / return-reminder / overdue â€” **never auto-sent** | â—‹ |
| `comms.draft_money` (receipt, balance due, reminder) | Money Â· Coordinator | Law 6 â€” a message asserting money owed is always human-sent | â—‹ |
| `comms.broadcast` (marketing) | drafts C+; **publish M+** | consent model; auto-pause thresholds | â—‹ |
| `comms.templates` | Owner Â· Admin (edit) Â· Manager (view) | version-pinned; unregistered variable blocks publish | â—‹ |
| `comms.settings` (channels, credentials, quiet hours) | Owner Â· Admin | credentials write-once, masked | â—‹ |
| OTP bodies | **nobody** â€” masked for every role incl. Owner | | â—‹ |

### 4.9 Automation (parked)

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `automation.view` (logs, queue, versions) | M+ | | â—‹ |
| `automation.edit` / `automation.publish` | Owner Â· Admin | Tier 2 node without downstream approval fails validation | â—‹ |
| `automation.replay_live` | Owner | sandbox replay Admin | â—‹ |
| Tier 3 â€” never automated | â€” | delete/restore, change permissions, alter audit, close fiscal period, approve own output, send promotions without consent, **release a deposit**, restore a backup | â€” |

### 4.10 Settings and Administration

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `settings.view` | M+ Â· Coordinator Â· Accounts (money-gated tab follows Â§5) | | â—‹ |
| `settings.manage` (General, Financial, Branches) | â›” **Code is `Owner` only** (`canManageSettings`), not Owner Â· Admin. **Since 0158 (7 Oct 2026, written, not yet applied to live) the `settings` table exists:** read = staff, money keys (`settings_is_money_key`) need `auth_can_view_money()`; write = `set_setting()` RPC, Owner only; `settings_history` append-only. Until 0158 is applied on live, settings are still `localStorage` there and D-9 is untestable on live (it runs under PGlite: `npm run test:settings`). | `settings`, `settings_history`, `set_setting()` â€” 0158 | âœ“ string Â· â›” roles |
| `delivery_zone.read` | all staff (zone name, description, active flag) â€” `fee_paisa` only when `auth_can_view_money()` | `list_delivery_zones()` returns `fee_paisa = null` for Warehouse Â· Technician Â· Driver; `get_delivery_zone_fee()` raises `insufficient_privilege` for them (Law 6, T4-07 build note 1). Clients are denied by RLS. | `delivery_zones_read_staff`, `list_delivery_zones()`, `get_delivery_zone_fee()` â€” 0189 (amended 3 Nov 2026) | âœ“ (T4-07) |
| `delivery_zone.create` | M+ | INSERT only; the Settings â–¸ System â–¸ Delivery zones control gates on this capability, not `settings.manage` (T4-07 build note 3) | `delivery_zones_insert_manager_plus`, `create_delivery_zone()` | âœ“ (T4-07) |
| `delivery_zone.manage` | M+ | UPDATE + `deactivate_delivery_zone()`; **no DELETE policy** â€” deactivate is terminal (Law 3, N-4, T4-07 build note 2) | `delivery_zones_update_manager_plus`, `update_delivery_zone()`, `deactivate_delivery_zone()` | âœ“ (T4-07) |
| `problem_report.create` | all staff | INSERT only; submit problem report with auto context (B27, B48). Clients denied by RLS. | `problem_reports_insert`, `create_problem_report()` â€” 0210 | âœ“ (T4-11) |
| `problem_report.read` | all staff (own reports) Â· Owner Â· Admin (all reports) | SELECT only; staff see own rows, Owner/Admin see all. Clients denied by RLS. | `problem_reports_select`, `list_problem_reports()`, `problem_reports_v` â€” 0210 | âœ“ (T4-11) |
| `problem_report.manage` | Owner Â· Admin | UPDATE status (Open â†’ Seen â†’ Fixed â†’ Won't fix) with reason â‰¥10 chars (Law 3). Staff cannot update/delete. | `update_problem_report_status()` â€” 0210 | âœ“ (T4-11) |
| `settings.rules` class 1â€“2 | Owner Â· Admin | BLOCK/WARN/OFF states | â—‹ |
| `settings.rules` class 3 | **Owner** + PIN + typed confirmation (2FA when built) | | â—‹ |
| `admin.users` (create, deactivate, assign â‰¤ Manager) | Owner Â· Admin | build gap: today only read/reset/revoke | â—‹ |
| `admin.grant_admin` | **Owner** | | â—‹ |
| `admin.audit_view` | M+ Â· Accounts | append-only; **no edit capability exists for anyone** | â—‹ |
| `admin.audit_config` (levels, retention, legal hold) | **Owner**, reason required; global logging cannot be disabled | | â—‹ |
| `admin.backup_run` | Owner Â· Admin | | â—‹ |
| `admin.restore` | **Owner** â€” PIN/2FA re-entry, type RESTORE, recovery checkpoint, sandbox default, maintenance mode | | â—‹ |
| `admin.numbering_view` | M+ Â· Accounts | formats are DB CHECK constraints â€” read-only by design | â—‹ |
| `admin.counter_reset` | **Owner**, reason â‰¥10, audited, blocked if any existing identifier â‰¥ new value | | â—‹ |
| `admin.date_table` (BS month-length table) | **Owner** | CSV import/export, validation, audit | â—‹ |
| `admin.integrations` / AI data-leaving policy | Owner (enable) Â· Admin (configure) | | â—‹ |

---

## 5. Money visibility (Law 6) â€” exactly what each role receives

| Data | Owner Â· Admin Â· Manager Â· Accounts | Coordinator | Warehouse Â· Technician Â· Driver | Client |
|---|---|---|---|---|
| Booking totals, discount, VAT, advance due, outstanding | âœ… | âœ… | âœ• (gate = "Payment required", no figure) | own only |
| Client balance, deposit held, credit limit, pay-later | âœ… | âœ… | âœ• | own only |
| Payments, invoices, receipts, security deposits | âœ… | âœ… (booking-scoped) | âœ• â€” **RLS filters rows** (`payments`, `invoices`, `security_deposits`) | own only |
| Rental rates, replacement value, deposit % | âœ… | âœ… | âœ• | on request/quote only |
| Purchase price, book value, depreciation, maintenance cost | âœ… | âœ• | âœ• | âœ• |
| Utilisation %, ROI, payback, idle revenue | âœ… | âœ• | âœ• | âœ• |
| Supplier cost / sub-rental margin | âœ… | cost âœ… Â· margin âœ• | âœ• | âœ• |
| Crew payout rates, TDS | âœ… | âœ• (billed only) | âœ• | âœ• |
| Expenses | âœ… | view all, no approval | own submissions only | âœ• |
| P&L, cash flow, working capital, VAT return | âœ… | âœ• | âœ• | âœ• |

Mechanics, in order of strength:
1. **Row filter** â€” RLS on `payments`, `payment_reversals`, `invoices`, `security_deposits`, `expenses` via `auth_can_view_money()`. A refused SELECT returns zero rows, not an error: the app must never read "0 rows" as "no data" for a money-blind role (`check-db.mjs` v2 lesson).
2. **Column masking** â›” **â€” writable-through on live: all 26 `_v` views are INSERT-able by
   `anon` (checked 7 Sep). Masking a column in a view does not protect the base table until
   0095 is applied.** â€” views (`v_booking_floor` pattern): `payment_outstanding` as boolean, never an amount. Coordinator's "booking money only" is a **column** rule (no `purchase_price`, `book_value`, `roi_*`, `payout_rate` in the views Coordinator reads), not a row rule.
3. **Write trigger** â€” money-blind roles cannot write a money column (0092). â›” **Repo only â€”
   0092 is NOT applied to live** (the ledger jumps 0078 â†’ 0089), so no Law 6 write trigger exists
   on production today.
4. **DOM omission** â€” `useCanViewMoney()` removes the element; KPI arrays exclude Revenue/Utilisation so nothing is in the DOM to unhide.
5. **Exports and messages** â€” CSV, print, PDF and comms templates are built from the same gated query. A Warehouse export of Settings must not contain VAT rates (kept: Financial is a money-gated **tab**, `exportConfig` walks the filtered tab list).

Known hole to keep closed: **`security_deposits` was readable by money-blind sessions on 16 Aug** (Rs 13,65,000 across 89 rows) while payments/invoices filtered correctly. Â§12 test D-3 asserts it stays closed.

---

## 6. Approval and override gates

### 6.1 The gate table

| id | Gate | Who may pass it | Reason | Audit | Source |
|---|---|---|---|---|---|
| `operations.grant` | Floor verb on a branch; Reset queue/task writes include old/new scope | Existing role policy **and** branch scope; pristine operation keeps existing role policy, history requires active branch grant | none | Existing domain receipts retained; grants carry issuer/revoker identity/time | 0171 + 0172; RULINGS-2026-10-24 |
| `operations.grant.issue_role` / `operations.grant.revoke_role` | Issue/revoke operation grants | Owner/Admin; Admin cannot target Owner/Admin, including self | none | grant actor/time; no deletion | Guarded 0171; RULINGS-2026-10-24 |
| `gate.handover.payment_outstanding` | Release gear with **payment outstanding** (advance tier not met) | **Any staff** â€” warning shown, release allowed | none | yes, per session | his ruling 7 Sep; 21 Jul soft gate |
| `gate.handover.payment_outstanding` | Release gear with **deposit outstanding** | same as above | none | yes | same rule â€” the gate is one gate |
| `gate.handover.deposit_collateral` | ID document satisfies deposit gate in lieu of cash | Any staff allowed to hand over | none | yes, recorded on collateral record | D1 (26 Oct 2026, 0181) |
| `gate.reset.qc_self_check` | Pass QC on an item cleaned by same person when alone on shift | Warehouse Â· Technician Â· Manager+ | "I am alone on shift" mandatory tick (`qc_self_checked = true`) | yes, `qc_self_checked` recorded in row and audited | W43, L7 (27 Oct 2026, 0183, T2-13) |
| `gate.handover.receiver_unverified` | Receiver not verified at handover | **Any staff allowed to hand over** | â‰¥10 chars | yes, per session | D2 (26 Oct 2026, 0179) |
| `gate.conflict.overbooking` | Overbooking (GiST conflict) | M+ | mandatory | yes; losing reservation deactivated | 21 Jul |
| `gate.conflict.crew` | Crew double-booking | M+ | mandatory | yes | Crew v3.1 |
| `gate.discount.general` | Discount â€” any % | C+ | **none** | line audited like any booking write | 31 Aug: ungated |
| `gate.case.charge_tier1` | Damage / case charge **< Rs 25,000** | Owner Â· Admin Â· Manager | yes | yes | 21 Jul |
| `gate.case.charge_tier2` | Damage / case charge **â‰¥ Rs 25,000** | **Owner** | yes | yes | 21 Jul |
| `gate.case.write_off` | Write-off (Missing â†’ Lost) | M+ under threshold Â· Owner above | yes | yes | â­ threshold |
| `gate.maintenance.cost` | Maintenance cost | M+ (â­ Rs 25,000) | yes | yes | Settings â–¸ Finance |
| `gate.purchase.request` | Purchase request | Manager < Rs 50,000 Â· Admin Â· Owner | â€” | yes | Admin v3.0 limits â­ |
| `gate.expense.approve` | Expense | M+ Â· Accounts (â­ Rs 25,000; above â†’ Owner); never own | â€” | yes | Expenses v2.2 |
| `gate.client.terms_override` | Credit limit / payment terms override | M+ | â‰¥10 chars | yes | Add Client v2.1 |
| `gate.client.block` | Block client | Owner Â· Admin Â· Manager | from list | yes | his ruling 7 Sep |
| `gate.client.merge` | Merge clients | M+ | yes | yes, reversible 30 d | Clients v2.0 |
| `gate.cancel.stage_too_late` | Cancel after Packed | M+ | â‰¥10 chars | yes | this doc |
| `gate.cancel.reason_missing` | Cancellation without valid reason | nobody | â‰¥10 chars | yes | Stage 1 (0115) |
| `gate.payment.reverse` | Payment reversal | Owner Â· Admin Â· Manager | yes | yes | Booking Workspace v2.3 |
| `gate.payment.over_invoice` | Payment exceeds invoice outstanding | nobody | â€” | yes | Stage 1 (0118) |
| `gate.payment.over_booking` | Advance payment exceeds booking estimate | nobody | â€” | yes | Stage 1 (0118) |
| `gate.invoice.void_role` | Void issued invoice (+ credit note) | M+ Â· Accounts (R-05) | yes | yes | 4 Sep rulings; Stage 1 (0117) |
| `gate.invoice.void_reason` | Void invoice without valid reason | nobody | â‰¥10 chars | yes | Stage 1 (0117) |
| `gate.invoice.void_paid` | Void paid invoice without credit note | nobody | credit note required | yes | Stage 1 (0117) |
| `gate.deposit.refund` | Deposit refund | Accounts confirms (M+ may) | â€” | yes | 21 Jul |
| `gate.reopen.role` | Reopen a Closed booking (stage only) | M+ | yes | yes | 4 Sep rulings; Stage 1 (0115) |
| `gate.revert.pre_handover` | Booked/Packed â†’ earlier Quote/Booked only; no handover or terminal booking | M+; Manager own branch; online | â‰¥10 chars | atomic audit + reversal; reservations released at Quote or refreshed at Booked | O16-3; 0167 |
| `gate.archive.terminal` | Archive a Closed or Cancelled booking; keep searchable history | M+; Manager own branch; online | â‰¥10 chars | atomic audit + terminal archive timestamp | O16-3; 0167 |
| `gate.pack.session_missing` | Booked â†’ Packed with no pack session | nobody | â€” | yes | Stage 1 (0115) |
| `gate.pack.units_unassigned` | Serial line with unassigned units at pack | nobody | â€” | yes | Stage 1 (0115) |
| `gate.pack.units_unpacked` | Unit unpacked in pack session | nobody | â€” | yes | Stage 1 (0115) |
| `gate.handover.session_missing` | Packed â†’ On Rent with no handover session | nobody | â€” | yes | Stage 1 (0115) |
| `gate.handover.units_unhanded` | Packed unit without handover line | nobody | â€” | yes | Stage 1 (0115) |
| `gate.handover.agreement_unsigned` | Agreement unsigned at handover | nobody | â€” | yes | Stage 1 (0115) |
| `gate.return.session_missing` | On Rent â†’ Returned with no return session | nobody | â€” | yes | Stage 1 (0115) |
| `gate.return.units_unaccounted` | On-rent unit with no return line | nobody | â€” | yes | Stage 1 (0115; non-physical exempt 0139, Consumable exempt 0141) |
| `gate.handover.consumable_product_missing` | Consumable line whose product row is missing at Handover | nobody | â€” | no (movement refused, handover held) | 0142 |
| `gate.stock_adjust.role` | Bulk stock adjustment by lower role | Owner Â· Admin Â· Manager | â‰¥10 chars | append-only `stock_adjustments` row | 0140; RULINGS-2026-09-29 |
| `gate.stock_adjust.negative_result` | Adjustment would make product quantity negative | nobody | â€” | refused | 0140 |
| `gate.close.no_invoice` | Returned â†’ Closed with no invoice | nobody | â€” | yes | Stage 1 (0116) |
| `gate.close.invoice_unsettled` | Returned â†’ Closed with unsettled invoice | nobody | â€” | yes | Stage 1 (0116) |
| `gate.close.deposit_unresolved` | Returned â†’ Closed with unresolved deposit | **M+ may pass it with a written reason** (0155); nobody otherwise. Offered only while Settings â–¸ Financial â–¸ Deposit rules is On; the database enforces role and reason regardless | â‰¥10 chars (`booking_stage_transitions.deposit_skip_reason`) | yes â€” `audit_events` gate `close_deposit_skipped` with deposit held/pending; **no money moves**, the deposit stays a liability | Stage 1 (0116); RULINGS-2026-10-06 (0155) |
| `gate.close.deposit_skip_role` | Deposit skip attempted below Manager | nobody | â€” | refused | 0155 |
| `gate.close.collateral_held` | Returned â†’ Closed with client collateral (ID card) still held | nobody | return collateral before closing | yes | D1 (26 Oct 2026, 0181) |
| `gate.close.open_case` | Returned â†’ Closed with open case | nobody | â€” | yes | Stage 1 (0116) |
| `gate.close.reservation_live` | Returned â†’ Closed with live reservation | nobody | â€” | yes | Stage 1 (0116) |
| `gate.unit_status.direct_write` | Direct write to product_units.status | nobody (engine-owned) | â€” | yes | Stage 1 (0114) |
| `gate.users.role_ceiling` | Role assignment exceeds caller ceiling | Owner only | â€” | yes | Stage 1 (0120) |
| `gate.users.immutable` | Deleting row from users | nobody (immutable) | â€” | yes | Stage 1 (0120) |
| `gate.booking_lines.money_blind_insert` | Direct line insert with money by money-blind | nobody (use create_booking) | â€” | yes | Stage 1 (0119) |
| `gate.discount.money_blind` | Money-blind caller attempting discount | nobody | â€” | yes | Stage 1 (0119) |
| `gate.counter.reset` | Counter reset | **Owner** | â‰¥10 chars | yes | 15 Aug â­ closed here |
| `gate.rule.class3` | Rule class 3 change | **Owner** + PIN + typed confirm | consequence note | forensic level regardless of setting | Rules Registry v1.0 |
| `gate.backup.restore` | Restore backup | **Owner** | typed `RESTORE` | yes + maintenance mode | Admin v3.3 |
| `gate.date.bs_edit` | BS date table edit | **Owner** | validation | yes | Date Engine v1.0 |
| `gate.audit.config` | Audit configuration | **Owner** | yes | forensic | Admin v3.3 |

WARN-class rules (Rules Registry) are passed by **any staff** with the warning logged â€” the same shape as the payment soft gate, because a driver at 6 AM cannot reach a manager. BLOCK-class rules are passed only by the role this table names.

### 6.2 Owner-only list (never delegated, not even to Admin)

1. Restore a backup.
2. Edit the Bikram Sambat month-length table.
3. Change audit configuration (level, retention, legal hold).
4. Reset a numbering counter.
5. Approve a damage charge or write-off **â‰¥ Rs 25,000**.
6. Grant or revoke the Admin role; deactivate an Admin.
7. Change a class-3 rule (money calculation order, deposit-as-liability, immutable payments, audit existence).
8. Enable an integration that sends client data outside Nepal (AI providers), and set its ceiling.
9. Live replay of an automation execution.
10. Retire a branch.

Everything else Admin can do. Admin âŠ‡ Manager âŠ‡ Coordinator for approvals (a higher rung can always act where a lower one may). The exception is the **approve-your-own-submission** rule: nobody approves what they submitted, at any rung.

---

## 7. Client Portal (role `Client`)

One page, no routes, sheets only. `auth_is_staff()` = false. Every read is joined to the session's `client_id`; **multi-user under one client record** (4 Aug). OTP login, no passwords; staff-enabled, no public signup.

| Code | Client may |
|---|---|
| **P1** | See own damage/missing cases **with evidence photos**; **no amount** until the Rs 25,000 approval gate clears; "Under review" is orange, never red. |
| **P2** | See own bookings (6-step client timeline, Inspection folded into Returned), items, dates, agreement status. |
| **P3** | See own client record: membership level and benefits, credit, documents. Cannot edit identity fields. |
| **P4** | See own invoices, payments, deposit held/refunded. |
| **P5** | See and download own documents (quote, agreement, invoice, receipt, delivery note). |

**Exactly four writes**, all going to a staff queue â€” the portal never changes a booking, invoice or stock directly:

| Write | Result staff-side |
|---|---|
| Request gear (free text, no catalogue in v1) | Draft quote task for Coordinator |
| Request extension (collision check runs before submit) | Extension request on the booking; Coordinator confirms |
| Upload payment proof | Attached to invoice; **never changes invoice status** until Accounts/Coordinator records the payment |
| Sign agreement | Signature stored with device/IP/time; agreement â†’ Signed |

`portal_users`, `portal_sessions`, `portal_auth_challenges` are **deny-all today**. They stay deny-all until the session â†’ `client_id` binding is written and tested (Â§12 D-5). Guessing it wrong exposes one client's data to another.

### 7.1 Hired Rider Link (non-login access path Â· W49 Â· T4-08 Â· R1â€“R5)

For hired delivery riders who lack staff logins:
- Staff issue an ephemeral single-job link (`create_rider_link(client_uuid, job_id, rider_name, rider_phone)`) with Law 8 idempotency (`client_uuid`). Replaying the same key returns the existing link with `already_issued: true` without re-minting.
- **Server-minted token (R3)**: Generated on the server (128+ bits entropy) and returned once; only SHA-256 hash is persisted in `delivery_job_links.token_hash`. Raw tokens never touch database storage, audit events, or server logs.
- **Credential masking (R1)**: `delivery_job_links.token_hash` is excluded from staff SELECT grants â€” direct `select token_hash` by Coordinator or Warehouse is refused at the column level.
- **Service-role only RPCs (R1 / D-10.6)**: Rider-facing RPCs (`get_rider_job_by_token`, `rider_mark_picked_up`, `rider_complete_delivery`) are granted exclusively to `service_role` and revoked from `public, anon, authenticated`. Direct RPC execution by any signed-in user or stranger is refused at the grant.
- **Edge Function mediation & error masking (R4)**: Public access path via dedicated `/rider/:token` route and `rider-link` Edge Function. Auth/permission refusals (42501) map to a uniform message ("This link is no longer valid") without logging or leaking tokens, hashes, phones, or names.
- **Strictly money-blind (Law 6)**: The rider endpoint and UI receive zero prices, rental rates, delivery charges, deposit requirements, invoice totals, or client financial statuses.
- **Single-job boundary**: The link resolves exactly one delivery job. Cross-job traversal or enumeration is impossible.
- **Permitted actions**:
  1. View pickup location (shop branch) and drop address with contact phone.
  2. View item summary (equipment descriptions and quantities; zero rates).
  3. "Picked up from shop" transition (`status` -> `In Transit`).
  4. "Complete delivery" transition with receiver name, drawn signature, and optional photo (`status` -> `Delivered`).
- **Fail-closed security**: Once delivered, failed, revoked by staff, or after 24 hours, the link immediately ceases to function. A used link cannot deliver twice. Direct table access is denied to anon and authenticated; all mutations are governed by security-definer RPCs.

---

## 8. Parked modules â€” cells pre-ruled

### 8.1 Crew Assist (light v1 now: caretaker as priced line; full module later)
Grid row and Â§4.7 apply unchanged when the module returns. Payouts live in Finance (Accounts), booking lives in Rentals (Coordinator). Crew ID documents: Owner Â· Accounts only, never exported.

### 8.2 Communication Center
Draft-only law stands for every channel: **nothing is ever auto-sent**, and nothing is ever logged as "sent" from a wa.me link. Money-asserting messages are human-sent by money roles. Broadcasts are marketing only and publish at M+. OTP is masked for everyone. Chat windows are launchers â€” Create Booking / Receive Payment / Extend open the owning workspace with its own gates.

### 8.3 Automation Center
Owner Â· Admin edit and publish; Manager reads logs and queue. **Autonomy tiers are permissions**: Tier 1 completes alone (notifications, reminders, non-financial transitions, reports, backups, labels); Tier 2 prepares and a named role completes (draft invoice â†’ `invoice.issue`; calculate damage â†’ `case.resolve`; propose refund â†’ `payment.refund`); Tier 3 never (see Â§4.9). Publishing a Tier 2 node without a downstream approval step fails validation. AI nodes are never Tier 1.

### 8.4 AI Assistant (roadmap)
Four agents inherit the caller's role â€” the Warehouse agent can never see or say a figure. No panel ships without real computation behind it (Law 16). Every call logged with record touched.

### 8.5 Notifications
Everyone has an inbox. Role defaults: Coordinator â†’ bookings; Warehouse/Technician â†’ queues; Accounts â†’ payments; Owner/Admin/Manager â†’ morning digest + exceptions. Content obeys Â§5 â€” a Warehouse notification never carries an amount.

---

## 9. Database contract

| Helper | Returns | Used by |
|---|---|---|
| `auth_user_role()` | the session's `system_role`; resolves deactivated users to `Client`, fallback `Client` when no `users` row | every policy |
| `auth_is_staff()` | role â‰  Client | all staff tables |
| `auth_can_view_money()` | role âˆˆ {Owner, Admin, Manager, Coordinator, Accounts} | money tables + views |
| `auth_is_finance_or_admin()` | role âˆˆ {Owner, Admin, Manager, Accounts} (R-05 / S1-a default; Coordinator excluded) | invoice void, credit notes, refunds |
| `auth_is_manager_or_above()` | role âˆˆ {Owner, Admin, Manager} | stage gates (cancel late, reopen), M+ rows |
| `auth_is_owner()` | role = Owner | Â§6.2 |
| `auth_user_branch_id()` | session's `branch_id` from `users` | branch scoping in RLS and views |
| `recompute_unit_status(p_asset_id uuid)` | `product_unit_status` | unit status engine (0114) |
| `booking_estimate_total(p_booking_id uuid)` | `numeric` | payment ceiling (0118) |
| `get_model_daily_rate(product_id, bundle_id)` | `numeric` | server-side prices (0119) |

Rules:
- `create_booking()` and every future RPC stay **SECURITY INVOKER** so each insert faces its own policy (a Warehouse call that includes a discount is rejected whole).
- Every write carries `client_uuid` (Law 8) and the acting `user_id` â€” on shared floor devices the PIN resolves the person (P8).
- `branch_id` scopes rows; a role's grant applies within its branch unless Owner/Admin.
- Audit tables have **no UPDATE/DELETE policy for any role** â€” immutable by omission.
- Coordinator's money scope is delivered by **views without the excluded columns**, not by RLS on rows (RLS cannot mask a column).

---

## 10. PII

| Data | Who | Rule |
|---|---|---|
| Client phone, email, address | C+ Â· Accounts always; Warehouse phone only (walk-in/floor contact); Driver **inside assigned open trip only** | HIS v2.1 |
| Client PAN, citizenship/passport documents | C+ Â· Accounts | hidden from Floor and Driver; Evidence engine keeps them out of Marketing category |
| Staff DOB, citizenship, salary grade, contract, reviews | **Owner** + own record (`admin.view_hr`, `admin.view_pii`) | every access audited; no HR role exists yet |
| Crew ID documents | Owner Â· Accounts | never exported, never on a call sheet |
| Marketing consent flag | C+ | unchecked by default; gates Marketing photo category and broadcasts |

---

## 11. Settings â–¸ People & Access (the surface)

- **Users tab** â€” list, create (Owner/Admin), assign role â‰¤ Manager (Admin) or any (Owner), deactivate (never delete), reset PIN, revoke sessions. *Build gap today: only read / reset / revoke exist.*
- **Permission matrix** â€” renders Â§3 **read-only** from the same constant `rbac.ts` uses, with a footer: *"Permissions are code and database policy. Changing a cell is a release, not a setting."* A test asserts the rendered matrix equals the constant.
- **Security** â€” session timeout, PIN policy, password policy (12 chars, 5 attempts, 30-min lockout), 2FA (not built â€” until then Owner-only actions use PIN re-entry + typed confirmation).
- **Money-gated tab rule** â€” Financial stays a gated tab so `exportConfig` covers the CSV for free (15 Aug wave 3). Do not fold it into General.

---

## 12. Reconciliation with code and acceptance tests

Doing this section is what makes the document "bug-free". None of it is optional.

### 12.1 Code changes required

| # | Change | Where |
|---|---|---|
| R-1 | Every capability string in Â§4 has a `case` in `checkCapability`; every `capability:` declared by an action appears in Â§4. Unmapped = deny stays. | `src/actions/core.ts`, `src/lib/rbac.ts` |
| R-2 | Rename/add the â—‹ strings (e.g. `payment.record`, `rental.pack`, `rental.reset`, `rental.discount`) to match Â§4 exactly. One capability per action. | `src/actions/**` |
| R-3 | `rbac.ts` exports ONE `MATRIX` constant (role â†’ capability set). Screens, `PageBody` restricted state, nav visibility and the Settings matrix all read it. No role literal anywhere else (grep `'Owner'`/`'Warehouse'` outside `rbac.ts` and tests = defect). | `src/lib/rbac.ts` |
| R-4 | Add `auth_is_manager_or_above()`, `auth_is_owner()`; confirm `auth_is_finance_or_admin()` membership; add policies for every M+ / Owner-only row in Â§4 that has none. | new migration â€” â›” **next free number is 0097.** There is exactly one `0074`; the duplicated prefixes are **0056** and **0076**, and both halves of each are already applied to live, so renumbering them would desynchronise `schema_migrations`. Record the collision, do not renumber. |
| R-5 | Money-blind policy on `security_deposits` (row filter) â€” verify 0092 covers SELECT, not only writes. | migration |
| R-6 | Coordinator column views: `v_equipment_coordinator` (no purchase/book/ROI), `v_crew_coordinator` (billed not payout). | migration |
| R-7 | Driver: trip-scoped PII view; policies read-only on `booking_transport` / trips (0014 stands). | migration |
| R-8 | `client.create` mapped to C+ Â· Warehouse with the Commercial section behind `money.view`; `client.block` mapped to Owner Â· Admin Â· Manager. (Both were "genuinely unruled" â€” now ruled.) | `core.ts`, Add Client form |
| R-9 | Handover: remove any Manager-override requirement on the payment/deposit gate; keep warning + audit row per session. | `handoverRental.ts`, Handover workspace |
| R-10 | Settings â–¸ People & Access renders the matrix from `MATRIX`; remove any editable matrix UI. | `modules/settings` |
| R-11 | Client portal tables: write the session â†’ `client_id` binding + policies **before** turning any portal screen on. | migration + `portal/*` |

### 12.2 Tests that must exist and pass

**App (vitest)**
- **T-1 Matrix round-trip** â€” for every role Ã— every capability in `MATRIX`, `checkCapability` returns exactly the table's value. Generated from the constant, so a cell change fails until both move.
- **T-2 Fail closed** â€” an unknown capability string denies Owner.
- **T-3 UI âŠ† DB** â€” a fixture lists, per capability, the roles its RLS policy admits (kept in `rbac.policies.json`, updated with each migration). Test asserts `MATRIX[role] âŠ† policyRoles` for all.
- **T-4 Money DOM** â€” render Booking Detail, Handover checklist, Inventory row, Client drawer, Report page as Warehouse/Technician/Driver: no element matches `/Rs\s?\d/`; gate reads "Payment required".
- **T-5 Coordinator scope** â€” same render as Coordinator: booking totals present; purchase price, ROI, utilisation, payout absent.
- **T-6 Settings export** â€” `exportConfig` as Warehouse contains no Financial keys.
- **T-7 Nav** â€” every âœ• cell's route renders `RestrictedState` for that role, and the nav item is absent.
- **T-8 Handover soft gate** â€” Warehouse completes a session with payment outstanding; result: session Completed, audit row `payment_outstanding_release` with actor, no approval prompt.
- **T-9 Approval ladder** â€” `case.resolve` at Rs 24,999 by Manager passes; at Rs 25,000 by Manager fails, by Owner passes; Admin behaves as Manager here.
- **T-10 No self-approval** â€” expense submitted by X cannot be approved by X at any role.

**Database (pgTAP or `check-db.mjs` v2 per role)**
- **D-1** As Warehouse: `payments`, `invoices`, `security_deposits`, `payment_reversals`, `expenses` (others') â†’ 0 rows, no error; `bookings` â†’ all rows in branch.
- **D-2** As Warehouse: `create_booking()` with a discount line â†’ rejected whole; without â†’ succeeds.
- **D-3** As Technician and Driver: same as D-1; Driver `booking_transport` UPDATE â†’ refused.
- **D-4** As Coordinator: money rows readable; `products` purchase columns absent from the view Coordinator reads.
- **D-5** As Client A: rows of Client B â†’ 0 across bookings, invoices, payments, cases, documents; portal writes limited to the four queues.
- **D-6** As anon / no `users` row: everything staff-side â†’ 0 rows, role resolves `Client`.
- **D-7** As Owner: `UPDATE audit_events` and `DELETE FROM audit_events` â†’ refused.
- **D-8** â›” **CORRECTED 8 Sep (R-27) â€” an Admin grants nothing.** As written this row read *"As Admin: grant Admin role â†’ refused; grant Manager â†’ succeeds"*, which disagrees with the rest of this document and with the code: `canManageSettings` is Owner-only, `staff_directory_v` returns an Admin **zero rows** to act on, and Â§16 V-3/V-4 already caught the same over-crediting of Admin on the damage and purchase ladders. Â§15.1 B-1 (stricter wins) settles it. **The row now reads:** as Admin, Manager, or any other non-Owner role, `set_staff_role` and `set_staff_active` â†’ refused at every target and every value. As Owner: both succeed, except that the **last active Owner** can be neither demoted nor deactivated (migration `0101`). Executed under PGlite, 12/12.
- **D-9** As Manager: `settings` UPDATE â†’ refused; SELECT â†’ succeeds.

### 12.3 Definition of done

`PERMISSIONS.md` v1.0 is implemented when T-1â€¦T-10 and D-1â€¦D-9 are green in CI, `check-db.mjs --role <each of 9>` prints Law 6 PASS for the four money-blind roles, and PROGRESS.md logs it as **Verified**, not written.

---

## 13. Open â­ â€” defaults taken, flip in review

| ID | Question | Default in this document |
|---|---|---|
| **F-a** | May Accounts write payment reversals? | No â€” Owner Â· Admin Â· Manager only. Accounts records refunds and credit notes. |
| **F-b** | Expense approval threshold and Owner escalation figure | Rs 25,000 to M+/Accounts; above â†’ Owner. |
| **F-c** | Maintenance cost approval threshold | Rs 25,000 (M+). |
| **F-d** | Purchase approval threshold (Manager vs Owner) | Rs 50,000. |
| **F-e** | Write-off threshold escalating to Owner | Rs 25,000 (same as damage). |
| **I-a** | May Coordinator create equipment / edit bundles? | No â€” view with booking money. Warehouse Quick-Adds; Manager+ publishes pricing. |
| **K-a** | Does Coordinator see crew payout rates? | No â€” billed rate only. |
| **D-a** | Can Driver complete a delivery handover at the client site (signature + photo)? | Not yet â€” Driver stays read-only on trips (0014). If yes â†’ `rental.pickup` gains Driver *for assigned trip only*, and the payment gate warning must reach the Driver's phone. |
| **S-a** | May Accounts edit Settings â–¸ Financial values (VAT rate, payment terms defaults)? | No â€” view. Owner/Admin write. |
| **S-b** | Manager Settings write anywhere? | No. Manager reads. |
| **W-a** | Warehouse override of WARN-class rules at 6 AM | Yes â€” any staff, logged (same shape as the payment gate). |
| **P-a** | Client "Request gear" catalogue in v1 | No â€” free text. |
| **A-a** | Who reads archived audit logs? | Owner Â· Admin Â· Accounts. |
| **N-a** | Numbering counter reset needs a written reason like the old >10% discount? | Yes, â‰¥10 chars. |

---

## 14. Supersession

- Replaces: 22 Jul RBAC grid (8 roles) Â· Foundation v1.1â€“v2.0 Â§08 Â· Administration v3.1 Â§1 role reconciliation and Â§7 matrix (12 roles) Â· Automation/Communication v3.1 permission tables (6 roles) Â· Crew v3.2 permission lines Â· Handover v1.1 Â§13 Manager-override-for-payment Â· Add Client v2.1 "should Warehouse create clients" â­ Â· Clients v2.0 "who may block" â­ Â· 15 Aug "who may reset a counter" â­.
- Keeps: Law 6 mechanics, `SystemRole` enum values, 0013/0014/0017 role migrations, `canCreateBooking` five roles (Owner Â· Admin Â· Manager Â· Coordinator Â· Warehouse), discounts ungated (31 Aug), 4 Sep invoice/close/reopen rulings, portal decisions (4 Aug), autonomy tiers (Automation v1.0).
- Changelog: **v1.0 â€” 7 Sep 2026** â€” first standalone permissions document; 9 roles; Admin âŠ‡ Manager ruling; payment soft gate confirmed for all staff; client create/block ruled. **v1.1 â€” 7 Sep 2026** â€” Â§15 build-time authority: Claude resolves conflicts during the build, within named limits, logged as rulings.

---

## 15. Build-time authority â€” Claude resolves conflicts

**Ruled 7 Sep 2026.** While building the app, Claude (Claude Code or a chat session working on the repo) **may make any change needed to resolve a conflict, gap or ambiguity without stopping to ask** â€” in this document, in any spec, in code, in a migration file. The build does not wait for a ruling round. Babin reviews by flipping logged rows, not by being asked mid-task.

**End every session with the R-29 blocks.** A session ends with `## Completion` and
`## Remaining`. Run `npm run completion`; **never type a percentage by hand.** Overall is the mean
of the same five dimensions every time â€” Backend, Real data, DB enforcement, Permissions,
Lifecycle â€” so two sessions can be compared. A dimension that cannot be counted this run is
written `not measured`, never guessed. `npm run lint:progress` fails an entry missing either
heading.

**A migration is `Verified` only when `check:pglite` AND `check:lifecycle` are both green in the
same run** (R-35, issued as R-27). Unit tests cannot see across the RPC boundary: 2,834 of them
were green over a database that accepted a double booking and refused every discounted booking.

### 15.1 Always

| # | Rule |
|---|---|
| **B-1** | **Stricter wins.** When two sources disagree on a permission: deny over allow, DB over UI, fewer roles over more. A conflict is never resolved by widening. |
| **B-2** | **Three-place log, same commit.** Every decision goes to (1) `RULINGS-<date>.md` in the repo, (2) PROGRESS.md under *Ruled* (house format Did / Ruled / Verified), (3) a `// RULING <date>: <one line>` comment at the code or migration site. |
| **B-3** | **This document moves with the code.** A ruling that changes a cell, a capability or a gate edits Â§3/Â§4/Â§6 and the T-1 fixture in the same commit. The doc never lags. |
| **B-4** | **Gates stay green.** tsc 0, vitest green, build exit 0 after the change â€” a ruling that breaks a gate is not a ruling, it is a bug. |
| **B-5** | **Business figures are â­.** Thresholds, fees, percentages, retention periods: take the Â§13 default (or the most conservative figure in any source), mark â­, move on. |
| **B-6** | **Reversible by design.** Prefer the change that can be undone with one edit. Write the revert in the ruling ("revert = remove Warehouse from line 42"). |
| **B-7** | **Silence is not supersession.** A newer document that does not mention a rule has not cancelled it (RULINGS-2026-09-04). |

### 15.2 Never â€” even to resolve a conflict (Babin's explicit word required)

| # | Boundary | Why it is fixed |
|---|---|---|
| **N-1** | Add a role to the money-visible set, or remove one from `Warehouse Â· Technician Â· Driver Â· Client`. | Law 6 is the product's spine; a "small" widening leaks every figure. |
| **N-2** | Move any item off the Owner-only list (Â§6.2). | These are the irreversible actions. |
| **N-3** | Make `rbac.ts` more permissive than RLS for any capability (P3). | Produces "saved" toasts on refused writes. |
| **N-4** | Add a delete permission, an audit UPDATE/DELETE path, or a payment edit (P5, P6, Law 5). | Immutability is not configurable. |
| **N-5** | **Apply a migration to the live Supabase project.** Write it, number it, test it locally â€” do not run it. Babin applies after the backup step. | Live DB has 246 bookings and a Booqable bridge; PHASE-0-PLAN backup-first rule. |
| **N-6** | Rename or drop a `system_role` enum value, or a capability string already in a released build. | 63 files carry the literals; renames invalidate every policy expression. |
| **N-7** | Turn on any Client Portal write path before test D-5 passes. | Cross-client data exposure. |
| **N-8** | Rotate, print, log or commit a credential or API token. | The 5 Sep audit found one in the working tree â€” the fix is rotate + Edge Function secret, and that is Babin's action. |

Anything not in this table is Claude's to decide.

### 15.3 Resolution order

When sources conflict, read in this order and stop at the first that answers:

```
1  PERMISSIONS.md (this file)            â€” for anything about who may do what
2  RULINGS-*.md, newest first            â€” dated rulings
3  MASTER.md                             â€” implementation detail
4  Foundation v3.0 Â· UI_UX.md            â€” engines, look
5  The module spec                       â€” page behaviour
6  The code as found                     â€” what actually runs today
```

If none answers: choose the option that is **(a)** stricter, **(b)** least code, **(c)** reversible â€” in that order. Record which of the six sources were consulted and why they did not settle it.

### 15.4 Session report

Each build session ends with one table Babin can scan on a phone:

| Conflict | Sources that disagreed | Decision | Why | Changed where | Revert |
|---|---|---|---|---|---|
| e.g. Handover required Manager override for unpaid release | Handover v1.1 Â§gates vs 21 Jul soft gate vs 7 Sep ruling | Any staff, warning + audit | Â§6.1 row 1; stricter reading would block the floor at 6 AM, which is the one case the soft gate exists for | `handoverRental.ts:88`, Handover checklist, Â§3.1 W2 | restore the override branch, one `if` |

A row Babin disagrees with is flipped by replying with the row number. That reply becomes the next `RULINGS-<date>.md` entry.

**The table is followed by the two R-29 blocks** â€” `## Completion` (five counted dimensions, the
mean of them the Overall) and `## Remaining` (features to build Â· bugs to fix Â· rulings open, each
with a count in its heading, plus one line naming what the next session starts with). A session
that logs Did / Ruled / Verified and no Completion / Remaining is logged as unfinished.

### 15.5 Where this clause lives

Copy Â§15 verbatim into `CLAUDE.md` under a heading **"Authority to resolve conflicts"**, so every Claude Code session reads it at start. `CLAUDE.md` points back here for the full matrix; it does not restate Â§3â€“Â§6.

---

## 16. Verification pass â€” 7 Sep 2026

Method: four independent read-only lenses over code, repo migrations and the live database,
then a refuter per blocker/major, then a hand re-count of every load-bearing number. Where the
automated pass and the hand check disagreed, the hand check is recorded here and the automated
claim is marked withdrawn. Positive controls were run in the same shell as every "does not
exist" claim.

**One finding was withdrawn.** The pass reported `settings` and `expenses` carrying an
`allow_anon` policy (`USING true WITH CHECK true`) as a live anon read/write hole. Those
policies are real but live in the **`bakery_archive`** schema â€” an unrelated project sharing the
Supabase instance â€” not in `public`. `public.expenses` carries only its three restrictive
policies and `public.settings` does not exist. Every anon-permit-all policy on the project is in
`bakery_archive`. Recorded because the first query had no schema filter and the wrong version
was nearly published; the hygiene question (an unrelated schema with anon-open tables on the
same instance) is real but is not this application's.

### 16.1 Findings

| # | Â§ | Claim as written | Verified reality | Severity |
|---|---|---|---|---|
| **V-1** | Â§4 preamble | "âœ“ = string already declared in the repo" | 31 âœ“ rows: **7 name a string that exists nowhere**, 16 name a real string with a different role set, 8 are accurate on both. Actions declare `permissions: ['x']`, **not** `capability:` â€” the field name in the preamble and in R-1/R-2 is wrong. | blocker |
| **V-2** | Â§4.3 `case.resolve` | M+ under Rs 25,000, Owner above | Resolved to `canWriteSharedTriage` â†’ `isStaff()`, admitting the three money-blind roles. **âœ… FIXED 8 Sep â€” R-25.** â›” **Severity corrected: LATENT, not live.** `resolveCase.ts:19` is `implemented: false` and `core.ts:281` throws `ActionNotImplementedError` **before** the permission loop at `:294`, so the check was never reached and nothing could write; the only caller is archived (`src/archive/operations/CasesQueue.tsx`). Real, worth fixing, but not exploitable â€” so Â§16.3's ordering, which ranks it first *because* it is live, is wrong. **V-5 and V-14 are live; this was not.** | ~~blocker~~ â†’ latent, fixed |
| **V-3** | Â§4.3, Â§6.1, T-9 | Damage approval is `M+` (includes Admin) | `auth_can_approve_damage(charge)`: `>= 25000` â†’ Owner; else **Owner Â· Manager**. Admin is refused at every amount, identically in 0057 and on live. The Rs 25,000 boundary itself is correct. | major |
| **V-4** | Â§4.3, Â§6.1 | `purchase.approve` â€” Manager < Rs 50,000 Â· Admin Â· Owner | `canApprovePurchase` and live `auth_can_approve_purchase()` are both **Owner Â· Manager**. Admin refused; no Rs 50,000 branch exists. | major |
| **V-5** | Â§5 items 2â€“3 | Present-tense enforcement | Live ledger: â€¦0077, 0078, **0089**. 0079â€“0088 and 0090â€“0096 unapplied â€” including **0092** (the write trigger item 3 cites). All **26 of 26** `_v` views are INSERT-able by `anon`, so item 2's masking is writable-through. | major |
| **V-6** | Â§9 | `auth_is_finance_or_admin()` = {Owner, Admin, Manager, Accounts} | Live: **{Owner, Admin, Manager, Coordinator, Accounts}** â€” set-identical to `auth_can_view_money()`. Manager included; **Coordinator omitted by the doc**. | major |
| **V-7** | Â§4, R-1 | "every capability declared by an action appears in Â§4" | **14 do not**: `operations.perform`, `payment.create`, `inventory.reserve/pack/ready/audit/transfer`, `maintenance.complete`, `note.create`, `unit.release`, `closing.approve`, `inspection.create/pass/fail`. | major |
| **V-8** | Â§4.2, Â§3 grid | `rental.pack` C+ Â· Warehouse; Technician view-only | The four floor actions declare `operations.perform` â†’ `canPerformOperations` = Owner Â· Admin Â· Manager Â· Warehouse Â· **Technician**. Technician can complete Pack and Handover; **Coordinator cannot**. Exactly inverted. | major |
| **V-9** | Â§4.2 `inspection.record` | âœ“, C+ Â· Floor | The string does not exist. The three real ones â€” `inspection.create/pass/fail`, declared by implemented actions â€” are **deliberately unmapped** and therefore denied to every role including Owner (`core.ts` TODO(decision), PLAN Â§4.29). The document's one job on the only three capabilities actually open, and it names a fourth that never existed. | major |
| **V-10** | Â§4.4 | Five âœ“ rows: `inventory.view`, `.edit_identity`, `.edit_pricing`, `.edit_purchase`, `.retire` | None exists. The real inventory vocabulary is `inventory.create/reserve/pack/ready/audit/transfer`. | major |
| **V-11** | Â§4.4, Â§3.1 W6 | Warehouse may Quick Add equipment | `inventory.create` maps to `canCreateBundle` = Owner Â· Admin Â· Manager; **Warehouse is refused**, and `createEquipment.ts` and `createBundle.ts` both declare that one string. W6's Quick Add raises `ActionPermissionError` today. | major |
| **V-12** | Â§7 | `portal_users`, `portal_sessions`, `portal_auth_challenges` are deny-all | Only **`portal_auth_challenges`** is deny-all. `portal_users` and `portal_sessions` already carry `auth.uid()` self-read bindings and staff write paths from 0072. R-11 should be re-scoped from "write the binding" to "verify it". | major |
| **V-13** | Â§3.1 E2, Â§4.6 | Floor and Driver submit own expenses | Live `public.expenses` INSERT is gated on `auth_is_finance_or_admin()` and the only SELECT is `auth_can_view_money()` â€” those three roles can neither insert their own claim nor read it back. E2 is impossible until own-row policies exist. | major |
| **V-14** | Â§12.2 D-8 | Owner grants Manager â†’ succeeds | `public.users` had exactly **one** policy (`users_select_own`, SELECT). With RLS on there was no INSERT/UPDATE path, so **no role assignment was possible for anyone**, Owner included. **âœ… FIXED 8 Sep â€” R-27, migration `0101`.** Fixed *without* opening a write policy: `authenticated` already holds `UPDATE` on `users.primary_role` at the grant level, so an UPDATE policy would have made `email`, `branch_id` and `employee_code` writable by the same `PATCH`. Two SECURITY DEFINER RPCs instead â€” `set_staff_role`, `set_staff_active` â€” each writing one column, Owner-gated, refusing the portal role and refusing to empty the Owner set. `users` still carries **no** write policy, which POST-CONDITION 3 asserts. **N-5: written and proven under PGlite, NOT applied to live.** | ~~major~~ â†’ fixed in tree |
| **V-15** | Â§12.2 D-suite | Nine per-role database tests | Live `auth.users` = 1. There is no Manager, Accounts, Technician, Driver or Client seat to sign in as, so D-3/D-5/D-8/D-9 have no subject. Either provision the identities or document the `app.current_user_id` impersonation harness â€” `auth_user_role()` supports it. | major |
| **V-16** | Â§12.1 R-4 | "two 0074s exist; renumber first" | One `0074`. Duplicated prefixes are **0056** and **0076**, both applied to live. Next free is **0097**. Following R-4 literally would renumber applied migrations. | minor |
| **V-17** | Â§14 Keeps | "`canCreateBooking` five roles" | No such symbol. The five-role set is real, named `BOOKING_DESK`, exposed as `canWriteBookingDesk`, and shared by three predicates. | minor |
| **V-18** | Â§4.6 | `payment.record` â—‹ | The live string is **`payment.create`**, mapped to `canRecordPayment` = Owner Â· Coordinator Â· Accounts (Admin and Manager refused, contradicting Â§2's "Money: All"). Note R-2 instructs renaming it to `payment.record`, which **Â§15.2 N-6 forbids** â€” the document contradicts itself. | minor |
| **V-19** | header vs Â§14 | Header "v1.0"; changelog lists v1.1 | Both predate this pass. This document is **v1.2**. | note |
| **V-20** | location line, Â§15.3 | "beside Foundation v3.0 and UI_UX.md"; resolution order names MASTER.md | **None of the three exists** anywhere in the repo or workspace. `rbac.policies.json` (T-3) does not exist either, but that one is expected â€” T-3 creates it. Â§15.3's order needs rewriting against files that are real. | note |

### 16.2 What this does not touch

Verified true and left alone: P1 fail-closed (an unknown capability denies Owner â€” there is a
test sentinel for it); one capability per action across all 43 action files; `create_booking()`
is SECURITY INVOKER; `booking_discounts_money_blind` refuses Floor with a `WITH CHECK`;
discounts ungated on both sides; W1's `bookings_insert` / `booking_stage_transitions_insert`;
`auth_user_role()`'s `Client` fallback; `auth_can_view_money()` excluding exactly Warehouse,
Technician, Driver and Client; and the Rs 25,000 damage boundary.

### 16.3 Order of work

â›” **Re-ordered 8 Sep (R-25).** V-2 was listed here as live; it is not â€” its action is
`implemented: false` and the dispatcher refuses before the permission check, so nothing could reach
the write. It is **fixed anyway** (one line, R-25), which leaves:

**V-5** (Law 6's write trigger and the view masking are not on production) and **V-14** (no role can
be assigned at all â€” `public.users` has one SELECT policy and no INSERT/UPDATE path). Those two are
the live defects, and both need a migration, so both are **N-5: written, not applied**. Everything
else in Â§16.1 is a correction to this document.

â›” **Updated 8 Sep (R-27).** V-14 is now written too â€” `0101_staff_roles_are_assignable.sql`, proven
on the full chain under PGlite with a 12-check behavioural probe. So both remaining live defects are
in the same state: **written, tested locally, unapplied.** Neither is closed until Babin runs the
backup step and applies them; the gap between the repo and production is the risk now, not the
absence of a fix. `0101` is the sixteenth unapplied migration.

# Rulings — 10 November 2026: design direction and clean-up

**Source:** Babin, answering Claude's interactive questions in chat (10 Nov 2026, 04:27 NPT).
These are Babin's explicit answers, not Claude's defaults. Claude read `main` at `93bc916`
read-only and changed nothing. **No code, migration or live setting has been changed by this file.**

This is a presentation ruling. Permissions, money rules, status meanings, gates and engines do
not change.

| # | Question | Babin's answer | Effect | Revert |
|---|---|---|---|---|
| G-1 | Which look for the main button and skin? | **Graphite/Paper now** | Primary button fill becomes near-black in light and near-white in dark. Surfaces, borders and text move to the Graphite/Paper values in card 5. | Restore the previous `--btn-primary-*` and surface values in `theme.css` |
| G-2 | What happens to the other themes? | **Drop Glass** | The `glass` and `glass-light` modes and the sidebar Glass toggle are removed. A saved `glass` becomes `dark`; a saved `glass-light` becomes `light`. Supersedes the 13 Oct 2026 Glass ruling. `high-contrast` is not touched. | Restore the two modes in `src/lib/theme.tsx`, the toggle in `Sidebar.tsx` and the `[data-style='glass']` blocks |
| G-3 | Where may blue still appear? | **Links, focus rings and the Booked status** | `--primary` stays blue because the Booked/Reserved status and links read it. Only the button tokens go graphite. Blue is never a button fill. | Point `--btn-primary-bg` back at the blue |
| G-4 | Sidebar active item colour? | **Neutral grey** | `--nav-active-bg` becomes a neutral grey with bold text in both themes. Green only ever means a status. | Restore the emerald values in `preset-black-light.css` |
| G-5 | Order of work? | **Clean-up first, then repaint** | Card 3 (clean-up) merges before card 5 (repaint), so tokens are changed once on a clean base. | — |
| G-6 | Work buttons on Today rows? | **Glance only** | Confirms the earlier 10 Nov decision: a Today row opens the booking; work buttons live in Operations. The 30 Oct design pack's per-row buttons are not adopted. | — |
| G-7 | The 58 unused shadcn components and 3 global CSS files? | **Remove after a check** | Removed only after before/after screenshots show no visual change. | Restore the folder and the three imports in `main.tsx` |
| G-8 | Animation libraries (Skiper UI, Vengeance UI, Animmaster)? | **Not adopted** (Claude's recommendation, accepted by the choices above) | No new UI or animation library. Motion uses the existing `--dur-*` tokens in CSS. | — |

## Answers to the open questions in `RULINGS-2026-11-10.md` (ease of use)

Asked again in the same chat at 04:31 NPT. These close Q1, Q2, Q3 and Q6 of that file.

| # | Closes | Question | Babin's answer | Effect | Revert |
|---|---|---|---|---|---|
| G-9 | Q6 | Build before or after day X? | **Small ones now; large ones after the floor loop is on staging** | Now: E-1, cards 1, 3 and 4. Later: E-2 to E-7, cards 2, 5 and 6. Order in `AGENT_PROMPTS-2026-11-10-design.md`. | — |
| G-10 | Q1 | Should Technician see and use New Rental? | **Yes** | A permission change. `PERMISSIONS.md` §3 New Rental cell for Technician moves from ✕. Needs a database change, written and tested locally, applied by Babin after backup (N-5). Card 6. Until card 6 lands, E-1 keeps New Rental out of the Technician sidebar. | Return the cell to ✕, revert the rbac line, write a reversing migration |
| G-11 | Q2 | Is recording a payment from the booking enough for Coordinator? | **Yes, booking only** | Finance stays out of the Coordinator sidebar. No permission cell changes. | Add Finance to the Coordinator list in E-1 |
| G-12 | Q3 | Where does the all-bookings documents list go? | **A Rentals filter** | Rentals gets a Documents view. `?tab=documents`, `/documents` and `/finance/documents` redirect to it. Amends card E-7. | Redirect to plain `/rentals` |

Still open from that file: **Q4** (Manager sees all 11; built as yes) and **Q5** (personal
settings for floor roles; the E-1 agent checks and reports).

**G-10 needs one more answer from Babin before card 6 is built:** how much may a Technician
do? Card 6 assumes the same limits as Warehouse (W1: create a booking, no discount line, no
money shown). Anything wider is a separate ruling.

## What the 30 Oct design pack is, after this ruling

- **Adopted:** Graphite/Paper tokens (G-1), Operational Color Rules v1 (status keys unchanged),
  the header contract, the duplicate Quick Actions fix.
- **Not adopted:** per-row work buttons on Today (G-6), seven Finance screens, progressive
  sections on Booking Detail. The 10 Nov ease-of-use decisions win on all three.
- **Checklist only:** the 114-frame register. It is not 114 build tasks.

## Open after this ruling

- **High-contrast theme.** Not ruled. It stays as it is until Babin says otherwise.
- **`RULINGS-2026-11-10.md` (ease of use, R-10.1 to R-10.12)** is not on `main` at `93bc916`.
  Put it in the repo root together with this file. G-6 repeats R-10.5; R-10.5 is the source.
- **Technician scope for New Rental** (see G-10).
- **D-UX-01 to D-UX-05.** Registered by card 4; still unanswered.

## Three-place log (B-2)

When each card lands, the agent adds: (1) this file to the repo root, (2) a PROGRESS.md entry
under *Ruled*, (3) a `// RULING 2026-11-10: G-n …` comment at the changed site.

## Third round, 04:55 NPT — organize the back-office modules (keep every function)

**Principle (Babin):** keep all functions, organize better. Nothing is removed. Each role sees
less; rare tools sit behind one More menu; every old link keeps working.

| # | Question | Babin's answer | Effect | Revert |
|---|---|---|---|---|
| G-13 | How to organize the 21 reports? | **5 groups + pinned** | Reports open on five groups: Money · Rentals · Equipment · Clients · Team. Each user can pin reports; pinned ones show first. No report is removed and no report URL changes. | Restore the 11-item family strip |
| G-14 | Inventory: where do Cases, Warranty, Labels and Purchase Requests live? | **One More menu** | Inventory keeps 4 tabs (Equipment · Bundles · Stock Check · Maintenance). The four tools open from one More menu on the Inventory page. Routes unchanged. | Remove the menu entries |
| G-15 | Clients: where do Imports, Duplicates, Referrals and Coupons live? | **One More menu** | Clients keeps 2 tabs (Clients · Memberships). The four tools open from one More menu. Routes unchanged. | Remove the menu entries |
| G-16 | How do staff jump to a booking, client or item? | **Page search on every list, plus one global search. Desktop: keyboard only (Ctrl/Cmd+K), no global box. Phone and iPad: one search icon in the header.** | The always-visible global search box leaves the desktop header. Each list keeps its own search. | Put the global box back in the desktop header |
| G-17 | Settings and Admin (8 areas)? | **4 + Admin group** | Business & Tax · Staff · Branches · Preferences, plus one Admin group (Audit · Activity · Numbering · Backup) shown to Owner and Admin only. Permission cells do not change. | Restore the flat list |
| G-18 | Technician on New Rental: how much? (completes G-10) | **Same as Warehouse** | W1 limits: create a booking, no discount line, no money shown, no cancel, no extend. Card 6's assumed scope is now confirmed; its design note is still required before code. | See G-10 |

**Proposed report grouping for G-13** (the agent confirms against the routes; Babin may move any):

| Group | Reports |
|---|---|
| Money | Revenue · Sales Register · VAT / Tax · Expenses · Cash Flow · Working Capital · Promotions |
| Rentals | Pulse · Rental Reports · Operations · Forecasting · Custom |
| Equipment | Inventory · Product · Equipment Performance · Asset ROI · Damage & Maintenance · Cases |
| Clients | Client Ledger |
| Team | Staff Performance · Activity |

Money-gated reports stay absent from the DOM for money-blind roles, whichever group they sit in.
A group with nothing a role may see is not shown to that role.

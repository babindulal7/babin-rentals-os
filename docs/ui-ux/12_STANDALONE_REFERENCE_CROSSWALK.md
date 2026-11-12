# Standalone prototype → current application: 25-screen / 64-tab / 199-button crosswalk

**Audited:** 12 November 2026 · **main at:** d4486a4ac681da766b345089ad4aa36b2b6e9075  
**Purpose:** preserve the design research and exhaustive prototype component registry **without promoting its demo markup, sample figures, fake handlers, colors, or stage keys into application law**.

## Reference provenance and limits

- [Babin Rentals OS standalone.html](https://drive.google.com/file/d/1SI1F3B3ye0pSI9CR5wP8xge-6JC98lWd/view) (stored HTML, Google Drive metadata reports 962,192 bytes): **visual/prototype source**, not React source, database contract or accepted owner ruling.
- [Babin Rentals gide lines.pdf](https://drive.google.com/file/d/1Zqeg9uTXkC4atkgF-Q4PegZmV8nJKo08/view): operational staff SOP. Use its packing, dispatch, inspection, cleaning, charging, storage and safety requirements as *research*; reconcile every implementation with newer owner decisions and database gates.
- User-provided registry design labels: **S-01…S-25, T-01…T-64, B-001…B-199, DE-01…DE-60, IN-01…IN-60**, plus 13 prototype sections. These are reference identifiers, **not counted or runtime-verified React components**. Duplication between desktop and mobile is intentional in the prototype; don't implement each as a new button, screen, component or route.
- Source-first canon: [AGENTS.md](../../AGENTS.md) → [PERMISSIONS.md](../PERMISSIONS.md) and latest [RULINGS](../../RULINGS-2026-11-10-design.md) → code and database → active cards. See [README](README.md). Do not guess that an unavailable prototype action actually works.

## Navigation and 25-screen crosswalk

**Actual 11 primary destinations** from `src/data/nav.ts`: New Rental, Today, Operations, Rentals, Calendar, Crew Assist, Inventory, Clients, Finance, Tools, Settings. Documents, Payments, Expenses and Reports are capabilities/views, not 13 permanent sidebar destinations. Role-scoped navigation is essential; never reproduce the prototype's all-role links.

| Prototype | Design scope | Actual home / implementation approach |
| --- | --- | --- |
| S-01 dashboard | Today movement board | `src/modules/today/Today.tsx`, `DashboardMovementPanel.tsx`; preserve 2 independent pickup/return filters and overdue sorting; **G-6 says glance-only rows**, no work CTAs |
| S-02 rentals | All Rentals ledger | `src/modules/rentals/RentalsList.tsx`; status filters are queries, not new booking statuses |
| S-03 flow | 13 prototype sections | `NewRental.tsx`, BookingDetail, four floor workspaces. **Do not build a 13-status flow engine** |
| S-04 operations | Work queues | `src/modules/operations`; Pack, Handover, Return, Reset are canonical floor jobs. Cleaning/Inspection/Maintenance/Delivery may be task queues or views |
| S-05 crew | Crew assignment | Crew Assist module; role-gated pay information |
| S-06 calendar | Date and commitments | Calendar module; authoritative 06:00–06:00 booking day, NPT, AD/BS conversion |
| S-07 inventory | Products and serialized units | Inventory module; condition, reservations and readiness separate |
| S-08 clients | Client list | Clients module; **Client** rather than prototype's Customer |
| S-09 payments | Payment ledger | Finance module, money-capability gate |
| S-10 documents | Docs and receipts | Rentals Documents route/view per newer G-12; preserve redirects and permissions |
| S-11 expenses | Expense ledger | Finance module; irreversible/audited changes only via approved action |
| S-12 reports | Money/utilization | Governed reports, grouped Money/Rentals/Equipment/Clients/Team (G-13) |
| S-13 tools | Operational tools | Tools module; money-restricted calculators hidden from floor |
| S-14 settings | Preferences/admin | Settings: 4 groups + Admin (G-17); no 9-tab redesign |
| S-15 delivery | Driver/transport | Existing Operations/delivery module; driver money-blind |
| S-16 addEquipment | Product form | Existing Add Equipment RecordWorkspace; avoid second creation form |
| S-17 editEquipment | Product edit | Existing Edit Equipment; never allow arbitrary inventory-status writes |
| S-18 addCustomer | Client form | Existing Add Client; update copy and route to Clients |
| S-19 clientDetail | Client dossier | Existing Client Detail with finance DOM gating |
| S-20 customerDetails | Mobile client detail | **Responsive view of same Client Detail**, not separate customer entity/permission model |
| S-21 addPayment | Record payment | Existing Finance/booking action; deposit is distinct from invoice receipt |
| S-22 editPayment | Correct/void payment | Append-only ledger/correction governed by approved rules; **no direct editable posted amount** |
| S-23 search | Command palette | Existing shared search; **desktop Cmd/Ctrl+K without always-visible global box** (G-16) |
| S-24 more | Phone hub | Existing MoreSheet; role filtered |
| S-25 stub | Locked/denied page | Existing inline gate/error and restricted state; do not manufacture a fake lifecycle route |

**Do not interpret the 25 S-IDs as 25 implemented URLs or a release completion percentage.** Every entry needs a path/role/commit check before a status is marked verified.

## The 13 prototype stages are design sections, not booking states

| Prototype sections | Canonical mapping |
| --- | --- |
| Booking, Gear, Crew & Delivery, Pricing | Quote editor / New Rental section composition, not independent transitions |
| Payment and Documents | Finance/document actions with their own capability and immutable ledger rules |
| Packing | Booked → Packed via Pack |
| Pickup | Packed → On Rent via Handover |
| Active | On Rent with overdue/extension flags and governed change actions |
| Return + Inspection | On Rent → Returned via validated Return; partial Return stays On Rent |
| Reset | Cleaning + QC within Reset; does **not** change booking stage or automatically release a damaged unit |
| Completed | Returned → Closed after actual finance, deposit, cases and reservation gates; Reset is not a Close gate |

Authoritative engine: `src/lib/workflow.ts` with **Quote → Booked → Packed → On Rent → Returned → Closed**. No new 13-step `BookingStatus` enum, no client-visible Packing/Inspection/Reset status and no arbitrary bypass/next-step button.

## Reference component inventories: how to audit them

| Prototype registry | Meaning | Correct reuse method |
| --- | --- | --- |
| 64 T-IDs | A mix of tab/filter choices, category chips, period selectors and phone nav | Map to existing routed navigation, segmented controls, data filters; don't add 64 permanent tabs |
| 199 B-IDs | Individual markup/button placements and demo handler names | Group by **one real domain intent**, find existing `PageActions`, `RecordActions`, OperationsShell and APIs; don't create duplicate mobile/desktop handlers |
| 60 IN-IDs | Prototype field positions, repeated responsive fields and bound demo input values | Map to persisted data fields, existing form components, validation and permissions; same field reflows, not separate mobile state |
| 60 DE-IDs | Prototype surfaces, palette, lifecycle widgets, charts, QA rules (mixed types) | **Not the same taxonomy** as PR #112's 60 UI pattern targets; use [04_UI_COMPONENT_INVENTORY.md](04_UI_COMPONENT_INVENTORY.md) and map each DE-ID into its category |
| KPI example data | Fictional dashboard/client/financial amounts | Never render as live counts, profits or payment promises |

### High-risk prototype controls — do not ship verbatim

- `B-005/B-006` and `B-160` have `op.noop`; a visible button with no live action violates truthful UI. **G-6 rejects Today row work buttons altogether.**
- `B-002/B-004`, `B-070`, `B-158/B-159` and separate phone controls duplicate actions across header, rails or sticky footer. Enforce **one owner for each primary action** and preserve desktop/phone parity without double execution; PR #126 already cleaned one duplicate Quick Actions card.
- `B-013 Mark Paid`, `B-025 VAT toggle`, `B-027 Mark Full Paid`, `B-054 Add Damage Charge`, `B-057 Charge Deposit`, `B-095 Void`, `B-156/B-159 edit Payment`: each needs **current immutable finance/approval actions and DB checks**; no row update or broad bulk write inferred from the prototype.
- `B-038`, `B-042`, `B-053`, `B-059`, `B-065` and `B-068/B-069`: stage/footer navigation is **not** an authorization to advance custody; server-owned gates alone decide.
- `B-035 Mark All Packed`, `B-050 Receive All`, `B-062 Mark All Cleaned`: never assume every serialized unit was scanned/inspected/QC'd; show explicit evidence and per-unit confirmation.
- `DE-27` media formatting or reset: never automatically erase a client's memory cards or settings. Follow approved operator SOP and record permission for destructive steps.
- Prototype Undo toast: do not promise reversal of financial or custody side effects where the canonical action has no safe audited undo. UI toasts only after actual success.
- `DE-32` staff PIN switch: issue #62 is a **security work item**, not evidence of 2FA, IP restriction or safe cached-money purging.
- WhatsApp uses a `wa.me` **staff-send draft**. Automatic scheduled communication applies to specific email events, not WhatsApp auto-send (see `docs/WORKFLOWS.md`).
- Barcode, receipt, KYC and draft controls must fail honestly on missing reads, concurrent changes, offline saves and denied roles.

## Design authority superseding old prototype details

| Prototype claims | Current decision / source |
| --- | --- |
| Inter across app | Outfit headings, Source Sans 3 UI, JetBrains Mono IDs; `docs/UI_UX_RULES.md`; Inter prohibited |
| Cobalt/emerald primary buttons | G-1/G-3 Graphite/Paper: neutral near-black/white primary; blue for links/focus/Booked |
| Green active sidebar item | G-4 neutral grey |
| Glass style and spring animation library | G-2 drop Glass; G-8 no animation library; check actual code before claiming the cleanup landed |
| 13 fixed nav destinations | 11, `src/data/nav.ts` |
| 4 phone bottom tabs | **5** actual `BottomBar.tsx`: Today / Rentals / Scan / Inventory / More |
| Lucide glyph import per module | Shared **Tabler** semantic icon registry `src/components/ui/Icon.tsx` |
| Per-row work button on Today | G-6: Today glance-only, click row opens rental, work from Operations |
| 9 settings tabs | G-17: four categories plus owner/admin Admin area |
| 9 inventory category tabs as primary | G-14: four tabs, rare tools in one More menu |
| 8 expense tabs / 7 separate finance screens | Finance organization per current routes and newer rulings; don't resurrect rejected designs |
| All labels are English, Customer/Order/Gear | Current UI glossary requires Client/Rental/Equipment/Unit; apply approved bilingual glossary |

Reference PRs **#112, #126, #127, #128, #129 and #130 are all merged** at audit time; don't create duplicate implementation cards from their old branch descriptions. A merge is **not** evidence of staging/physical acceptance.

## Evidence status

This file is an evidence-based **crosswalk**, not an assertion that 25 screens, 64 tabs, 199 buttons or 60 inputs are fully working. No live Supabase change, state transition, email or WhatsApp message was performed.

Next: fill source-path / exact role / test / device screenshot / PR-head evidence for each *actual* user task from the existing 16-workflow catalogue. Use [13_RESPONSIVE_IMPLEMENTATION_MATRIX.md](13_RESPONSIVE_IMPLEMENTATION_MATRIX.md).

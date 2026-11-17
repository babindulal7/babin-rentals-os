# Role journeys and user research

## Roles and actual app permissions

Nine repository roles: **Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client**. For every control, read the **specific executable predicate** in src/lib/rbac.ts and enforced database capability/RLS before presenting the control; role titles alone are insufficient. Permissions may be more restrictive by branch and may change through a separate owner ruling.

| Persona cluster | Core job | Critical screen | Common failure to observe |
| --- | --- | --- | --- |
| Warehouse | Scan, pack, receive, reset, shelve | Today, Operations, floor modal | Wrong serial, missing accessory, invisible save failure |
| Technician | Equipment readiness, inspect/repair, floor verbs as actually authorized | Operations, Inventory | Unverified condition treated as ready; branch scope |
| Coordinator | Client intake, quote, confirmation, follow-ups | New Rental, Rentals, Calendar | Wrong dates, lost draft, assumed stock |
| Accounts | Invoice, payment, close where allowed | Finance, Rental detail | Double posting, money rounding, false zero |
| Manager | Resolve exceptions, assign work, review gates | Today, Operations, approvals | Override without reason/audit |
| Owner/Admin | Policy, oversight, decisions, exceptions | Reports, Settings, approvals | Unreviewed access widening or unsafe release |
| Driver | Own authorized delivery and proof | Operations/delivery view | Seeing unrelated jobs or financial information |
| Client | Allowed portal tasks only | Client portal | Staff-only content leak, misleading progress |

These are **interview hypotheses**: validate at the actual counter and warehouse. The source matrix, not this table, decides rights.

## Research protocol

Observe real work in three contexts: **morning pickup window**, **night-time return**, and **manager/accounts reconciliation**. Use staging and non-sensitive test fixtures only. Observe, do not teach the solution.

For each task record:
- participant role, device, viewport, one or two-handed use, scanner model and lighting;
- objective, start/end, number of taps/scans and unnecessary page changes;
- wrong unit/booking/amount, missing blocker, data loss, retry, offline and any role leak;
- confidence rating after completion and what the operator expected next;
- timestamped screen capture/screenshot if consent is given and no real client secrets are shown.

## Research questions

- Can a new caretaker find the **next pickup**, identify its one remaining blocker, and scan the correct unit?
- Does the iPad stay usable one-handed while moving between cases and accessories?
- Can a night-shift user record a **partial return** without incorrectly freeing the units still out?
- Do floor staff understand **reserved for next rental** versus **physically cleaned/QC-ready**?
- Can the Coordinator resolve a conflict without losing a complete draft?
- Can Accounts tell invoice due, client money held as deposit, and close gating apart?
- Can a Driver prove delivery without seeing client financials?
- Can a Manager identify a genuine **unresolved case** rather than a routine Reset task?
- Does Nepali IME composition survive focus, search, date and numeric input shortcuts?

## Baseline and outcomes

Record actual before/after measurements; do not invent baseline tap counts. Measure:
1. time from task intent to persisted completion;
2. tap count and scan count;
3. successful independent completion rate;
4. serious operator mistakes;
5. lost/duplicated writes or stale-data conflicts;
6. device/role accessibility;
7. percentage of changed screens with complete evidence (not a project-wide finish claim).

The active staff test template is ../USABILITY_TESTS.md. First conduct the existing staged task cards U1–U12, then add targeted tests only when a new screen needs them.

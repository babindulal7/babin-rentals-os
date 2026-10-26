# T10 — After go-live

Work Babin ruled on but placed **after** day X (S6), plus the "not built yet" items no go-live track
needs. Each becomes a full card when it is scheduled. **Nothing here may be pulled into a go-live
lane without Babin moving it** (PLAN §7 scope creep).

## Ruled features, built after go-live

| Item | Ruling | Notes |
|---|---|---|
| **Productions** — one shoot or project for a client, grouping its bookings, crew and dates | D26 | Shared table + RLS; today `br.productions` in one browser. Old entries arrive only through the T4-06 export file. |
| **Coupons in the database** | S6 | Today `babin_coupons_v2` in one browser. Applying a coupon is a discount line (Law 10). |
| **Warranty claims in the database** | S6 | Today `br.warranties` in one browser. |
| **Asset ROI per unit** | D16 | Split a line's revenue by days each unit was out; fills `assetRoi.ts` TODO(decision). |
| **Depreciation per category** | D17 | ⭐ cameras 3 y, lenses 7 y, lighting & grip 5 y, other 5 y, salvage 10%; editable in Settings and per asset. |
| **Purchase cost entry** for the ~180 imported products | D18 | Reports keep saying "not tracked" per product until entered. |
| **Utilisation and idle time** | (25 Jul KPI lock) | Needs unit status history over time — a status-history table. |
| **Second site** | D27 | Per-site grants already exist (0171/0172); add site admin screens and stock transfers when a site opens. |
| **Client portal extras** | PERMISSIONS §7 | Extension requests, payment-proof upload, remote agreement signing. |
| **Nepali documents and booking site** | T6 note | PDFs need an embedded Devanagari font. |

## "Not built yet" screens and buttons (from the 26 Oct marker scan)

- **Admin:** Backup & Restore service, Audit settings rules, Numbering export (PDF/Excel/JSON/XML).
- **Inventory:** Add/Edit Warehouse, advance or cancel a stock transfer, shelf/rack labels, bundle
  templates and import, Stock Check "confirm missing", per-unit accessory checklists and booking bars.
- **Finance:** expense receipt upload and expense reversal (needs a reversal number sequence).
- **Crew:** call sheets.
- **Clients:** KYC verification and credit-limit modals marked unavailable.
- **Reports:** Forecasting (no validated model — Law 16) and the live Custom Report builder.

## Stage 6 width (from the September roadmap)

Communication centre (inbox, WhatsApp Cloud API, SMS), automation, AI assistant with validated
computation (Law 16), Android and iOS store builds (Capacitor / installed PWA first).

## Code health

- ~9,300 inline `style={{}}` objects; files over 2,500 lines (Calendar 4,264, BookingDetail 3,431,
  RentalsList 3,220, AddBundle 3,058).
- Supabase performance advisories from 17 Oct (unindexed foreign keys, multiple permissive
  policies) — review against real query plans, never drop by count.
- Main bundle 704 kB (20 Oct) — after T1-14's first pass.
- Coverage only measures `src/lib/**`.
- **Seven global style layers** load on every screen (`src/main.tsx`: `theme.css`,
  `preset-black-light.css`, `ui-v2.css`, `responsive.css`, `shadcn-preset-pilot.css`,
  `shadcn-luma-ui.css`, `shadcn-rhea-ui.css`). Merge them into one token layer after go-live, behind
  light/dark/role screenshot baselines and `check:contrast` (106/106 on 26 Oct). Until then, add no
  further preset on top.

# Zoom audit — Windows 125% / 150% display scaling (Task 4.2)

Mock build, signed in as Owner, emulated CSS viewports with a fresh load per width. The measurements, method and before/after numbers are in `measurements.json`.

| Laptop | Scaling | CSS width | Sidebar default |
|---|---|---|---|
| 1366×768 | 125% | 1093 | 64px rail (tablet band) |
| 1366×768 | 150% | 911 | 64px rail |
| 1920×1080 | 125% | 1536 | 256px open (desktop band) |
| 1920×1080 | 150% | 1280 | 256px open, so the header is only 1024px wide |

Screenshots (800px-wide captures of the pane):
- `inventory-911-before.jpg`: no title, a 58px search box ("Search e").
- `finance-911-before.jpg`: no title ("Search booki…").
- `operations-911-before.jpg`: Action column cut at the edge, row link off-screen.
- `inventory-1280-sidebar-open-before.jpg`: title shown as "I…" beside Refresh, Export and More.
- `finance-1280-sidebar-open-after.jpg`: full title, More plus Record Payment.
- `finance-1280-more-menu-after.jpg`: More holds Create Invoice and Export invoices. Create Invoice opened its dialog (closed with Escape, nothing saved).

Rulings: `RULINGS-2026-10-15.md`, section "Windows display scaling".

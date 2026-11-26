# Cadra before/after visual matrix

Status: **PASS for the recorded local browser scope**, 28 October 2026. All 1,704 current-source scenarios passed the geometry checks; 23 browser interaction checks also passed. Repository-wide tests and database/build gates are recorded separately in [interaction and gate results](CADRA_INTERACTION_RESULTS.md).

Branch: `codex/cadra-responsive-ui-20261026`. Baseline commit: `34cce2dcd9b9197ad3b2384363df632d195e5f14`. Scope: [accepted ruling](../../../RULINGS-2026-10-26.md), [exact modified-file changelog](CADRA_MODIFIED_FILES.md), [R-01–R-20 evidence map](CADRA_REQUIREMENT_EVIDENCE.md), [remaining boundaries](CADRA_REMAINING_GAPS.md).

## Reproducible evidence

| Item | Recorded value |
|---|---|
| Preserved baseline | 1,300 source/token files under `artifacts/cadra/before-source` |
| Baseline fingerprint | `11a0317718cb1edfbb63cb52e8aab94fb3690b69d6827a9da28878d308e36d6e` |
| Current fingerprint | `447632cb610f8860ffbaf25ddb684a8a3e147c24df2b4cf94079189c863700d1` |
| Capture harness | [cadra-visual-matrix.mjs](../../../scripts/cadra-visual-matrix.mjs) |
| Baseline / current receipts | [Before](../../../artifacts/cadra/before-seeded/results.json), [after](../../../artifacts/cadra/after-seeded/results.json) |
| Route and record provenance | [Before manifest](../../../artifacts/cadra/before-seeded/route-manifest.json), [after manifest](../../../artifacts/cadra/after-seeded/route-manifest.json) |
| Dataset | Existing seeded corpus; `VITE_DATA_SOURCE=mock`, `VITE_MOCK_SEEDED=true` in both phases |
| Browser | Local headless Chrome; reduced motion; service workers and nonlocal requests blocked; Owner staff routes and anonymous auth screens |
| Population | 58 mounted routes + 13 secondary/query states = 71 states; 12 sizes × light/dark = 1,704 scenarios per phase |
| Redirect aliases | 38 enumerated; these are not additional independently captured states |

Sizes: 320×844, 360×800, 375×812, 390×844, 430×932, 768×1024, 820×1180, 1024×768, 1194×834, 1280×800, 1440×900 and 1920×1080.

The baseline loader serves preserved committed sources. The harness waits for mounted content, cleared loading skeletons and loaded fonts after route changes and viewport resizes. Booking/product/bundle/client identities come from actual seeded links or queries. The cases corpus is empty: `/inventory/cases/:id` uses the explicitly labelled `/inventory/cases/QA-UNKNOWN-RECORD` missing-record probe. Populated case detail is not certified.

A current `FAIL` means body/main overflow exceeds 1px, a header control leaves the viewport, a visible movement action leaves its containing panel, or the applied theme differs. The movement-action predicate was added after the baseline and is not retrospectively certified for it. `REVIEWED` records an automated geometry result; it does not mean every image was manually reviewed or every action completed.

## Results

| Run | Complete | Scenarios | REVIEWED | FAIL | NOT VERIFIED | Uncaught page errors | Source changed |
|---|---|---:|---:|---:|---:|---:|---|
| Seeded baseline | true | 1,704 | 1,548 | 156 | 0 | 0 | false |
| Current seeded after | true | 1,704 | 1,704 | 0 | 0 | 0 | false |

All 1,704 current screenshots exist, all indices are unique, and every route/state has 24 viewport/theme combinations. All 1,632 staff captures have exactly one global header and one primary navigation. At ≥1280px they have one dock and no bottom bar; below 1280px they have one bottom bar and no dock. There are zero navigation-ownership mismatches.

The Owner matrix does not establish money-blind DOM/payload behavior. Those boundaries are covered by the specific tests/contracts listed in the evidence map and require their own current-source receipts.

## Route-level comparison

| Route / secondary state | Before REVIEWED / FAIL | After REVIEWED / FAIL / NOT VERIFIED |
|---|---:|---:|
| `/login` | 24 / 0 | 24 / 0 / 0 |
| `/forgot-password` | 24 / 0 | 24 / 0 / 0 |
| `/reset-password` | 24 / 0 | 24 / 0 / 0 |
| `/clients` | 22 / 2 | 24 / 0 / 0 |
| `/today` | 24 / 0 | 24 / 0 / 0 |
| `/rentals` | 24 / 0 | 24 / 0 / 0 |
| `/rentals/productions` | 24 / 0 | 24 / 0 / 0 |
| `/rentals/:bookingNo/packing` | 24 / 0 | 24 / 0 / 0 |
| `/rentals/:bookingNo/handover` | 24 / 0 | 24 / 0 / 0 |
| `/rentals/:bookingNo/return` | 24 / 0 | 24 / 0 / 0 |
| `/rentals/:bookingNo/reset` | 24 / 0 | 24 / 0 / 0 |
| `/rentals/:bookingNo/evidence` | 22 / 2 | 24 / 0 / 0 |
| `/rentals/:bookingNo` | 24 / 0 | 24 / 0 / 0 |
| `/crew` | 22 / 2 | 24 / 0 / 0 |
| `/crew/timesheet` | 24 / 0 | 24 / 0 / 0 |
| `/inventory` | 24 / 0 | 24 / 0 / 0 |
| `/inventory/warranty` | 24 / 0 | 24 / 0 / 0 |
| `/inventory/labels` | 24 / 0 | 24 / 0 / 0 |
| `/inventory/purchase-requests` | 24 / 0 | 24 / 0 / 0 |
| `/inventory/:assetId` | 10 / 14 | 24 / 0 / 0 |
| `/inventory/bundles/:bundleRef` | 24 / 0 | 24 / 0 / 0 |
| `/calendar` | 24 / 0 | 24 / 0 / 0 |
| `/operations` | 24 / 0 | 24 / 0 / 0 |
| `/inventory/cases` | 24 / 0 | 24 / 0 / 0 |
| `/inventory/cases/:id` | 24 / 0 | 24 / 0 / 0 |
| `/operations/sub-rental` | 14 / 10 | 24 / 0 / 0 |
| `/operations/delivery` | 24 / 0 | 24 / 0 / 0 |
| `/notes` | 6 / 18 | 24 / 0 / 0 |
| `/finance` | 24 / 0 | 24 / 0 / 0 |
| `/reports/pulse` | 14 / 10 | 24 / 0 / 0 |
| `/reports/expenses` | 24 / 0 | 24 / 0 / 0 |
| `/reports/clients` | 24 / 0 | 24 / 0 / 0 |
| `/reports/promotions` | 24 / 0 | 24 / 0 / 0 |
| `/reports/staff` | 24 / 0 | 24 / 0 / 0 |
| `/reports/inventory` | 24 / 0 | 24 / 0 / 0 |
| `/reports/products` | 24 / 0 | 24 / 0 / 0 |
| `/reports/equipment-performance` | 24 / 0 | 24 / 0 / 0 |
| `/reports/asset-roi` | 24 / 0 | 24 / 0 / 0 |
| `/reports/forecasting` | 24 / 0 | 24 / 0 / 0 |
| `/reports/cash-flow` | 24 / 0 | 24 / 0 / 0 |
| `/reports/working-capital` | 24 / 0 | 24 / 0 / 0 |
| `/reports/rentals` | 22 / 2 | 24 / 0 / 0 |
| `/reports/operations` | 16 / 8 | 24 / 0 / 0 |
| `/reports/damage-maintenance` | 16 / 8 | 24 / 0 / 0 |
| `/reports/sales` | 24 / 0 | 24 / 0 / 0 |
| `/reports/vat-tax` | 24 / 0 | 24 / 0 / 0 |
| `/reports/activity` | 22 / 2 | 24 / 0 / 0 |
| `/reports/revenue` | 24 / 0 | 24 / 0 / 0 |
| `/reports/cases` | 18 / 6 | 24 / 0 / 0 |
| `/reports/custom` | 20 / 4 | 24 / 0 / 0 |
| `/clients/:id` | 22 / 2 | 24 / 0 / 0 |
| `/settings` | 14 / 10 | 24 / 0 / 0 |
| `/admin/audit` | 24 / 0 | 24 / 0 / 0 |
| `/tools` | 24 / 0 | 24 / 0 / 0 |
| `/admin/audit-log` | 24 / 0 | 24 / 0 / 0 |
| `/admin/activity-log` | 24 / 0 | 24 / 0 / 0 |
| `/admin/numbering` | 24 / 0 | 24 / 0 / 0 |
| `/admin/backup` | 14 / 10 | 24 / 0 / 0 |
| `/rentals?action=new` | 22 / 2 | 24 / 0 / 0 |
| `/inventory?action=new` | 24 / 0 | 24 / 0 / 0 |
| `/clients?action=new` | 22 / 2 | 24 / 0 / 0 |
| `/inventory?tab=bundles` | 22 / 2 | 24 / 0 / 0 |
| `/inventory?tab=stock-check` | 24 / 0 | 24 / 0 / 0 |
| `/inventory?tab=maintenance` | 24 / 0 | 24 / 0 / 0 |
| `/clients?tab=membership` | 24 / 0 | 24 / 0 / 0 |
| `/finance?tab=reports` | 16 / 8 | 24 / 0 / 0 |
| `/finance?tab=payments` | 22 / 2 | 24 / 0 / 0 |
| `/finance?tab=documents` | 24 / 0 | 24 / 0 / 0 |
| `/settings?tab=branches` | 14 / 10 | 24 / 0 / 0 |
| `/settings?tab=people` | 14 / 10 | 24 / 0 / 0 |
| `/settings?tab=system` | 14 / 10 | 24 / 0 / 0 |

## Manual comparisons

Codex visually reviewed the four current Today anchors through fresh copies of the recorded images, avoiding an earlier reused-filename preview-cache discrepancy. Both Return actions and row menus are contained at desktop width; phone actions and the selected navigation label are visible. The live clock advanced between captures, so overdue labels changed (for example 97 to 99 days late); the seeded records did not change.

| State | Baseline | Current reviewed image | Observed result |
|---|---|---|---|
| Today 1440px light | [Before](../../../artifacts/cadra/before-seeded/0098-1440x900-light.webp) | [After](../../../artifacts/cadra/review-447632cb/0098-1440x900-light.webp) | Full-width two-panel board; Return and More controls fit; dock and one header remain contained |
| Today 1440px dark | [Before](../../../artifacts/cadra/before-seeded/0099-1440x900-dark.webp) | [After](../../../artifacts/cadra/review-447632cb/0099-1440x900-dark.webp) | Readable dates/IDs, status labels and both panel actions; selected dock destination is visible |
| Today 390px light | [Before](../../../artifacts/cadra/before-seeded/0116-390x844-light.webp) | [After](../../../artifacts/cadra/review-447632cb/0116-390x844-light.webp) | Single bottom bar; selected Today has a solid paired background; dates, IDs and primary actions fit |
| Today 390px dark | [Before](../../../artifacts/cadra/before-seeded/0117-390x844-dark.webp) | [After](../../../artifacts/cadra/review-447632cb/0117-390x844-dark.webp) | Single bottom bar and readable selected destination; no horizontal clipping in the shown board |

The current [high-contrast phone image](../../../artifacts/cadra/interactions/today-high-contrast-447632cb.webp) was also reviewed: selected Today is black text/icon on yellow, visibly distinct from the black bar. The interaction driver measures 13.713:1 for that foreground/background pair, 9.367:1 for dark glass/system, and 14.629:1 for light glass at both tested widths. Expanded More is also checked for its actual paired surface. These are selected-navigation checks, not a claim that every rendered pixel meets contrast requirements.

The [current amendment PDF](../../../artifacts/cadra/interactions/sample-schedule-amendment.pdf) was rasterized and inspected in [this fresh preview](../../../artifacts/cadra/interactions/sample-schedule-amendment-447632cb.png). Nepali signer text, drawn mark, dates and retained-original provenance fit the single A4 page.

## Changes and retained history

The desktop dock uses the existing destination/permission registry. Tablet/phone reuse the existing bottom bar and More. Tokens/shared styles own the neutral surfaces, font roles, controls and responsive behavior. Preset files remain retained with competing global imports inactive; the scoped report pilot remains.

Unit edits persist narrow identity/location/condition fields through guarded actions and local SQL contracts. Calendar reads authoritative resource IDs/intervals and guards whole-rental date moves; signed agreements require retained replacement evidence. Unsupported sources remain explicitly unavailable.

The earlier [pre-contrast-fix matrix](../../../artifacts/cadra/pre-navigation-contrast-seeded/results.json) passed geometry on `2b69219…`, but its loaded high-contrast review exposed an inline transparent background overriding the selected bottom-navigation surface. The current source fixes that ownership and adds measured browser contrast assertions. The old runtime-equivalence proof applied only to the intervening test-focus wait correction; it is not used to certify the later navigation change. Current matrix and interaction receipts both identify `447632cb610f8860ffbaf25ddb684a8a3e147c24df2b4cf94079189c863700d1`.

The focused test failure was an insufficient fixed delay around asynchronous field focus. Its regression now waits for actual PAN/VAT focus and passed 31/31; the navigation correction passed 44/44 focused shell tests. Final full-suite outcomes belong to the separate gate report.

## Rollback and acceptance limits

The development-only `?shellPreview=classic` compares classic navigation on the same routes. Source rollback can restore the classic shell/prior imports or disable new entry points under the accepted ruling. Retain audits, proposals, agreement objects and version history; do not delete business records or reverse hosted schema.

No push, merge, deployment or hosted migration is recorded here. Physical touch/stylus/rotation/keyboard/camera, offline/reconnect, hosted Auth/PostgREST/Storage and screen-reader acceptance remain independent. One Tab-step containment assertion is not an exhaustive keyboard or accessibility certification.

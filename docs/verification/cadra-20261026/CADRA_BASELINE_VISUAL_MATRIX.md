# Cadra baseline visual matrix

Implementation branch: `codex/cadra-responsive-ui-20261026`. Source baseline: `34cce2dcd9b9197ad3b2384363df632d195e5f14`. Original source is preserved under `artifacts/cadra/before-source`; the primary checkout and its concurrent work were not changed.

## Source findings

| Family | Existing implementation / protected behavior | Baseline finding |
|---|---|---|
| Shell | One header, Sidebar/BottomBar, locked eleven destinations, scanner | Seven global CSS imports competed for ownership; tablet used a rail |
| Today | Pickup/Return movement queries and operational dates | Preserve both actual queues; no finance dashboard |
| Rentals and record editors | Quote/create/detail, section saves, retries, dirty guards | Preserve existing engines and inline summary rails |
| Operations | Pack/Hand/Return/Reset header and modal/dock | Preserve real progress, blockers, saved receipts and one footer |
| Inventory | Products, serialized units, quantity stock, bundles | UnitEditor was session-only; status is engine-owned |
| Calendar | Month/Week/Day bookings and availability | Resource catalogue empty; display-day values were unsuitable for exact conflict arithmetic |
| Finance/Reports | Existing source-backed figures, charts and restrictions | Preserve integer paisa, provenance, keyboard behavior and absent-source states |
| Secondary pages | Clients, memberships, crew, cases, documents, tools, settings/admin/auth | Inspect actual routes and query states; historical page index is stale |

## Cascade ownership

The selected implementation gives semantic tokens and modes to `theme.css`/the token package, common control/card/table appearance to `ui-v2.css`, navigation geometry to shell CSS, and shared width adaptations to `responsive.css`. Black/light, Luma and Rhea sources remain retained but their overlapping global imports are inactive. Scoped Rhea report components remain supported.

## Browser evidence

The harness is `scripts/cadra-visual-matrix.mjs`. It blocks nonlocal requests. The complete comparison uses the repository's existing deterministic `VITE_DATA_SOURCE=mock`, `VITE_MOCK_SEEDED=true` corpus in both phases, with its Mock Mode banner. An earlier unseeded partial run is retained separately; it is not substituted for seeded evidence.

The completed baseline receipt, `artifacts/cadra/before-seeded/results.json`, records all 1,704 scenarios: 1,548 REVIEWED, 156 FAIL, zero missing/unverified captures and zero browser errors. Its source fingerprint is `11a0317718cb1edfbb63cb52e8aab94fb3690b69d6827a9da28878d308e36d6e`, with `sourceChanged=false`. Exact routes, record provenance, dataset, viewport, theme, screenshot and geometry are retained in that receipt and its route manifest. REVIEWED denotes the automated geometry predicate, not a blanket manual or functional PASS. Interrupted/OOM runs remain separate incomplete evidence. Physical hardware, hosted Auth/PostgREST/Storage and a screen-reader audit remain independent acceptance items.

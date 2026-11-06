# T9 source export requirements

Read-only source review, 6 November 2026. This is the data request for the T9-01
comparison and the T9-02 availability holds; it is not an import approval.

## Source state observed

Source: [Babin Rentals — Booqable ChatGPT Bridge](https://docs.google.com/spreadsheets/d/1nnD2Xw4gbMAo_mBJBaglCNfAGp_tmIp2Gjeiv899p68/edit).
The following values are the bridge's recorded sync results, not an independent
verification that every source record was exported.

| Dataset | Recorded last success, NPT | Reported data rows |
|---|---|---:|
| Orders | 2026-11-06 00:42:53 | 1,315 |
| Customer_Metrics | 2026-11-06 00:42:52 | 363 |
| Equipment_Catalog | 2026-10-13 03:00:44 | 307 |
| Stock_Items | 2026-10-13 03:00:44 | 264 |
| Rental_Line_Items | 2026-10-13 03:01:40 | 19,502 |
| Rental_Plannings | 2026-10-13 03:01:40 | 5,511 |

The workbook modification date therefore does not establish catalogue or
planning freshness. Refresh the required datasets before using their comparison
or planning rows for a cutover decision. Client metrics are aggregates; they do
not replace a client export.

The full catalogue header range A1:N1 contains only eleven populated columns.
The amount is explicitly labelled `Base Price NPR (provisional)`. There are no
additional slug, bundle-content, pricing-structure or seasonal-rule columns in
the remaining three columns.

The recorded API field map, dated 9 October, lists `slug`, `price_structure_id`,
`price_ruleset_id`, `price_type`, `price_period` and `base_price_in_cents` for
products. Product groups also list `structure_price_in_cents` and
`flat_fee_price_in_cents`. These are recorded schema keys, not exported current
values or proof of the current API response format.

## Configured OS project checked 6 November 2026

Read-only metadata and aggregate queries against the project matching the
repository's configured Supabase hostname found:

| OS dataset | Total rows | Active rows |
|---|---:|---:|
| Products | 205 | 205 |
| Clients | 1 | Not measured; no active flag assumed |
| Bundles | 1 | 1 |
| External references, all providers | 0 | Not applicable |

The four relations introduced by local migration 0160 are absent from the
configured hosted database: `pricing_structures`, `pricing_structure_tiles`,
`pricing_rulesets` and `pricing_rules`. This establishes a deployment prerequisite
for the pricing import. A later-numbered entry in migration history does not
prove that every earlier migration was applied. No migration was applied by this
inspection.

The deployed `external_refs` columns contain the provider/entity/external/local
IDs, timestamps and payload hash, but no store-slug field. Local migration 0040
has the same shape. T9-01's requirement to preserve old product links therefore
needs an explicit supported storage path and verification with T7-17 before
importing those slugs.

There is no mapped OS snapshot to compare yet. Do not classify every source row
as new simply because all mappings are absent. Reconcile the existing OS records
and retain stable identity links through the import path first. The older bridge
catalogue's 307 rows (273 marked active on 5 November) and these 205 OS rows have
different freshness and potentially different scope; their difference is not a
count of missing products.

The repeatable [read-only preflight query](cutover-readonly-preflight.sql)
returns counts and metadata only. Individual client records, prices and
credentials are not included. It supplies prerequisites for the match report,
not the match report or production acceptance itself.

## Required export contents

Keep the exports and individual client data outside Git. Record the source
account, export time with timezone, dataset scope, row counts and currency
alongside the files. A changed-since export must state its cutoff and exclusions.

| Entity | Data needed for the existing normalized comparison |
|---|---|
| Clients | Stable Booqable ID and all fields in the client import's scope, including creation/update markers needed to identify changes since the earlier import. |
| Products | Stable product/group IDs, name, SKU, tracking and archive state, store slug, pricing-structure/ruleset IDs, price type/period and authoritative minor-unit amounts with currency. |
| Bundles, including kit-style products | Stable bundle ID, component product IDs and quantities, archive state and pricing identity. Obtain current catalogue composition explicitly; historical rental lines are not a substitute. |
| Pricing structures | Stable structure/ruleset IDs, names, charging periods, rate/discount steps, effective dates and product/bundle references needed to reproduce the source quote. |
| Seasonal rules | Stable rule IDs, applicability, amounts or percentages, start and end timestamps including timezone. Include the four rules named by T9-01 with their actual end dates. |
| Stock and rental plannings for T9-02 | Stable stock/planning/order/line IDs, quantities, status, locations and reservation/pickup/return timestamps sufficient to reproduce every still-open Booqable hold. |

Preserve Booqable's historical figures in the source archive. Verify currency
before normalizing amounts to integer paisa. Do not promote the provisional
catalogue price column to an authoritative import value. Product photos remain
outside the import scope under B45.

## Comparison and quote evidence

1. Obtain the complete scoped exports and the corresponding OS snapshot, joined
   to Booqable external references. Review OS records without mappings before
   labelling source rows new.
2. Normalize the same fields and types in both snapshots using the format in
   [T9-01](../T9_CUTOVER.md). Preserve business order where meaningful and use a
   consistent order for unordered bundle members.
3. Run the existing local comparison. Reconcile entity counts and review every
   conflict and changed field before requesting an import decision. `osOnly`
   records are not deletion instructions.
4. Select 20 real products and retain both systems' three-day quotes. Match
   client/membership, quantities, dates, operational-day interpretation, tax and
   applicable pricing/seasonal rules. Keep deposits separate from Rental Total.
5. Record source and OS amounts, differences and the explanation for each
   difference. The card permits the known rounding difference; it does not
   authorize an invented tolerance or unexplained pricing differences.

No current OS match report, 20-product quote comparison or staging import has
been certified by this source inspection.

## Scheduling fact still required

`PLAN.md` specifies an 18 February renewal and an 8 February cancellation, while
ruling S8 and T9-08 specify a 20 March renewal and 10 March cancellation. The plan
also places the last Booqable return on 1 March. This conflict is tracked as
[O-23](../../OPEN_DECISIONS.md); the actual Account & Billing date is awaiting
Babin's confirmation. Export preparation continues without choosing a new
renewal or run-off date.

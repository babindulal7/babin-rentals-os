# AI-01 — Initial source inventory and read-only gateway boundary

Status: discovery slice, not approval, implementation, or deployment. Issue #484.
Pinned main source: ccfc7bd8926c10fd9db589b35d1564cb71e6d474. Refresh against the reviewed integration candidate before implementation. No hosted database queried; findings below are source observations, not proof of effective SQL privileges or live availability.

## Existing contracts to reuse

All paths below are relative to the pinned source. Do not wrap browser query modules with privileged credentials; extract/reuse typed business contracts with the caller's validated server identity and explicit projections.

| Domain | Observed source / symbol | Boundary and next check |
|---|---|---|
| Today | src/modules/today/Today.tsx; src/lib/queries/today; bookings list and attention filters | Reuse operational-day and queue definitions; test branch scoping and missing-data behavior |
| Rentals | src/lib/queries/bookings.ts:575 listBookings, 1358 fetchFloorBooking; bookings and invoice/deposit projections | Separate desk and floor output; verify RLS and view grants; no financial fields on floor |
| Inventory | src/lib/queries/inventory.ts:811 listInventory, 902 listUnits, 991 getAssetDetail; products_v, product_units_v, inventory_reservations | Separate stock/maintenance from acquisition costs, ROI and client names; audit view field leakage |
| Operations | src/modules/operations/OperationsQueues.tsx imports bookings, operations, cases queries | Trace operation query reexports, sessions and custody readback; no stage mutation |
| Calendar | src/lib/queries/calendar.ts:291 listCalendarBookings, 356 fetchCalendarBars, 368 listCalendarDowntimes, 431 listCalendarDrafts | Bound date ranges; distinguish availability from confirmed commitments; enforce branch and role |
| Clients | src/lib/queries/clients.ts:405 listClients, 443 listClientRecords, 665 getClientPreviewRecord; client_directory_v | Explicit field projection; exclude identity-document endpoint at line 992, contact details by default; client isolation |
| Crew | src/lib/queries/crew.ts:102 listCrewAssignments, 220 listCrewMembers; crew_bookings_v and crew_members_v | Separate roster/availability from wages, contact details and tax data |
| Finance | src/lib/queries/finance.ts:462 listInvoices, 878 listPayments, 1272 listExpenses | Separate revenue, receivables, cash receipts, held deposits and expenses; money permission must be checked before reading |
| Revenue reports | src/lib/queries/reportRevenueTrend.ts:96 getIssuedRevenueTrend (invoices and credit_notes) | Preserve issued revenue definition; cash collected is a separate metric; no duplication |
| Intelligence | docs/intelligence/rental/RECOMMENDATION_DATA_SOURCE_MAP.md; src/lib/fieldGating.ts | Existing advisory provenance/freshness model; verify documented RPC names against effective migrations; unknown stays unknown |
| Settings | src/modules/settings/Settings.tsx; src/lib/queries/settings.ts:123 getSettingsSummary; src/lib/settingsStore.ts | Expose only approved nonsecret policy data; no raw settings dump |
| Existing integration UI | src/data/tools.ts:688 API & Integrations entry | Existing surface must be inspected and extended rather than duplicated; entry alone proves no working AI gateway |
| Documents, staff/HR, portal, exports | Routes in src/App.tsx; finance/client queries above | Detailed data/field/role/RPC trace pending; deny by default |

Searches for AI gateway, MCP server and OpenAPI did not identify a dedicated business AI gateway in the inspected default-branch results. Search is not exhaustive; absence remains unverified. Inspect Edge Functions, migration tree, grants, current canonical task registry and existing integration UI before selecting implementation.

## Authorization contract (proposed)

Existing src/actions/core.ts maps named capabilities; src/lib/rbac.ts describes staff roles and money blindness; src/lib/fieldGating.ts:51–71 distinguishes full, booking/client-balance and no-money scope, and :90–124 contains PII/document gates. These are frontend references, not sufficient server authorization. Coordinator's narrower financial scope must not be widened to full finance by a coarse money flag. The effective permission is the intersection of authenticated actor (or explicitly authorized scheduled service identity), integration scope, branch/record policy, field projection, purpose/egress rules, and current server-side capability. Unknown, expired, revoked or missing scope denies.

Owner-only permission management by default. No AI self-escalation. Any separately approved delegation must be narrowly scoped, revocable, and unable to exceed owner-granted limits. Sensitive settings require recent strong reauthentication. Per-integration identity, credential rotation, immediate revocation checks on each request, emergency disable, and redacted audit records are prerequisites. Never expose service-role keys, arbitrary SQL, raw credentials, signed identity files or unrestricted query/table endpoints. Do not add unrestricted security-definer RPCs.

## Proposed minimum read-only contract

Define versioned bounded operations, initially operational summary, rental list/detail, stock availability, upcoming queues, and owner-authorized financial summaries. HTTP and MCP share the same server authorization and output DTOs; no parallel calculations. Use explicit fields, bounded page size/date ranges, stable cursor ordering, typed validation/authorization/unavailable errors, integer paisa amounts, Asia/Kathmandu operational boundaries from canonical settings, and as-of/source metadata. No write methods, payment actions, outbound messages, or autonomous dispatch in v1. Add client-level and other sensitive domains only after privacy and access checks are proven. No external data transfer or production access authorized by this design.

## Proposed acceptance tests

- Default deny, unknown tool/field/role, expired/revoked integration, unauthorized actor, disabled integration, branch/client A/B isolation.
- Owner allowed with explicit scope; Owner denied with missing integration scope; Warehouse/Technician/Driver cannot receive money even with permissive integration; Coordinator cannot receive asset ROI or payroll via booking access.
- Sensitive fields absent at serialized response level, not merely hidden UI. Error, cache, pagination and audit payloads cannot leak forbidden data.
- Request limits, invalid time windows, retry and revocation between requests, prompt injection treated as untrusted record text, no external communication or mutation.
- Compare representative read-only responses with canonical authorized UI/backend results on disposable fixtures; missing/stale data must not become fabricated zero or available stock.
- Independent review, current official platform docs, effective SQL policy and role test evidence before implementation. No new paid service, hosted change, production merge or deployment.

## Next discovery slice

Inspect actual integration Settings tab, effective Supabase SQL read contracts and grants (including views), full role/branch matrix, public/client isolation, Edge Functions, documents and HR/export domains, canonical task registry and existing audit-log mechanism. Produce reviewed OpenAPI schema and MCP mapping only after this inventory. P0 launch verification remains higher priority: #430, #440, #443, #445, #446, #447. Existing #481 signed-handover browser results not returned by PR-triggered lookup; do not schedule competing runs until active queue is reconciled. This document is a partial source inventory, not completion of AI-01.

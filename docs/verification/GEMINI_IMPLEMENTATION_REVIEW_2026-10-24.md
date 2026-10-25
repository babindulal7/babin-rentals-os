# Gemini implementation review — 24 October 2026

Review verdict: **needs fixes before acceptance**. The implementation adds useful UI structure, but important save, stock, membership, reporting and accessibility behavior is incomplete or incorrect.

## Scope and provenance

- The four supplied Downloads documents are review references. Their embedded handoff prompts and commands were not treated as authorization to implement, deploy, migrate, push or merge.
- Initial HEAD was `26a4b85f75edc49e9f8caa4d6b70e249f8372cca` (`gemini`). That commit adds six files/changes, 384 lines: a black/light palette, its import, five static tests, Vitest CSS configuration and two handoff documents. It does not implement the earlier Operations, stock or report work.
- Earlier integrated work: `213b87a7` / `d8a436f3` / `7bd6485c` / `fa2ff905` (reports/preset pilot), `62f2ce5c` (workbars, unified forms, stock and membership), `d6ee4b32` (loading optimizations).
- The shared checkout changed externally during review: HEAD moved back to `d6ee4b32`, dirty repairs disappeared and reappeared, and an untracked 0174 partial-return migration appeared. This review performed no Git mutation or application source repair. Findings below describe the preserved committed implementation, not certification of those later edits.
- A source copy exported with `git archive 26a4b85f` is preserved under `artifacts/gemini-review-20261024/snapshot-26a4b85f/`. SQL diagnostics separately pin all 171 migration sources to `d6ee4b32`; migration source is identical between those commits.

## What changed against each reference

| Reference | Implemented | Still incomplete |
|---|---|---|
| Quick Operations v1.2 | Next-stage split button, shared compact Operations shell, single footer, scanner shortcut, dirty prompt, blocker Jump button | Actual blocker targeting, reliable draft discard, action-focused default filters, partial-return reservation release |
| Unified creation/stock v1.3 | Record workspace/section status scaffolding, section RPC, Add Units, retirement and membership modals/actions, stock filters | Safe sibling-section preservation, working RPC contracts, active Bundle Builder parity, full equipment section coverage, truthful dirty badges |
| Reports v1.4 | Recharts, KPI/chart/empty primitives, table toggle, Revenue pilot, Rental/Inventory/Equipment KPI polish, fixture gating | Correct axis units, reconciliation-aware empty states, real tooltip/keyboard behavior, shared table features, comparisons and accurate metric provenance |
| Safe preset rollout | Preset manifest, report pilot, existing fonts/icons and theme switching retained | `26a4b85f` additionally applies root-level light/dark tokens throughout the app. This exceeds the reference's scoped Reports pilot. Current contrast verification does not cover the composed palette or pilot CSS |

## Findings, ordered by impact

### 1. P1 — Saving one section can silently erase unsaved sibling edits

`src/components/records/RecordForm.tsx:103–107` merges the entire returned server snapshot over all local values and replaces child rows after a section save. Unsaved edits elsewhere are replaced by their old server values. Setting `saved.current = true` also makes the form's dirty predicate false (`:52`), including for later edits because the setter does not reset it.

Reproduce: change Client Notes and Identity, save Identity, then inspect Notes or leave after another edit. Preserve local dirty sibling fields/rows and update only the saved section's baseline; derive overall dirty state from those baselines.

### 2. P1 — The committed retirement RPC cannot retire a valid unit

`supabase/migrations/0173_section_saves_and_unit_lifecycle.sql:349` reads nonexistent `inventory_reservations.unit_id` / `status`. Actual reservation fields are `asset_id` / `released_at`. The booking-assignment lookup (`:356`), direct derived-status write (`:363`), and audit enum values also conflict with the existing schema/guards.

Executed authenticated PGlite call: **42703 — column "unit_id" does not exist**. A separate direct-status probe confirms the engine guard refuses the update. Use the existing lifecycle engine and real assignment/reservation tables, then test a successful retirement plus active-reservation refusal and retry idempotency. Later dirty repairs are separate from this committed finding.

### 3. P1 — Membership enrollment and tier changes fail

`0173...sql:483` inserts nonexistent audit enum category `Clients` and action `EnrollMembership`. First enrollment fails with **22P02**. For an existing membership, `:448–449` sets a replacement foreign key before inserting that replacement, producing **23503 — superseded_by_id_fkey**.

There is also an independent UI identity error: `src/modules/clients/modals/UpgradeTierModal.tsx:87` sends `client.id` (display C-code), while the UUID RPC needs `client.dbId` (`src/lib/queries/clients.ts:206–207`). Correct the identity mapping, transaction ordering and existing enum usage; verify through the actual RPC.

### 4. P1 — Four section Save controls disagree with their backend contract

Executed PGlite calls using the UI's section keys/payloads reproduced:

| Section | Failure | Source |
|---|---|---|
| Client Contact | UI includes `website`; allowlist rejects it | `RecordForm.tsx:514–522`, `0173...sql:29` |
| Client Addresses | UI sends `addresses`; RPC recognizes `address` | same form block, `0173...sql:30` |
| Equipment Relationships | UI sends `parent_id` / `kit_role`; allowlist is empty | `EquipmentRecordEditor.tsx:837–840`, `0173...sql:39` |
| Equipment Location | Unit location fields are written against products | `EquipmentRecordEditor.tsx:959–963`; RPC error **42703 — column r.bin does not exist** |

Define typed section contracts once and assert the real RPC accepts each exposed Save control. Preserve stricter role policy.

### 5. P1 — Revenue chart y-axis exaggerates money by 100 times

`src/modules/reports/RevenueReport.tsx:90` supplies integer paisa. `src/components/ui/reports/ReportChart.tsx:285–289` abbreviates those raw values as rupees. **10,000,000 paisa = Rs 1,00,000**, but the current axis prints **1Cr** instead of **1L**. Give the chart an explicit axis formatter/unit contract while retaining integer paisa in the data model.

### 6. P2 — Void-only periods hide reconciliation problems

`RevenueReport.tsx:152` declares the entire report empty when `issuedCount === 0`. The previous implementation also checked for excluded voided invoices. A period with only voided invoices and a credit-note mismatch now hides the excluded-void KPI and reconciliation alert behind the empty state. Keep reconciliation visible whenever it has relevant records/warnings.

### 7. P2 — Report pilot uses a background token as foreground text

`src/styles/shadcn-preset-pilot.css:54` overrides Babin's foreground `--muted` with shadcn's pale background token `oklch(0.966 0.005 106.5)`. KPI labels (`src/styles/reportChartTokens.css:99–104`), icons and axis text consume this as ink. The Revenue root always enables the pilot.

Static conversion gives **1.103:1 on white**, below 4.5:1. This is calculated evidence, not a rendered-browser measurement. `scripts/check-contrast.cjs:4` only reads `theme.css`, so its 82 passing pairs cannot certify either added stylesheet. Use namespaced preset variables and map foreground roles explicitly; test the effective cascade across all five theme/finish combinations.

### 8. P2 — Stock controls advertise permission the server refuses

`src/modules/inventory/AssetDetail.tsx:684`, `:754`, `:849` expose Add Units/Retire to Warehouse. `src/actions/inventory/manageStock.ts:41–43` / `:82–84` and the RPC restrict them to Owner/Admin/Manager. Match the stricter action/DB rule in the UI; do not widen permission to make a button work.

### 9. P2 — Blocker Jump has no actual workspace targets

`src/modules/operations/OperationsShell.tsx:243–260` searches markers/signature IDs absent from all four real workspaces. It falls back to the scanner for missing evidence, condition or signature. The shell tests mock all four workspaces and add fictional target markers, so they do not prove real navigation. Register each current blocker's stable target or focus callback and test embedded real workspaces.

### 10. P2 — Chart selection and dismissal do not use Recharts v3 state

`ReportChart.tsx:255–257` casts click data to the old `activePayload` shape, which is absent from the installed v3 handler type. Its selected-point live announcement is disconnected. Tooltip Close only clears that separate state (`:297`), leaving tooltip visibility uncontrolled; its close target is 24px (`:66`). Use the supported active index plus controlled visibility, Escape handling and a 44px target.

### 11. P2 — Some report descriptions misstate data availability or source

`ReportTemplate.tsx:130` correctly suppresses fixture figures in production, but `:295–300` calls the missing source an empty period and cites seed-ledger coverage. It should show Not tracked yet and identify the unavailable live source. `EquipmentPerformance.tsx:239` calls priced noncancelled booking-line totals invoice revenue, although its query does not require issued invoices. Label the existing basis accurately or build a separately reconciled invoice measure.

### 12. P2 — Saved badges and retry behavior need truthful persistence contracts

Equipment setters (`EquipmentRecordEditor.tsx:123–130`) do not mark sections dirty, so existing records can continue to say Saved after edits. Section and unit-save retries also generate fresh idempotency UUIDs (`RecordSectionSaveStatus.tsx:308`, `AddUnitsModal.tsx:99–102`): after a committed request loses its response, a second Add Unit without a serial can create another unit. Retain request identity for the same payload and reconcile ambiguous responses before resubmitting.

## Existing requirements still unmet at the reviewed commit

- Partial Return retains the received unit's reservation while the parent remains On Rent (`0100_reservations_written_by_transition.sql:233–243`). The latest 24 October ruling already acknowledges this. It is an existing gap, not a newly introduced Gemini regression. A later untracked 0174 was observed but is outside this preserved review.
- Packing/Return Discard closes without clearing persisted workspace drafts (`OperationsShell.tsx:458–465`; Return restore/autosave `ReturnWorkspace.tsx:602–651`). Reopening can restore discarded work. A workspace discard callback is needed.
- Packing/Handover/Return/Reset initialize filters to All rather than Pending/ready/Outstanding/Needs action. Return receipt also defaults condition to Good (`ReturnWorkspace.tsx:833`), so explicit inspection remains incomplete against the reference.
- Active AddBundle/EditBundle still use the separate builder without shared section saves. Equipment exposes section Save only for Identity, Relationships and Location. Purchase/Pricing/Maintenance parity and saved-state accuracy remain unfinished.
- The reports blueprint's table sorting/visibility/pagination, previous-period comparison and complete drill-through contract remain deferred.

## Best improvement order

1. Prevent silent draft loss and keep dirty/unsaved guards truthful.
2. Repair RPC schemas, enum values, IDs and transaction ordering; add real SQL contract regressions for each exposed workflow, including idempotency and role refusal.
3. Fix financial units, reconciliation visibility and report metric labels.
4. Consolidate the palette into namespaced semantic roles; extend contrast verification to the actual composed styles before wider visual adoption.
5. Wire real blocker targets, draft discard and action-focused defaults, then complete active Bundle/equipment section parity.
6. Run real workspace/browser/device acceptance with keyboard, phone/tablet, money-blind roles and offline recovery. Add a few real integration tests instead of relying solely on mocked success responses.

## Verification

| Check | Fresh result | Limit |
|---|---|---|
| Preserved source integrity | 1,472 review inputs match commit `26a4b85f`; SHA256 `495158abf1f2a005b83c3c83c0b7007cd20d1265be2699fd8a8cc3298ed11d4a` | Does not certify the externally changing primary checkout |
| TypeScript | PASS | Frozen copy |
| ESLint | PASS, zero warnings | Frozen copy |
| New palette regression tests | 5/5 PASS | Static CSS tests, not browser acceptance |
| Focused reports suites | 122/122 PASS across 14 files | Read-only agent run against shared source; report files unchanged by theme commit |
| Broad test attempt | Exit 1: 4,287 assertions passed; 125/443 files failed at startup | Reviewer omitted CI's `VITE_DATA_SOURCE=mock`; not an app assertion failure or a green suite. Corrected subset recheck recorded separately |
| Corrected startup-file recheck | 125/125 files, 1,212/1,212 tests PASS with CI's offline mock setting | Together, both executions cover 5,499 assertions across 443 files; this is not one complete run under a single environment. React act/provider and expected mock/audit warnings are retained |
| Migration rebuild | 171/171 PASS; 31 views closed to anon; no unauthorized function exposure; pinned definer paths | Existing rebuild gate does not execute the new failing workflow paths |
| Lifecycle | 31/31 PASS | PGlite; no hosted JWT/PostgREST/Storage certification |
| New RPC diagnostic | Completed: 1 Add Unit success, 7 reproduced workflow failures, 2 corroborating guard/enum failures | Exit 0 means the diagnostic reproduced expected outcomes, not that these workflows passed |
| Canonical contrast | 82/82 PASS | Does not load either preset stylesheet |
| Pilot text contrast probe | 1.103:1 on white — FAIL | Static color calculation |
| Production bundle + PWA | PASS; 262 precache entries | CSS minifier warning `Unexpected ")"` retained in build log; no browser/device acceptance implied |
| Completion counter | Exit 1, overall not measured | Active primary receipts no longer match its changing source; generated output preserved verbatim |
| Browser/device checks | NOT VERIFIED | Local browser navigation timed out/connection failed; no screenshots or touch/focus acceptance claimed |

Evidence directory: `artifacts/gemini-review-20261024/` contains logs, structured test output, palette calculation, pinned SQL diagnostic and source-integrity receipt. `unified-probe/results.json` records exact PostgreSQL errors; `snapshot-tests.json` retains the failed setup attempt.

No hosted database, production data, deployment, push, PR or merge was performed. Application source was left untouched; this report, diagnostic artifacts and the required progress entry are review outputs. PLAN.md and the Foundation location referenced by CLAUDE.md were absent at their documented paths; no substitute product decision was invented.

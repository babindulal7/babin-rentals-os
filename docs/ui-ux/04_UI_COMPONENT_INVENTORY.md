# 60-element UI inventory — audit/reuse targets

**Important:** The 60 rows below are **design targets**, not 60 missing components. A single existing component may satisfy multiple targets; multiple existing source files may be redundant. Do not generate one React component per row. Before implementation, mark each item **Existing, Existing-needs-fix, Missing, Out-of-scope or Unverified**, attach source/test/PR evidence.

## Group A — 16 inputs (I01–I16)

| ID | Design target | Likely existing starting point / verification |
| --- | --- | --- |
| I01 | Text field | ui/Input.tsx; label/help/error/IME |
| I02 | Number and money field | ui/MoneyField.tsx; no money for blind roles |
| I03 | Multiline notes field | real saved text, dirty guard |
| I04 | Search input | ui/SearchInput.tsx; Nepali IME, clear/Escape |
| I05 | Select/dropdown | ui/Select.tsx; keyboard/readability |
| I06 | Autocomplete/combobox | client/equipment lookup; no duplicate search engine |
| I07 | Checkbox | required kit/gate states |
| I08 | Choice/radio cards | ui/ChoiceCards.tsx |
| I09 | Switch/toggle | governed settings and real save |
| I10 | BS/AD calendar date control | ui/DateField.tsx, BsAdDate.tsx |
| I11 | Time control | valid 06:00 day boundary |
| I12 | Date range picker | ui/FilterDatePicker.tsx |
| I13 | Quantity stepper | ui/QuantityStepper.tsx; scanner/IME safe |
| I14 | Barcode/QR scan | ui/ScannerInput.tsx, BarcodeScannerModal.tsx |
| I15 | Drawn signature | ui/SignaturePad.tsx, persisted custody |
| I16 | Evidence/photo upload | evidenceStorage + floor workspaces; do not fake uploads |

## Group B — 12 navigation (N01–N12)

| ID | Design target | Existing starting point / verification |
| --- | --- | --- |
| N01 | Sidebar | src/components/shell |
| N02 | Shared PageHeader | ui/Page.tsx, PageActions.tsx |
| N03 | Breadcrumb/back | record identity, dirty guard |
| N04 | Tabs/segment control | ui/SegmentedControl.tsx |
| N05 | Mobile bottom nav / More | src/data/nav.ts + shell |
| N06 | Command palette | shell/CommandPalette.tsx |
| N07 | Search results / zero results | global search, no role leaks |
| N08 | Filter drawer | ui/FilterDrawer.tsx |
| N09 | Filter chips | ui/ActiveFilterChip.tsx |
| N10 | Pagination | ui/Pagination.tsx |
| N11 | Saved views | ui/SavedViewsMenu.tsx |
| N12 | Operations stage navigator | modules/operations/OperationsStageBar.tsx |

## Group C — 18 information/feedback (F01–F18)

| ID | Design target | Existing starting point / verification |
| --- | --- | --- |
| F01 | Semantic status block | ui/Badge.tsx; status.ts + inventory.ts |
| F02 | Booking lifecycle progress | ui/LifecycleProgress.tsx; no extra CTA |
| F03 | KPI / metric display | data-verified figures, no fake card |
| F04 | Stock availability indicator | live availability and hold state |
| F05 | Conflict explanation | ConflictResolutionModal / booking conflict |
| F06 | Due timer / urgency | ui/ReturnCountdown.tsx |
| F07 | Damage / missing alert | return case/maintenance gates |
| F08 | Inline field error | RecordErrorSummary/field association |
| F09 | Retry / read-error state | ui/StateViews.tsx and PageBody |
| F10 | Loading skeleton | ui/StateViews.tsx |
| F11 | Empty and filtered-empty state | ui/StateViews.tsx |
| F12 | Offline, sync and stale badge | FloorOfflineStatus/DataAgeBadge |
| F13 | Success toast | ui/Toast.tsx; success-only |
| F14 | Permission / unavailable reason | ui/Unavailable.tsx, backend RLS |
| F15 | Notification state | no fake deliveries |
| F16 | Audit timeline | persisted event and actor metadata |
| F17 | Financial summary | money-only DOM with real values |
| F18 | Tooltip / contextual help | ui/InfoTooltip.tsx; not hover-only |

## Group D — 14 containers/layouts (L01–L14)

| ID | Design target | Existing starting point / verification |
| --- | --- | --- |
| L01 | Page shell | ui/PageShell.tsx |
| L02 | Card/section | ui/Card.tsx |
| L03 | Sortable/paginated table | ui/DataTable.tsx, Table.tsx |
| L04 | Dense/touch list | ui/ListWorkspace.tsx |
| L05 | Create/edit record workspace | ui/RecordWorkspace.tsx |
| L06 | Context summary rail | desktop sticky, narrow reflow |
| L07 | Operations popup/workspace | OperationsShell.tsx |
| L08 | Modal | ui/Modal.tsx |
| L09 | Destructive/dirty confirm | ui/ConfirmDialog.tsx |
| L10 | Drawer/bottom sheet | ui/ContextDrawer.tsx and shell |
| L11 | Desktop split pane | floor/queue dock |
| L12 | Calendar grid | modules/calendar |
| L13 | Sticky form action bar | RecordActions / StickyFloorBar |
| L14 | Responsive record card | mobile list, same data/actions |

**Total:** 16 + 12 + 18 + 14 = **60**.

## Reuse & duplicate investigation

- ui/PageActions enforces one primary and at most two visible secondary actions; do not create another header-action component.
- ui/LifecycleProgress and lib/rentalActions.ts already resolve the next verb; do not author competing state tables.
- ui/FilterDrawer and BooqableRentalFilterDrawer are layered domain adaptation; similarity does not prove redundancy.
- There are multiple table components; verify usage/tests before deduplicating.
- Legacy and seeded components may exist: confirm actual mounting/route and live query before citing a feature as shipped.
- Avoid adopting a new Tailwind/shadcn component for an existing controlled form or gate without reviewing native styling and installed tokens.
- Existing test and PR overlap should be recorded before work starts.

## Tracking format per ID

ID | source path(s) | current mounted routes | role(s) | existing test(s) | issue/PR | state | usability result | owner | evidence SHA. Begin every state **Not audited** until the individual item is reviewed, regardless of file counts.

# Remaining acceptance — Booking Operations

The local UI work is partial against the complete v1.1 brief. Do not mark every acceptance item complete from green component tests or old screenshots.

The preserved checkpoint now has a completed [16/16 browser proof](frozen-checkpoint-9dc/gallery.html), plus 333/333 focused tests, typecheck, lint, contrast and mock build. The listed database, active-copy, native/device and hosted gaps remain open. The screenshot set covers the Return stage, Operations menu, queue dock/dirty resize and Warehouse mock view; it is not a browser execution of all four persisted floor workflows.

| Priority | Issue | Evidence / required next step |
|---|---|---|
| P0 | Early partial Return does not release the individual unit hold | Disposable probe: A received, B outstanding, parent On Rent; A's new overlapping reservation fails GiST `23P01`. Actual 0100 trigger releases at parent stage transition. The 0115 replacement is unattached. Requires an authorized durable database contract correction; migration authoring remains unapproved here. |
| P0 | Inventory status can retain On Rent after individual receipt | `0114_unit_status_engine.sql` checks parent On Rent without testing the unit's receipt. The strict Only In Stock preset can reject this stale state. Keep real holds visible; do not disguise it with reader-only release logic. |
| P0 | Receipt/reservation writes are not one atomic transaction | Return-only queued-success refusal is corrected, but existing multi-write sequencing is not an atomic receipt/hold transaction. Test ambiguous failure, stale retry, duplicate Return and actual concurrent allocations as part of the database correction. |
| P1 | Physical clearance after a genuine damage/QC finding is not explicitly defined | Non-voided findings and actual failed-QC/repair/missing exceptions conservatively block. Payment, financial disposition and Reset completion must not invent a repair-clearance event. `TODO(decision)` is recorded in `docs/OPEN_DECISIONS.md`. |
| P1 | Broad verification is affected by moving shared source | Current per-run receipts must match the assessed source. Earlier full runs failed or changed source during external checkouts; preserve those logs and do not present their passes as current certification. |
| P1 | Physical-device and hosted acceptance | Real iPhone/iPad touch/keyboard/rotation, camera/scanner/signature/evidence, hosted roles/JWT/RLS/Storage and offline/reconnect require separate execution. No hosted access or production changes were made. |
| P2 | Native browser/OS 200% zoom and screen-reader pass | Reduced CSS-viewport checks are labelled equivalent layout evidence. They do not prove native display zoom, physical keyboard obstruction, F6/browser chrome or a screen-reader session. |
| P2 | Interior workflow redesign beyond the shared frame | Existing floor tables, checks, signatures, exception forms and summary rails are retained. No new particle changes to domain controls are claimed beyond the documented presentation/markup/copy changes. |

The saved SQL probe is diagnostic, not a passing implementation of the new policy. Its 13 assertions confirm the present defect and protections. On the read-only re-audit at `3420fd86`, all 170 SQL files had the same SHA-256 as the probe: `3b357d86b8ad49e796c0a4d23cc52c582d792c891613fca9f65704c33b94e54c`.

Serial A/B and quantity-tracked returns need distinct integration tests. Quantity receipt must release only proven returned quantity and must never invent a physical asset identity. Preserve unreturned B, unrelated/future holds, genuine safety restrictions, queue tasks and the booking Close gate.

`npm ci` was not run over the active shared dependency installation. Installed dependency versions were inspected first; replacing `node_modules` while other local work was running would disrupt that work. This is an explicit verification limitation, not a silently skipped successful command.

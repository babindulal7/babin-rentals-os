# T2-19 — Return acknowledgement verification

Branch: `lane-a/T2-19-signature-at-return-when-damage-is`, based on local `main` at `80e498bc`.
Implementation claim: `2bf2ba2e`. The frozen source fingerprint is recorded in [source.json](source.json).

## Result

Clean returns ask for no signature. A session containing damaged, lost or missing items requires one
stored returning-person signature or an audited refusal naming the person and providing at least ten
trimmed characters. The database checks both partial-session completion and the full Returned stage.
The acknowledgement stores the flagged-item snapshot and is immutable, as is its signature image.

The existing Return capability and branch grants remain the authority. Owner, Admin, Manager,
Warehouse and Technician may acknowledge within their Return scope. Accounts, Coordinator, Driver
and Client cannot write acknowledgements. Accounts sees a restricted Return screen.

The signature/photo-created session adopts the action's stable completion key before any receipt.
Competing completion claims are refused. Damage findings retain stable identities across retries,
keeping the acknowledged snapshot intact after a failed transition or a lost response.
Findings keep their captured session when the per-line inspection row is reused by a later partial
return. Detaching a flagged inspection or assigning it to another booking/operation is refused;
a later clean session does not inherit the earlier finding. Reports retain each flagged serial.

Printed reports load completed sessions' stored acknowledgements and embed the actual signature
image, with extra pages for long flagged lists. Pending Return damage notices wait for the session
seal; email receives the stored image and WhatsApp drafts include the acknowledgement or refusal.
All new floor queries and acknowledgement payloads omit amounts.

## Changed surfaces

- Database: [migration 0226](../../../supabase/migrations/0226_return_damage_acknowledgement.sql), lifecycle L64.
- Actions: `floorVerb.ts`, `returnRental.ts`; deterministic damage-finding keys and stable session claim.
- UI: `ReturnWorkspace.tsx`, the existing `SignOnGlassModal.tsx`.
- Libraries: acknowledgement validation/query, gate registry, PDF export/generation, damage email/WhatsApp rendering.
- Email Edge Function: `supabase/functions/send-email/index.ts`.
- Shared authority file: `docs/PERMISSIONS.md` §6.1. No change to `rbac.ts`, `core.ts`, pricing or money engines.

## Browser and print checks

`node scripts/t2-19-screen-check.mjs` drove local `dev:mock` at port 3034 with all external requests
blocked. It used booking **864**, client **Gandaki Weddings Pvt. Ltd.**, with a missing NISI Athena 25mm.
The Technician account was an explicit synthetic local fixture because the corpus supplies no Technician login.

- Owner, Warehouse and Technician: 375 / 820 / 1440 px — flagged item, refusal/name fields, completion affordance,
  no horizontal overflow, input targets at least 44 px. Warehouse/Technician DOM checks found no money figures.
- Sign-on-glass dialog: 375 / 820 / 1440 px — flagged list and canvas present; primary target at least 44 px;
  footer fully visible with no horizontal clipping. The light-theme attestation is readable.
- Offline: completion blocked with the connection message.
- Accounts: acknowledgement controls absent; restricted Return screen.
- Existing loading, empty and error rendering is retained through `PageBody`. Unit tests cover a failed history
  load with retry, retained drafts after failed writes, and signature upload failure with an inline error.

Machine results: [screen-check.json](screen-check.json). Screenshots are stored alongside it by role/width,
plus the three `signature-modal-*.png` files.

`node docs/verification/t2-19/print-smoke.mjs` exercised the real browser PNG-to-PDF export path using
synthetic data. It embedded a signature PNG and all 50 flagged items in a four-page A4 report.
Poppler parsed the PDF and rendered the final page; the fiftieth item and signature are visible:
[PDF](return-report-signature.pdf), [rendered final page](return-report-signature-preview.png).
The render environment printed warnings for unused font aliases; the report's Helvetica text and signature rendered.

## Command results

Final full gate sequence is running. Results will be recorded here before delivery.

Earlier focused verification: 160 tests passed across nine files; the final retry-specific action suite
passed 102 tests after adding the stable finding-identity regression.

`npm audit --json`: 36 existing findings — 3 low, 15 moderate, 14 high, 4 critical. This card changes
neither dependency manifest nor lockfile; dependency remediation remains separate from T2-19.

## Release boundary

Migration 0226 is local only; final WRITTEN / VERIFIED status is recorded in PROGRESS and the migration ledger.
No migration, application or email Edge Function was deployed, and nothing was pushed or merged.
Babin reviews and merges, then coordinates staging/application of the migration and email function.

T2-18 remains an open evidence-capture card. The photo-first session retry needed by this signature flow
is fixed here; its broader multi-photo, compression, upload-stage and per-unit damage-photo acceptance
are not certified by this card. Physical-device and hosted Storage acceptance remain with the release work.
No new product decision was introduced.

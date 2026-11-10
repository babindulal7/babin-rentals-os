# T2 — Floor loop completion

**Goal:** the warehouse can run a real rental end to end on a phone or iPad — book → pack →
hand over → return → reset — with photos, signatures and every gate working against the live
database. **Lane A · Codex-1.** Rulings: S5, S14, D1–D5; W27–W45, W50–W55, W91
(`RULINGS-2026-10-26-workflow.md`); B10–B15, B19, B35, B36, B47, K4 (`RULINGS-2026-10-27-booqable.md`); §4.31 photo rule; Laws 5, 6, 8, 13; R-40 (custody is online
and fail-closed).

**Exit (G2):** on staging, then live: a booking goes through all four floor verbs on the iPhone 17
Pro and M4 iPad Pro with a Bluetooth scanner at the bench; Pack and Handover save a real photo;
receiver and warehouse sign on glass; an ID card can stand in for the cash deposit and must come
back before Close; a repaired unit returns to stock only when its repair job closes; airplane-mode
scanning queues and flushes; a repeat client's collector is picked in one tap; one person alone on
the night shift can finish Reset; scanning any label shows who has the item.

**Priority inside this track:** every card without a tag, and cards marked **[go-live]**, must be done
by day X; **[soon]** cards go in if time allows, otherwise in the first two weeks after X.

**Why this track is first:** today **Pack and Handover cannot finish live** — both require a saved
photo (gate "Evidence Captured", `PackingWorkspace.tsx` ~line 776, `HandoverWorkspace.tsx` gate 6)
and nothing in the app uploads one. `uploadEvidencePhoto()` in `src/lib/evidenceStorage.ts` is
written and has **no caller**.

---

### T2-01 · Camera evidence upload            status: done in part (26 Oct, `3fca220`) — the rest is T2-18 (T2-16 built the photo rules) · size: L · lane A
**What** — Wire `uploadEvidencePhoto()` into: Pack (booking photo), Handover (booking photo),
Return (damage photo per flagged unit — required by the 21 Jul return-flag lock), Reset (QC
defect photo) and the Evidence workspace (upload + review). Capture with
`<input type="file" accept="image/*" capture="environment" multiple>` (phone/iPad camera or
gallery). **Several photos per step are allowed (W27); the gate needs at least one.** Shrink on the
device before upload (W27): **damage photos to at most 10 MB, all other photos to at most 3 MB** —
downscale the long edge and lower JPEG quality step by step until under the cap, keep serial
numbers readable, strip EXIF location; convert HEIC to JPEG. Show progress, keep the same
`clientUuid` on retry (Law 8). Uploads need a network: when offline, say so inline and keep the
photo in memory until it can send — never fake success (Law 12, R-40). Replace the "upload
unavailable" texts (`OperationEvidenceStatus.tsx`, `EvidenceWorkspace.tsx`).
**Why** — S5 (photo gate stays mandatory); §4.31; W27; damage disputes.
**Where** — `src/lib/evidenceStorage.ts`, `src/lib/queries/operationEvidence.ts`,
`src/modules/rentals/{PackingWorkspace,HandoverWorkspace,ReturnWorkspace,ResetWorkspace,EvidenceWorkspace}.tsx`,
`src/modules/operations/OperationEvidenceStatus.tsx`, `evidence_files`, bucket `evidence`.
**Database** — none expected (bucket and policies from 0170); if a column is missing, claim a number.
**Done when** — 1) on staging, Pack completes on a real booking after one photo, Handover likewise;
2) Return refuses a Damage flag without a photo and accepts it with one; 3) the photo is readable
by staff with access to the booking and **not** by Client B (T1-06 seats); 4) Warehouse sees no
money anywhere on the screens touched; 5) a failed upload leaves the gate red and the photo
retryable; 6) tests cover compress (a 12 MB phone photo ends ≤ 3 MB, a damage photo ≤ 10 MB),
several photos in one step, retry-same-uuid, offline refusal.
**Needs** — none to build in mock mode; T1-06 (Storage accepted on staging) for the staging checks.

**Built 26 Oct (`3fca220`):** one booking-level photo per tap at Pack, Handover, Return and Reset,
compressed on the device (1600 px, JPEG 0.8, EXIF stripped), retry with the same `clientUuid`.
**Not built yet → T2-18:** several photos per pick, a damage photo per flagged unit at Return, the
10 MB damage-photo size and an honest offline message. The staging checks (Done when 1–3) wait for T1-06.

### T2-18 · Finish evidence capture (what T2-16 left)            status: todo · size: L · lane A · [go-live]
**What** — Finish what T2-01 left (Claude's review of `3fca220`, 26 Oct). **Items 3 and 4 below were built by T2-16 (several photos, size caps) — check them, do not rebuild;** items 1, 2, 5, 6 and 7 are still open:
1) **Honest offline message.** Offline, the screens say the photo "was saved / kept on device and will
   upload when connectivity is restored", but nothing keeps or uploads it (`OperationEvidenceStatus.tsx`
   `handleFileChange` and `handleRetry`; `EvidenceWorkspace.tsx` `handleUploadFile`;
   `evidenceStorage.ts` `assertStorageAvailable`). Say "You are
   offline — this photo was not saved. Take it again when you are back online." A real on-device
   queue may come later; a false "saved" may not (Law 16: every action is an authentic operation).
   **Claude sent this wording as `fix-evidence-offline-text.patch` on 26 Oct** (it also removes the
   "(Law 12 / R-40)" developer text that turned `lint:ui-copy` red on `3fca220`); if it is on `main`,
   this item is done. **Done: on `main` since 31 Oct (`622ff11`).**
2) **A damage photo per flagged unit at Return** (21 Jul return-flag lock): each flagged unit row
   gets its own photo button that passes `itemId`; Return cannot complete while a flagged unit has
   no photo. Today `ReturnWorkspace.tsx` passes no `itemId`.
3) **Several photos at once** (W27): `multiple` on the input on the floor screens and the Evidence
   page (both read only `files[0]` today); upload one by one with "2 of 3" progress; each photo keeps
   its own `client_uuid` for retry.
4) **Photo sizes** (W27): damage photos keep detail — at most 10 MB (long edge up to 2560 px,
   quality 0.9, stepping down until under the cap); other photos stay at 1600 px / 0.8 (under 3 MB).
5) **A failed load is not "0 photos":** `fetchBookingEvidenceFiles()` (`src/lib/queries/evidence.ts`)
   returns `[]` on any error, so the screen shows no photos instead of "could not load". Return the
   error and show "Could not load photos — Retry".
6) **One owner for sessions.** `resolveOrCreateSession()` (`evidenceStorage.ts`) opens a Packing,
   Handover or Return session from the photo button with a random `client_uuid`; the Return verb keys
   its receipt on its own action `client_uuid` (`floorVerb.ts`, `readReturnSessionForAction`). Add a
   test: photo first → Return completes → retry with the same action key → no second session and no
   second release. If it fails, open the session through the floor-verb action instead.
7) **Evidence page stage mapping.** `EvidenceWorkspace.tsx` sends every category except Return and
   Damage to the `Packing` stage. After Pack is complete there is no In Progress Packing session, and a
   booking may have only one Packing session ever (`operation_sessions_one_packing_per_booking`,
   0003), so those uploads fail. Map each category to its own stage; attach to the open session or use
   a stage that needs none (`Damage`, `Reset` — 0003 `evidence_references_operational_stage_needs_a_session`).
**Why** — W27; the 21 Jul return-flag lock; Law 16 (no success that did not happen); R-40.
**Where** — `src/modules/operations/OperationEvidenceStatus.tsx`, `src/lib/evidenceStorage.ts`,
`src/lib/imageCompression.ts`, `src/lib/queries/evidence.ts`, `src/modules/rentals/ReturnWorkspace.tsx`,
`src/modules/rentals/EvidenceWorkspace.tsx`;
`src/actions/rentals/floorVerb.ts` only if step 6's test fails.
**Database** — none expected: `evidence_references.item_id` exists and `Damage`/`Reset` are in the
`evidence_operation_stage` enum (0001). If a column is missing, claim a number.
**Build notes** — keep one state value per photo — idle · compressing · uploading ·
saved · failed · offline (not saved) — handled by an exhaustive `switch`, instead of separate flags
(`isUploading`, `uploadError`, `retryPayload`) that can contradict each other.
**Done when** — 1) offline, nothing says "saved"; 2) Return with two flagged units cannot complete
until each has its photo; 3) picking three photos uploads three with a count; 4) a 12 MP damage photo
keeps a 2560 px long edge and ends ≤ 10 MB, a normal photo ≤ 3 MB; 5) a forced query error shows the
retry message; 6) the session retry test passes; 7) a Handover photo added on the Evidence page
after Pack is complete saves; gates green; driven in `dev:mock` at 375, 820 and
1440 px as Warehouse and Technician.
**Needs** — T2-01 (done in part). Staging checks of T2-01 (Done when 1–3) still wait for T1-06.

### T2-17 · Save a unit's details            status: todo · size: M · lane A · [go-live]
**What** — On the equipment page, the unit editor (`AssetDetail.tsx`, `UnitEditor`) lets staff change
a unit's asset tag, serial, status, rack, shelf, bin and condition, then says "Editing this session
only — there is no unit-update action yet, so nothing is persisted" (line 223). Staff label and
re-shelve real stock as they go (W72), and a screen that looks editable but saves nothing must not
ship (Law 16), so make it real:
1) An `updateUnit` action — one write with `client_uuid` and an audit row — for **asset tag, serial,
   rack, shelf and bin**. Asset tag never empty and unique; serial may be empty. Spaces and dashes are
   trimmed, not refused.
2) **Status is read-only here.** Nobody writes `product_units.status` directly
   (`gate.unit_status.direct_write`, 0114): it changes through Pack, Return, Reset and Retire. Show it
   with that hint.
3) **Condition is read-only after intake** (PERMISSIONS §3.1, Warehouse limited cell: condition at intake). Later changes come
   through Return inspection and repair jobs.
4) Replacement value stays intake-only and is never sent to money-blind roles (already so).
5) After Save, read the unit back and show "Saved"; on failure keep the draft and say why inline. If
   someone changed the unit since it was opened, say so instead of overwriting.
6) After an asset tag change, offer **Reprint label** (T2-08) — the old label no longer matches.
**Why** — Law 16 (the editor implies a save that never happens); PERMISSIONS §3.1 (the Warehouse
limited cell: edit identity, units and location); W72; usability task U12 (`docs/USABILITY_TESTS.md`).
**Where** — `src/modules/inventory/AssetDetail.tsx` (`UnitEditor`), new
`src/actions/inventory/updateUnit.ts`, `product_units` (update policy `product_units_update`: Owner ·
Admin · Manager · Warehouse, 0018). Use the capability PERMISSIONS §4 gives unit edits; if none fits,
add one for exactly that role set in PERMISSIONS §4, `src/lib/rbac.ts` and the T-1 fixture in the
same commit (B-3), never wider than RLS (N-3).
**Database** — none expected (policy and audit exist). If the uniqueness or trim rule needs SQL, claim
a number and add a lifecycle step.
**Build notes** — one state value: editing · saving · saved · failed · changed-by-someone-else; Save is
disabled while saving; labels outside the fields.
**Done when** — 1) as Warehouse, change rack and shelf, Save, reload — the new values are there;
2) an empty or duplicate asset tag is refused inline and the draft is kept; 3) status and condition
cannot be edited here; 4) as Coordinator (not in the update policy) the editor is not offered (B-1);
5) Warehouse gets no replacement value in the DOM or the payload; 6) two tabs editing the same unit —
the second save is told the unit changed; 7) screen check passes at 375 / 820 / 1440.
**Needs** — none (T2-08 for the reprint step).

### T2-02 · Drawn signatures            status: done (built 26 Oct; terms line + checkbox already in the sign modal; the receiver-from-collectors picker lands with T2-12) · size: M · lane A
**What** — A signature pad (finger or stylus) for Receiver and Warehouse at Handover and Driver on
delivery handovers. **One receiver signature covers both the receipt and the rental terms (L3):**
the pad sits under the item list and the terms ("received for <client>, under the rental terms")
— no second signature. The receiver is the client or someone they send (W28); their name comes
from the client's collectors list (T2-12). Save the drawing as a PNG through T2-01's upload and
link it with `signatures.signature_evidence_file_id`; keep signer name and time as today. The DB
gate `gate.handover.agreement_unsigned` already needs one signature in the handover session
(0171 ~line 503) — keep it.
**Why** — 21 Jul lock (client signature before gear leaves); PERMISSIONS §6.1 agreement gate; L3.
**Where** — `HandoverWorkspace.tsx` (gate 5), `src/actions/rentals/floorVerb.ts` (`writeSignatures`),
`signatures` table, new `src/components/ui/SignaturePad.tsx`.
**Database** — none.
**Done when** — signature PNG visible on the booking's documents; blank pad refused; works with a
finger on the iPhone and Apple Pencil on the iPad; 44 px controls.
**Needs** — T2-01.

### T2-03 · ID card as the deposit            status: done · size: L · lane A
**What** — New collateral record kept **apart from money** (Law 5): type (citizenship card,
passport, driving licence), number (stored, shown masked except to Manager+), photo (T2-01; visible
to **Manager and above** only), held by, held at, returned by, returned at. At Handover the deposit
gate (gate 4) passes when an ID is held **instead of cash** (D1). Close refuses while an ID is
still held — new gate `gate.close.collateral_held` ("Return the client's ID before closing").
Booking Detail and Client page show "ID held" without the number for non-Manager roles. Nothing
here ever enters a total, outstanding or report sum.
**Why** — D1 (OPEN_DECISIONS §12 / §4.65c).
**Where** — new migration, `HandoverWorkspace.tsx` gate 4, close path in
`apply_booking_stage_transition()`, `BookingDetail.tsx`, `docs/PERMISSIONS.md` §6.1 (two new rows,
same commit — B-3).
**Database** — migration (claim number): table `collateral_documents` + RLS (staff insert/read
booking-scoped; number/photo columns Manager+), gate in the stage-transition function, lifecycle
steps: "ID satisfies deposit gate", "Close refused while ID held", "Warehouse cannot read ID number".
**Done when** — 1) `check:pglite` + `check:lifecycle` green with the new steps; 2) handover with ID
and no cash completes; 3) Close blocked until "Return ID" is recorded; 4) T-1 fixture updated.
**Needs** — T2-01.

### T2-04 · Gate 1 override by any handover staff            status: done · size: M · lane A
**What** — When the receiver's ID cannot be checked, **any staff member allowed to hand over** may
override gate 1 with a reason of 10+ characters; the override is audited (actor, role, time,
reason). Remove `OVERRIDE_UNAVAILABLE` for gate 1.
**Why** — D2 ("Can override anyone but with reason"). Changes PERMISSIONS §6.1
`gate.handover.receiver_unverified` from M+ to handover-capable staff.
**Where** — `HandoverWorkspace.tsx` (~line 822), stage-transition gate, `src/lib/rbac.ts`,
`docs/PERMISSIONS.md` §6.1, T-1 fixture.
**Database** — migration (claim number) if the gate is enforced in SQL; lifecycle step "Warehouse
overrides gate 1 with reason; refused without".
**Done when** — DB gate and UI agree; reason < 10 chars refused inline; audit row exists.
**Needs** — none.

### T2-05 · Technician can do every floor verb            status: done · size: M · lane A
**What** — Technician may Pack, Hand over, Return and Reset (D3). Update `canPack`, `canHandover`
(and the per-operation grants from 0171) and PERMISSIONS §3 Technician cells in one commit.
Technician stays **money-blind** — the payment/deposit gates still show "Payment required" with no
figure and cannot be cleared by a Technician (soft release with warning stays, as for Warehouse).
**Why** — D3; closes OPEN_DECISIONS §17 and the P0-B Technician cell.
**Where** — `src/lib/rbac.ts` (~lines 502–524), `src/actions/core.ts`, operation grant SQL,
`docs/PERMISSIONS.md` §3, T-1 fixture, `BookingOperationsMenu`, `BookingDetail` primary action.
**Database** — migration (claim number) only if 0171's grant model excludes Technician from
handover; lifecycle step "Technician completes a handover".
**Done when** — a Technician seat on staging completes all four verbs; sees no money.
**Needs** — T1-05 (Technician seat).

### T2-06 · Repair job closes the damage            status: ready — awaiting merge (lane-a/T2-06-repair-job-closes-the-damage) · size: L · lane A
**What** — Build the Maintenance job detail screen (today "not built yet", `Maintenance.tsx` ~lines
454 and 1139): findings, actions taken, cost (money roles only), photos, and **Close job (note
required)** for Technician or Manager+. Closing marks the linked `damage_findings` row repaired and
re-runs the unit status engine, so the unit becomes reservable (D4). Until then the unit stays
blocked — as today.
**Why** — D4; 21 Jul "maintenance blocks availability until cleared"; OPEN_DECISIONS 24 Oct.
**Where** — `src/modules/inventory/Maintenance.tsx`, new `MaintenanceJobDetail.tsx`,
`src/actions/maintenance/completeMaintenance.ts`, `recompute_unit_status` (0114, 0176),
`damage_findings`.
**Database** — migration (claim number): link maintenance record ↔ finding; clearance on completion
in the status engine; lifecycle steps "unit with open finding cannot be reserved", "after job close
it can".
**Done when** — staging: flag damage at Return → job created → unit not bookable → close job with
note → unit bookable; Warehouse sees no cost.
**Needs** — T2-01 (photos on the job).

### T2-07 · Reset "Needed next"            status: done · size: S · lane A
**What** — In the Reset queue, a unit whose next reservation's pickup is within **4 hours ⭐**
(Settings ▸ Operations) shows a "Needed next · pickup 10:30" badge (icon + text, never colour
alone) and sorts to the top; the rest stay first-in, first-out.
**Why** — D5 (§4.65a).
**Where** — `src/modules/rentals/ResetWorkspace.tsx`, `src/lib/queries/reset.ts`,
`src/lib/settingsStore.ts`.
**Database** — none (reads reservations).
**Done when** — mock data with a pickup in 3 h sorts first; at 5 h it does not; Settings change
takes effect.
**Needs** — none.

### T2-08 · Floor printing            status: done · size: M · lane A
**What** — 1) Packing list print/PDF from Pack (parent-first, children nested — 27 Jul hierarchy
rule); 2) Return report print/PDF (units, outcome, photos count, flags); 3) QR labels from
Inventory: **QR code + asset code** on each label (W71), printed on the label printer Babin buys
(W54, O-16) and on A4 label sheets as a fallback; reprint one unit's label from its item card.
Replace the two `<Unavailable reason="Printing … is not built">` blocks.
**Why** — 21 Jul lock: the OS generates the Packing List in v1; staff hand paper to drivers; W54, W71.
**Where** — `PackingWorkspace.tsx` (~line 1380), `ReturnWorkspace.tsx` (~line 1571),
`src/lib/pdf/generatePdf.ts` (`generateDocumentPdf`), `src/lib/labelPrinter.ts`, `QrLabels`.
**Database** — none (document records via `createDocument` where they exist).
**Done when** — PDFs open on iPad and print on the shop printer; Warehouse versions carry no prices.
**Needs** — none.

### T2-09 · Bluetooth scanner at the packing bench            status: doing — code verified; iPad/scanner acceptance pending (lane-a/T2-09-main-integration) · size: S · lane A + Babin
**What** — Claude proposes 2–3 iPad-compatible Bluetooth scanners that read QR and Code 128 in
keyboard (HID) mode, with prices from Nepali sellers; Babin buys one. Make `ScannerInput` accept a
fast keystroke burst ending in Enter anywhere on the floor screens (focus trap on the scan field,
no double submit). Camera scanning stays everywhere (S14). **Manual tick stays beside scanning on
every floor screen** — only some items carry labels today and labelling has no deadline (W25, W72);
a manual tick records "ticked by hand" so the audit shows which items were not scanned.
**Why** — S14; W72; bulk packing speed.
**Where** — `src/components/ui/ScannerInput.tsx`, `src/lib/scannerLookup.ts`, floor screens.
**Database** — none.
**Done when** — 50 serials scanned in a row on the iPad with no missed or doubled scan; an unlabelled
item can be packed, handed over and returned by hand in ≤ 2 taps.
**Needs** — Babin buys the scanner (O-16).

### T2-10 · Offline outbox for scans and ticks            status: done · size: M · lane A
**What** — Route non-custodial floor writes (scan events, checklist ticks, notes, queue stamps)
through the Dexie outbox (`src/lib/offlineQueue.ts`, `dataAccess.ts` idempotent insert) with
`client_uuid`. Custody transitions stay online RPCs (R-40). Show queued count and last flush.
**Why** — 21 Jul lock (warehouse tablet works offline for scan + triage + packing);
REMAINING_WORK Task 2.4; the shop internet "drops sometimes" (W55) — go-live critical.
**Where** — `src/lib/offlineQueue.ts`, `src/lib/dataAccess.ts`, `src/lib/syncEngine.ts`, floor screens.
**Database** — none.
**Done when** — in airplane mode: 20 scans + ticks queue; back online they flush once (no
duplicates, server rows = 20); the Confirm button says it needs a connection.
**Needs** — none.

### T2-12 · Client collectors and ID on file            status: done · merged (`d62b9a0f`) · size: M · lane A · [go-live]
**What** — 1) **ID on file before the first rental** (W50): a client needs one ID document (type,
number, photo) before their first Handover; stored once and reused (W51 — a citizenship card does
not expire; record an expiry only when the document has one). The Handover receiver step shows
"ID on file ✓" instead of asking again. 2) **Collectors list per client** (W28, W34): name, phone,
ID photo of the people a client usually sends (assistant, AC, driver). At Handover, staff pick the
receiver from the list in one tap; a new person is added on the spot (name + phone + ID photo).
3) ID numbers masked except to Manager+; photos visible to Manager+ and the client's own portal
account only (same rule as T2-03).
**Why** — W28, W34, W50, W51; Handover gate 1 (receiver verified) gets one tap for known people.
**Where** — client record (`src/modules/clients/*`), `HandoverWorkspace.tsx` gate 1,
`src/lib/queries/clients.ts`, evidence/documents storage (T2-01).
**Database** — migration (claim a number): `client_id_documents` (or reuse the client document
store if it fits) + `client_collectors` with RLS (staff read booking-scoped clients; ID number and
photo columns Manager+; Client reads own); lifecycle step "Warehouse cannot read an ID number".
**Build notes** — the form keeps the draft apart from what is saved and shows
loading → saving → saved / failed; phone numbers and ID numbers accept spaces and dashes and are cleaned,
not refused; labels sit outside the fields.
**Done when** — a first-time client cannot be handed gear without an ID on file (clear inline
message + "Add ID" in place); a repeat client's collector is picked in one tap; Warehouse never sees
an ID number.
**Needs** — T2-01. Also wires the collector picker into `SignOnGlassModal.tsx` as the receiver name (T2-02 left free text).

### T2-13 · Self-QC when alone            status: ready — awaiting merge (lane-a/T2-13-self-qc-when-alone) · size: S · lane A · [go-live]
**What** — Allow the person who cleaned an item to pass its QC **when alone on shift** (W43, L7):
the QC step shows "I am alone on shift" as a tick; with it ticked, `qc_by = cleaned_by` is accepted
and recorded as self-checked (audit row says so). Without it, a second person is still asked for.
Today the database refuses this outright: CHECK `qc_by <> cleaned_by` on `cleaning_queue_entries`
(0003 ~line 890), and the 25 Oct repair enforces a second inspector in the app.
**Why** — W43; the new night shift (W32) often has one person on the floor.
**Where** — `src/modules/rentals/ResetWorkspace.tsx`, `src/actions/rentals/floorVerb.ts` (~lines
265–296), new migration.
**Database** — migration (claim a number): add `qc_self_checked boolean not null default false`;
replace the CHECK with `qc_by <> cleaned_by or qc_self_checked`; audit the flag; lifecycle step
"self-QC refused without the flag, accepted with it, audited". Update PERMISSIONS §6.1 (new row) and
the "ruled, not yet in code" box in the same commit (B-3).
**Done when** — both paths work in mock mode and on staging; the audit shows self-checked rows.
**Needs** — none.

### T2-14 · Scan a label → item card            status: ready — awaiting merge (lane-a/T2-14-scan-a-label-to-item-card) · size: M · lane A · [go-live]
**What** — Scanning (camera or Bluetooth) or searching an item's QR/asset code **anywhere outside a
floor workspace** opens its item card: status, **who has it now** (client, booking, due back, with a
countdown), location if in the shop, next booking, last reset, open damage. Inside a workspace,
scanning keeps its current meaning (mark the item). Money hidden for floor roles (Law 6).
**Why** — W91 "knowing who has which item".
**Where** — `src/components/shell/ScannerFab.tsx`, `src/lib/scannerLookup.ts`,
`src/modules/inventory/AssetDetail.tsx` (or a lighter sheet), `src/lib/queries/inventory.ts`.
**Database** — none expected.
**Build notes** — a Bluetooth scanner types the code and presses Enter. Never
debounce scans — that drops items. Ignore the same code a second time within ⭐ 1.5 s; trim spaces and
match case-insensitively; every code is checked by the server, and an unknown code says so inline.
**Done when** — scan → card in ≤ 1 second on the iPad; an item on rent shows the client and due-back
time; a Warehouse seat sees no money.
**Needs** — none.

### T2-15 · Damage found during reset            status: ready — awaiting merge (lane-a/T2-15-damage-found-during-reset) · size: S · lane A · [soon]
**What** — When Reset marks an item Damaged after the client has left (W44), the app opens a damage
case **linked to the booking it last came back from**, defaulting to **claim from the client**; the
client gets the "damage found — under review" email without an amount (W23, T5-07); the amount
follows only after a Manager (< Rs 25,000) or Owner (≥ Rs 25,000) approves.
**Why** — W44, W23; Cleaning v3.1 "damage found post-inspection" case.
**Where** — `ResetWorkspace.tsx`, `src/actions/cases/*`, `src/lib/damage.ts`.
**Database** — none expected (cases exist); add a lifecycle step if the link needs a new column.
**Done when** — a Reset damage on staging creates the case on the right booking with photos, the
client gets the notice, and no amount appears until approval.
**Needs** — T2-01, T5-07 for the email.

### T2-16 · Photo rules from W27: several photos, size caps, HEIC            status: ready — awaiting merge (lane-a/T2-16-photo-rules-w27) · size: S · lane A · [go-live]
**What** — T2-01 shipped one photo per step with one shrink rule. Bring it to W27: the file input gets
`multiple`; **one or more photos per step, the gate needs at least one**; shrink on the device until
**damage photos ≤ 10 MB and every other photo ≤ 3 MB** (lower the long edge and the JPEG quality step
by step, keep serial numbers readable), strip EXIF location, convert HEIC to JPEG. Same `clientUuid`
on retry; offline still refuses inline.
**Why** — W27; T2-01 was built before the workflow round.
**Where** — `src/lib/imageCompression.ts`, `src/lib/evidenceStorage.ts`, `src/modules/rentals/EvidenceWorkspace.tsx`,
`src/modules/operations/OperationEvidenceStatus.tsx`, `src/lib/__tests__/imageCompression.test.ts`.
**Database** — none.
**Done when** — a 12 MB phone photo ends ≤ 3 MB, a damage photo ≤ 10 MB, three photos attach to one
step and the gate passes on the first, a HEIC file uploads as JPEG, retry reuses the uuid.
**Needs** — T2-01 (done).

### T2-25 · Print every line; the pick list from the booking            status: done · size: S · lane A · [go-live]
**What** — T2-08 (done) prints the packing list from Pack and the return report from Return. Two gaps:
1) **Long bookings are cut short on paper.** The packing list stops after 16 lines ("…and N more
   equipment lines listed on digital manifest"), the return report after 14 and the document PDF after
   12 (`src/lib/pdf/generatePdf.ts` ~lines 260, 639, 858). Print **every** line, on as many A4 pages as
   it takes, with "page 2 of 3" and the booking number on each page — staff tick the paper at the shelf.
2) **The pick list (B15 — A4, one per booking):** the packing list also prints from **Booking Detail**
   ("Print pick list"), with the booking number as a **QR code** at the top (scanning it opens the
   booking, T2-14), client, project (T3-26, once it exists) and pickup date and time; each line keeps
   its asset code, tick box and shelf location, parent-first with children nested (27 Jul rule).
Warehouse versions carry no prices.
**Why** — the 21 Jul lock (the OS prints the packing list; staff hand paper to drivers); B15.
**Where** — `src/lib/pdf/generatePdf.ts`, `src/lib/pdf/exportPdf.ts`, `BookingDetail.tsx`,
`PackingWorkspace.tsx`.
**Database** — none.
**Done when** — a 40-line booking prints all 40 lines over two pages; the pick list prints from
Booking Detail and from Pack on the iPad; scanning its QR opens that booking; Warehouse sees no price
in either PDF; screen check.
**Needs** — none (T3-26 adds the project line when it lands).

### T2-19 · Signature at Return when damage is found            status: todo · size: S · lane A · [go-live] · slips first
**What** — At Return, when at least one unit is flagged damaged or missing, the person returning the
gear signs once under the list of flagged items ("returned by <name> for <client>; the flagged items
are as shown") before Return can complete (B19). With no flags, no signature is asked (R-39). Reuse the
T2-02 drawn-signature modal and the `signatures` table; the signature joins the Return session and
shows on the Return report (T2-08) and the damage notice (T5-07 item 6). If the person will not sign,
staff tick "Refused to sign" with a reason of at least 10 characters — recorded and audited, and Return
can complete ⭐ (the gear is back; blocking would stall the floor).
**Why** — B19; the 21 Jul return-flag lock; W23 (damage notice).
**Where** — `src/modules/rentals/ReturnWorkspace.tsx`, the T2-02 signature modal,
`src/actions/rentals/floorVerb.ts` (Return), the Return gate in Postgres.
**Database** — migration (claim a number): Return refuses to complete while a flagged line has neither
a signature nor a recorded refusal (`gate.return.damage_unsigned` — add the row to PERMISSIONS §6.1 in
the same commit, B-3); lifecycle "a flagged return without signature is refused", "a clean return
needs none".
**Done when** — 1) a return with no flags completes with no signature; 2) a return with a flagged unit
cannot complete until signed or the refusal is recorded; 3) the signature is on the Return report;
4) Warehouse and Technician can do it; 5) screen check.
**Needs** — T2-02 (done), T2-18 (damage photo per flagged unit).

### T2-20 · Floor adds consumables at Pack and Handover            status: todo · size: S · lane A · [go-live] · slips first
**What** — On Pack and Handover, "**Add consumables**" lists the consumable products (tape, gels,
batteries) with a quantity stepper (B35). Adding writes a consumable line to the booking through
T3-30's action: the price comes from the server and floor roles never receive it (Law 6). Stock goes
down at Handover as today (0142). A line added on the floor shows "added by <name> at Pack" on the
booking, so the desk sees it before invoicing.
**Why** — B35, B14.
**Where** — `src/modules/rentals/PackingWorkspace.tsx`, `HandoverWorkspace.tsx`, T3-30's `addConsumableLine` action.
**Database** — none beyond T3-30 (its function admits floor roles for consumable lines only, and
returns no price to them).
**Done when** — 1) Warehouse adds 2 rolls of gaffer tape at Pack; the desk sees the line with its
price; Warehouse has no price in the DOM or the payload; 2) Handover deducts the stock once; 3) the
same `client_uuid` twice adds one line; 4) screen check.
**Needs** — T3-30.

### T2-21 · Planned downtime with a reason            status: todo · size: M · lane A · [go-live] · slips first
**What** — Block a unit (or part of a quantity-tracked product) for **dates you know in advance**, with
a **reason from a list** (B10): ⭐ **Repair · Service or calibration · Our own shoot · Lent to a
partner · Marketing shoot · Other (type it)**. In that range the unit cannot be booked — New Rental,
the public site (T7-02), availability (T3-22) — and the calendar shows a grey bar with the reason
(icon + text). If a booking already holds the unit in that range the downtime is refused with the
booking named ("BK-1234 has it on those dates"). Downtime ends on its end date or by "**End now**"
(a named terminal action, Law 3); nothing is deleted. Who: the roles that may create a maintenance job
today (`maintenance.create`, C+ · Floor, PERMISSIONS §4.3).
**Why** — B10, B53.
**Where** — `src/lib/availability.ts`, `src/lib/queries/availability.ts`, `src/modules/inventory/AssetDetail.tsx`,
`src/modules/calendar/Calendar.tsx`, new `src/actions/inventory/planDowntime.ts`.
**Database** — migration (claim a number). **The design note picks one:** a `Downtime` hold inside
`inventory_reservations` (then `booking_id` may be empty for that kind only, and the existing GiST
guard covers both directions), or its own table checked by the reservation function and by the
downtime insert. Since 31 Oct the guard also covers the 4-hour holds of `0188` (`hold_state`,
`confirm_booking_atomic`, `create_or_extend_hold`) — the note must say how downtime meets them. Either way: `client_uuid`, reason, who, ended at/by; `public_availability` honours it;
lifecycle "a booking over a downtime is refused", "a downtime over a booking is refused", "an ended
downtime frees the dates".
**Done when** — 1) block a camera for 3 days; New Rental and the public site show it unavailable on
those days only; 2) a downtime over an existing booking is refused with the booking number; 3) End now
frees the dates at once; 4) the calendar bar shows the reason to every staff role; 5) screen check.
**Needs** — T3-22 merged first if it is open (both change `src/lib/queries/availability.ts`).

### T2-22 · Time between rentals: account-wide or per product            status: todo · size: M · lane A · [go-live] · slips first
**What** — Settings ▸ Operations rules gets "**Time between rentals: Account-wide · Per product**"
(B11, reading). *Account-wide* is today's `rentalTurnaround` setting. *Per product* uses each product's
**prep minutes before pickup** and **cleaning minutes after return** — `products.prep_time_minutes` and
`cleaning_time_minutes`, already on the equipment form (Maintenance section) but read by nothing for
availability today. In per-product mode, a unit returned at 18:00 with 120 cleaning minutes is free
from 20:00, and a 09:00 pickup with 60 prep minutes needs the unit back by 08:00. Today the turnaround
is applied by the screen only (`src/lib/queries/availability.ts`); move the rule to where reservations
are made, so the database refuses a booking that is too close. Existing reservations are not changed.
**Why** — B11, B53.
**Where** — `src/modules/settings/sections/System.tsx` (Operations rules), `src/lib/availability.ts`,
`src/lib/availabilityEvaluation.ts`, `src/lib/queries/availability.ts`, the reserved range in
`apply_booking_stage_transition()` and in `confirm_booking_atomic()` / `create_or_extend_hold()` (0188).
**Database** — migration (claim a number): the reservation check widens the range by the turnaround
(account-wide) or by the product's prep/cleaning minutes (per product); lifecycle "per product: a
pickup inside the cleaning window is refused", "account-wide mode behaves as before".
**Done when** — 1) per-product mode refuses a pickup 1 hour after a return when cleaning is 2 hours,
on screen and in the database; 2) account-wide mode is unchanged; 3) the equipment form says the
minutes are used only in per-product mode; 4) screen check.
**Needs** — T2-21 (same availability change).

### T2-23 · Allow overbooking on chosen products            status: todo · size: M · lane A · [go-live] · slips first
**What** — Each product gets an **"Allow overbooking"** switch, **off by default** (B12), on the
equipment form (product edit: Owner · Admin · Manager) and in bulk edit (T4-12). When it is on and a
booking asks for more than is free, Confirm still succeeds: the extra quantity becomes a **short**
line — **no unit is reserved for it** — and the booking, Today and the booking list show "**1 short —
sub-rent or swap**" with the T3-13 choices until it is covered (K4). The database guard against two
bookings on one unit stays exactly as it is. Pack refuses a short line until it is covered. Remove the
device-only "Allow overbooking" setting (`src/lib/bookingRules.ts`, localStorage) and the
`(allowOverbooking || true)` no-op in `AddItemPanel.tsx` (~line 1836).
**Why** — B12, B53, K4; Law 16 (a setting that lives in one browser).
**Where** — equipment form, `src/modules/rentals/booking/AddItemPanel.tsx`,
`src/modules/rentals/booking/BookingConflictModal.tsx`, `src/lib/availability.ts`,
`src/lib/availabilityEvaluation.ts`, Confirm (`create_booking`, `confirm_booking_atomic` — 0188) in
Postgres, the Today card, `src/lib/bookingRules.ts`.
**Database** — migration (claim a number): `products.allow_overbooking boolean not null default false`;
a short quantity on the line, set by Confirm only for products that allow it; the GiST guard untouched;
lifecycle "past stock without the switch is refused (as today)", "with the switch: confirmed with a
short line and no reservation", "Pack refuses a short line".
**Done when** — 1) with the switch off nothing changes; 2) on: booking 3 of a product with 2 free
confirms with "1 short"; 3) Today shows the short line to desk roles and to Warehouse (no money);
4) a sub-rent line clears it; 5) the device-only setting is gone; 6) screen check.
**Needs** — T3-13 (the similar / sub-rent choices); T2-21 (same availability files).

### T2-24 · Temporary stock from partners            status: todo · size: L · lane A · [go-live] · slips first
**What** — Add partner gear to our stock **for a period** (B13): the partner (a `suppliers` record, as
for sub-rents), the product (an existing one, or a new "partner only" product), the units (asset codes;
labels printed with "PARTNER" ⭐) or a quantity, **from – until**, and **what the partner charges: per
day or a fixed amount** (B47 — money roles only, Law 6). Inside the period the units are bookable like
our own; outside it they do not exist for availability, and no booking may run past the end. They never
count in owned stock, ROI or depreciation. At the end date a **"Return to partner" task** appears in
the floor queue (B36) listing the units; completing it (scan each unit, photo optional) ends the
temporary stock — "Returned to partner", a named terminal action (Law 3). The partner cost shows in
the booking's profit and the sub-rent report (money roles). **Design note first** (availability change).
**Why** — B13, B36, B47, B53.
**Where** — new `src/modules/inventory/TemporaryStock*.tsx`, `src/actions/inventory/*`,
`src/lib/availability.ts`, the floor task queue, the sub-rent report.
**Database** — migration (claim a number): `temporary_stock` (supplier, product, quantity, from, until,
cost kind, cost in paisa, status, `client_uuid`) with partner units as `product_units` tied to it;
availability counts them only inside the window, in the same place T2-21 puts downtime; the cost is
money-masked like the 0062 column grants; lifecycle "a booking outside the window cannot reserve a
partner unit", "the end task appears and closes the stock".
**Done when** — 1) add 2 partner lenses for 5 days; New Rental books them inside the window only;
2) Warehouse sees the units and the task but no cost; 3) Owner sees the cost in the booking's profit;
4) at the end date the task lists both lenses, and completing it takes them out of availability;
5) nothing is deleted; 6) screen check.
**Needs** — T2-21, T2-08 (labels), T3-13 (the partner list in the sub-rent flow).

### T2-11 · Device day            status: todo · size: M · lane A + Babin + staff
**What** — One supervised session on the **iPhone 17 Pro, M4 iPad Pro and the Bluetooth scanner**
(and one staff Android phone if any staff use Android): run five real-shaped bookings through all
four verbs on staging, in both orientations, light and dark, at 125% text; airplane-mode test
(T2-10); photo, signature, ID card, override, Technician seat. Record defects as cards.
**Why** — No physical device acceptance has ever run (REMAINING_WORK Task 4.1, 4.3).
**Where** — `docs/verification/DEVICE_DAY_<date>.md`.
**Database** — staging.
**Done when** — checklist complete; zero P0 defects open; P1 defects have cards with owners. Also
drive the counter desktop PC and a laptop (W52), the name + PIN switch on the shared iPad (T1-15),
and one night-shift return before 6 AM (W31, W32).
**Needs** — T2-01 … T2-10, T2-12 … T2-15, T1-15; Babin books the session (target 10 Jan 2027, 26 Poush).

# T2 — Floor loop completion

**Goal:** the warehouse can run a real rental end to end on a phone or iPad — book → pack →
hand over → return → reset — with photos, signatures and every gate working against the live
database. **Lane A · Codex-1.** Rulings: S5, S14, D1–D5; W27–W45, W50–W55, W91
(`RULINGS-2026-10-26-workflow.md`); §4.31 photo rule; Laws 5, 6, 8, 13; R-40 (custody is online
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

### T2-01 · Camera evidence upload            status: done (built 26 Oct to the pre-W27 spec: one photo per step, 1600 px / q0.8 — W27 delta is T2-16) · size: L · lane A
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

### T2-06 · Repair job closes the damage            status: todo · size: L · lane A
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

### T2-09 · Bluetooth scanner at the packing bench            status: todo · size: S · lane A + Babin
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

### T2-10 · Offline outbox for scans and ticks            status: todo · size: M · lane A
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

### T2-12 · Client collectors and ID on file            status: todo · size: M · lane A · [go-live]
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
**Done when** — a first-time client cannot be handed gear without an ID on file (clear inline
message + "Add ID" in place); a repeat client's collector is picked in one tap; Warehouse never sees
an ID number.
**Needs** — T2-01. Also wires the collector picker into `SignOnGlassModal.tsx` as the receiver name (T2-02 left free text).

### T2-13 · Self-QC when alone            status: todo · size: S · lane A · [go-live]
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

### T2-14 · Scan a label → item card            status: todo · size: M · lane A · [go-live]
**What** — Scanning (camera or Bluetooth) or searching an item's QR/asset code **anywhere outside a
floor workspace** opens its item card: status, **who has it now** (client, booking, due back, with a
countdown), location if in the shop, next booking, last reset, open damage. Inside a workspace,
scanning keeps its current meaning (mark the item). Money hidden for floor roles (Law 6).
**Why** — W91 "knowing who has which item".
**Where** — `src/components/shell/ScannerFab.tsx`, `src/lib/scannerLookup.ts`,
`src/modules/inventory/AssetDetail.tsx` (or a lighter sheet), `src/lib/queries/inventory.ts`.
**Database** — none expected.
**Done when** — scan → card in ≤ 1 second on the iPad; an item on rent shows the client and due-back
time; a Warehouse seat sees no money.
**Needs** — none.

### T2-15 · Damage found during reset            status: todo · size: S · lane A · [soon]
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

### T2-16 · Photo rules from W27: several photos, size caps, HEIC            status: todo · size: S · lane A · [go-live]
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

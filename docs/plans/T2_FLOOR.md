# T2 — Floor loop completion

**Goal:** the warehouse can run a real rental end to end on a phone or iPad — book → pack →
hand over → return → reset — with photos, signatures and every gate working against the live
database. **Lane A.** Rulings: S5, S14, D1–D5; §4.31 photo rule; Laws 5, 6, 8, 13; R-40 (custody
is online and fail-closed).

**Exit (G2):** on staging, then live: a booking goes through all four floor verbs on the iPhone 17
Pro and M4 iPad Pro with a Bluetooth scanner at the bench; Pack and Handover save a real photo;
receiver and warehouse sign on glass; an ID card can stand in for the cash deposit and must come
back before Close; a repaired unit returns to stock only when its repair job closes; airplane-mode
scanning queues and flushes.

**Why this track is first:** today **Pack and Handover cannot finish live** — both require a saved
photo (gate "Evidence Captured", `PackingWorkspace.tsx` ~line 776, `HandoverWorkspace.tsx` gate 6)
and nothing in the app uploads one. `uploadEvidencePhoto()` in `src/lib/evidenceStorage.ts` is
written and has **no caller**.

---

### T2-01 · Camera evidence upload            status: done · size: L · lane A
**What** — Wire `uploadEvidencePhoto()` into: Pack (booking photo), Handover (booking photo),
Return (damage photo per flagged unit — required by the 21 Jul return-flag lock), Reset (QC
defect photo) and the Evidence workspace (upload + review). Capture with
`<input type="file" accept="image/*" capture="environment">` (phone/iPad camera), compress on the
device before upload (⭐ long edge 1600 px, JPEG quality 0.8, EXIF location stripped), show
progress, keep the same `clientUuid` on retry (Law 8). Uploads need a network: when offline, say
so inline and keep the photo in memory until it can send — never fake success (Law 12, R-40).
Replace the "upload unavailable" texts (`OperationEvidenceStatus.tsx`, `EvidenceWorkspace.tsx`).
**Why** — S5 (photo gate stays mandatory); §4.31; damage disputes.
**Where** — `src/lib/evidenceStorage.ts`, `src/lib/queries/operationEvidence.ts`,
`src/modules/rentals/{PackingWorkspace,HandoverWorkspace,ReturnWorkspace,ResetWorkspace,EvidenceWorkspace}.tsx`,
`src/modules/operations/OperationEvidenceStatus.tsx`, `evidence_files`, bucket `evidence`.
**Database** — none expected (bucket and policies from 0170); if a column is missing, claim a number.
**Done when** — 1) on staging, Pack completes on a real booking after one photo, Handover likewise;
2) Return refuses a Damage flag without a photo and accepts it with one; 3) the photo is readable
by staff with access to the booking and **not** by Client B (T1-06 seats); 4) Warehouse sees no
money anywhere on the screens touched; 5) a failed upload leaves the gate red and the photo
retryable; 6) tests cover compress, retry-same-uuid, offline refusal.
**Needs** — T1-06 (Storage accepted on staging).

### T2-02 · Drawn signatures            status: todo · size: M · lane A
**What** — A signature pad (finger or stylus) for Receiver and Warehouse at Handover, Driver on
delivery handovers, and agreement signing. Save the drawing as a PNG through T2-01's upload and
link it with `signatures.signature_evidence_file_id`; keep signer name and time as today.
`gate.handover.agreement_unsigned` passes only with a stored signature.
**Why** — 21 Jul lock (client signature before gear leaves); PERMISSIONS §6.1 agreement gate.
**Where** — `HandoverWorkspace.tsx` (gate 5), `src/actions/rentals/floorVerb.ts` (`writeSignatures`),
`signatures` table, new `src/components/ui/SignaturePad.tsx`.
**Database** — none.
**Done when** — signature PNG visible on the booking's documents; blank pad refused; works with a
finger on the iPhone and Apple Pencil on the iPad; 44 px controls.
**Needs** — T2-01.

### T2-03 · ID card as the deposit            status: todo · size: L · lane A
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

### T2-04 · Gate 1 override by any handover staff            status: todo · size: M · lane A
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

### T2-05 · Technician can do every floor verb            status: todo · size: M · lane A
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

### T2-07 · Reset "Needed next"            status: todo · size: S · lane A
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

### T2-08 · Floor printing            status: todo · size: M · lane A
**What** — 1) Packing list print/PDF from Pack (parent-first, children nested — 27 Jul hierarchy
rule); 2) Return report print/PDF (units, outcome, photos count, flags); 3) confirm QR/barcode label
printing from Inventory works on the chosen printer path (AirPrint or PDF). Replace the two
`<Unavailable reason="Printing … is not built">` blocks.
**Why** — 21 Jul lock: the OS generates the Packing List in v1; staff hand paper to drivers.
**Where** — `PackingWorkspace.tsx` (~line 1380), `ReturnWorkspace.tsx` (~line 1571),
`src/lib/pdf/generatePdf.ts` (`generateDocumentPdf`), `src/lib/labelPrinter.ts`, `QrLabels`.
**Database** — none (document records via `createDocument` where they exist).
**Done when** — PDFs open on iPad and print on the shop printer; Warehouse versions carry no prices.
**Needs** — none.

### T2-09 · Bluetooth scanner at the packing bench            status: todo · size: S · lane A + Babin
**What** — Claude proposes 2–3 iPad-compatible Bluetooth scanners that read QR and Code 128 in
keyboard (HID) mode, with prices from Nepali sellers; Babin buys one. Make `ScannerInput` accept a
fast keystroke burst ending in Enter anywhere on the floor screens (focus trap on the scan field,
no double submit). Camera scanning stays everywhere (S14).
**Why** — S14; bulk packing speed.
**Where** — `src/components/ui/ScannerInput.tsx`, `src/lib/scannerLookup.ts`, floor screens.
**Database** — none.
**Done when** — 50 serials scanned in a row on the iPad with no missed or doubled scan.
**Needs** — Babin buys the scanner (O-8).

### T2-10 · Offline outbox for scans and ticks            status: todo · size: M · lane A
**What** — Route non-custodial floor writes (scan events, checklist ticks, notes, queue stamps)
through the Dexie outbox (`src/lib/offlineQueue.ts`, `dataAccess.ts` idempotent insert) with
`client_uuid`. Custody transitions stay online RPCs (R-40). Show queued count and last flush.
**Why** — 21 Jul lock (warehouse tablet works offline for scan + triage + packing);
REMAINING_WORK Task 2.4.
**Where** — `src/lib/offlineQueue.ts`, `src/lib/dataAccess.ts`, `src/lib/syncEngine.ts`, floor screens.
**Database** — none.
**Done when** — in airplane mode: 20 scans + ticks queue; back online they flush once (no
duplicates, server rows = 20); the Confirm button says it needs a connection.
**Needs** — none.

### T2-11 · Device day            status: todo · size: M · lane A + Babin + staff
**What** — One supervised session on the **iPhone 17 Pro, M4 iPad Pro and the Bluetooth scanner**
(and one staff Android phone if any staff use Android): run five real-shaped bookings through all
four verbs on staging, in both orientations, light and dark, at 125% text; airplane-mode test
(T2-10); photo, signature, ID card, override, Technician seat. Record defects as cards.
**Why** — No physical device acceptance has ever run (REMAINING_WORK Task 4.1, 4.3).
**Where** — `docs/verification/DEVICE_DAY_<date>.md`.
**Database** — staging.
**Done when** — checklist complete; zero P0 defects open; P1 defects have cards with owners.
**Needs** — T2-01 … T2-10; Babin books the session (target 10 Jan 2027, 26 Poush).

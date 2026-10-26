# T4 — Shared operations tools

**Goal:** the tools staff share across devices — delivery dispatch, team notes, shift handover —
read and write the database instead of one browser's storage. **Lane B.** Rulings: S6, D8, D28;
Laws 3, 6, 8; DELIVERY_DISPATCH_PHASE2 (16 Oct).

**Exit (G4):** on staging and live: a delivery job assigned on the desk iPad appears on the driver's
phone; a note written on one device shows on another; a shift handover written at logout is read
by the next shift; every device has offered its old browser-only entries as a file and kept them.

**Today:** `src/lib/queries/delivery.ts`, `internalNotes.ts` and `shiftHandover.ts` refuse in live
mode ("unavailable … nothing has been saved") and keep data under the browser keys
`babin_rentals_deliveries_v1`, `babin_internal_notes_v1`, `br.shiftHandovers`. The delivery
database half already exists in source: `0165_delivery_jobs_and_event_rpc.sql` and
`0166_booking_transport_dispatch.sql` (three RPCs, no caller yet).

---

### T4-01 · Delivery dispatch on the database            status: todo · size: L · lane B
**What** — Replace the localStorage store in `delivery.ts` with the 0165/0166 RPCs:
`delivery_create_job`, `delivery_assign_driver`, `delivery_transition_job` (Scheduled → Ready → In
Transit → Delivered / Failed, terminal states immutable). The Driver sees **only jobs assigned to
them**; Manager/Coordinator/Warehouse see their branch; no money on any driver screen (Law 6).
Follow the transition matrix and the seven test groups in
`docs/release/2026-10-16/DELIVERY_DISPATCH_PHASE2.md`.
**Why** — S6 (delivery dispatch at go-live); 21 Jul lock (driver + vehicle on delivery/pickup).
**Where** — `src/lib/queries/delivery.ts`, `src/modules/operations/DeliveryWorkspace.tsx`,
`src/lib/deliveryDispatchWorkflow.ts` (UI mirror only), new action files under `src/actions/`.
**Database** — none new expected (0165/0166 go live in Batch 1); add lifecycle steps for the
matrix if missing.
**Done when** — 1) two devices on staging stay in sync; 2) Driver seat cannot read an unassigned job
or any charge; 3) replaying the same `request_key` changes nothing; 4) a delivery event never
changes the booking stage (Phase 2 rule).
**Needs** — T1-05 (Driver seat), Batch 1 on staging.

### T4-02 · Reschedule a delivery            status: todo · size: S · lane B
**What** — "Change time" on a delivery job moves **only the job's scheduled time** — the rental
dates stay (D8). The change is audited, and a WhatsApp draft ("Your delivery is now at …") is
prepared for staff to send — never auto-sent (21 Jul comms lock).
**Why** — D8 (§4.64c).
**Where** — `DeliveryWorkspace.tsx`, `src/lib/whatsappTemplates.ts`, `src/lib/whatsappActions.ts`.
**Database** — migration (claim number) for a `delivery_reschedule_job` RPC + event row, if 0165's
transition RPC cannot change the time.
**Done when** — rescheduled job shows old → new time in its history; booking dates unchanged;
WhatsApp draft opens with the right number and text.
**Needs** — T4-01.

### T4-03 · Proof of delivery            status: todo · size: S · lane B
**What** — On "Delivered": receiver name (as today) **plus** a drawn signature and an optional photo,
through the T2-01 / T2-02 components, linked to the delivery job.
**Why** — DELIVERY_DISPATCH_PHASE2 ("signed proof-of-delivery remains a later requirement").
**Where** — `DeliveryWorkspace.tsx`, `src/lib/evidenceStorage.ts`.
**Database** — migration (claim number) if the job needs an evidence link column.
**Done when** — the signature shows on the job and on the booking's documents.
**Needs** — T2-01, T2-02, T4-01.

### T4-04 · Team notes on the database            status: todo · size: M · lane B
**What** — New table for staff notes: author, text, optional links (booking, asset, client), pinned,
created at; **archive, never delete** (Law 3). Staff-only (no Client). Notes that mention money
are a writer's choice, so the note text is visible to every staff role — the screen warns "Notes
are seen by all staff". Replace the localStorage path in `internalNotes.ts`; keep the drawer and
`/notes` page.
**Why** — S6.
**Where** — `src/lib/queries/internalNotes.ts`, `src/modules/notes/*`.
**Database** — migration (claim number): `team_notes` + RLS (`auth_is_staff()`), audit trigger.
**Done when** — two staff seats on staging see each other's notes; Client seat sees none; archive
hides a note from the default list but keeps it.
**Needs** — none.

### T4-05 · Shift handover on the database            status: todo · size: M · lane B
**What** — New table for shift handovers: from staff, written at (logout flow — 28 Jul lock),
open items, notes, acknowledged by / at. The next shift sees unacknowledged handovers on Today
and acknowledges them. Replace `shiftHandover.ts` localStorage; keep `HandoverSheet.tsx`,
`ShiftHandoverPanel.tsx`, `ShiftBriefModal.tsx`.
**Why** — S6.
**Where** — `src/lib/queries/shiftHandover.ts`, `src/modules/auth/HandoverSheet.tsx`,
`src/modules/today/ShiftHandoverPanel.tsx`, `src/modules/notes/ShiftBriefModal.tsx`.
**Database** — migration (claim number): `shift_handovers` (+ acknowledgements) + RLS staff-only.
**Done when** — handover written at logout on the iPad shows on the next sign-in on the phone; an
acknowledgement records who and when.
**Needs** — none.

### T4-06 · Export old browser-only entries            status: todo · size: S · lane B
**What** — On the first sign-in to the live app, if the device holds any of the old keys
(`br.productions`, `babin_rentals_deliveries_v1`, `babin_internal_notes_v1`, `br.shiftHandovers`,
`br.warranties`, `babin_coupons_v2`, and legacy unsent offline work in IndexedDB), show one card:
"This device has N old entries saved only here. Download them as a file for Babin." Download a
JSON + CSV bundle. **Never auto-import, never delete** — the bytes stay (D28, Law 3). Shown once
per device until dismissed; reachable later from Settings ▸ System.
**Why** — D28; OPEN_DECISIONS §14 and §16 (no ownership is inferred from a later login).
**Where** — new `src/lib/legacyLocalExport.ts`, a card on Today, `src/lib/devicePurge.ts` (read only).
**Database** — none.
**Done when** — on a device seeded with old keys the file downloads with every entry; the keys are
still present afterwards; a clean device shows nothing.
**Needs** — none.

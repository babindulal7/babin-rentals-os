# T4 — Shared operations tools

**Goal:** the tools staff share across devices — delivery dispatch, team notes, shift handover —
read and write the database instead of one browser's storage. **Lane B · Gemini.** Rulings: S6, D8, D28, W32, W46–W49;
Laws 3, 6, 8; DELIVERY_DISPATCH_PHASE2 (16 Oct).

**Exit (G4):** on staging and live: a delivery job assigned on the desk iPad reaches the rider as a
one-time link (W49) and the delivery fee comes from the zone (W48); a note written on one device
shows on another; a shift handover written at the end of any of the three shifts is read by the next
shift; every device has offered its old browser-only entries as a file and kept them.

**Volume:** 5 or more deliveries or collections a day (W46), by hired riders for now; an own scooter
and e-van are planned (W47).

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
Riders are hired and change often, so staff dispatch each job **by sending the rider a one-time
link (T4-08)**; staff and own drivers (later) use the app. Each job records **who delivered**
(rider name and phone, or staff user) and **vehicle** (hired bike · own scooter · own e-van —
W47; the vehicle list lives in Settings).
**Why** — S6 (delivery dispatch at go-live); 21 Jul lock (driver + vehicle on delivery/pickup); W46, W47.
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

### T4-04 · Team notes on the database            status: done · size: M · lane B
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

### T4-05 · Shift handover on the database            status: done · size: M · lane B
**What** — New table for shift handovers: from staff, written at (logout flow — 28 Jul lock),
open items, notes, cash counted (when closing is "per shift", T3-07), acknowledged by / at. The
next shift sees unacknowledged handovers on Today and acknowledges them. **Three shifts** (W32):
06:00–15:00, 14:00–23:00, 22:00–07:00 — kept in Settings ▸ Operations ▸ Shifts so times can change;
the overlap hour is when handover is due. Replace `shiftHandover.ts` localStorage; keep `HandoverSheet.tsx`,
`ShiftHandoverPanel.tsx`, `ShiftBriefModal.tsx`.
**Why** — S6.
**Where** — `src/lib/queries/shiftHandover.ts`, `src/modules/auth/HandoverSheet.tsx`,
`src/modules/today/ShiftHandoverPanel.tsx`, `src/modules/notes/ShiftBriefModal.tsx`.
**Database** — migration (claim number): `shift_handovers` (+ acknowledgements) + RLS staff-only.
**Done when** — handover written at logout on the iPad shows on the next sign-in on the phone; an
acknowledgement records who and when.
**Needs** — none.

### T4-06 · Export old browser-only entries            status: done · size: S · lane B
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

### T4-07 · Delivery zones and fees            status: todo · size: S · lane B · [go-live]
**What** — Settings ▸ Operations ▸ **Delivery zones**: a short table of zones with a fee each.
Starting zones (L6, researched — Kathmandu services group the valley the same way):
**Inside Ring Road · Outside Ring Road, inside the valley · Far valley (Bhaktapur town, Godawari,
valley edges) · Outside the valley (quoted per trip)**. Fees ⭐ Rs 3,500 for each valley zone until
Babin sets them (O-15); "Outside the valley" asks staff to type the fee. On a booking (and on online
requests, W85) choosing delivery means choosing a zone — one tap — and the fee fills in. Pickup at
the shop stays Rs 0. Replace the fixed Rs 3,500 "Babin Delivery" price.
**Why** — W48, W85, L6.
**Where** — `src/lib/settingsStore.ts`, settings table (0158), `src/lib/bookingTransportForm.ts`,
`NewRental.tsx` transport section, `src/lib/pricingPipeline.ts`.
**Database** — migration (claim a number) if zones need their own table rather than a settings key.
**Done when** — four zones editable by Owner/Admin/Manager; a booking's delivery fee follows its zone;
Warehouse cannot see fees.
**Needs** — none.

### T4-08 · One-time rider link            status: todo · size: L · lane B · [go-live]
**What** — For a hired rider (W49): staff tap "Send to rider" on a delivery job, type the rider's
name and phone, and share a link (WhatsApp/SMS from the staff phone). The link opens **only that
job**, with **no login and no money**: pickup point, drop address and contact, item count and case
labels, "Picked up from shop", "Delivered" with receiver name, drawn signature (T2-02) and an
optional photo (T2-01). It stops working once the job is Delivered or Failed, or after 24 hours ⭐,
and staff can cancel it. Every step is recorded against the job with the rider's name and the link
id (not a user account).
**Why** — W49; hired riders change often.
**Where** — new public route (separate small entry, like `marketing.html`/`booking.html`),
`supabase/functions/rider-link/` (Edge Function validating the token), `DeliveryWorkspace.tsx`.
**Database** — migration (claim a number): `delivery_job_links` (random 128-bit token stored
**hashed**, job id, expires at, revoked at, rider name/phone) + RPCs callable only through the Edge
Function; lifecycle/security steps "a link reads only its job", "an expired or revoked link reads
nothing", "no money column is reachable", "a used link cannot deliver twice". PERMISSIONS §3/§7: a
new non-login access path — add the row in the same commit (B-3).
**Done when** — a rider on any phone completes a delivery from the link; the job, signature and time
appear for staff; a second use, an expired link and a guessed link all fail; a security review note
is in `docs/verification/` and Claude has reviewed it at a check-in.
**Needs** — T4-01, T2-01, T2-02.

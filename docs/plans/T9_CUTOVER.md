# T9 — Booqable cutover

**Goal:** move the business from Booqable to the OS without a double booking or a lost rupee, and
cancel Booqable before it renews. **Lane A · Codex-1 + Babin + staff.** Rulings: S7, S8, S9, D20, D28; 19 Aug
money ruling (imported history keeps Booqable's figures; new bookings use the OS's whole-rupee
model); 1 Sep bridge rulings (the OS is the terminal system).

**Exit (G9 and switch-off):** OS holds every client, product, bundle and pricing rule from Booqable;
open Booqable rentals block availability in the OS until they end; the trial reconciled; from
day X every new rental is in the OS; by 1 Mar the last Booqable rental is closed and its data
archived; by 10 Mar Booqable is cancelled.

**Order of days:**

```
… M4 10 Jan ─ import + holds live ─▶ Trial 11–31 Jan (Booqable is master, OS mirrors)
   ─▶ go/no-go 29 Jan ─▶ X = Mon 1 Feb 2027 (18 Magh 2083): OS-only for new rentals,
   online booking live, Booqable store closed to new bookings
   ─▶ run-off: open Booqable rentals end in Booqable (holds keep the OS honest)
   ─▶ 1 Mar (17 Falgun): last one closed, data archived ─▶ 10 Mar (26 Falgun): Booqable cancelled
```

---

### T9-01 · Bring the catalogue and clients across            status: todo · size: M · lane A
**What** — From Booqable exports (CSV/API, read-only): clients created or changed since the earlier
import, products, bundles (and the kit-style products that are bundles — 18 Aug), **pricing
structures** ("Babin Daily", "Days wise discount", "Rental Rate Card", … — 0160) and the **four
seasonal rules** (SUMMER25, New Year, Christmas ×2) **with their end dates** so they expire on their
own (D20). Dry run first; a match report (new / updated / unchanged / conflict) for Babin to
approve; then load through the existing import centres and pricing tables on staging, then live.
Imported history keeps Booqable's figures (19 Aug ruling).
**Why** — S7; D20.
**Where** — `src/modules/clients/ImportCenter`, `src/modules/inventory/ProductsImportCenter.tsx`,
`src/lib/clientImport.ts`, `src/lib/productImport.ts`, `pricing_rulesets` / pricing structure tables.
**Database** — data, through the app's import paths (no raw SQL on live).
**Done when** — counts reconcile with Booqable (clients, products, bundles, structures); a sample of
20 products prices the same 3-day quote in both systems (allowing the known rounding difference).
**Needs** — Batch 1 live; T3-09.

### T9-02 · Booqable rentals block the OS calendar            status: todo · size: M · lane A
**What** — Import every **open and upcoming** Booqable booking (reserved or started) as a read-only
**external hold** in the OS: product (and serial where Booqable has one), from/to, Booqable number.
Holds block availability exactly like a reservation, show a neutral "Held in Booqable #831" chip
(icon + text — not gold, which is reserved for external gear), cannot be packed or invoiced in the
OS, and disappear when the Booqable booking ends. Refresh
**daily** (07:00 ⭐) from the trial start until the last Booqable rental is closed.
**Why** — Without this the OS will rent out a camera Booqable has already promised — the biggest
cutover risk (PLAN §7).
**Where** — new migration, `src/lib/availability.ts`, Calendar, New Rental availability, a small
import script run on a schedule.
**Database** — migration (claim number): `external_holds` + inclusion in the availability/GiST
check; lifecycle step "an external hold blocks a reservation on the same unit and dates".
**Done when** — a camera on an open Booqable rental shows as unavailable in the OS for those dates;
the hold vanishes the day after its Booqable return.
**Needs** — T9-01.

### T9-03 · The trial            status: todo · size: M · Babin + staff + lane A support
**What** — **11–31 Jan 2027 (27 Poush–17 Magh 2083).** Every real job is entered in Booqable (still
the master) **and** in the OS, by the person who would normally do it, on their own device and
account (T1-13). Each evening: a reconcile sheet — bookings created, picked up, returned, money
received — Booqable vs OS, with differences explained. Defects become cards the same day.
**Why** — S7.
**Where** — `docs/verification/TRIAL_<date>.md` (one row per day).
**Database** — live, through the app.
**Done when** — the last 5 trial days reconcile with no unexplained difference.
**Needs** — G1–G8 met on staging; T9-01, T9-02; staff trained (T9-07).

### T9-04 · Go / no-go            status: todo · size: S · Babin
**What** — **29 Jan 2027 (15 Magh).** Babin goes through PLAN §1 (G1–G10) with the evidence links.
Any "no" moves X by one week (latest 15 Feb — PLAN §5 slack).
**Done when** — decision recorded in `RULINGS-<date>.md`.
**Needs** — T9-03.

### T9-05 · Day X            status: todo · size: S · Babin + staff + lane A
**What** — **Mon 1 Feb 2027 (18 Magh 2083).** From opening: every new rental in the OS only;
`book.babinrentals.com` live (T7-11); in Booqable, stop new bookings (turn off online booking on
the store; staff stop creating orders). Booqable stays open for the run-off only. Message clients
who book online often (WhatsApp draft) with the new link.
**Done when** — no new Booqable order is created after X (checked daily in Booqable's list).
**Needs** — T9-04 "go"; T7-10.

### T9-06 · Run-off            status: todo · size: S · staff
**What** — Open Booqable rentals are returned and closed **in Booqable**; their OS holds (T9-02)
expire as they end. Payments for those rentals are recorded in Booqable. A short list on Today shows
"Booqable rentals still out: N" until zero.
**Done when** — N = 0, target 1 Mar 2027 (17 Falgun).
**Needs** — T9-05.

### T9-07 · Staff training            status: todo · size: S · Babin + lane A
**What** — Three short sessions before the trial — **floor** (pack, hand over, return, reset,
scanner, photos, signatures), **desk** (new rental, re-book, online requests, payments, deposits,
ID cards), **accounts** (payments, refunds, daily closing, VAT register, TDS) — each with a
one-page cheat sheet in English and Nepali.
**Done when** — every staff member has done their session and signed in on their device.
**Needs** — T1-13; screens done on staging.

### T9-08 · Archive Booqable, then cancel            status: todo · size: S · Babin + lane A
**What** — After the run-off: export everything from Booqable (orders, customers, products, invoices,
quotes, contracts as PDF, payments, reports) to Babin's Drive and record the export date and file
list. Check Booqable's cancellation notice terms in Account & billing **by 1 Feb**. Cancel by
**10 Mar 2027 (26 Falgun)** — the renewal is 20 Mar. Then answer O-1 and point `babinrentals.com`
at its new home.
**Why** — S8; Law 3 spirit (history kept).
**Done when** — archive files listed in `docs/live/BOOQABLE_ARCHIVE_<date>.md`; cancellation
confirmation saved; the root domain no longer shows the Booqable store.
**Needs** — T9-06.

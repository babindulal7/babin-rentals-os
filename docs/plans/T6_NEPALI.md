# T6 — Nepali language

**Goal:** every staff screen can be switched to Nepali per user, with wording Babin has approved.
**Lane B · Gemini.** Rulings: S6, S11, W67; 21 Jul locks (Nepali covers every screen, per-user toggle; numbers,
IDs and NPR stay in Latin script); `src/lib/i18n.ts` rules (Asar has one weight — never synthesise
bold; Hind body metrics differ from English; `canEnable()` refuses Nepali below 100% coverage).

**Exit (G6):** `canEnable()` returns true for every staff screen; Babin has approved every string
(recorded per wave); floor screens pass a Nepali layout check at 360 / 820 / 1280 on the real
devices; nothing is guessed — an unapproved string is not shipped as Nepali.

**Size of the job (measured 26 Oct):** the catalogue in `src/lib/i18n.ts` holds **15 keys**
(navigation, statuses, primary actions), each with Nepali marked verified in the file. A scan of
`src/modules` and `src/components` found **~4,400 distinct visible English strings** (6,165
occurrences) — a lower bound, since computed strings were not counted. Largest: Rentals ~1,300,
Inventory ~1,020, Reports ~660, Clients ~480, Settings ~420, shared UI ~415, Operations ~310.
**Babin's review time** at ~250 strings an hour is about **18–25 hours**, spread as ~2 hours a day
across the waves below.

---

### T6-01 · Glossary first            status: done 1 Nov 2026 — 265 terms in `src/i18n/glossary.ne.json`, approved by Babin as drafted · size: S · Claude drafts (arrives as a file) · Babin approves
**What** — Draft Nepali for ~200 core terms used everywhere: the 11 nav items, the six booking
statuses and flags, the four floor verbs, gate names, roles, money words (advance, deposit,
outstanding, VAT), common buttons (Save, Cancel, Confirm, Back, Retry), date words, error words.
Babin approves the glossary **in one sitting**; every later wave must use these exact terms.
**Why** — S11. One approved word per idea keeps 4,400 strings consistent.
**Where** — new `src/i18n/glossary.ne.json` (term → approved Nepali, with an English note).
**Database** — none.
**Done when** — Babin's approval recorded (date + "approved" per term) — target 6 Dec 2026. **Recorded 1 Nov 2026.**
**Needs** — none.

### T6-02 · String catalogue and lint            status: todo · size: L · lane B
**What** — Move visible strings out of components into keyed catalogues (`src/i18n/en/*.json`
source, `src/i18n/ne/*.json` translations), one file per module, keys like
`rentals.bookingDetail.recordPayment`. Extend `scripts/check-ui-copy.mjs` so new raw JSX text in
`src/modules` fails the lint once a module is converted. Extend `i18n.ts` coverage to report **per
module and per screen**. Keep Latin for numbers, booking numbers, serials and NPR (existing rule
and `bs.ts` test). Nepali BS month names in Devanagari for the Nepali view.
**Why** — Today strings are inline across ~390 files; nothing can be reviewed or switched.
**Where** — `src/lib/i18n.ts`, new `src/i18n/`, `scripts/check-ui-copy.mjs`, components module by module.
**Database** — none (per-user language preference already exists as a user setting — confirm; add
a column only if it does not).
**Done when** — converted modules render identical English (snapshot tests unchanged); coverage
report prints per module.
**Needs** — T6-01 (keys for glossary terms).

### T6-03 · Review sheets            status: todo · size: S · lane B
**What** — For each wave, generate a review sheet Babin can work through on a phone: one row per
string — key, screen, English, Nepali draft, a screenshot link for context, and an "OK / fix"
column. Approved rows are imported back by a script that refuses any row not marked OK.
**Why** — S11 (Babin approves screen by screen).
**Where** — `scripts/i18n-review-export.mjs`, `scripts/i18n-review-import.mjs`, sheet in Babin's Drive.
**Database** — none.
**Done when** — a round trip on 20 strings works; the import refuses unapproved rows.
**Needs** — T6-02.

### T6-04 · Wave 1 — the floor            status: todo · size: L · lane B + Babin
**What** — Convert and draft: shell (header, nav, bottom bar, scanner), sign-in, Today, Operations,
Pack, Handover, Return, Reset, Evidence, delivery (driver view). Babin approves via T6-03.
**Done when** — 100% approved for these screens; floor layout check passes on the iPad and iPhone
(T6-08). Target: approved by 3 Jan 2027 (19 Poush).
**Needs** — T6-01, T6-02, T6-03.

### T6-05 · Wave 2 — the desk            status: todo · size: L · lane B + Babin
**What** — Rentals list, Booking Detail, New Rental, Calendar, Clients (list, detail, add), crew on
bookings.
**Done when** — 100% approved. Target 17 Jan 2027 (3 Magh).
**Needs** — T6-04.

### T6-06 · Wave 3 — back office            status: todo · size: L · lane B + Babin
**What** — Finance (all tabs), Inventory (equipment, bundles, maintenance, stock check), Crew Assist,
Notes, Tools.
**Done when** — 100% approved. Target 24 Jan 2027 (10 Magh).
**Needs** — T6-05.

### T6-07 · Wave 4 — reports, settings, admin            status: todo · size: L · lane B + Babin
**What** — All report pages, Settings, Audit/Activity/Backup screens, notifications (T5) and email
templates for staff.
**Done when** — 100% approved; `canEnable()` true for the whole staff app. Target 29 Jan 2027
(15 Magh, go/no-go day).
**Needs** — T6-06.

### T6-08 · Nepali layout pass            status: todo · size: M · lane B
**What** — With Nepali on, check every converted screen at 360 / 820 / 1280: no clipped buttons or
headings, tables still fit (Hind is wider than Source Sans 3), Asar headings never bold
(`safeWeight()`), no fallback boxes. Check the all-Outfit typography ruling (RULINGS-2026-10-23)
falls back to the Nepali faces for Devanagari, **offline**, on the devices.
**Why** — `i18n.ts` cost #2: a table that fits in English may not fit in Nepali.
**Where** — screens per wave; `src/styles/*`.
**Database** — none.
**Done when** — screenshots per wave at three widths with no defects; offline font check on device.
**Needs** — each wave.

### T6-09 · Switch it on            status: todo · size: S · lane B
**What** — Settings ▸ My preferences ▸ Language: English / नेपाली, per user, saved to the account
so it follows the user across devices. Staff choose on their first sign-in during the trial.
**Done when** — two staff on one iPad each keep their own language.
**Needs** — T6-07.

**Not in this track:** Nepali **PDF documents** (the PDF generator embeds Helvetica, which has no
Devanagari) and the client booking site in Nepali — both go to T10 unless Babin moves them up.

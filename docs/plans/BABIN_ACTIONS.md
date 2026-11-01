# Babin's checklist — what only the owner can do

Everything here waits on you: accounts, money, approvals, merging, the live database and the
people. Agents build the rest; Claude reviews and sends files. Dates are AD · BS. Tick a box by
editing this file or telling Claude at a check-in.

## Week 1 — by Sun 1 Nov 2026 (16 Kartik 2083)

- [x] Review and merge the plan pull request (T0-01) — merged 26 Oct.
- [x] Apply the 26 Oct workflow package — on `main` since `6f01439`.
- [x] The 26 Oct v3 package — on `main` since 31 Oct (`a8611ca`, merged in `02191a5`).
- [ ] Apply the **31 Oct package** (the zip from Claude: the Booqable round of 27 Oct on `main` `9e219db`)
      and commit it.
- [ ] **Disable the GitHub CI workflow** — Actions → CI → ⋯ → Disable workflow (T0-09). CI stays off;
      local checks are the gate.
- [x] Set up the three agent worktrees: **Codex-1 (lane A), Gemini (lane B), Codex-2 (lane C)**
      (PLAN.md §6) — the lanes are building (26–31 Oct). Next prompts: the 31 Oct APPLY note and
      `docs/plans/prompts/README.md`.
- [ ] Apply Claude's `fix-red-checks.patch` (31 Oct) **first**: on `main` `9e219db` the typecheck (20
      errors — so `npm run build` fails), lint (3) and UI-copy (4) checks are red, and one error can crash
      Booking Detail. The patch turns them green.
- [ ] Answer **O-18**: should the switch-user PIN be **4 or 6 digits**? (T1-15 waits on it; the 0066
      database rule is 6 today.)
- [ ] Answer **O-19**: may **every staff member** write team notes, or only Coordinator and above? (One
      test on `main` is red until you say.)
- [ ] From now on, run the **full check list** (`docs/plans/README.md`) before every push — CI no longer
      catches anything (T0-11 makes it one command).
- [x] Take a production backup — `scripts/backup-db.ps1`, ~30 min (T1-01). *Reported done by Babin 1 Nov 2026; T1-01 is `done` only once `npm run check:dump` passes and the SHA-256 is recorded.*
- [ ] Approve the cost of a second Supabase project for staging (T1-02).
- [ ] Create a Cloudflare account; later add three DNS records when asked: `app.`, `book.`, `staging-app.` (T1-07).
- [x] **Apply for eSewa and Khalti merchant accounts** — onboarding time is unknown, so start now (T7-06). *Reported done by Babin 1 Nov 2026.*
- [x] Ask your bank for the **Fonepay merchant API / dynamic QR credentials** for online payments (T7-05). *Reported done by Babin 1 Nov 2026. Enter them only as Edge Function secrets when T7-05 asks (N-8) — never in chat or the repo.*
- [ ] **Do not switch on email sign-up in Supabase Auth** until T7-10 says go; then, in the dashboard, turn
      on **CAPTCHA (Cloudflare Turnstile)** *first*, set the email code expiry to 10 minutes, and only then
      allow sign-ups (`docs/ONLINE_BOOKING_SPEC.md` §4 step 7 and §11 — an Owner action, N-7).
- [ ] Create the email-service account Claude recommends — plan for **~3,000–4,000 emails a month**
      (automatic client emails) — and add its DNS records to `babinrentals.com` (T1-09).
- [ ] Send the **membership plan table** (template below) (T8-01).
- [ ] Send the **staff roster**: name, role, shift (06–15 · 14–23 · 22–07), phone model (T1-13, T2-11).
- [ ] Ask the accountant seven questions (answers by 30 Nov / 14 Mangsir):
  1. TDS rate on crew payouts (O-5).
  2. Is IRD-certified electronic billing required for us? (O-6)
  3. How should non-VAT bills appear in the VAT register and return? (O-7)
  4. Is VAT charged on a cancellation fee? (T3-03)
  5. Please check our invoice layout (sample PDF from Claude) (T3-06).
  6. **An invoice is numbered when it is fully paid. If the booking then changes (extension, late fee,
     damage), do we issue a second invoice or a credit note?** (O-14)
  7. **May the VAT invoice wait until the client pays in full — even credit clients who pay weeks
     later — or must it be issued when the advance is paid or at handover, whichever comes first?**
     VAT Act §6 says a supply happens at the earliest of invoice, service or payment, with a rule for
     part payments. (O-17)
- [ ] Close the open GitHub PRs and old branches from Claude's triage list (T0-03, T0-04) — you or
      Codex-1; Claude never pushes.
- [ ] Send the list of **sub-rent partners** — name, phone, what they usually lend (T3-13, T2-24).

## By Sun 22 Nov (6 Mangsir)

- [ ] **Live batch 0** — apply `0163` alone (closes six business functions anyone can call without
      signing in today); ~15 minutes after a backup (T1-04).
- [ ] Check the **delivery zones** (Inside Ring Road · Outside Ring Road in the valley · Far valley ·
      Outside the valley) and send the **fee for each** (O-15, T4-07).
- [ ] Enter the **cancellation fee tiers** in Settings once the screen is on staging (O-10, T3-03).
- [ ] Send the **rental agreement terms** text — it must allow signing by the client or on the
      client's behalf (O-11, T3-06, L3).
- [ ] Pick the **label printer** and **Bluetooth scanner** from Claude's shortlist and buy them (O-16).
- [x] O-1 answered 27 Oct (B5): the root redirects to `book.babinrentals.com` from day X; a full website
      after go-live.

## By Sun 6 Dec (20 Mangsir)

- [x] Approve the **Nepali glossary** (265 terms, 7 flagged choices first, one sitting) — sheet:
      `docs/plans/T6-01-GLOSSARY-REVIEW.md` (T6-01). *Approved as drafted, 1 Nov 2026.*
- [ ] Read and approve the **online booking spec**, esp. §0 and the 13 ⭐ defaults in §13.2 —
      `docs/ONLINE_BOOKING_SPEC.md` (T7-01).
- [ ] **Live batch 1** — about an hour: fresh backup, then run the prepared apply script (T1-10).
- [ ] Turn on `pg_cron` in the Supabase dashboard when asked (T5-04, T5-07).
- [ ] Copy the **Google review link** from your Google Business Profile ("Ask for reviews") and send it
      (B9, T5-07).
- [ ] Create **Google Analytics 4** and a **Meta Pixel** for the booking site and send the two IDs —
      they are public IDs, not passwords (B37, T7-16).

## December

- [ ] Staff enter a **deposit for every product** — the screen shows progress (T3-02).
- [ ] Staff turn on **Show online** / **Only inside bundles** for the products you want online (T7-02).
- [ ] Label items with **QR + asset code** as you go — no deadline; unlabelled items are ticked by hand (W72).
- [ ] **Nepali reviews** — about 2 hours a day as each wave's sheet arrives (T6-04 … T6-07).
- [ ] Enter the Fonepay credentials as Edge Function secrets (Claude shows where; never paste them in chat) (T7-05).
- [ ] Staff enter the **consumables**: unit price, stock count and reorder level for each (B14, T3-30).
- [ ] When two-step sign-in reaches staging: everyone who sees money (Owner, Admin, Manager, Coordinator,
      Accounts) installs an authenticator app and sets it up (B21, T1-17).

## By Sun 3 Jan 2027 (19 Poush)

- [ ] **Live batch 2** (T1-10).
- [ ] Nepali wave 1 (floor screens) approved.

## By Sun 10 Jan (26 Poush)

- [ ] **Device day** with staff: iPhone 17 Pro, M4 iPad Pro, the counter PC, a laptop, the scanner;
      one night-shift return (T2-11).
- [ ] **Usability round 1** the same day: watch three staff (floor, desk, someone new) do the task cards
      in `docs/USABILITY_TESTS.md`; rank the ten worst problems before you go home (T9-09). Claude sends
      the task cards with real staging booking numbers the day before.
- [ ] Every staff member signs in once on each shared device and sets a **PIN** (T1-15, T1-13; 4 or 6
      digits — O-18).
- [ ] By **Fri 15 Jan (1 Magh)** ⭐: pick **official product photos** online for every product shown online —
      the maker's press images, or your own photos; note where each came from. No photos from other
      rental shops (B45, B49, T7-02).
- [ ] If you have Google Search Console for `babinrentals.com`, export its page list for the old-link
      check (T7-17).
- [ ] **Live batch 3** (T1-10).
- [ ] Three short **staff training** sessions, including the night shift (T9-07).

## Trial — 11–31 Jan (27 Poush–17 Magh)

- [ ] Every real job goes into Booqable **and** the OS (T9-03).
- [ ] 10 minutes each evening on the reconcile sheet.
- [ ] **Usability round 2 — Wed 20 Jan (6 Magh)** ⭐ (T9-09).

## Decide and switch

- [ ] By **1 Feb**: read Booqable's cancellation notice terms (Account & billing) (T9-08).
- [ ] **Fri 29 Jan (15 Magh) — go / no-go** against PLAN.md §1 (T9-04).
- [ ] **Mon 1 Feb (18 Magh) — day X**: new rentals only in the OS; stop new Booqable bookings; add the
      Cloudflare redirect `babinrentals.com/*` → `book.babinrentals.com/*` (B5, T9-05).
- [ ] At go-live: write the **first offer email**, or ask Claude for a draft — every email carries an
      unsubscribe link (B31, T5-12).
- [ ] By **1 Mar (17 Falgun)**: last Booqable rental closed; export the Booqable archive (T9-08).
- [ ] By **10 Mar (26 Falgun)**: **cancel Booqable** (renews 20 Mar · 6 Chaitra) (T9-08).
- [ ] **Every month from February:** usability round on the first Sunday, 11:00–13:00 ⭐ — 7 Feb
      (24 Magh), 7 Mar (23 Falgun), 4 Apr (21 Chaitra) (T9-09).

---

## Template — membership plans (send one row per plan)

Plan names must be one of the five levels below unless you want new ones (that needs a small
database change — fine, just say so).

| Level | Label | Annual fee (Rs) | Item discount % | Bundle discount % | Bookings / month | Rentals at once | Authorised users | Credit limit (Rs) | Term (months) | Perks |
|---|---|---|---|---|---|---|---|---|---|---|
| Academy | Access Member / Partner / Elite Member | | | | | | | | 12 | |
| Creator | | | | | | | | | | |
| Cinematographer | | | | | | | | | | |
| Production Alliance | | | | | | | | | | |
| Elite | | | | | | | | | | |

Perks to choose from: Priority Booking · Dedicated Manager · Company Billing · Credit Terms ·
VIP Support · Custom Solutions.

## Template — delivery zone fees (O-15)

| Zone | Fee (Rs) |
|---|---|
| Inside Ring Road | |
| Outside Ring Road, inside the valley | |
| Far valley (Bhaktapur town, Godawari, valley edges) | |
| Outside the valley | quoted per trip |

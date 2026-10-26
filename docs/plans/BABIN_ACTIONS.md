# Babin's checklist — what only the owner can do

Everything here waits on you: accounts, money, approvals, merging, the live database and the
people. Agents build the rest; Claude reviews and sends files. Dates are AD · BS. Tick a box by
editing this file or telling Claude at a check-in.

## Week 1 — by Sun 1 Nov 2026 (16 Kartik 2083)

- [x] Review and merge the plan pull request (T0-01) — merged 26 Oct.
- [ ] Apply the **26 Oct workflow package** (the zip from Claude) to your local repo and commit it.
- [ ] **Disable the GitHub CI workflow** — Actions → CI → ⋯ → Disable workflow (T0-09). CI stays off;
      local checks are the gate.
- [ ] Set up the three agent worktrees: **Codex-1 (lane A), Gemini (lane B), Codex-2 (lane C)**
      (PLAN.md §6) and paste the first prompts: `prompts/T2-16.md` (Codex-1), `prompts/T4-04.md`
      (Gemini), `prompts/T3-01.md` (Codex-2).
- [ ] Take a production backup — `scripts/backup-db.ps1`, ~30 min (T1-01).
- [ ] Approve the cost of a second Supabase project for staging (T1-02).
- [ ] Create a Cloudflare account; later add three DNS records when asked: `app.`, `book.`, `staging-app.` (T1-07).
- [ ] **Apply for eSewa and Khalti merchant accounts** — onboarding time is unknown, so start now (T7-06).
- [ ] Ask your bank for the **Fonepay merchant API / dynamic QR credentials** for online payments (T7-05).
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

## By Sun 22 Nov (6 Mangsir)

- [ ] **Live batch 0** — apply `0163` alone (closes six business functions anyone can call without
      signing in today); ~15 minutes after a backup (T1-04).
- [ ] Check the **delivery zones** (Inside Ring Road · Outside Ring Road in the valley · Far valley ·
      Outside the valley) and send the **fee for each** (O-15, T4-07).
- [ ] Enter the **cancellation fee tiers** in Settings once the screen is on staging (O-10, T3-03).
- [ ] Send the **rental agreement terms** text — it must allow signing by the client or on the
      client's behalf (O-11, T3-06, L3).
- [ ] Pick the **label printer** and **Bluetooth scanner** from Claude's shortlist and buy them (O-16).
- [ ] Answer O-1: what should `babinrentals.com` show after the Booqable store closes? (⭐ redirect to `book.`)

## By Sun 6 Dec (20 Mangsir)

- [ ] Approve the **Nepali glossary** (~200 words, one sitting) (T6-01).
- [ ] **Live batch 1** — about an hour: fresh backup, then run the prepared apply script (T1-10).
- [ ] Turn on `pg_cron` in the Supabase dashboard when asked (T5-04, T5-07).

## December

- [ ] Staff enter a **deposit for every product** — the screen shows progress (T3-02).
- [ ] Staff turn on **Show online** / **Only inside bundles** for the products you want online (T7-02).
- [ ] Label items with **QR + asset code** as you go — no deadline; unlabelled items are ticked by hand (W72).
- [ ] **Nepali reviews** — about 2 hours a day as each wave's sheet arrives (T6-04 … T6-07).
- [ ] Enter the Fonepay credentials as Edge Function secrets (Claude shows where; never paste them in chat) (T7-05).

## By Sun 3 Jan 2027 (19 Poush)

- [ ] **Live batch 2** (T1-10).
- [ ] Nepali wave 1 (floor screens) approved.

## By Sun 10 Jan (26 Poush)

- [ ] **Device day** with staff: iPhone 17 Pro, M4 iPad Pro, the counter PC, a laptop, the scanner;
      one night-shift return (T2-11).
- [ ] Every staff member signs in once on each shared device and sets a **4-digit PIN** (T1-15, T1-13).
- [ ] **Live batch 3** (T1-10).
- [ ] Three short **staff training** sessions, including the night shift (T9-07).

## Trial — 11–31 Jan (27 Poush–17 Magh)

- [ ] Every real job goes into Booqable **and** the OS (T9-03).
- [ ] 10 minutes each evening on the reconcile sheet.

## Decide and switch

- [ ] By **1 Feb**: read Booqable's cancellation notice terms (Account & billing) (T9-08).
- [ ] **Fri 29 Jan (15 Magh) — go / no-go** against PLAN.md §1 (T9-04).
- [ ] **Mon 1 Feb (18 Magh) — day X**: new rentals only in the OS; stop new Booqable bookings (T9-05).
- [ ] By **1 Mar (17 Falgun)**: last Booqable rental closed; export the Booqable archive (T9-08).
- [ ] By **10 Mar (26 Falgun)**: **cancel Booqable** (renews 20 Mar · 6 Chaitra) (T9-08).

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

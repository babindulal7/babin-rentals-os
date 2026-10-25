# Babin's checklist — what only the owner can do

Everything here waits on you: accounts, money, approvals, the live database and the people.
Agents build the rest. Dates are AD · BS. Tick a box by editing this file or telling Claude.

## Week 1 — by Sun 1 Nov 2026 (16 Kartik 2083)

- [ ] Review and merge the plan pull request (T0-01).
- [ ] Take a production backup — `scripts/backup-db.ps1`, ~30 min (T1-01).
- [ ] Approve the cost of a second Supabase project for staging (T1-02).
- [ ] Create a Cloudflare account; later add three DNS records when asked: `app.`, `book.`, `staging-app.` (T1-07).
- [ ] **Apply for eSewa and Khalti merchant accounts** — onboarding time is unknown, so start now (T7-06).
- [ ] Ask your bank for the **Fonepay merchant API / dynamic QR credentials** for online payments (T7-05).
- [ ] Create the email-service account Claude recommends; add its DNS records to `babinrentals.com` (T1-09).
- [ ] Send the **membership plan table** (template below) (T8-01).
- [ ] Send the **staff roster**: name, role, phone model (T1-13, T2-11).
- [ ] Ask the accountant five questions (answers by 30 Nov / 14 Mangsir):
  1. TDS rate on crew payouts (O-5).
  2. Is IRD-certified electronic billing required for us? (O-6)
  3. How should non-VAT bills appear in the VAT register and return? (O-7)
  4. Is VAT charged on a cancellation fee? (T3-03)
  5. Please check our invoice layout (sample PDF from Claude) (T3-06).
- [ ] OK to delete merged GitHub branches (unmerged ones get an archive tag first) (T0-04).

## By Sun 22 Nov (6 Mangsir)

- [ ] **Live batch 0** — apply `0163` alone (closes six business functions anyone can call without signing in today); ~15 minutes after a backup (T1-04).
- [ ] Enter the **cancellation fee tiers** in Settings once the screen is on staging (O-10, T3-03).
- [ ] Send the **rental agreement terms** text (O-11, T3-06).
- [ ] Pick the **Bluetooth scanner** from Claude's shortlist and buy it (O-8, T2-09).
- [ ] Answer O-1: what should `babinrentals.com` show after the Booqable store closes? (⭐ redirect to `book.`)

## By Sun 6 Dec (20 Mangsir)

- [ ] Approve the **Nepali glossary** (~200 words, one sitting) (T6-01).
- [ ] **Live batch 1** — about an hour: fresh backup, then run the prepared apply script (T1-10).
- [ ] Turn on `pg_cron` in the Supabase dashboard when asked (T5-04).

## December

- [ ] Staff enter a **deposit for every product** — the screen shows progress (T3-02).
- [ ] **Nepali reviews** — about 2 hours a day as each wave's sheet arrives (T6-04 … T6-07).
- [ ] Enter the Fonepay credentials as Edge Function secrets (Claude shows where; never paste them in chat) (T7-05).

## By Sun 3 Jan 2027 (19 Poush)

- [ ] **Live batch 2** (T1-10).
- [ ] Nepali wave 1 (floor screens) approved.

## By Sun 10 Jan (26 Poush)

- [ ] **Device day** with staff: iPhone 17 Pro, M4 iPad Pro, the scanner (T2-11).
- [ ] **Live batch 3** (T1-10).
- [ ] Three short **staff training** sessions; every staff member signs in on their own device (T9-07, T1-13).

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

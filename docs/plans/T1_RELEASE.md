# T1 — Release & infrastructure

**Goal:** a live database that matches the verified source, a staging copy to rehearse on, hosting,
email, monitoring and backups — so every other track can be accepted on staging and shipped to
live in small, reversible batches. **Lane A · Codex-1 (code) + Babin.** Rulings: S10, S12, S13, S15, D27, D33, W53, W56, W74, W75; N-5, N-8.

**Exit (G1, G10):** live carries every verified migration through three Babin-applied batches;
nine role seats pass on staging; Storage scoping accepted with Client A / Client B; the staff app
serves from `app.babinrentals.com` on Cloudflare Pages; email sends from `@babinrentals.com`;
errors reach Sentry; a restore drill has worked once.

**State on 26 Oct** (from `docs/live/schema_migrations_2026-10-17.txt` and `npm run db:plan`):
live has 156 ledger rows, newest `0164`; **19 files are pending** (0157–0163, 0165–0174, 0176,
0177); `0047_seed_reference_corpus.sql` must **never** be applied (one-shot seed, number already
spent live); **7 renames** to settle (0056_0, 0059, 0060, 0069, 0073, 0081, 0082); **2 live rows
with no local file** (`archive_bakery_pos_schema`, `0047_seed_tail_b917_equipment_line`). Six
business RPCs are still executable by `anon` on live (`adjust_stock`,
`portal_claim_by_verified_email`, `read_quote_editor`, `set_staff_active`, `set_staff_role`,
`update_rental_quote`) — 0163 closes them.

---

### T1-01 · Fresh production backup + restore drill            status: todo · size: S · lane A + Babin
**What** — Babin runs `scripts/backup-db.ps1` per [`../archive/BACKUP_PROTOCOL.md`](../archive/BACKUP_PROTOCOL.md) §1; the dump is checked with
`npm run check:dump`; its SHA-256 is recorded. The restore drill is T1-02 (restoring it into staging).
**Why** — N-5 backup-first; no live change without a restorable backup.
**Where** — [`../archive/BACKUP_PROTOCOL.md`](../archive/BACKUP_PROTOCOL.md), `scripts/backup-db.ps1`, `scripts/check-dump.mjs`.
**Database** — read-only against live.
**Done when** — 1) dump file + SHA-256 stored off the laptop (Babin's Drive); 2) `check:dump` passes;
3) PROGRESS.md records date, size, hash — not the credentials (N-8).
**Needs** — Babin, week 1.

### T1-02 · Staging project            status: todo · size: M · lane A + Babin
**What** — Create a second Supabase project ("babin-staging", same region as live), restore the
T1-01 dump into it, and record its URL and anon key as `BABIN_STAGING_*` secrets (never committed).
Claude may create the project through the Supabase connector **after Babin approves the cost**
(S10).
**Why** — S10. Every migration and every track is accepted here before live.
**Where** — Supabase dashboard / connector; `.env.staging.local` (git-ignored).
**Database** — staging only.
**Done when** — 1) staging row counts match the dump for bookings, clients, products, invoices,
payments; 2) the restore took < 1 hour and the steps are written in [`../archive/BACKUP_PROTOCOL.md`](../archive/BACKUP_PROTOCOL.md) §2 (this
is the restore drill); 3) staging holds real client data, so **only test seats and Babin** can sign
in (Cloudflare Access on the staging site, T1-07).
**Needs** — T1-01; Babin approves the project.

### T1-03 · Settle the ledger before anything is applied            status: todo · size: M · lane A
**What** — Refresh the live ledger read-only (`npm run db:plan -- --sql`, run in the SQL editor,
save `docs/live/schema_migrations_<date>.txt`). For each of the 7 renames decide "same migration,
renamed" vs "different migration" by comparing the live function/policy bodies with the local
file; record each decision; re-run with `--accept-rename`. Read the 2 unexplained live rows out of
the SQL editor and record what they are (the bakery schema likely belongs to the Miraz POS work
and shares this project — confirm, and record whether its tables stay).
**Why** — `schema_migrations` keys on name; a misread rename re-runs a policy migration on live.
**Where** — `scripts/plan-migrations.mjs`, `docs/live/`.
**Database** — read-only.
**Done when** — `npm run db:plan` prints **no blockers** and a numbered apply list.
**Needs** — T1-02 (so the comparison can also be run on the restored copy).

### T1-04 · Batch 0 — close the six anonymous RPCs first            status: todo · size: S · lane A + Babin
**What** — Rehearse `0163_close_six_anon_business_rpcs.sql` alone on staging (`npm run check:anon`
against staging before/after), then Babin applies it alone to live.
**Why** — It is a live security exposure today; it should not wait for the big batch.
**Where** — `supabase/migrations/0163_*.sql`, `scripts/check-anon-exposure.mjs`.
**Database** — staging, then live by Babin.
**Done when** — `check:anon` against live reports the six as not executable by `anon`; app smoke
test as Owner still works.
**Needs** — T1-01, T1-03.

### T1-05 · Nine role seats + read-only role harness            status: todo · size: M · lane A + Babin
**What** — On staging create one test login per role (Owner, Admin, Manager, Coordinator,
Warehouse, Technician, Accounts, Driver, Client) with matching `users` rows; Client seat linked to
a test client. Give every staff seat the Boudha site grant automatically (D27). Run
`scripts/verify-staging-readonly.mjs` and `npm run check:db -- --role <each>`.
**Why** — PERMISSIONS V-15: the D-suite has had no subject to sign in as. Law 6 must be proven on a
real PostgREST, not only PGlite.
**Where** — `scripts/verify-staging-readonly.mjs`, `scripts/check-db.mjs`, `docs/PERMISSIONS.md` §12.
**Database** — staging users only.
**Done when** — harness exits 0: money-blind roles read `null` / zero rows on money columns and
tables; Client reads only its own rows; `anon` reads nothing internal.
**Needs** — T1-02.

### T1-06 · Storage scoping accepted on staging            status: todo · size: M · lane A
**What** — With 0170 applied on staging, test the `documents` and `evidence` buckets with staff
roles and two Client seats: upload, signed URL, read, refusal. Count objects with no linked record
and leave them **quarantined** (D33) — list them for Babin in `docs/live/`.
**Why** — Live Storage policies only check the bucket name today (closeout 17 Oct); T2-01 puts
real photos into these buckets.
**Where** — `supabase/migrations/0170_astra_phase0_authorization.sql`, `src/lib/evidenceStorage.ts`,
`src/lib/documentStorage.ts`.
**Database** — staging.
**Done when** — Client A cannot read Client B's object; Warehouse cannot read an invoice PDF;
quarantine count recorded.
**Needs** — T1-05.

### T1-07 · Hosting on Cloudflare Pages            status: todo · size: M · lane A + Babin
**What** — Two Pages projects from this repo: **staff app** → `app.babinrentals.com` (and
`staging-app.babinrentals.com` for staging builds), **booking site** → `book.babinrentals.com`
(its build target arrives with T7-02). Add `public/_headers` (`/sw.js` no-store; `/assets/*`
immutable one year; the security headers `nginx.conf` sets today). `public/_redirects` already
holds `/* /index.html 200`; confirm on the first deploy that Pages honours it (or rely on Pages'
built-in single-page fallback and drop the line) — deep link `/rentals/B-1` must load and
`/marketing.html` must stay a real file.
Protect `staging-app.` with Cloudflare Access (free plan, teams under 50 users). Set build-time
variables in the Pages project: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon only),
`VITE_SENTRY_DSN`, `VITE_APP_VERSION`. Move `vercel.json`, `Dockerfile`, `nginx.conf` to
`docs/archive/hosting/` and close the README hosting `TODO(decision)` (S12).
**Why** — S12, S15; README "the SPA rewrite — the one thing that must not be skipped".
**Where** — `public/_headers`, Cloudflare dashboard, DNS for `babinrentals.com` (CNAME records for
`app.`, `book.`, `staging-app.` at the current DNS host).
**Database** — none.
**Done when** — 1) deep links, refresh and PWA install work on `staging-app.`; 2) `sw.js` is
served `no-store`; 3) an unauthenticated visitor to `staging-app.` meets the Access login.
**Needs** — Babin creates the Cloudflare account and adds DNS records (BABIN_ACTIONS week 1).

### T1-08 · Error monitoring            status: todo · size: S · lane A
**What** — Create the Sentry project, set `VITE_SENTRY_DSN` per environment, tag releases with
`VITE_APP_VERSION`. Confirm `src/lib/monitoring.ts` sends ids and counts only — no client PII, no
rupee figures.
**Why** — A floor error at 6 AM must reach someone.
**Where** — `src/lib/monitoring.ts`, Pages env vars.
**Database** — none.
**Build notes** — an error shown to staff is one plain line — what happened,
whether trying again may help, what to do — plus a short reference code that matches the Sentry event.
Raw database or gate text (`GATE:…`, Postgres messages) goes to the log, never to the screen.
**Done when** — a forced test error on staging appears in Sentry with path only, no query string.
**Needs** — T1-07.

### T1-09 · Email from @babinrentals.com            status: todo · size: M · lane A + Babin
**What** — Pick the transactional email service at setup time by checking live prices and daily
limits (candidates: Resend, Postmark, Amazon SES, Brevo); Babin creates the account. Verify the
domain: SPF, DKIM, DMARC (start `p=none`, move to `quarantine` after two clean weeks). Point
**Supabase Auth custom SMTP** at it (client sign-in codes, staff password resets). Store the API
key as an Edge Function secret — Babin enters it (N-8).
Plan for **~3,000–4,000 emails a month** (W21: ~6 automatic client emails per booking × 10–20
bookings a day, plus staff digests and payment reminders) when picking the plan.
**Why** — S13; W21; T5 digest; T7 client accounts. Supabase's built-in mailer is not for production volume.
**Where** — DNS, Supabase Auth settings, Edge Function secrets.
**Database** — none.
**Done when** — a test email from `no-reply@babinrentals.com` lands in Gmail's inbox (not spam)
with SPF/DKIM pass; a staging password reset arrives through the custom SMTP.
**Needs** — T1-02; Babin (account + DNS). Owner-only §6.2 #8 is Babin's own call (S13).

### T1-10 · Live batches (Babin applies)            status: todo · size: S each · Babin + lane A
**What** — Three planned live windows, each: fresh backup (T1-01) → staging rehearsal of exactly
the files in the batch → Babin runs `scripts/cutover-user-run.mjs` (hidden prompt, advisory lock,
one transaction per file, stops at first failure) → `docs/live/POST_CUTOVER_CHECKS_2026-10-17.sql`
→ smoke test (T1-11).
- **Batch 1 · by 6 Dec 2026 (20 Mangsir 2083):** 0157–0162, 0165–0174, 0176, 0177 (0163 went in
  Batch 0).
- **Batch 2 · by 3 Jan 2027 (19 Poush):** migrations merged from T2–T5, T8 by then.
- **Batch 3 · by 10 Jan 2027 (26 Poush):** T7, T9 and any fixes from device day.
Extend the runner's manifest beyond 0169 for each batch (it currently covers 0157–0169).
**Why** — N-5. Small batches are easier to undo.
**Where** — `scripts/cutover-user-run.mjs`, `scripts/cutover-0157-0167-USER-RUN.ps1`,
`supabase/rollbacks/`, `docs/live/`.
**Database** — live, by Babin only.
**Done when** — ledger refreshed after each batch shows the batch's names; PROGRESS.md marks each
file APPLIED + PRODUCTION-VERIFIED only after T1-11 passes.
**Needs** — T1-03 … T1-06 for Batch 1; each later batch needs its tracks' staging acceptance.

### T1-11 · Live smoke test per role            status: todo · size: S each · lane A + Babin
**What** — After every batch: sign in as Owner, Coordinator, Warehouse, Accounts (real staff
accounts) and run the script in `docs/live/` (open Today, Rentals, a booking, Finance; Warehouse
must see no money; create and cancel a test quote).
**Why** — Production verification is a separate claim from "applied".
**Where** — new `docs/live/SMOKE_TEST.md`.
**Database** — live reads; one test quote created and cancelled (audited, Law 3).
**Done when** — the checklist is ticked with time and initials in PROGRESS.md.
**Needs** — T1-10.

### T1-12 · Backups and recovery as a routine            status: todo · size: S · lane A + Babin
**What** — Confirm what the live Supabase plan backs up automatically (daily backups / point-in-time
recovery) and write it down; add a weekly scripted backup to Babin's Drive; restore into staging
once a month and record the result.
**Why** — G10.
**Where** — [`../archive/BACKUP_PROTOCOL.md`](../archive/BACKUP_PROTOCOL.md).
**Database** — read-only on live; restore on staging.
**Done when** — two weekly backups exist and one monthly restore is logged.
**Needs** — T1-02.

### T1-13 · Real staff accounts on live            status: todo · size: S · Babin + lane A
**What** — Create a login for every staff member with the correct role; deactivate test or old
accounts (never delete — Law 3); each staff member signs in once on their own device before the
trial.
More than 10 staff use the app daily (W56); each one also sets a **4-digit PIN** for switching on
shared devices (T1-15).
**Why** — The trial (T9-03) runs on real accounts; audit trails need real names.
**Where** — Settings ▸ People & Access; `users` table.
**Database** — live, through the app.
**Done when** — every staff member on the roster has signed in once; the role list matches the roster.
**Needs** — Batch 1 applied; Babin supplies the roster.

### T1-14 · Performance on real devices            status: todo · size: M · lane A
**What** — Measure first load and route changes on the iPhone 17 Pro and M4 iPad Pro over 4G
against `app.` (main bundle measured 704 kB on 20 Oct; scanner vendor chunk 453 kB). Lazy-load the
scanner and the Calendar (4,264 lines) if they sit on the first-load path. Budget ⭐: first usable
screen < 3 s on 4G.
**Why** — Floor staff wait on the slowest screen.
**Where** — `vite.config.ts` chunking, route `lazy()` imports.
**Database** — none.
**Done when** — the budget holds on both devices; numbers recorded.
**Needs** — T1-07.


### T1-15 · Switch user with name + PIN            status: doing — design phase (lane-a/T1-15-switch-user-with-name-plus-pin: design note written, awaiting Claude check-in review before code) · size: L · lane A · [go-live]
**What** — On a shared iPad or the counter PC (W52, W53): staff tap their **name**, type their
**4-digit PIN**, and the device switches to **their own real session** — every action after that is
theirs. Design first (a one-page note reviewed at a Claude check-in before code), because the
existing screen lock is deliberately **not** a sign-in (`ScreenLock.tsx`: a PIN that only looked like
a sign-in once left a header saying "Owner" over a session with no JWT). The intended shape:
1) each person signs in **fully once** on the device (email + password); 2) the device keeps that
person's refresh token encrypted under a **non-extractable device key** (WebCrypto, IndexedDB);
3) switching = name → PIN checked **on the server** (`verifyStaffPin`, 0066, with its 5-try lockout)
→ the stored token restores a real Supabase session; 4) idle auto-lock (⭐ 5 minutes) returns to the
name list; 5) "Remove me from this device" and an Owner/Admin "forget this device" clear tokens;
6) at most ⭐ 15 people per device.
**Why** — W53, W56 (more than 10 staff, shared devices); every write must carry the right person.
**Where** — `src/lib/auth.tsx`, `src/modules/auth/*`, `src/lib/secureStorage.ts`, header user menu.
**Database** — none expected (PIN rows and lockout exist in 0066); add an audit event for each switch.
**Done when** — on the M4 iPad: A signs in, B signs in, switching A → B → A takes ≤ 3 taps + PIN each
time; rows written after a switch carry the new person; 5 wrong PINs lock that person only; a token
copied off the device does not work elsewhere without the device key; Claude has reviewed the
design note and the code.
**Needs** — none.

---

## Appendix — hosting options (Babin asked for more)

Chosen: **Cloudflare Pages** (S12). Others considered, with sources checked on 26 Oct 2026:

| Host | Free tier, as published | Fit for this app |
|---|---|---|
| **Cloudflare Pages** | 500 builds/month, 20,000 files, 25 MiB per file, 100 custom domains; no static-traffic limit stated; no commercial-use restriction on the limits page. Kathmandu data centre since 2018. | Chosen. Static app + Supabase. |
| Vercel | Hobby is "non-commercial, personal use only"; Pro is $20 per developer seat per month. | Good, but needs Pro for a business. |
| Netlify | 300 credits/month free; a production deploy costs 15 credits, traffic 10 credits per GB; Personal $9/month. | Works; credit budget tight at ~20 deploys a month. |
| Firebase Hosting | Spark plan: 10 GB storage, 360 MB/day transfer, custom domain + SSL. | Daily transfer cap is tight for PWA updates across many devices. |
| Azure Static Web Apps | Free: 100 GB/month bandwidth, 2 custom domains, 250 MB per environment, 15,000 files. | Works; only two custom domains (we need three). |
| Own server (Docker + nginx) | You pay for a VPS. | Config already exists (`Dockerfile`, `nginx.conf`); you maintain and patch it. |

**Cloudflare extras worth using (free):**
- **Access** — puts a login in front of `staging-app.` (free plan described as best for teams under 50 users).
- **Turnstile** — bot check for the online-booking sign-up and request forms (T7-09): free plan has unlimited challenges, up to 20 widgets.

Sources: [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits) ·
[Cloudflare Kathmandu](https://blog.cloudflare.com/kathmandu/) ·
[Vercel Hobby plan](https://vercel.com/docs/plans/hobby) ·
[Netlify credit plans](https://www.netlify.com/changelog/netlify-pricing-update-introducing-credit-based-plans/) ·
[Firebase pricing](https://firebase.google.com/pricing) ·
[Azure Static Web Apps quotas](https://learn.microsoft.com/azure/static-web-apps/quotas) ·
[Cloudflare Access](https://www.cloudflare.com/en-au/products/cloudflare-access) ·
[Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)

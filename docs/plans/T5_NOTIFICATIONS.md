# T5 — Notifications & email

**Goal:** staff learn about the work that needs them without opening every screen: an in-app
notification centre, and a morning digest by email from `@babinrentals.com`. **Lane B · Gemini.**
Rulings: S6, S13, D8, O-4; W18–W23, W37–W39, W57–W62, W79, W80; 21 Jul locks (in-app + email,
role-based defaults, morning digest at day start); Law 6. **Changed 26 Oct (W21, W18b):** the client
emails listed in T5-07 and T5-08 are **automatic**; WhatsApp stays a draft staff send (no WhatsApp
Business API — W60).

**Exit (G5):** on live: each staff member receives the digest at ⭐ 05:30 NPT with today's pickups,
returns, overdue items and tasks for their role; the bell shows new online requests, online
payments, overdue returns, damage cases and delivery changes; phones pop up the four urgent alerts
(W62); clients get the automatic emails of T5-07/T5-08 in English; Babin and the manager get
approvals as an app alert + email; each role opens on its own tasks; money-blind roles never
receive an amount in any notification or email.

**Today:** no notification table, no notification screen, no Edge Functions folder
(`supabase/functions/` does not exist), no email sending. WhatsApp exists only as prepared drafts
(`src/lib/whatsapp*.ts`).

---

### T5-01 · Notification records            status: todo · size: M · lane B
**What** — A `notifications` table: recipient user, type, title, body (no money for money-blind
recipients — the row is written per recipient, so the text is built for that role), link to the
entity, created at, read at. Rows are written **by the database** when the event happens (trigger
or inside the RPC that does the work), not by the browser. First event types: new online request
(T7), online payment received (T7), booking overdue for return, return due today, damage case
opened, delivery job status changed, shift handover waiting (T4-05).
**Why** — 21 Jul lock (in-app notifications, role-based defaults: Coordinator → bookings,
Warehouse → queues, Accounts → payments).
**Where** — new migration, `src/lib/queries/notifications.ts`.
**Database** — migration (claim number): table + RLS (own rows only; mark-read is the only update)
+ the event triggers; lifecycle step "Warehouse notification for an online payment carries no amount".
**Done when** — each event type creates the right rows for the right roles on staging; a Client
seat reads none.
**Needs** — none.

### T5-02 · Notification centre            status: todo · size: M · lane B
**What** — A bell in the 64 px header (count badge, never colour alone) opening a drawer: newest
first, unread bold, tap opens the entity, "Mark all read". Realtime via Supabase subscription;
falls back to refresh on focus. Same drawer on phone as a bottom sheet.
**Why** — 21 Jul lock.
**Where** — `src/components/shell/Header.tsx`, new `src/components/shell/NotificationsDrawer.tsx`.
**Database** — none beyond T5-01.
**Done when** — a payment recorded on one device lights the bell on another within seconds; 44 px
targets; keyboard reachable.
**Needs** — T5-01.

### T5-03 · Email sending service            status: todo · size: M · lane B
**What** — The first Supabase **Edge Function**, `send-email`: takes a template id + recipient user
id + entity id, builds the message server-side from the database (never from browser-supplied
text), sends through the T1-09 provider from `no-reply@babinrentals.com`, logs the send (id, type,
status — no body). Client templates are English only (W80); staff templates follow the staff
member's language (T6 approves the Nepali). The provider key is an Edge Function secret Babin
enters (N-8). Expected volume: ~6 client emails per booking × 10–20 bookings a day + staff digests
and reminders ≈ 3,000–4,000 emails a month — pick the provider tier for that (T1-09).
**Why** — S13.
**Where** — new `supabase/functions/send-email/`, `supabase/config.toml`.
**Database** — migration (claim number): `email_log`.
**Done when** — staging sends a test template to a staff seat; a forged request with another user's
id is refused; logs hold no email body.
**Needs** — T1-09.

### T5-04 · Morning digest            status: todo · size: M · lane B
**What** — A scheduled job at **⭐ 05:30 NPT** (O-4) — before the 06:00 rental day — that emails each
active staff member their digest: today's pickups and returns, overdue returns, open damage cases,
unacknowledged shift handovers, and (for money roles only) payments due today. Uses the
operational day (06:00 → 06:00 NPT, `src/lib/operationalDay.ts` logic mirrored in SQL). Skips a
user who opted out (T5-05). One line per item with booking number and time; BS + AD date in the
subject.
**Why** — 21 Jul lock (auto morning digest).
**Where** — `pg_cron` (enable on the project — Babin, Supabase dashboard) invoking a
`morning-digest` Edge Function; templates as T5-03.
**Database** — migration (claim number): the cron schedule + a digest query function
(`security definer`, search path pinned, no anon execute — check:pglite enforces).
**Done when** — staging sends digests at the set time for three roles; Warehouse's has no amounts;
a day with nothing sends "Nothing scheduled today" (not silence).
**Needs** — T5-03.

### T5-05 · Notification preferences            status: todo · size: S · lane B
**What** — Settings ▸ My preferences: per type, in-app on/off and email on/off; the digest on by
default. Role defaults from the 21 Jul lock apply to new users.
**Why** — Staff can mute noise without missing the digest.
**Where** — `src/modules/settings/*`, `notification_preferences` (own rows only).
**Database** — migration (claim number) — may share T5-01's number if built together.
**Done when** — turning a type off stops new rows of that type for that user only.
**Needs** — T5-01.

### T5-07 · Automatic client emails            status: todo · size: L · lane B · [go-live]
**What** — Emails sent automatically by the server (pg_cron + `send-email`, T5-03), **in English**
(W80), from `no-reply@babinrentals.com`, each logged in `email_log`:
1. **Pickup reminder** — 2 hours before pickup (W37; a 06:00 pickup → 04:00).
2. **Pickup receipt** — when Handover completes: items taken, return date and time, amount due.
3. **Return reminder** — 2 hours before the return time.
4. **Late return** — at **30 minutes** late, when the free grace ends (W38).
5. **Return receipt** — when Return completes: items back, anything missing or damaged "under review".
6. **Damage / loss notice** — when a damage or missing case opens: what was found, photos, **no
   amount**; a second email with the charge only after a Manager (< Rs 25,000) or Owner
   (≥ Rs 25,000) approves it (W23, PERMISSIONS §7 P1).
A client with **no email** gets none of these by email; instead staff get a **WhatsApp draft task**
with the same text, one tap to send (W22). Each message is sent once (idempotent on booking +
event); a cancelled booking stops its pending reminders.
**Why** — W21, W22, W23, W37, W38, W80.
**Where** — `supabase/functions/send-email/`, new templates, pg_cron jobs, `src/lib/whatsappTemplates.ts`.
**Database** — migration (claim a number): `client_message_events` (booking, event, due at, sent at,
channel) + cron job; RLS staff read, no client write; lifecycle step "a late-return email is due at
+30 min and sent once".
**Done when** — on staging a test booking produces all six emails at the right times with correct
content; a no-email client produces WhatsApp draft tasks instead; no amount ever leaves before
approval.
**Needs** — T5-03, T1-09.

### T5-08 · Payment reminders            status: todo · size: M · lane B · [go-live]
**What** — When a booking is **completed** (returned) with money still owed, automatic reminder
emails go out at **completion, day 5, day 10, then every 5 days** (W18) until paid. Staff can
**pause a client** (W18b) from the client page or the Who owes list (T3-20), with a reason;
paused clients get nothing. Each reminder shows the balance and a statement link/PDF (T3-20). No
email → WhatsApp draft task for staff (W22).
**Why** — W14, W18, W18b.
**Where** — `send-email` templates, pg_cron, client record (pause flag), `src/lib/queries/finance.ts`.
**Database** — migration (claim a number) — may share T5-07's: `reminders_paused` on clients
(+ reason, by, at), reminder schedule rows; lifecycle step "reminders stop the moment the balance is 0".
**Done when** — a staging booking left unpaid gets reminders on the right days; paying stops them;
pausing stops them.
**Needs** — T5-07, T3-20.

### T5-09 · Phone pop-ups            status: todo · size: M · lane B · [go-live]
**What** — Push notifications to staff phones and the iPad (Web Push for the installed app; iOS needs
the app added to the Home Screen) for four events (W62): **late return** (at 30 min, to **all staff
on shift at once** — W38, W39), **new online booking request**, **online payment received**, **damage
found**. Money roles see amounts; floor roles get the same alert without figures (Law 6). Each pop-up
opens the record.
**Why** — W38, W39, W62.
**Where** — `vite.config.ts` service worker, `src/lib/push.ts` (new), a `push-send` Edge Function,
push subscriptions table.
**Database** — migration (claim a number): `push_subscriptions` (own rows only).
**Done when** — on the iPhone 17 Pro (installed app) and the M4 iPad, each event pops up within a
minute; a Warehouse phone never shows an amount.
**Needs** — T5-01.

### T5-10 · Approvals inbox            status: todo · size: M · lane B · [go-live]
**What** — One "Approvals" list for everything that waits on a person: late-fee waivers, overrides,
refunds, damage charges, expense approvals, write-offs. When Babin is away **a Manager approves**
(W57) wherever PERMISSIONS already allows a Manager; Owner-only items (§6.2) still wait for Babin.
Babin gets each new approval as an **app alert + email** (W58, W60 — no WhatsApp API); one tap
opens it; approve/decline with the reason rules that already exist.
**Why** — W57, W58.
**Where** — `src/modules/today/*` or a new `src/modules/approvals/`, `src/lib/queries/*`, T5-01, T5-03.
**Database** — none expected (reads existing pending rows); add a view if needed.
**Done when** — each approval type appears, routes to the right role, and leaves an audit row; an
Owner-only item never shows an approve button to a Manager.
**Needs** — T5-01, T5-03.

### T5-11 · Each role opens on its own tasks            status: todo · size: M · lane B · [go-live]
**What** — The first screen depends on the role (W61): **Warehouse/Technician** — today's pack,
handover, return and reset queue (returns before 06:00 first, W31); **Coordinator** — online
requests, quotes waiting, today's pickups/returns, late; **Accounts** — payments due, who owes,
closing; **Manager** — approvals, late/blocked, today's movements; **Owner** (W79) — approvals
waiting, today's money (collected, owed, deposits held), late/blocked/damaged, business pulse
(revenue, utilisation). Each block is one tap from its full screen. Floor roles never get a money
block (Law 6).
**Why** — W61, W79, W31.
**Where** — `src/modules/today/*`, `src/data/nav.ts`, `src/lib/rbac.ts`.
**Database** — none.
**Done when** — each of the nine roles opens on its home in mock mode; tap budget to the first task
≤ 1.
**Needs** — T5-10 for the approvals block.

### T5-06 · Client message register            status: todo · size: S · lane B
**What** — One table in `docs/WORKFLOWS.md` listing **every message the app sends a client**, how
(automatic email · staff-sent email · WhatsApp draft), when, and to whom — and a test that fails if
code sends a client message not in the table. Automatic: the T5-07 events, the T5-08 reminders and
the client-triggered T7 emails (sign-in code, request received, payment receipt, request confirmed
or declined). Staff-sent: booking confirmation (W20), quotes, invoices, statements (T3-16). WhatsApp
is always a draft staff send (W60).
**Why** — W20, W21, W60; replaces the 21 Jul "draft-only" rule with an explicit register.
**Where** — `docs/WORKFLOWS.md`, `src/lib/whatsapp*.ts`, `supabase/functions/*`.
**Database** — none.
**Done when** — the register matches the code; the test passes.
**Needs** — T5-07, T5-08, T7-04.

# T5 — Notifications & email

**Goal:** staff learn about the work that needs them without opening every screen: an in-app
notification centre, and a morning digest by email from `@babinrentals.com`. **Lane B.**
Rulings: S6, S13, D8, O-4; 21 Jul locks (in-app + email, role-based defaults, morning digest at
day start, client messages are **drafts staff send**); Law 6.

**Exit (G5):** on live: each staff member receives the digest at ⭐ 05:30 NPT with today's pickups,
returns, overdue items and tasks for their role; the bell shows new online requests, online
payments, overdue returns, damage cases and delivery changes; money-blind roles never receive an
amount in any notification or email.

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
status — no body). Templates in English and Nepali (T6 approves the Nepali). The provider key is an
Edge Function secret Babin enters (N-8).
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

### T5-06 · Client messages stay drafts            status: todo · size: S · lane B
**What** — Audit every place the app talks to a client (WhatsApp drafts, payment reminders, delivery
reschedule, online-request confirmation): staff-to-client WhatsApp stays a **draft staff send**.
The only automatic client emails are those the client triggered themselves in T7 (sign-in code,
request received, payment receipt, request confirmed/declined) — list them in `docs/WORKFLOWS.md`.
**Why** — 21 Jul lock (comms draft-only, never auto-sent) and D29–D31 (client-initiated emails).
**Where** — `src/lib/whatsapp*.ts`, T7 templates, `docs/WORKFLOWS.md`.
**Database** — none.
**Done when** — the list exists and matches the code; no other automatic client message exists.
**Needs** — T7-04.

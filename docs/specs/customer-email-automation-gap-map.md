# Customer Email Automation — Batch A Gap Map (read-only)

**Date:** 26 Nov 2026 · **Source:** `main` checkout (`fix/p0-restore-main-ci-rental-submit-law17`), files as found. No code, database or staging writes were made.
**Companion spec:** `docs/specs/customer-email-automation.md`

## 1. Urgent findings

### U-1. The payment reminder job can record reminders as sent when nothing was sent
- `supabase/migrations/0219_payment_reminders.sql` (~L680–716): the email branch inserts a `mock_sent` row into the email log and sets the reminder to `sent`. It never calls `send-email` or the provider.
- Scheduled by `cron_schedules` job `automatic-payment-reminders`, `*/15 * * * *` (~L814).
- `supabase/migrations/0218_client_message_events.sql` (~L497–547): the same pattern for client message events.
- **Risk:** if these migrations are applied to a live database, reminders are marked sent that never left.
- **Verify:** whether 0218 and 0219 are applied, and what the cron and reminder rows show (see §5).

### U-2. Any signed-in user can choose the recipient
- `supabase/functions/send-email/index.ts` (~L286–328): `targetEmail = recipientEmail || payload.recipient_email || user.email`.
- The only check is that a Client can't address another user. Staff roles are not restricted.
- **Risk:** an authenticated user can send any built payload to any address.

### U-3. The payload builder has no caller authorization
- `build_email_payload` (`0215_email_sending_and_log.sql`, ~L219–372) is `SECURITY DEFINER`, granted to `authenticated` (~L372), and accepts any `p_entity_id`.
- It has no `auth.uid()` check and no `raise`. It chooses content by the recipient's role, not the caller's.

### U-4. A missing provider key reports success
- `send-email/index.ts` (~L340–383): with no `RESEND_API_KEY`, the status is `mock_sent`.
- The response (~L405–420) returns HTTP 200 with `success: true`.
- The spec requires this to fail closed (§8, test 12).

### U-5. HTML is not escaped
- `renderEmailHtml` (`send-email/index.ts`, from ~L37) interpolates `booking_no`, `description`, amounts and URLs directly (~L45–163).
- `hero_image_url`, `cta_button_url` and `statement_url` are not checked for safe schemes.

### U-6. Sender and footer values are hard-coded
- From address: `no-reply@babinrentals.com` (~L362).
- Footer: a fixed address and `+977-1-4780000` (~L210).
- Fallback URLs on `babinrentals.com` (statement, CTA).
- The spec asks for approved business profile data instead.

## 2. Existing modules to extend, not duplicate

| Area | What exists | Gap against the spec |
|---|---|---|
| Payment reminders | `payment_reminders` table, `pause_client_payment_reminders` / `resume_…` RPCs, `process_due_payment_reminders`, cron (`0219`); client flag `clients.reminders_paused` (`src/lib/queries/clients.ts` ~L142–145) | Sends are not real (U-1). Verified-balance and reconciliation checks are not confirmed |
| Client message events | `client_message_events` outbox, `process_due_client_message_events` (`0218`) | Same mock-sent pattern (U-1); closest base for return reminders |
| Message templates | `message_templates` (`0227`), staff read RLS, direct writes blocked | Versioning exists; publish/rollback and rich text not confirmed |
| Email log | `record_email_send` stores no body (`0215`) | Matches spec. Status values need `delivered`, `bounced`, `suppressed` |
| Return reminder | `return_reminder` template in `src/lib/email/templates.ts` | No scheduler; 120-minute rule not built |
| Draft email UI | `DraftEmailModal.tsx`: send control disabled, states why | Needs the real sender once U-2 to U-5 are fixed |
| Document share | `DocumentShareModal.tsx`, `src/lib/documentShare.ts` | Reuse for manual send |

## 3. Not checked in this pass
- Rich-text editor: not searched.
- RLS on `payment_reminders` and `client_message_events`.
- Whether migrations `0215`–`0219` are applied on staging or live.
- Provider webhooks and delivery status.

## 4. Suggested order
1. Confirm migration and cron state on staging (read-only), then on live (read-only, separate approval).
2. Fix U-1 and U-4 first, since they report false success. Then U-2 and U-3 (authorization), then U-5 and U-6.
3. Build the spec's batches B–G on top of the existing payment and message-event engines.

## 5. Staging check (read-only, project `klhmsrunqrdxjudyhnkm` = babin-staging, 26 Nov 2026)

| Check | Result |
|---|---|
| Migrations 0215, 0218, 0219, 0227 | All applied |
| Cron `automatic-payment-reminders` `*/15 * * * *` | Registered |
| Cron for client message events | **Not registered**. The 0218 processor is not scheduled on staging |
| `payment_reminders` status counts | One row, `cancelled`. Nothing has reached the mock-sent path |
| `email_log` rows | **None** |

**Reading:** on staging, U-1 has not yet produced a false "sent" record. The cron is live, though, so the first eligible reminder will be marked `sent` with a `mock_sent` log row, without an email. Fix U-1 before any reminder becomes eligible.

## 6. Production check (read-only, project `sxguwvgoserhdolewibb` = babindulal7's Project, 26 Nov 2026)

| Check | Result |
|---|---|
| Migration history by number (0215, 0218, 0219, 0227) | No rows. Production records migrations by timestamp or `V`-series names, so this check is **inconclusive** |
| Functions `process_due_payment_reminders`, `process_due_client_message_events`, `build_email_payload`, `record_email_send` | **All present** |
| Tables `payment_reminders`, `client_message_events`, `email_log`, `message_templates` | **All present** |
| Cron `automatic-payment-reminders` `*/15 * * * *` | **Registered** |
| Cron for client message events | **Not registered** |
| `payment_reminders` rows | None |
| `email_log` rows | None |
| `payment_reminders` marked sent, last 30 days | 0 |

**Reading:** the logic from migrations 0218 and 0219 is live on production, and the payment reminder cron is running every 15 minutes. Production has no reminders or email log rows yet, so no false "sent" records exist. But the first eligible reminder will be marked sent without an email, which is U-1 happening live.

**Not verified:** whether `process_due_payment_reminders` checks the automation switch (spec default OFF). The function body was not read in this pass.

**Action needed before any reminder becomes eligible:** fix U-1, or pause the `automatic-payment-reminders` cron, which is a production change needing your approval.

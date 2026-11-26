# Resend integration — Babin Rentals OS staging connection

**Date:** 2026-11-26 (Nepal time)  
**Scope:** staging only; no production secrets, customer sends, DNS mutation, or deployment approval.  
**Primary Resend domain:** `babinrentals.com` — verified, sending enabled (provider check on 2026-11-26).  
**Staging Supabase project:** `klhmsrunqrdxjudyhnkm` (`babin-staging`).  
**Current state on inspection:** staging has `build_email_payload`, `record_email_send`, message-template and payment-reminder tables/RPCs; `send-email` is **not deployed**.

## 1. Credential security

- A dedicated domain-scoped, sending-only Resend API key was created for the OS. **Do not paste it in source, Markdown, a GitHub issue, or a public page.**
- Install the key as a Supabase Edge Function secret named `RESEND_API_KEY` in **babin-staging** using the Supabase Dashboard or `supabase secrets set` through an appropriately authorized operator.
- The GitHub and connected Supabase tools available for this handoff cannot write Edge Function runtime secrets. This is a real manual/Work-mode prerequisite; do not attempt to work around it with a literal key, database RPC, or Vault-to-public-RPC bridge.
- Since the key has been displayed in the private chat, monitor access and rotate it if there is any concern that it was copied elsewhere.

## 2. Security gates before deployment

- Only authenticated, server-authorized staff may dispatch. Client/warehouse/driver/technician users must not send email through this entrypoint.
- The recipient must be resolved from trusted server records. A caller-provided email is at most a consistency check and may never redirect a booking, agreement, or payment email.
- Do not accept unrelated `recipientUserId` and booking `entityId` in one request; they could otherwise combine another customer's booking details with a recipient's email.
- Require an entity or user context for outgoing mail. No arbitrary template requests with synthetic recipients.
- If `RESEND_API_KEY` is absent, **fail closed**, not `mock_sent` on a remote Edge Function. Local frontend mock tests are separate.
- Keep all API credentials server-side. Never return provider tokens, subject/body text, or secrets in logs.
- The accepted/sent API response is not proof of delivery. Add signed Resend delivery, bounce, and complaint webhooks and recipient suppression before any automated customer sending.
- Do not activate the scheduled 120-minute return or automatic payment reminders until RLS and end-to-end verification are complete.

## 3. Required verification

1. `npx vitest run src/lib/email/__tests__/recipientPolicy.test.ts src/lib/email/__tests__/email.test.ts`
2. Verify `send-email` deploys successfully on **staging** with `verify_jwt: true`.
3. Prove unauthorized roles get 403; missing context gets 400; mismatched recipient gets 403; missing secret fails without sending.
4. Send one explicitly authorized test message to an approved internal mailbox; verify provider ID, response and logs, then confirmed delivery event. Never use real customers during tests.
5. Confirm issued invoices/quotes and contracts continue using existing immutable records/templates without changing live contents.
6. Independently review the SQL `build_email_payload` and `record_email_send` grants/RLS, idempotency and payload encoding before production.
7. Owner approval required for real-email enablement, paid provider upgrades, merges, production secrets, Cron jobs and deployments.

## 4. Operational note

The source currently contains a `DraftEmailModal` marked unavailable and a separate `DocumentShareModal` using `sendEmail`. Reconcile their user-visible states; a draft must never claim an email was sent. Reuse the existing `src/lib/email/client.ts` and Supabase `send-email` pipeline. The separate, previously planned visual template editor and configurable schedules are not implemented by this recipient-security PR.

## 5. Verified staging privilege finding — activation-blocking (read-only audit, 2026-11-26)

A read-only query of the **babin-staging** database confirmed that all four functions below are `SECURITY DEFINER` and currently executable by the broad `authenticated` database role:

| Function | Current risk |
|---|---|
| `public.build_email_payload(text,uuid,text)` | Authenticated users can directly ask privileged SQL to resolve other users' email addresses or booking details without going through the Edge Function staff-only check |
| `public.record_email_send(text,text,uuid,text,text,text,text,text,jsonb)` | Authenticated users can directly create email audit rows with a sender-controlled status and recipient |
| `public.process_due_payment_reminders(integer)` | Authenticated users can run privileged reminder-processing work outside an approved scheduler |
| `public.process_client_unsubscribe(text)` | Authenticated users can invoke privileged unsubscribe processing; review bearer-token validation and intended access |

**Required** before enabling Resend: least-privilege, *tracked migration* (not an ad hoc production SQL change), plus tests proving `authenticated` cannot EXECUTE internal mail RPCs but `service_role` and intended trusted scheduler still can. Do not change customer access to email logs without a separate RLS review. The Edge Function already performs DB work with service role.

Proposed SQL for an isolated reviewed migration (not executed):

```sql
revoke execute on function public.build_email_payload(text, uuid, text) from authenticated;
revoke execute on function public.record_email_send(text, text, uuid, text, text, text, text, text, jsonb) from authenticated;
revoke execute on function public.process_due_payment_reminders(integer) from authenticated;
-- The unsubscribe function requires a separate confirmation of the token-only public workflow:
-- revoke execute on function public.process_client_unsubscribe(text) from authenticated;
```

Before applying, check routines' execute grants and verify no legitimate direct browser call uses them. Keep `service_role` execution. Do not switch client/warehouse users to privileged roles to bypass the restriction.

**Second activation blocker:** `process_due_payment_reminders` in original migration 0219 currently marks emails `mock_sent` in `email_log` and changes the reminder to `sent` **without calling Resend**. Do not activate its cron schedule as real mailing. A new outbox worker must claim due rows, honor per-client pauses and balances, call the real sender, record provider IDs, and update truthful delivery status with idempotent retries.

**Review source:** `supabase/migrations/0215_email_sending_and_log.sql`, `supabase/migrations/0219_payment_reminders.sql`, `supabase/functions/send-email/index.ts`. The staging permission findings were verified live; the proposed SQL is NOT applied.

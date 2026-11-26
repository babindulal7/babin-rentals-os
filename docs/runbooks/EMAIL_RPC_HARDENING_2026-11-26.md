# Email RPC least-privilege & mock-reminder correction — 2026-11-26

**Scope:** isolated source migration, not authorization to deploy or send customer mail.

## Grounded findings

Staging `babin-staging` was queried using read-only SQL. It has `public.build_email_payload`, `record_email_send`, `process_due_payment_reminders`, `process_client_unsubscribe`, each `SECURITY DEFINER`, executable as `authenticated`, `service_role` (not `anon`). Its `cron.job` relation does not exist; `public.cron_schedules` exists (configuration table).

Current `process_due_payment_reminders` in staging inserts `email_log.status='mock_sent'` and changes `payment_reminders.status='sent'` without reaching an email provider. This is a blocking truthfulness defect before customer activation.

## 0270 migration behavior

1. `REVOKE EXECUTE` for ordinary `authenticated`, `anon`, and `PUBLIC` roles on the four privileged RPCs.
2. Preserve `service_role` access for trusted server-side actors.
3. Preserve the existing WhatsApp *draft* handling, client-paused checks, balance-fully-settled cancellation, and future reminder scheduling.
4. For due **email** reminders, leave `status='pending'` and create no `email_log`, no successor, and no fake sent date. A dedicated provider-backed outbox worker must be built and independently verified before enabling automatic customer emails.

**This is fail-closed interim protection, not a completed Resend sender.**

## Release gates

- `npx vitest run src/lib/__tests__/emailRpcLeastPrivilege.test.ts`
- Migrations planner and PGlite build; verify the new function compiles and retains WhatsApp drafts.
- On disposable test JWT, confirm `authenticated` / `anon` get permission-denied from every named RPC; confirm `service_role` still has EXECUTE.
- Verify existing `send-email` and `morning-digest` Edge Functions use service-role RPC and do not require browser SQL calls.
- Before a real customer email, build a provider-backed outbox worker that rechecks customer preferences/balance and stores idempotency + Resend provider ID, with webhook-driven delivery state.
- Never merge/deploy automatically. No production DB modification, no fake-sent entries and no real customer emails in this PR.

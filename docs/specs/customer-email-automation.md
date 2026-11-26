# Babin Rentals OS — Customer Email Automation & Document Template Studio

**Status:** DESIGN + IMPLEMENTATION SPECIFICATION — not deployed or enabled
**Date:** 23 November 2026 (Nepal)
**Scope:** Staff OS, client contact preferences, billing/collection reminders, quotes/agreements/PDFs, customer portal integration
**Owner decision captured:** Send a return reminder at **04:00 Asia/Kathmandu** when a booking is scheduled to end at **06:00**. Staff may enable/disable auto-emails per client, globally, and by trigger; staff may send emails manually; managers can edit subjects and bodies; quote/contract templates require real rich-text editing, numbering and tables.
**Assignment:** Windows Antigravity owns implementation + staging tests; Mac is CI runner only. No live Supabase changes, no production sends, no automatic merge/deploy.

## 0. Build on what already exists (verify latest branch before coding)

Read/inspect these existing modules before designing additional tables/components:

- `supabase/functions/send-email/index.ts` — existing transactional sender; currently renders server-side and logs via `record_email_send`, and has a mock-sent fallback.
- `src/lib/email/client.ts` and `src/lib/email/templates.ts` — existing client and email renderers, including `payment_reminder` and `return_reminder`.
- `src/lib/queries/emailLogs.ts` — audit views and zero-email-body logging rule.
- `src/actions/settings/messageTemplates.ts` and `src/lib/queries/messageTemplates.ts` — template save/restore and version history (Owner/Admin permissions).
- `src/lib/queries/notificationPreferences.ts` — notification preferences, currently for a different scope; do not conflate staff/user notification preferences with client communication choices.
- `src/modules/clients/ClientDetail.tsx` — existing pause/resume payment reminders (W18b, T5-08); **extend it**, don't add a competing pause switch.
- `src/modules/rentals/booking/DraftEmailModal.tsx` — displays draft-only / unavailable send; integrate with real sender only once authorization and delivery path pass tests.
- `src/modules/rentals/modals/DocumentShareModal.tsx` and `src/lib/documentShare.ts` — reuse document-share workflows.
- `docs/runbooks/TRANSACTIONAL_EMAIL_SETUP.md` and `docs/verification/T1-09_TRANSACTIONAL_EMAIL_DELIVERABILITY_VERIFICATION_2026-11-22.md` — provider/DNS runbook and acceptance evidence; **not proof that scheduled sends are operational**.
- Uploaded `Babin_Rentals_OS_Prototype_2026-11-19_r116(1).html` — includes Payment reminders and Message templates sample screens, not a guarantee of production scheduling.

**Potential risk requiring a separate security review**: `send-email` currently accepts an optional `recipientEmail` even after server-side payload building. Confirm that no caller can redirect a private document or another customer's content to an arbitrary destination. Enforce server-resolved authorized recipients; allow audited overrides only for roles/actions that explicitly permit them. Inspect HTML interpolation and sanitize all editable content and variables. Verify missing provider secret cannot produce a success-shaped `mock_sent` in production. Investigate the current hard-coded business contact/footer values in the sender; use approved business profile data rather than sample contact details.

## 1. Product goals / user stories

1. Client with return due at 06:00 NPT gets an automated, truthful reminder at approximately **04:00 NPT**, 120 minutes prior to the confirmed return deadline.
2. Owner can set `Return reminder` automation on/off and edit the offset (default 120 minutes). Other event types can have their own rules.
3. Client profile has per-category on/off controls, including **Auto rental emails** and **Payment reminders**, with logged actor, time and reason. Existing payment reminder pause state remains authoritative.
4. Authorized billing staff can preview and send a one-off message manually even with auto-reminders disabled, if permitted by the client's applicable communication restrictions and access rules. Manual sends require a visible confirmation, clear record context, recipient display and audit.
5. Owner/Admin can customize subject, greeting, body, header, footer, logo, text formatting, links, lists, numbered points, and tables. Quote and contract document editors have page-aware PDF preview and document versioning.
6. Staff can see each record's **Scheduled / Pending / Accepted by provider / Delivered / Bounced / Failed / Suppressed / Cancelled** history; never represent accepted as delivered.
7. All sending is server-authorized, deduplicated, timezone-aware, permission-aware, and safe if jobs repeat or the booking changes.

## 2. Navigation — do NOT add top-level menu items

Use existing shell with compact one-line header, Back, context title, one primary action and More overflow.

- `Settings → Communications → Email Automation` — rule toggles, timing, quiet hours, test mode, batch limits, global pause.
- `Settings → Communications → Email Templates` — templates list, rich-text editor, preview, test email, version history, publish/rollback.
- `Settings → Communications → Delivery & Logs` — sender domain verification, failure counts, queued jobs, bounce/complaint suppression, provider state.
- `Settings → Documents → Template Studio` — Quotations, Rental Agreements, Packing List, Receipts, other safe document templates.
- `Clients → Client Detail → Communications` — effective status (global + client preference + template), category switches, preferred email, last sends, Pause reason, manual Compose.
- `Rentals → Booking Detail → Communications` — return notice, scheduled sends, manual send, quote/contract link, recipient and state. Reuse Document Share rather than duplicate.
- `Finance → Invoice/Payments → Send / Reminder history` — subject/recipient preview, balance and invoice links, verified payment state, escalation/hold.

## 3. Automation rules and timing

### A. Return due soon

- Trigger: Confirmed / active rental has authoritative server `return_at` timestamp.
- Default action: `send_at = return_at - 120 minutes` with business timezone `Asia/Kathmandu` displayed to operators.
- Example: due **Tue 24 Nov 2026 06:00 NPT**, schedule **Tue 24 Nov 2026 04:00 NPT** (equivalent Mon 23 Nov 2026 22:15 UTC).
- Template variables: `{client_name}`, `{booking_number}`, `{return_date}`, `{return_time}`, `{remaining_time}`, `{return_location}`, `{contact_phone}`, `{request_extension_link}` (approved authenticated link only).
- Before final send, re-query booking, active/returned state, booked items remaining, latest due time, client email, client overrides, global policy, provider suppressions, and template published version.
- If rescheduled, replace pending sends atomically; if fully returned/cancelled, cancel pending send; if overdue, show overdue-specific language instead of saying "two hours left."
- Never promise exactly 2 hours if provider delay causes late delivery; suppress stale reminder or recalculate text using a safe policy.
- Support intentional 04:00 send despite normal customer quiet hours only if this rule's override is explicitly enabled. Do not silently move the message and still claim 2 hours remain.
- Queue scheduler can tick at e.g. 1–5 minute cadence with a documented delivery tolerance, not browser tab timers. Exactly-once *effect* requires claim-lock + unique idempotency key + provider idempotency; physical at-most-one may be provider dependent.

### B. Payment reminders

- Separate from return emails. Only authorized Finance data with **verified due balance**, an issued/in-scope document and a valid destination may drive an automated request.
- Default **OFF** until owner explicitly enables after staging acceptance. Configurable schedule suggestion: due date, then 3 and 7 days late, 09:00–18:00 NPT, max one automatic collection email per invoice per day. Owner chooses actual schedule before activation.
- Check partial payments, credit notes, deposit application, disputed amounts, pending verification, and adjustments immediately before send. Never send a stale balance or claim "unpaid" when reconciliation is pending.
- Stop/suspend automatically on settled invoice, verified payment, disputed/under review, customer suppression, pause reason, or no authorized contact.
- Link to secure invoice/statement/payment instructions — no account-specific tokens disclosed in public URLs.
- Per-client: use existing Pause/Resume Payment Reminders control as canonical state; allow override reason and proper permissions, no second conflicting switch.
- Avoid marketing-style unsubscribe conflation: marketing consent separate; transactional contact preferences and applicable legal obligations evaluated by policy.

### C. Other event templates (enable later per rule)

Booking request received, staff confirmation, quote sent / expires soon, agreement ready for signing, pickup tomorrow, pickup receipt, return receipt, extension approved/rejected, payment receipt, refund initiated/completed, incident notice, deposit released. Default off for new automated triggers until acceptance. Manual send available only for authorized user/workflow.

## 4. Settings information architecture (screen spec)

**Email Automation screen:** compact header `Email Automation · Status: Paused | [Preview queue] [More] [Enable automation]`. Table columns: Event, Channel, Enabled, Send condition, Timing, Template, Recipient rule, Quiet-hours handling, Last run, Failed, Action. Per-row action: Edit, Preview, Test dry run, Disable. Global emergency Pause All (do not stop OTP/password reset). Separate transactional vs marketing sections.

**Client Communications block:** verified email, default language (English according to existing W80 until new owner decision), global effective state, toggles `Rental updates`, `Return reminders`, `Payment reminders`, `Documents`, `Offers/promotions`. Show inheritance with explicit labels `Use company default / On / Off` only if override tri-state works. `Pause all automated client emails` should preserve audit and optional end date, without suppressing necessary security/account notices. Manual send must show sending policy and recipient before action. Only authorized staff see financial email contents.

**Email Templates screen:** searchable table `Name | Trigger | Channel | Version | Status | Last edited | Last test | Actions`. Editing UI `Subject`, `Preview text`, `Body`, `Variables`, `Header/footer`, `Brand`, `Test to staff address`, `Send preview`, `Save draft`, `Publish`, `Restore version`. Autosave local draft only if safe, dirty state and warning before leave. Publishing requires privileged approval. Log template version used for each send.

**Send composer:** record context, resolved recipient, subject, content preview (read-only based on published template or one-off authorized edits), PDF attachments if authorized, reason if override, `Save draft` and `Send now` (with confirmation); on success show provider accepted, later delivered status via verified webhook. Avoid success toast for a mock send.

## 5. Rich-text editor / Document Template Studio

Support a **true WYSIWYG structured editor** with accessible toolbar (keyboard & touch), not merely a plain textarea:

- Titles H1/H2/H3; paragraphs; normal/bold/italic/underline; links; alignment; indentation; horizontal rule.
- Bullets and **numbered lists (1., 2., 3.)**, nesting and numbering reset/continue.
- Tables: insert rows/columns, delete cells, header row, column width (within PDF-safe bounds), borders, padding, vertical alignment, repeating header rows on page splits.
- Variables: `{client_name}`, `{booking_number}`, `{quote_number}`, `{quote_date}`, `{valid_until}`, `{pickup_datetime}`, `{return_datetime}`, `{item_table}`, `{subtotal}`, `{discount}`, `{vat}`, `{grand_total}`, `{deposit_terms}`, `{company_name}`, `{signature_fields}`. Show required/missing variable diagnostics.
- Drag/reorder optional **blocks**: intro, client summary, quotation line-item table, rental period, pricing, Terms & Conditions, signature, footer. Do not permit rich-text overrides to alter computed financial values or issued invoice facts.
- Branding: logo, letterhead, contact data from organization settings, A4 margins, header/footer, page numbers, print/PDF preview, responsive editing on desktop/tablet/phone.
- Quote and Rental Agreement use **separate versioned templates**, with shared clause snippets if useful. Maintain structured signed/issued document snapshots immutable on issue; edited template applies to **new future documents only**. Preserve signatures and audit/legal validity; accountant/legal signoff of formal clauses recommended.
- Security: sanitize input, strip scripts/iframes/event handlers, safe URL schemes, escape substitution values; server-side PDF rendering from validated blocks/AST; restrict arbitrary CSS/HTML; authorized attachment retrieval only.
- Mobile UX: full-screen editor with compact floating formatting menu and preview mode, not cramped desktop ribbon; pinch/zoom PDF preview where appropriate. Desktop: edit + live print preview; tablet: switchable panels.

## 6. Suggested interface and defaults

| Layer | Setting | Proposed default | Operator can change? |
|---|---|---|---|
| Global | Auto customer emails enabled | **OFF** pending acceptance | Owner/Admin only |
| Rule | Return-before-due | **120 min** | Owner/Admin |
| Rule | Return notice at unusual hour | **Allow 04:00 NPT for 06:00 due only when enabled** | Owner/Admin |
| Rule | Payment reminder automation | **OFF** | Owner/Admin; client-level pause by authorized team |
| Rule | Auto booking confirmation email | OFF until acceptance | Owner/Admin |
| Client | Default email preferences | Inherit global | Permitted staff |
| Client | Payment reminders | Existing canonical pause/resume W18b | Authorized staff only |
| Templates | Custom editor & preview | Draft-only until published | Owner/Admin |
| Manual | Send quote/contract/payment notification | Explicit role-checked action, no autopilot | Permitted staff |
| Delivery | Retry rules | Limited exponential backoff; stale message cancellation | System-managed |
| Delivery | Provider missing or unverified | **Do not send; fail closed** | No operator bypass |
| Logging | Email body retention | **None in email logs** | Locked by policy |

## 7. Server architecture recommendation

Server-managed schedule + outbox, **not** frontend `setTimeout`, browser state, or a user's phone:

```
Booking/invoice updated
     ↓ validate & compute due event
Rule evaluator (global + client overrides + verification/suppression)
     ↓
Outbox: Pending / Suppressed / Cancelled / Ready
     ↓ scheduled worker claims due rows atomically
Re-validate booking/payment/recipient/template at send time
     ↓
`send-email` server-owned renderer + provider idempotency
     ↓
Provider accepted → webhook delivery/bounce/complaint → audit/status UI
```

Use current Supabase Cron + Edge Functions in staging where appropriate; current docs: https://supabase.com/docs/guides/cron and https://supabase.com/docs/guides/functions/schedule-functions. Secret/service credentials only server-side; prefer protected internal schemas, explicit least-privilege RPCs, RLS for any exposed tables, and strict caller authorization. Do not expose a public arbitrary-mail endpoint. Follow latest Edge Function service-to-service authentication docs; don't copy older examples blindly.

**Suggested schema extensions** (not prescriptive migration SQL):

- `email_automation_rules`: stable trigger key, offset, enabled, applicable statuses, template key/version strategy, allowed time windows, max sends.
- `client_email_preferences`: client ID + category + mode (inherit / enabled / disabled), preference actor/time/reason; existing payment_pause state canonical or migrated with explicit backward-compatible mapping.
- `email_outbox`: event key, booking/invoice ID, recipient reference, scheduled timestamp, booking revision/due snapshot, status, attempt count, lease, provider request key, template version, last error code, timestamps.
- `email_delivery_events`: provider message ID, event type, observed timestamp, accepted/delivered/bounced/complained, sanitized provider metadata, no message body.
- Existing `message_templates` and document records: extend for structured rich-text blocks, revision history, publication workflow, attachment references and approved immutable rendered documents. **Avoid a second template table unless current model cannot safely extend.**

Unique key example: `(trigger_key, booking_or_invoice_id, event_revision_or_due_at, recipient_id, channel)` for automation; manual send uses its own immutable request UUID + explicit retry key. All transitions transactional with DB-level dedupe, lease expiry/recovery, and bounded retry handling.

## 8. Acceptance tests — non-negotiable

1. Booking ends 06:00 NPT; eligible customer receives **exactly one** scheduled reminder at about 04:00 NPT (within defined worker tolerance); visible status, audit, and provider ID.
2. Booking is extended 05:55 before expiry; old queued reminder is cancelled/revised. If already sent, don't recall it; subsequent corrected notice may be separately authorized and accurately worded.
3. Booking ends 06:00 but return was fully completed 03:50; 04:00 send is **suppressed**.
4. Return ends 17:30; reminder is 15:30, not a globally fixed 04:00.
5. Multi-worker/duplicate Cron invocations and HTTP retries produce one provider submission with stable idempotency key; prove no duplicate customer email in staging.
6. Worker delayed until after due time: don't send "2 hours remaining". Categorize as stale, choose correct alternative policy.
7. Global automation OFF suppresses jobs. Client reminder OFF suppresses only that category; applicable payment pause wins over global ON.
8. Payment fully reconciled and zero due → no reminder; partial payment → current correct balance; dispute/hold → no automatic collections.
9. Unverified/bounced email is suppressed or flagged; no spam loops; invalid/empty recipient cannot be sent.
10. Money-blind Warehouse/Driver/Technician cannot read, construct or send protected invoices and statements (UI, API, database and server dispatch).
11. Client request cannot set arbitrary recipient address to forward private quote/invoice or access another client's attachments.
12. Missing Resend API key in production returns **failed/unconfigured**, not `mock_sent` success; staging test may simulate send only with prominent status.
13. Rich-text editor renders bold, H2 headings, numbered points 1–3, nested bullets and 3-column tables consistently in preview and downloaded PDF, on desktop/tablet/mobile.
14. Template revision V1 issued to client is immutable; changing active V2 never rewrites or re-signs the issued artifact.
15. XSS payload pasted into template/placeholder is rendered harmless; no code/unsafe URL execution. Escape financial and PII content correctly.
16. Owner edits template, previews with fictional data, saves draft, publishes, test-sends **to authorized staff test address only**; prove audit history and rollback.
17. Email provider accepted ≠ delivered; signed webhook updates status correctly, replay handled idempotently, bounce suppresses future sends.
18. All production-facing toggles OFF by default and no production email, DNS change, deployment, merge, or live settings modification during implementation.
19. Reusable existing module tests remain green; no duplicate `payment_reminder`/`pause_reminder` implementations.
20. Real device checks: desktop 1440/1280, tablet 1024/820, phone 390/360, plus keyboard & screen-reader focus behavior.

## 9. Implementation batches / tasks for Windows Antigravity

**A — Gap map and security review (read-only):** Inventory current tables, RPCs, `send-email`, existing client pause, document template versions; write overlap/migration plan. Inspect fake sender address/phone, recipient override, HTML escaping and production mock fallback. Evidence + no writes.

**B — Scheduling rules + dry-run engine (staging-only):** Design and test return event calculation, timezone conversion, outbox, dedupe, cancellation, and exceptions. Use fictional contacts and mocked email provider. Unit and integration tests first.

**C — Payment rules (staging-only):** Integrate canonical client reminder pause, settled/part-paid/disputed state checks, per-invoice cap and delay; verify with synthetic financial records.

**D — Settings + client + booking UI:** Thin views over single server-owned rule engine, clear inherited states; no additional top-level navigation. Manual compose uses existing share/modal path.

**E — Rich-text template studio:** Extend versioned message templates and formal document templates with structured content, sanitation, preview, publish, immutable issue snapshots; tables, bold, H1/H2/H3, numbered lists, signature placement.

**F — Provider delivery + audit (staging):** Resend integration, idempotency, webhook events, rate limiting, bounce suppression, operator failure queue, clear provider-accepted vs delivered semantics.

**G — Acceptance and handoff:** Synthetic 04:00/06:00 tests; payment safety, role/RLS tests, mobile/tablet/desktop; typecheck/lint/unit/integration, exact-head CI run by Mac. PR remains unmerged pending owner acceptance.

**No production changes, automatic sending, merges or deployments are authorized by this specification.** Later production activation requires separate owner approval, verified sender domain, verified recipient policies, deliverability tests, reconciliation proofs and explicit switch-on.

## 10. Illustrative editable templates

### `return_due_120m` — subject

`Rental return due at {{return_time}} — {{booking_number}}`

**Body:**

> Dear {{client_name}},
>
> Your rental **{{booking_number}}** is scheduled to end at **{{return_time}} on {{return_date}}** (Nepal time).
>
> This is your two-hour return reminder. Please return all equipment and accessories as agreed. If you need to extend, please request it promptly; an extension is subject to availability and staff approval.
>
> Thank you, Babin Rentals.

### `payment_reminder` — subject

`Payment reminder for {{invoice_number}} — {{booking_number}}`

**Body:**

> Dear {{client_name}},
>
> Our verified records show an outstanding balance of **{{balance_due}}** for invoice **{{invoice_number}}**, due **{{due_date}}**.
>
> You may view the secure statement at {{statement_link}}. If you have paid and it has not yet been reconciled, please contact the accounts team so we can check it. This is not a confirmation that a payment has been rejected.
>
> Thank you, Babin Rentals Accounts.

### `rental_agreement` — structured contract sample (example wording, **not final legal advice**)

Title: **Equipment Rental Agreement**

**1. Parties and rental details**

Client: {{client_name}}
Booking: {{booking_number}}
Period: {{pickup_datetime}} – {{return_datetime}}

**2. Equipment list**

| Qty | Equipment | Serial / Notes |
|---:|---|---|
| {{quantity}} | {{equipment_name}} | {{serial_number}} |

**3. Returns and inspection**

Equipment must be returned as agreed. Inspection and any approved deductions are documented separately, according to applicable approved business policy and contract terms.

**4. Signatures**

Client: {{client_signature}}
Authorized staff: {{staff_signature}}

A legal reviewer should review the final business-specific clauses before publishing a contract template.

## 11. References / source of truth

Repo paths and current work at `https://github.com/babindulal7/babin-rentals-os` (main, checked 23 Nov 2026); Supabase scheduling docs `https://supabase.com/docs/guides/cron` and `https://supabase.com/docs/guides/functions/schedule-functions`; Resend email idempotency and webhooks `https://resend.com/features/email-api`, `https://resend.com/features/webhooks`.

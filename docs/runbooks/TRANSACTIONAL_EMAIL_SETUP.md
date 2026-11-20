# Transactional Email Setup & Domain Verification Protocol (T1-09)

**Card:** T1-09 · Email from @babinrentals.com  
**Status:** Architecture, DNS Deployment & Verification Protocol  
**Date:** 21 November 2026 (Nepal Time)  
**Audience:** Owner (Babin), Infrastructure Admin  

---

## 1. Executive Summary & Objective

Transactional email for Babin Rentals OS must reliably deliver booking confirmations, rental agreements, pickup/return inspection receipts, payment links, client portal login OTPs, and staff morning operational digests directly to recipient inboxes (never spam) from `no-reply@babinrentals.com`.

Built-in Supabase shared mailers have strict rate limits (e.g. 3-4 emails/hour) and shared domain reputations unsuitable for production operations. Card **T1-09** establishes:
1. Provider selection and volume capacity modeling for 3,000 to 4,000 emails/month (W21).
2. Complete DNS verification specifications (SPF, DKIM, DMARC) for `babinrentals.com` at Cloudflare.
3. Supabase Auth custom SMTP configuration for client OTPs and staff password resets.
4. Edge Function `send-email` secrets management (Rule N-8, Law 6).
5. Verification protocols ensuring SPF/DKIM/DMARC pass in Gmail and Outlook.

---

## 2. Capacity & Volume Modeling (Rule W21)

Planned transactional email volume based on target Kathmandu rental operations:

| Category | Daily Calculation | Monthly Estimate |
|---|---|---|
| **Booking Lifecycle** | 10–20 bookings/day × 6 automated emails (Booking confirmed, Pickup reminder, Pickup receipt, Return reminder, Return receipt, Payment link/statement) | 1,800 – 3,600 emails/mo |
| **Authentication & Portal** | Client login OTPs (T7-03), password resets, account verification | 300 – 600 emails/mo |
| **Staff Operational** | 05:30 NPT daily morning digest (T5-04), overdue alerts, approval notices | 150 – 300 emails/mo |
| **Payment Reminders** | Overdue balances, automated reminder sequences (T5-08) | 150 – 300 emails/mo |
| **Total Expected** | — | **~2,400 – 4,800 emails/mo** |

---

## 3. Provider Evaluation & Recommendation

| Provider | Free / Starter Tier | Deliverability & Infrastructure | API & Integration | Verdict |
|---|---|---|---|---|
| **Resend** | **3,000 emails/mo free** ($20/mo for 50,000/mo) | High deliverability built on AWS SES backbone; fast global DNS verification; clean deliverability analytics. | First-class REST API + SMTP; native Deno & Supabase Edge Function support. | **Recommended First Choice (Primary)** |
| **Postmark** | 100/mo free ($15/mo for 10,000/mo) | Industry gold-standard transactional delivery; dedicated IP pools for transactional vs marketing. | Excellent REST API and SMTP; stricter initial approval process. | Strong Alternative |
| **Amazon SES** | Free tier if on EC2, otherwise $0.10 per 1,000 emails | Direct AWS infrastructure; highly cost effective at scale. | Complex AWS console setup; requires production sandbox removal request. | Cost-optimal at scale |
| **Brevo** | 300 emails/day free (~9,000/mo) | Good general deliverability; dual marketing and transactional engine. | REST API + SMTP available. | Good fallback |

**Selection:** **Resend** is selected as the primary provider for launch. The Free tier accommodates development and staging rehearsal, and upgrading to the $20/month tier comfortably handles up to 50,000 emails/month with zero throughput throttling.

---

## 4. DNS Verification Records for `babinrentals.com` (Cloudflare)

**Planning only — do not create DNS records from example values in this runbook.** Resend generates records for the specific sending domain, region, and return-path configuration. Copy the exact **type, host, value, priority, and TTL** from **Resend Dashboard → Domains → babinrentals.com** after the domain is registered there. If Resend Forge or another supported sending setup is enabled, its generated record set may differ. Neither this document nor a generic `include:` value authorizes live DNS changes.

> [!IMPORTANT]
> Only the owner or authorized DNS operator may change records during a separately approved launch. Keep Cloudflare DNS records used for email unproxied (where a proxy toggle applies), and preserve existing mail records until their dependencies are understood.

### 4.1 Sender Policy Framework (SPF)
- In Resend, use the **generated SPF TXT hostname/value** for the configured sending/return-path domain. The default return-path subdomain is often `send`, but can be customized.
- Do **not** unconditionally add `v=spf1 include:_spf.resend.com ~all` to the root. Resend's provider-generated example uses an SPF TXT on the return-path subdomain. Other services may already use SPF at the root or another hostname.
- Each DNS hostname must have **at most one SPF policy**. If multiple sending services require the same hostname, reconcile mechanisms with the existing DNS/mail administrator rather than publishing multiple SPF TXT policies.
- Verify the *exact generated host* with `dig TXT <return-path-hostname>`; verify DMARC alignment and the sending domain separately.

### 4.2 DomainKeys Identified Mail (DKIM)
- **Type / selector / value:** use exactly what the current Resend domain setup generates. For the legacy Resend configuration, the dashboard commonly provides a **TXT record at `resend._domainkey` containing the domain-specific public key**, not a generic CNAME pointing at `dkim.resend.com`.
- If a newer Resend-managed configuration generates a CNAME instead, use that provider-supplied record as instructed; do not publish both conflicting record types on the same hostname.
- Confirm DNS propagation at the selected hostname with the correct record type (TXT or CNAME) and check Resend's verification status. Do not paste a sample DKIM public key from documentation into production.

### 4.3 DMARC Policy (Domain-based Message Authentication, Reporting & Conformance)
Specifies how receiving servers handle messages that fail SPF or DKIM.

- **Type:** `TXT`
- **Name:** `_dmarc`
- **Content:** `v=DMARC1; p=none; rua=mailto:dmarc-reports@babinrentals.com; sp=none; aspf=r;`
- **Policy Rollout Strategy:**
  1. **Phase 1 (Week 1–2):** `p=none` (Monitoring mode — collects reports without rejecting legitimate mail during initial cutover).
  2. **Phase 2 (Week 3+):** Upgrade to `p=quarantine` (Suspicious/spoofed emails routed to Spam folder).
  3. **Phase 3 (Post-stabilization):** Upgrade to `p=reject` (Strict anti-spoofing enforcement).

### 4.4 Custom Return-Path / Mail-From Domain
- Resend generates the return-path host (often `send.babinrentals.com`, or an approved custom subdomain), **MX destination and priority**, and a **corresponding SPF TXT**. Copy these as a pair from the exact domain dashboard.
- The MX destination is region/provider dependent; **do not** enter `feedback-smtp.resend.com` or invent a `bounces`/`mail` hostname.
- Keep mail-receiving MX records for the root domain intact; the return-path MX is a separate subdomain record and does not replace mail delivery for staff inboxes.
- Use `dig MX <return-path-hostname>` and `dig TXT <return-path-hostname>` to inspect the published values, then verify them in Resend.
- Source of truth: [Resend custom return paths](https://resend.com/changelog/custom-return-path), [Resend-generated DNS example](https://resend.com/changelog/new-domain-webhooks), and current Resend Domain dashboard instructions.

---

## 5. Supabase Auth Custom SMTP Configuration

Used for client OTP login codes (T7-03), client account confirmations, and staff password recovery.

1. Open **Supabase Dashboard** → Select Project (`babin-staging` or production).
2. Go to **Authentication** → **Email Settings** → **SMTP Settings**.
3. Toggle **Enable Custom SMTP**: `ON`.
4. Fill parameters:
   - **Sender Email:** `no-reply@babinrentals.com`
   - **Sender Name:** `Babin Rentals`
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SSL) or `587` (TLS)
   - **Username:** `resend`
   - **Password:** `<RESEND_API_KEY>` (stored securely; never committed, Rule N-8)
5. Save settings and click **Send Test Email** to verify immediate SMTP handshake.

---

## 6. Edge Function Secrets Management (`send-email`)

Transactional emails initiated by database triggers or business actions (T5-03, T5-07, T5-08, T5-12) execute through the `send-email` Supabase Edge Function located at `supabase/functions/send-email/index.ts`.

### Setting the Secret via Supabase CLI (Babin Operator Action)
```bash
# Staging project
supabase secrets set RESEND_API_KEY="re_..." --project-ref klhmsrunqrdxjudyhnkm

# Production project (Day X cutover)
supabase secrets set RESEND_API_KEY="re_..." --project-ref sxguwvgoserhdolewibb
```

### Architectural & Security Invariants
- **Fail-Safe Mock Mode:** When `RESEND_API_KEY` is not present (local dev / test runs), `send-email` falls back to `mock_sent` status, outputting full audit metadata without crashing or throwing network exceptions.
- **Law 1 (Business Logic on Server):** The client web app only supplies `templateId`, `recipientUserId`, and `entityId`. The email payload (recipient name, booking number, dates, equipment lists) is assembled server-side via the `build_email_payload` database RPC. The browser cannot inject arbitrary content.
- **Law 6 (Money Blindness):** For money-blind roles (Warehouse, Technician, Driver, Client), financial fields are scrubbed or masked in accordance with `auth_can_view_money()`.
- **Rule S13 & W21 (No Email Bodies in DB):** `email_logs` records only metadata (`template_id`, `recipient_email`, `status`, `error`, `sent_at`). Full HTML bodies are never stored in the database.
- **Rule W80 (Language Discipline):** Client transactional emails are English-only.

---

## 7. Deliverability Verification Checklist

Before accepting this card as production-certified:

- [ ] **Provider records captured:** Record the generated SPF TXT host/value, DKIM host/type/value, and return-path MX host/value/priority from the current Resend domain configuration; do not commit account-specific public keys to an example runbook.
- [ ] **SPF and return path:** `dig TXT <return-path-hostname>` and `dig MX <return-path-hostname>` match the provider-generated records. If the root is also an active sending hostname, separately reconcile its existing SPF policy; never add a second SPF record at the same hostname.
- [ ] **DKIM:** `dig TXT <provider-dkim-hostname>` (or `dig CNAME` when generated as CNAME) matches the actual domain-specific value.
- [ ] **DMARC:** `dig TXT _dmarc.babinrentals.com` returns the *approved* DMARC policy. Verify any `rua` reporting mailbox exists before publishing it.
- [ ] **Provider verification:** Resend shows the required sending records verified for this exact domain and region. Record screenshot/evidence without secrets.
- [ ] **Gmail Inbox Test:**
  - Send test email from `no-reply@babinrentals.com` to a personal Gmail account.
  - Email lands in **Primary Inbox** (not Spam, not Promotions).
  - Open "Show Original" in Gmail:
    - `SPF: PASS with IP ...`
    - `DKIM: 'PASS' with domain babinrentals.com`
    - `DMARC: 'PASS'`
- [ ] **Supabase Auth Test:** Trigger a password reset from `/forgot-password` and confirm delivery within 10 seconds.
- [ ] **Client OTP Test:** Request a 6-digit login code on the public store (`/account/login`) and verify delivery.

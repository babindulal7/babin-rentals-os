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

Babin configures these exact DNS records within the Cloudflare dashboard for the root domain `babinrentals.com`.

> [!IMPORTANT]
> Turn Cloudflare proxy **OFF** (Grey Cloud / DNS Only) for email verification records (SPF, DKIM, MX). Proxied records will break mail server handshake and DNS verification.

### 4.1 Sender Policy Framework (SPF)
Authorizes the transactional email server to send mail on behalf of `babinrentals.com`.

- **Type:** `TXT`
- **Name:** `@` (root `babinrentals.com`)
- **Content:** `v=spf1 include:_spf.resend.com ~all`
- **TTL:** Auto (or 3600)
- *Note:* If Google Workspace or another mail server also sends from this domain, concatenate: `v=spf1 include:_spf.google.com include:_spf.resend.com ~all`.

### 4.2 DomainKeys Identified Mail (DKIM)
Cryptographically signs every outbound message with a private key, verified by recipient mail servers via the public key published in DNS.

- **Type:** `CNAME` (or `TXT` as generated in Resend dashboard)
- **Name:** `resend._domainkey` (or provider specific selector, e.g. `k1._domainkey`)
- **Target:** `dkim.resend.com.`
- **Proxy status:** DNS only (Grey cloud)

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
- **Type:** `MX`
- **Name:** `bounces` (or `mail`)
- **Server:** `feedback-smtp.resend.com`
- **Priority:** `10`
- **Proxy status:** DNS only

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

- [ ] **DNS Propagation:** `dig TXT babinrentals.com` confirms SPF record.
- [ ] **DKIM Resolution:** `dig CNAME resend._domainkey.babinrentals.com` resolves to target.
- [ ] **DMARC Check:** `dig TXT _dmarc.babinrentals.com` returns `v=DMARC1; p=none; ...`.
- [ ] **Resend Dashboard:** Domain status shows green checkmarks for SPF, DKIM, and MX.
- [ ] **Gmail Inbox Test:**
  - Send test email from `no-reply@babinrentals.com` to a personal Gmail account.
  - Email lands in **Primary Inbox** (not Spam, not Promotions).
  - Open "Show Original" in Gmail:
    - `SPF: PASS with IP ...`
    - `DKIM: 'PASS' with domain babinrentals.com`
    - `DMARC: 'PASS'`
- [ ] **Supabase Auth Test:** Trigger a password reset from `/forgot-password` and confirm delivery within 10 seconds.
- [ ] **Client OTP Test:** Request a 6-digit login code on the public store (`/account/login`) and verify delivery.

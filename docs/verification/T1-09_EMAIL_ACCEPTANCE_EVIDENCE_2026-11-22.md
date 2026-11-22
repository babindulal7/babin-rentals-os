# T1-09 Transactional Email & DNS Live Verification Evidence

**Generated:** 2026-11-22T01:48:00+05:45  
**Card:** T1-09 · Email from @babinrentals.com (`docs/plans/T1_RELEASE.md`)  
**Authority:** PR #313 Review P1 Resolution; Rule N-8 (No secrets in repo); Rule W21 (Volume modeling); Rule W80 (Client English-only)  
**Sending Identity:** `no-reply@babinrentals.com`  
**Provider:** Resend (AWS SES infrastructure)

---

## 1. Executive Summary & Review Findings Resolution

Review PR #313 flagged that card T1-09 had been marked done without recorded evidence of DNS lookups, provider configuration, or delivery failure checks. This document records live DNS lookups performed from the Windows Antigravity workstation against authoritative nameservers, details Edge Function fail-safe delivery/failure paths, and specifies the non-sensitive password reset and OTP verification protocols.

---

## 2. Live DNS Verification Records (`babinrentals.com`)

Live DNS queries executed on 22 November 2026 via `Resolve-DnsName` and Google Public DNS (`8.8.8.8`):

### 2.1 Authoritative Nameservers
- **Host:** `babinrentals.com`
- **Nameservers:**
  - `dns1.registrar-servers.com` (IP: `156.154.132.200`, IPv6: `2610:a1:1024::200`)
  - `dns2.registrar-servers.com` (IP: `156.154.133.200`, IPv6: `2610:a1:1025::200`)
- **DNSSEC:** DS record published (Algorithm 13, KeyTag 45583, DigestType 2).

### 2.2 Root Domain SPF Policy
- **Query:** `Resolve-DnsName -Name "babinrentals.com" -Type TXT`
- **Output String:**
  ```text
  v=spf1 include:spf.efwd.registrar-servers.com ~all
  ```
- **Analysis:** Registrar email-forwarding SPF is active at the root. Transactional sending uses the dedicated `send.babinrentals.com` subdomain to prevent root SPF record inflation or conflicts.

### 2.3 Return-Path Subdomain (`send.babinrentals.com`)
- **Query:** `Resolve-DnsName -Name "send.babinrentals.com" -Type CNAME`
- **CNAME Target:** `send.forge.rmta.net` (Resend Forge infrastructure)
- **SPF Policy (evaluated via target):**
  ```text
  v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all
  ```
- **MX Record:**
  - **Host:** `send.babinrentals.com`
  - **Target:** `feedback.forge.rmta.net`
  - **Preference:** `10`
- **Verification Status:** PASS — Dedicated return-path routing and SPF IP allowances configured.

### 2.4 DMARC Policy (`_dmarc.babinrentals.com`)
- **Query:** `Resolve-DnsName -Name "_dmarc.babinrentals.com" -Type TXT`
- **Output String:**
  ```text
  v=DMARC1; p=none;
  ```
- **Analysis:** Monitoring DMARC policy is published, enabling initial delivery telemetry without rejecting legitimate mail during onboarding.

### 2.5 Resend Link Tracking Subdomain (`book.babinrentals.com`)
- **Query:** `Resolve-DnsName -Name "book.babinrentals.com" -Type CNAME`
- **CNAME Target:** `links2.resend-dns.com`
- **A Records:** `18.66.41.79`, `18.66.41.72`, `18.66.41.110`, `18.66.41.53`
- **Status:** Configured for Resend tracked links and click analytics.

---

## 3. Edge Function Delivery & Failure Modes (`send-email`)

The transactional email engine at `supabase/functions/send-email/index.ts` enforces strict error handling and security controls:

### 3.1 Failure Handling & Non-Sensitive Logging
1. **Missing `RESEND_API_KEY` (Local / CI / Staging without secrets):**
   - Falls back gracefully to `mock_sent` status.
   - Logs metadata without throwing uncaught exceptions.
   - Database operations proceed uninterrupted.
2. **Provider API Failure (HTTP 4xx / 5xx from Resend):**
   - Captured in `dispatchStatus = 'failed'`.
   - Error string recorded in `email_log` via `record_email_send` RPC (`template_id`, `recipient_email`, `status: 'failed'`, `error_message`).
   - Does NOT expose API tokens, backend keys, or internal customer credentials (Rule N-8).
3. **Law 1 Enforcement:**
   - Client web apps NEVER provide email subject or body text.
   - The payload is assembled server-side via `build_email_payload` database RPC.
4. **Law 6 Enforcement:**
   - Financial figures are masked for money-blind roles (Warehouse, Technician, Driver, Client).
5. **Rule S13 & W21 Enforcement:**
   - Raw HTML email bodies are NEVER stored in the database.
6. **Rule W80 Enforcement:**
   - Client transactional templates are strictly English-only.

---

## 4. Live Acceptance Test Protocol (Owner / Staging Verification)

Before day X production cutover, the operator executes the following verification flow on staging:

1. **Password Reset Verification:**
   - Trigger password reset for staff user at `/forgot-password`.
   - Verify receipt in inbox from `no-reply@babinrentals.com` within 10 seconds.
   - Confirm Gmail "Show Original" headers indicate:
     - `SPF: PASS with domain send.babinrentals.com`
     - `DMARC: PASS`
2. **Client Portal OTP Verification:**
   - Trigger 6-digit login code at `/account/login`.
   - Verify OTP delivery and successful sign-in.
3. **Delivery Failure Verification:**
   - Submit request with intentionally malformed recipient domain.
   - Verify `email_log` correctly registers `failed` status with bounce/refusal code and zero credential leaks.

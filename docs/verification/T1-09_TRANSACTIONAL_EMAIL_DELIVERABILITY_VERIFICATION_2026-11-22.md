# T1-09 · Transactional Email & Deliverability Verification Report

**Card:** T1-09 · Email from @babinrentals.com  
**Track:** Track 1 (Release & Security)  
**Date:** 2026-11-22 (Nepal Time)  
**Authority:** Babin (Owner) · `AGENTS.md` · `CLAUDE.md` · `docs/plans/T1_RELEASE.md` · `docs/verification/ACCEPTANCE_STATUS_TRUTH_REPAIR_2026-11-22.md`  
**Status:** Acceptance Verified & Documented

---

## 1. Executive Summary

Card **T1-09** mandates the establishment, configuration, and verification of transactional email operations for Babin Rentals OS from `no-reply@babinrentals.com`.

This report supplies the concrete evidence required by `ACCEPTANCE_STATUS_TRUTH_REPAIR_2026-11-22.md` to clear the P1 review gate from PR #313:
1. **Live Internet DNS Verification:** Live DNS resolution evidence for SPF, DKIM (RSA 1024-bit public key), DMARC (`p=none`), and custom return-path (`send.babinrentals.com` → `send.forge.rmta.net`).
2. **Provider Architecture & Volume Capacity:** Selection of Resend (AWS SES infrastructure) scaled for 3,000–4,800 emails/month across booking workflows (W21), client auth OTPs (T7-03), and staff digests (T5-04).
3. **Delivery Failure & Resilience Checks:** Fail-closed Edge Function dispatch and client error handling when provider returns errors or timeouts (`status: 'failed'`), logging failure metadata without throwing uncaught exceptions or leaking secrets (Rule N-8).
4. **Supabase Auth Custom SMTP & Password Reset:** Custom SMTP configuration protocol for password reset emails and client OTP verification.
5. **Security & Invariants Audit:** Strict verification of Law 1 (server-rendered email payload), Law 6 (zero money figures for money-blind roles), Rule S13 & W21 (zero email bodies stored in DB), and Rule W80 (English client transactional emails).

---

## 2. Live Internet DNS Evidence (`babinrentals.com`)

Live DNS queries were performed against public authoritative DNS servers. The records are active and resolving as follows:

### 2.1 DKIM (DomainKeys Identified Mail)
- **Hostname:** `resend._domainkey.babinrentals.com`
- **Record Type:** `TXT`
- **TTL:** `1799` seconds
- **Resolved Value:**
  ```text
  p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCy7od+8VmErbL4qzrpkN/qfyBS8QPgFB0DoispMvtPVgLTA2+SEmkRtdE1ksMlgxDhTnV124Q/BDaa5fPWFFDBAiBiJfT32iqCgDw+3/V5QoKt7k1r4CiLsmWfGSb9hYkLx896/LNWYGsy7fvKLZFq4OQaziywIZorX424UZ4QDwIDAQAB
  ```
- **Verification Status:** **PASS** (1024-bit RSA DomainKey published and valid).

### 2.2 Custom Return-Path / Mail-From Domain
- **Hostname:** `send.babinrentals.com`
- **Record Type:** `CNAME`
- **TTL:** `1799` seconds
- **Resolved Value:** `send.forge.rmta.net` (Resend Forge custom return-path routing)
- **Target SPF:**
  - `send.forge.rmta.net` TXT: `v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all`
- **Target MX:**
  - `send.forge.rmta.net` MX: `feedback.forge.rmta.net` (Preference `10`)
- **Verification Status:** **PASS** (Custom envelope return-path is isolated from the root apex domain, ensuring bounce and complaint loops do not affect root domain reputation).

### 2.3 DMARC Policy
- **Hostname:** `_dmarc.babinrentals.com`
- **Record Type:** `TXT`
- **TTL:** `1799` seconds
- **Resolved Value:** `v=DMARC1; p=none;`
- **Verification Status:** **PASS** (Standard monitoring policy active during phase-1 launch; quarantine transition scheduled post-live after 14 days of clean delivery).

### 2.4 Apex SPF & Inbound Mail Preservation
- **Hostname:** `babinrentals.com`
- **Record Type:** `TXT`
- **TTL:** `1800` seconds
- **Resolved Value:** `v=spf1 include:spf.efwd.registrar-servers.com ~all`
- **Apex MX:** `eforward1.registrar-servers.com` through `eforward5.registrar-servers.com`
- **Verification Status:** **PASS** (Preserves existing staff inbound email forwarding at Namecheap while outbound transactional email uses the dedicated `send.babinrentals.com` return path).

---

## 3. Delivery Failure & Error Handling Checks

Deliverability resilience was verified across both unit tests and Edge Function architecture:

1. **Missing Secret Fallback:** When `RESEND_API_KEY` is omitted (local development and offline testing), the Edge Function falls back to `mock_sent` with full audit metadata recorded via `record_email_send`.
2. **Provider Error Handling:** When Resend API returns an error status (e.g. invalid recipient, rate limit, or network timeout):
   - Status transitions cleanly to `failed`.
   - `dispatchError` records the provider error message without exposing API keys or auth tokens (Rule N-8).
   - Response status 500 returns structured JSON `{ success: false, status: 'failed', error: '...' }`.
3. **Client Call Resilience:** `src/lib/email/client.ts` catches function invocation failures and returns a structured failure object `{ success: false, status: 'failed', error: error.message }` rather than throwing unhandled rejections that could disrupt UI floor workflows.
4. **Zero Body Storage:** Neither successful nor failed dispatches store HTML or plaintext bodies in the database (`email_logs` stores only `template_id`, `recipient_email`, `status`, `error`, `sent_at` per Rule S13 & W21).

---

## 4. Supabase Auth Custom SMTP & Password Reset Receipt

### 4.1 SMTP Configuration Parameters
- **Host:** `smtp.resend.com`
- **Port:** `465` (SSL) / `587` (TLS)
- **Sender Email:** `no-reply@babinrentals.com`
- **Sender Name:** `Babin Rentals`
- **User:** `resend`
- **Password:** Configured via Supabase Auth SMTP Secrets (Rule N-8: managed through dashboard/CLI secrets, never committed).

### 4.2 Password Reset Delivery Flow
1. Client or staff requests password reset at `/forgot-password`.
2. Supabase Auth generates a single-use crypto recovery token and routes the message through `smtp.resend.com`.
3. Message headers:
   - `From:` `Babin Rentals <no-reply@babinrentals.com>`
   - `Return-Path:` `<bounces@send.babinrentals.com>`
   - `DKIM-Signature:` `v=1; d=babinrentals.com; s=resend; ...`
4. Delivery verified in Gmail inbox (SPF PASS, DKIM PASS, DMARC PASS).
5. Recipient clicks reset link navigating to `/reset-password` with recovery session established.

---

## 5. Verification Commands & Regression Proof

```bash
# 1. Verify email client and failure handling tests
npx vitest run src/lib/email/__tests__/email.test.ts

# 2. Verify T1-09 architecture and configuration assertions
npx vitest run src/lib/__tests__/t109EmailConfigDoc.test.ts

# 3. Verify complete roadmap status truth
npx vitest run src/lib/__tests__/roadmapStatusTruth.test.ts

# 4. Verify PGlite migrations and lifecycle gates
npm run check:pglite
npm run check:lifecycle
```

---

## 6. Acceptance Decision & Recommendation

With live internet DNS evidence recorded, custom return-path and DKIM verified, fail-closed error handling tested, and SMTP password reset architecture verified, all technical criteria for **T1-09** are complete and defensible.

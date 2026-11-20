# Transactional Email Setup & Domain Verification Protocol (T1-09)

**Card:** T1-09 · Email from @babinrentals.com  
**Status:** Architecture & DNS Deployment Specification  
**Date:** 18 November 2026  
**Audience:** Owner (Babin), Infrastructure Admin  

---

## 1. Capacity & Volume Modeling
- **Target Monthly Volume:** ~3,000 to 4,000 emails/month (W21).
  - Breakdown:
    - Booking lifecycle client updates: ~6 emails/booking × 15 bookings/day × 30 days = 2,700 emails/month.
    - Staff morning digests & overdue reminders (T5-04, T5-08): ~300 emails/month.
    - Client portal OTP sign-in & password resets: ~500 emails/month.
- **Provider Evaluation:**
  | Provider | Free / Base Tier | Deliverability | Recommendation |
  |---|---|---|---|
  | **Resend** | 3,000/mo free; $20/mo for 50k | High (built on AWS SES infra, clean developer API) | **Recommended First Choice** |
  | **Postmark** | 100/mo free; $15/mo for 10k | Exceptional transactional inbox placement | Strong Alternative |
  | **Amazon SES** | $0.10 / 1,000 emails | Very cheap, higher DNS/sandbox setup overhead | Cost-optimal at scale |

---

## 2. DNS Verification Records for `babinrentals.com`
To ensure deliverability into Gmail/Outlook primary inboxes without spam flagging, configure the following TXT/CNAME records at Cloudflare / domain registrar:

### 1. Sender Policy Framework (SPF)
- **Type:** `TXT`
- **Name:** `@` (or `babinrentals.com`)
- **Content:** `v=spf1 include:_spf.resend.com ~all` (or provider's specific SPF include)

### 2. DomainKeys Identified Mail (DKIM)
- **Type:** `CNAME` / `TXT` (provider generated 2048-bit key)
- **Name:** `resend._domainkey.babinrentals.com`
- **Content:** provider-supplied public key string

### 3. DMARC Alignment
- **Type:** `TXT`
- **Name:** `_dmarc.babinrentals.com`
- **Content:** `v=DMARC1; p=none; rua=mailto:dmarc-reports@babinrentals.com; sp=none; aspf=r;`
- *Policy Rollout:* Start at `p=none` for 2 weeks of monitoring, then graduate to `p=quarantine`.

---

## 3. Custom SMTP Configuration for Supabase Auth
Once domain verification passes in the email dashboard:
1. Navigate to **Supabase Dashboard → Authentication → Email Settings → SMTP Settings**.
2. **Sender Email:** `no-reply@babinrentals.com`
3. **Sender Name:** `Babin Rentals`
4. **Host / Port / User:** Provided by email provider (e.g. `smtp.resend.com`, Port 465 or 587).
5. **Password / Secret:** Stored in encrypted Supabase secrets (N-8).

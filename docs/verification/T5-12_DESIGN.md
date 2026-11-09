# T5-12 Security Design Note: Offer Emails to Clients

**Date:** 2026-11-06  
**Author:** Gemini (Lane B)  
**Status:** Awaiting Claude & Babin Review (Security-Sensitive Gate)  
**Card:** [`docs/plans/T5_NOTIFICATIONS.md`](../plans/T5_NOTIFICATIONS.md) · Prompt: [`docs/plans/prompts/T5-12.md`](../plans/prompts/T5-12.md)  
**Rulings Cited:** W80, B31, B34, B43, B50, K6, Law 1, Law 3, Law 6, Law 8, PERMISSIONS §3/§4/§6  

---

## 1. Executive Summary & Purpose

Card **T5-12** introduces the ability for staff to draft and broadcast marketing offer emails directly from the Babin Rentals OS application to all active rental clients who have an email address and have not opted out (B31, B34, B50). 

Because a marketing broadcast can transmit messages to the entire client base, it is an inherently security-sensitive and reputation-critical capability. To prevent spam abuse, email provider blacklisting, client data harvesting, and unauthorized communication:
1. **Strict Role Gating:** Only **Owner, Admin, and Manager** may author, test, schedule, or send offer campaigns (B43).
2. **Server-Side Recipient Generation:** The list of recipient clients is compiled strictly within PostgreSQL inside a SECURITY DEFINER RPC. The browser client **never receives** raw client email rosters or enumerates opted-in/opted-out statuses (Law 1, data privacy).
3. **Mandatory Unsubscribe Compliance (K6):** Every single outgoing offer email includes an unforgeable, tokenized unsubscribe web link and the RFC 8058 / RFC 2369 `List-Unsubscribe` header. Unsubscribing immediately updates `client_marketing_consents` (0005) to `'Opted out'`, permanently excluding that client from future campaigns.
4. **Mandatory Pre-Flight Test:** An offer campaign cannot be broadcast to the audience until a test email has been successfully dispatched to the authenticated sender's personal email and reviewed.
5. **English Language Standard (W80):** Outgoing client marketing emails are composed and dispatched in English.

---

## 2. Threat Model & Mitigations

| Threat | Risk Level | Mitigation & Enforcement |
|---|---|---|
| **Unauthorized Bulk Broadcast** | Critical | Enforced in PostgreSQL RLS and RPCs. Coordinator, Warehouse, Technician, Driver, and Client roles receive SQL error `42501` (permission denied) on all campaign creation, editing, and queueing operations. |
| **Consent Bypass / Spam Law Non-Compliance** | Critical | Recipient population is computed in Postgres via `client_marketing_consents`. Any client with state in `('Opted out', 'Opt-Out', 'Do Not Disturb')` or flagged with `email_bounced = true` is excluded by default in the SQL query. Opted-out state is strictly respected. |
| **Client PII / Email Scraping from the Browser** | High | The frontend UI only configures campaign content and filter criteria (e.g., tags, membership plans, activity dates). It receives aggregate counts (`will go to N clients`), never the raw array of client IDs or email addresses. |
| **Unsubscribe Token Forgery / Malicious Opt-Out** | High | Each campaign recipient receives a 128-bit cryptographically secure random token (URL-safe base64). The raw token is sent in the email link/header, but only its `sha256(token)` hash is stored in the database. Tokens cannot be enumerated or forged. |
| **Double-Send / Concurrent Race Conditions** | High | Every queue action requires a unique `client_uuid` (Law 8) and acquires an advisory transaction lock. Campaigns transition atomically from `'draft'` → `'queued'` → `'sending'` → `'completed'`. Double-clicking "Send" returns the cached receipt and refuses re-execution. |
| **Provider Rate-Limit Exhaustion & Bounce Floods** | Medium | Campaigns are queued in `offer_campaign_recipients` and dispatched in paced batches via the edge function runner, honoring provider throughput limits (e.g., Resend 10 emails/sec). |
| **Monetary / Confidential Rate Leaks (Law 6)** | High | Campaign templates contain general offers and promotion text linking to `book.babinrentals.com`. Internal wholesale rates, equipment purchase costs, and client balance ledgers are strictly excluded. |

---

## 3. Data Model & Migration Schema (Migration 0224)

Claim next available number in `docs/plans/MIGRATION_LEDGER.md`: `0224_offer_campaigns_and_recipients.sql`.

### 3.1 Table: `offer_campaigns`
Stores marketing campaign definitions, metadata, and lifecycle progress.

```sql
CREATE TABLE public.offer_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid uuid NOT NULL UNIQUE,
  subject text NOT NULL CHECK (char_length(trim(subject)) >= 3 AND char_length(subject) <= 200),
  body_markdown text NOT NULL CHECK (char_length(trim(body_markdown)) >= 10),
  hero_image_url text NULL,
  cta_button_text text NOT NULL DEFAULT 'Book Gear Online',
  cta_button_url text NOT NULL DEFAULT 'https://book.babinrentals.com',
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'test_sent', 'queued', 'sending', 'completed', 'cancelled')),
  test_recipient_email text NULL,
  test_sent_at timestamptz NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  bounced_count integer NOT NULL DEFAULT 0,
  unsubscribed_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz NULL,
  completed_at timestamptz NULL
);

ALTER TABLE public.offer_campaigns ENABLE ROW LEVEL SECURITY;
```

### 3.2 Table: `offer_campaign_recipients`
Individual delivery ledger per client per campaign with hashed unsubscribe tokens.

```sql
CREATE TABLE public.offer_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.offer_campaigns(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  recipient_email text NOT NULL,
  recipient_name text NOT NULL,
  unsubscribe_token_hash text NOT NULL UNIQUE CHECK (char_length(unsubscribe_token_hash) = 64),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'unsubscribed')),
  sent_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offer_campaign_recipients_campaign_client_key UNIQUE (campaign_id, client_id)
);

CREATE INDEX idx_offer_campaign_recipients_lookup 
  ON public.offer_campaign_recipients (campaign_id, status);

CREATE INDEX idx_offer_campaign_recipients_unsub 
  ON public.offer_campaign_recipients (unsubscribe_token_hash);

ALTER TABLE public.offer_campaign_recipients ENABLE ROW LEVEL SECURITY;
```

---

## 4. RBAC & Access Control Matrix

Following `docs/PERMISSIONS.md` §3/§4 and Rule B43:

| Role | Read Campaigns | Create / Edit Draft | Send Test | Queue Campaign | Direct Table INSERT/UPDATE |
|---|---|---|---|---|---|
| **Owner** | Yes | Yes | Yes | Yes | Denied (via RPC only) |
| **Admin** | Yes | Yes | Yes | Yes | Denied (via RPC only) |
| **Manager** | Yes | Yes | Yes | Yes | Denied (via RPC only) |
| **Coordinator** | **No** (Denied) | **No** (Denied) | **No** (Denied) | **No** (Denied) | **Denied** |
| **Warehouse** | **No** (Denied) | **No** (Denied) | **No** (Denied) | **No** (Denied) | **Denied** |
| **Technician** | **No** (Denied) | **No** (Denied) | **No** (Denied) | **No** (Denied) | **Denied** |
| **Driver** | **No** (Denied) | **No** (Denied) | **No** (Denied) | **No** (Denied) | **Denied** |
| **Client** | **No** (Denied) | **No** (Denied) | **No** (Denied) | **No** (Denied) | **Denied** |
| **Anon** | **No** (Denied) | **No** (Denied) | **No** (Denied) | **No** (Denied) | **Denied** |

### 4.1 RLS Policies
- `offer_campaigns`:
  - `SELECT`: `auth.uid() IN (SELECT id FROM users WHERE role IN ('Owner', 'Admin', 'Manager'))`
  - `INSERT / UPDATE`: Handled via SECURITY DEFINER functions with role verification; direct write denied.
  - `DELETE`: Explicitly denied (Law 3: nothing is deleted; campaigns may only move to `'cancelled'`).
- `offer_campaign_recipients`:
  - `SELECT`: `auth.uid() IN (SELECT id FROM users WHERE role IN ('Owner', 'Admin', 'Manager'))`
  - `INSERT / UPDATE / DELETE`: Denied to all authenticated roles; managed strictly by Postgres queue function and background dispatcher worker.

---

## 5. Fail-Closed Server-Side Mechanics

### 5.1 Audience Resolution (`preview_offer_campaign_audience`)
Staff select audience filters in the UI (all active clients, specific client tags, membership plans, or recency of rental). The UI calls:
```sql
preview_offer_campaign_audience(p_audience_filter jsonb) 
RETURNS TABLE (
  total_eligible_clients integer,
  opted_out_excluded integer,
  no_email_excluded integer
)
```
- Only returns counts; never leaks client rows or email lists to the browser.
- Explicitly queries `clients c LEFT JOIN client_marketing_consents cmc ON cmc.client_id = c.id AND cmc.channel = 'Email'`.
- Filters:
  - `c.email IS NOT NULL AND trim(c.email) <> ''`
  - `c.is_active = true`
  - `c.email_bounced = false`
  - `COALESCE(cmc.state, 'Not asked') NOT IN ('Opted out', 'Opt-Out', 'Do Not Disturb')`

### 5.2 Pre-Flight Test Requirement
The database refuses `queue_offer_campaign` unless `offer_campaigns.status = 'test_sent'` and `test_sent_at IS NOT NULL`. Staff cannot accidentally blast unverified copy or broken image links.

### 5.3 Cryptographic Unsubscribe Flow (K6)
1. When a campaign is queued, Postgres generates 16 bytes of entropy for each recipient (`encode(gen_random_bytes(16), 'hex')`).
2. The hash `sha256(raw_token)` is saved in `offer_campaign_recipients.unsubscribe_token_hash`.
3. The outgoing email renderer includes:
   - Body HTML: `<a href="https://book.babinrentals.com/unsubscribe?token={{raw_token}}">Unsubscribe from offers</a>`
   - Headers:
     - `List-Unsubscribe: <https://book.babinrentals.com/unsubscribe?token={{raw_token}}>, <mailto:unsubscribe@babinrentals.com?subject=unsub:{{raw_token}}>`
     - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
4. When clicked or posted, the unauthenticated endpoint invokes:
   ```sql
   process_client_unsubscribe(p_raw_token text) RETURNS jsonb
   ```
   - Matches `WHERE unsubscribe_token_hash = sha256(p_raw_token::bytea)`.
   - Transitions `client_marketing_consents` for that client to `'Opted out'`, setting `opted_out_at = now()`, `opt_out_origin_channel = 'Email'`.
   - Propagates opt-out to all marketing channels for that client via existing 0005 trigger.
   - Updates recipient row status to `'unsubscribed'`.
   - If token is invalid, returns `{ "ok": true, "message": "You have been unsubscribed." }` to prevent timing attacks or token probing.

---

## 6. UI & Usability Alignment

1. **Screen Location:** Mounted in communication / marketing section under `src/modules/tools/OfferCampaigns.tsx` (accessible to Owner, Admin, Manager).
2. **Five Screen States:**
   - **Loading:** Skeleton table of existing campaigns.
   - **Empty:** Clean call-to-action explaining how offer broadcasts work and that opted-out clients are automatically excluded.
   - **Error:** Inline error banners for failed previews or submission errors.
   - **Restricted:** Clear "Restricted to Owner, Admin, and Manager" banner for unauthorized staff seats.
   - **Offline:** Clear indicator that marketing campaigns require active connectivity; offline queueing is strictly disabled.
3. **Drafting Workflow:**
   - Step 1: Compose (Subject, Body Markdown, Hero Image, Action Button).
   - Step 2: Audience Filter (All active clients vs Tags vs Membership).
   - Step 3: Live Preview & Test Send (Dispatches preview email to logged-in user).
   - Step 4: Final Audience Count Confirmation ("Ready to broadcast to 42 clients").
   - Step 5: Send & Track (Displays delivery progress bar: Sent / Failed / Unsubscribed).

---

## 7. Verification Gates & Review Checklist

Before opening implementation PR, this design note must pass Claude and Babin check-in review:
- [x] Does it honor Owner, Admin, Manager only (B43)?
- [x] Does it strictly exclude opted-out clients from receiving emails (B34)?
- [x] Does it require an unsubscribe link and `List-Unsubscribe` header (K6)?
- [x] Does it require pre-flight test email before broadcasting?
- [x] Does it prevent client email harvesting by resolving recipients server-side?
- [x] Does it enforce RFC-compliant one-click unsubscribe?
- [x] Does it maintain English for client communications (W80)?
- [x] Does it deny Coordinator and Warehouse roles in Postgres?

# T4-08 Security Design Note: One-Time Rider Link

**Date:** 2026-10-31  
**Author:** Gemini (Lane B)  
**Status:** Awaiting Claude & Babin Review  
**Card:** [`docs/plans/T4_SHARED_TOOLS.md`](../plans/T4_SHARED_TOOLS.md) · Prompt: [`docs/plans/prompts/T4-08.md`](../plans/prompts/T4-08.md)  
**Rulings Cited:** W49, W46, Law 6, Law 3, Law 8, PERMISSIONS §3/§7  

---

## 1. Executive Summary & Purpose (W49)
Babin Rentals frequently hires external delivery riders for single drop-offs and collections. Because hired riders change daily and do not have staff accounts, staff need to generate a temporary, job-specific link from the delivery desk. The rider opens this link on their mobile browser without logging in, views pickup and delivery details, records pickup from the shop, captures receiver signature upon delivery, and marks the job complete. Once delivered, failed, revoked, or after 24 hours, the link ceases to function.

---

## 2. Threat Model & Mitigations

| Threat | Risk Level | Mitigation & Enforcement |
|---|---|---|
| **Token Brute-Force / Guessing** | Critical | 128-bit cryptographically secure random token (URL-safe base64, 22+ chars). Raw token is **never stored in the database**; only `token_hash` (`sha256(token)`) is persisted in Postgres. A guessed token cannot match. |
| **Monetary & Pricing Leakage (Law 6)** | Critical | The rider endpoint and UI are strictly money-blind. Neither rental prices, delivery fees, deposits, invoice totals, nor client credit status are included in the query or returned in the JSON payload. Enforced at the Postgres view/RPC layer. |
| **Cross-Tenant / Cross-Job Hopping** | High | The rider token is strictly scoped to a single `job_id`. The lookup query is `WHERE token_hash = sha256($1) AND expires_at > now() AND revoked_at IS NULL`. No enumerating or browsing other jobs. |
| **Replay / Double Delivery** | High | Atomic state transition: delivery completion sets `completed_at = now()` and transitions `delivery_jobs.status = 'Delivered'`. A completed, failed, or revoked link immediately refuses further reads and writes. |
| **Tampering with Job Details** | Medium | The rider has read-only access to dispatch address, contact, and item/case count. Rider write capability is restricted to two idempotent state transitions: `mark_picked_up` and `complete_delivery(receiver_name, signature_svg, photo_url)`. |
| **Stale / Zombie Links** | Medium | Hard 24-hour expiration ceiling (`expires_at = created_at + interval '24 hours'`). Staff can manually revoke the link at any moment via the delivery workspace. |

---

## 3. Data Model & Migration Schema

### 3.1 Table: `delivery_job_links`
Claim next free migration number in `docs/plans/MIGRATION_LEDGER.md` (e.g. `0199_one_time_rider_links.sql`).

```sql
CREATE TABLE public.delivery_job_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  rider_name text NOT NULL,
  rider_phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  revoked_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  CONSTRAINT delivery_job_links_token_hash_len CHECK (char_length(token_hash) = 64)
);

CREATE INDEX idx_delivery_job_links_lookup 
  ON public.delivery_job_links (token_hash) 
  WHERE revoked_at IS NULL AND completed_at IS NULL;
```

### 3.2 RLS & Access Policies
- `delivery_job_links` has **RLS enabled**:
  - `anon` has **NO DIRECT TABLE ACCESS** (`SELECT`, `INSERT`, `UPDATE`, `DELETE` are denied to `anon` and `authenticated`).
  - Access is mediated solely through SECURITY DEFINER RPCs pinned to `search_path = public` or Edge Function with service-role token.
  - Staff (`Coordinator`, `Manager`, `Owner`, `Admin`) can view active links via an authenticated view joined to `delivery_jobs`.

---

## 4. Database RPCs & Edge Function Contract

### 4.1 RPC: `get_rider_job_by_token(p_token_hash text)`
- **Callable by:** `anon` (or Edge Function).
- **Validation:**
  - `expires_at > now()`
  - `revoked_at IS NULL`
  - `completed_at IS NULL`
- **Returns JSON:**
  ```json
  {
    "job_id": "...",
    "job_number": "DEL-2026-0042",
    "status": "Assigned",
    "pickup_address": "Babin Rentals, Putalisadak, Kathmandu",
    "delivery_address": "Horizon Studios, Sanepa, Lalitpur",
    "contact_name": "Suman Gurung",
    "contact_phone": "9801234567",
    "case_count": 3,
    "case_labels": ["Cam-A Case", "Prime Lens Kit", "Tripod Bag"],
    "notes": "Gate code #4412, call upon arrival",
    "rider_name": "Kiran Rider",
    "expires_at": "2026-11-01T08:00:00Z"
  }
  ```
  *(Notice: Absolutely zero rates, line prices, fees, or monetary figures).*

### 4.2 RPC: `complete_rider_delivery(p_token_hash text, p_receiver_name text, p_signature_svg text, p_photo_url text, p_client_uuid uuid)`
- **Validates token and atomicity**:
  - Updates `delivery_job_links.completed_at = now()`.
  - Updates `delivery_jobs.status = 'Delivered'`, `delivered_at = now()`, `receiver_name`, `signature_svg`, `delivery_photo_url`.
  - Appends to `audit_events` recording rider action with link id and rider name.
  - If token is already used or expired, throws an exception and refuses the update.

---

## 5. UI Architecture & Routing
- **Public Route:** Isolated entry `src/rider.html` / route `/rider/:token` (lightweight standalone bundle, no main app shell, no navigation rail, mobile-first touch layout).
- **Floor Verb Targets:** Big 56px action buttons ("Confirm Pickup", "Submit Signature & Complete").
- **Offline & Connectivity:** If rider drops connection in the basement, signature is held locally in memory until connection resumes or displays a clear offline retry prompt.

---

## 6. Review Gate & Checklist
- [x] Design note completed with threat model, RLS rules, and Law 6 money blindness guarantees.
- [ ] Claude & Babin review design note at next check-in.
- [ ] Claim migration in `docs/plans/MIGRATION_LEDGER.md`.
- [ ] Implement migration + lifecycle steps (`check:pglite` and `check:lifecycle`).
- [ ] Implement Edge Function / RPC and `/rider/:token` UI.

# T4-08 Security Design Note: One-Time Rider Link

**Date:** 2026-10-31 · Updated 2026-11-01 (Review Fixes R1–R5)  
**Author:** Gemini (Lane B)  
**Status:** Implemented & Verified (R1–R5 complete)  
**Card:** [`docs/plans/T4_SHARED_TOOLS.md`](../plans/T4_SHARED_TOOLS.md) · Prompts: [`docs/plans/prompts/T4-08.md`](../plans/prompts/T4-08.md) & [`docs/plans/prompts/T4-08-fixes.md`](../plans/prompts/T4-08-fixes.md)  
**Rulings Cited:** W49, W46, Law 6, Law 3, Law 8, PERMISSIONS §3/§7.1, RULINGS-2026-11-01 (R1–R5)  

---

## 1. Executive Summary & Purpose (W49)
Babin Rentals frequently hires external delivery riders for single drop-offs and collections. Because hired riders change daily and do not have staff accounts, staff need to generate a temporary, job-specific link from the delivery desk. The rider opens this link on their mobile browser without logging in, views pickup and delivery details, records pickup from the shop, captures receiver signature upon delivery, and marks the job complete. Once delivered, failed, revoked, or after 24 hours, the link ceases to function.

---

## 2. Threat Model & Mitigations (Updated for R1–R5)

| Threat | Risk Level | Mitigation & Enforcement |
|---|---|---|
| **Token Brute-Force / Guessing** | Critical | 128-bit+ cryptographically secure random token generated on the server (`replace(gen_random_uuid()::text \|\| gen_random_uuid()::text, '-', '')`). Raw token is **never stored in the database**; only `token_hash` (`sha256(token)`) is persisted in Postgres. A guessed token cannot match. |
| **Authenticated Session Token Probing (R1, D-10.6)** | Critical | Rider-facing RPCs (`get_rider_job_by_token`, `rider_mark_picked_up`, `rider_complete_delivery`) are granted exclusively to `service_role`. They are revoked from `authenticated`, `anon`, and `public`. Calling them as any signed-in user or stranger is refused at the grant. |
| **Staff Credential Harvesting (R1)** | High | The `token_hash` column is explicitly excluded from the `authenticated` SELECT grant on `delivery_job_links`. Direct `SELECT token_hash` by Coordinator or Warehouse is refused by Postgres at the column level. |
| **Mutation Replays / Law 8 Violations (R2)** | High | `delivery_job_links.client_uuid` is `NOT NULL UNIQUE`. Calling `create_rider_link` with the same `client_uuid` returns `{ link_id, already_issued: true }` without re-minting a raw token or duplicating rows. |
| **Monetary & Pricing Leakage (Law 6)** | Critical | The rider endpoint and UI are strictly money-blind. Neither rental prices, delivery fees, deposits, invoice totals, nor client financial statuses are included in the query or returned in the JSON payload. Enforced at the Postgres view/RPC layer. |
| **Cross-Tenant / Cross-Job Hopping** | High | The rider token is strictly scoped to a single `job_id`. The lookup query is `WHERE token_hash = $1 AND expires_at > now() AND revoked_at IS NULL AND completed_at IS NULL`. No enumerating or browsing other jobs. |
| **Replay / Double Delivery** | High | Atomic state transition: delivery completion sets `completed_at = now()` and transitions `delivery_jobs.status = 'Delivered'`. A completed, failed, or revoked link immediately refuses further reads and writes. |
| **Information Leakage via Error Messages (R4)** | Medium | In `supabase/functions/rider-link`, error codes (e.g. `42501`) map to a uniform message: `"This link is no longer valid"`. Raw tokens, hashes, phone numbers, and rider names are never logged. |
| **Stale / Zombie Links** | Medium | Hard 24-hour expiration ceiling (`expires_at = created_at + interval '24 hours'`). Staff can manually revoke the link at any moment via the delivery workspace. |

---

## 3. Data Model & Migration Schema (0190_one_time_rider_links.sql)

```sql
create table public.delivery_job_links (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  rider_name text not null check (length(btrim(rider_name)) >= 2),
  rider_phone text not null check (length(btrim(rider_phone)) >= 7),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id),
  completed_at timestamptz,
  created_by uuid not null references public.users(id),
  constraint delivery_job_links_expires_after_created check (expires_at > created_at)
);

create index delivery_job_links_token_hash_idx on public.delivery_job_links(token_hash)
  where revoked_at is null and completed_at is null;
create index delivery_job_links_job_id_idx on public.delivery_job_links(job_id);
create index delivery_job_links_client_uuid_idx on public.delivery_job_links(client_uuid);

alter table public.delivery_job_links enable row level security;

-- Column-level grant: staff can inspect metadata, but NEVER the token_hash (R1)
revoke all on public.delivery_job_links from public, anon, authenticated;
grant select (id, client_uuid, job_id, rider_name, rider_phone, created_at, expires_at, revoked_at, revoked_by, completed_at, created_by)
  on public.delivery_job_links to authenticated;
grant all on public.delivery_job_links to service_role;
```

---

## 4. Verification & Gates (L47 in scripts/e2e-lifecycle.mjs)
1. **R1 / D-10.6 Execution Grant Verification**:
   - `has_function_privilege('authenticated', 'get_rider_job_by_token(text)', 'EXECUTE')` = `false`.
   - `has_function_privilege('authenticated', 'rider_mark_picked_up(text)', 'EXECUTE')` = `false`.
   - `has_function_privilege('authenticated', 'rider_complete_delivery(text, text, text, text)', 'EXECUTE')` = `false`.
   - `has_column_privilege('authenticated', 'delivery_job_links', 'token_hash', 'SELECT')` = `false`.
   - `has_function_privilege('service_role', ..., 'EXECUTE')` = `true`.
2. **R2 Idempotency**:
   - Calling `create_rider_link` twice with the same `client_uuid` leaves exactly one row in `delivery_job_links`.
   - Replay returns `already_issued: true` and `raw_token: null`.
3. **R3 Server-Minted Token**:
   - Server mints token using core UUID entropy; raw token is returned once in JSON result.
   - Asserted that raw token text does not appear in `delivery_job_links` or `audit_events`.
4. **Law 6 Money Blindness**:
   - Asserted that JSON payload from `get_rider_job_by_token` contains zero money keywords (`paisa`, `price`, `rate`, `deposit`, `total_amount`, `discount`, `invoice`, `credit`).

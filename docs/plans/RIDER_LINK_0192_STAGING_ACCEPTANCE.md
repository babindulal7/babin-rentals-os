# Rider links — migration 0192 staging acceptance and release gate

Status: **draft, not run**. Intended for a **separately confirmed staging Supabase project**; do not run write tests or apply migrations to the only connected project without confirmation that it is staging. PR #39 is stacked on PR #37 and must not be deployed out of order.

## 1. Read-only preflight before even considering migration 0192

Confirm the target project ref is **staging**, not production. Verify migration 0190 and 0191 exist and 0192 is absent, and save a staging-only snapshot. Execute as a DBA/staging owner:

```sql
-- Zero rows required. Each row is a job with multiple not-revoked/not-completed links.
-- Do not print token_hash or raw URL credentials in logs.
select job_id, count(*) as active_link_count
from public.delivery_job_links
where revoked_at is null and completed_at is null
group by job_id
having count(*) > 1;

-- Metadata only; this is a potential count of expired-but-not-revoked links,
-- which the new server issuer will revoke when replacing each one.
select count(*) as expired_unclosed
from public.delivery_job_links
where revoked_at is null and completed_at is null and expires_at <= now();
```

A nonzero duplicate count is a **hard stop** for 0192's partial unique index. Review the affected jobs with their owners before resolving anything; do not automatically delete credentials or booking records. Confirm migration sequence, schema privileges, and user role/branch mapping on staging.

## 2. Isolated CI gates (mandatory)

For the final immutable PR head, require GitHub green for `npm run typecheck`, source lint, mock tests including `riderLink.edge.test.ts`, migration build from scratch, authenticated security regressions, `scripts/e2e-lifecycle.mjs` L47, production build, and coverage. The CI pipeline is isolated PGlite, **not** a real hosted Supabase JWT, Functions or RLS acceptance test.

Check the 0192 contract specifically:
- Only `service_role` can execute `issue_rider_link_server`; `anon` and `authenticated` are refused at PostgreSQL EXECUTE grants.
- `create_rider_link` is no longer callable by browser sessions, and `token_hash` stays unreadable to staff.
- A repeated `issue_request_key` returns the same link ID, `was_created = false`, and does not change the saved hash.
- A different key cannot create a second not-revoked/not-completed link for the same job, including simultaneous requests.
- Existing delivery, refund, VAT, money-blind and Team Notes test gates remain green.

## 3. Staging Edge and browser acceptance — do not use production clients

Deploy matching migration + Edge build + test UI to **staging** only, after the preflight is clear and a reviewer has approved the deployment. For each case capture status code, privacy-safe response shape, DB row counts and audit event; never capture raw bearer tokens in CI logs or tickets.

| Case | Expected |
| --- | --- |
| No JWT / invalid, expired or forged JWT on `action=issue` | 401; zero new links |
| Authenticated Client, Driver, Technician or Accounts issues | denied; zero new links |
| Owner/Admin allowed across branches; Manager/Coordinator/Warehouse only own branch | per policy; denied requests do not disclose whether a job exists |
| Valid Coordinator issues once | 200, raw 128-bit random token returned **once**, matching row contains only SHA-256 hash and 24h expiry |
| Replay same `request_key` | 409; no second raw token, no new row |
| Concurrent different keys for same job | at most one active link; second fails, no duplicate |
| Revoke then issue new key | new token works; revoked token unusable |
| Expired or completed link | read / pickup / delivery refused; no money fields or credential leak |
| Valid anonymous rider link, no login | money-blind job read, pickup, delivery work via Edge; direct browser RPCs remain denied |
| Cross-branch staff link list / forged job ID | no data leak / unauthorized mutation |
| Generic malformed/unknown/expired/revoked token | no financial figures or raw DB trace in HTTP errors |
| Double-tap and lost response | no second bearer token; operator must revoke/reissue |
| Old deployed client after 0192 | must fail closed; never recover direct RPC issuance |

Check public endpoint anti-abuse / rate limits and HTTP, logs and caching. `Cache-Control: no-store` must be honored, raw token must not appear in structured logs, analytics or audit rows; bearer URLs can still be copied or exposed via browser history and link sharing.

## 4. Release order and hard stop

Review and merge PR #36, then reconcile/review/merge PR #37, and only then rebase/retarget PR #39. Do not enable public rider links until staging approval. Any failed authorization, leaked money/token, duplicate active link, unexpected SQL permission or unverified Supabase project identity is **release-blocking**.

**No actions on live Supabase** are authorized by this runbook. Do not use it as approval to deploy or alter production.

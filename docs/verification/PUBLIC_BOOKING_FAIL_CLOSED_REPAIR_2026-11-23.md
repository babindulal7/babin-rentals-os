# T7-02 — Public catalogue and availability fail-closed repair (23 Nov 2026)

**Status:** Draft / test in progress / no deployment.  
**Repository:** `babindulal7/babin-rentals-os`  
**Related:** Cloudflare site separation draft PR #338.  
**Owner lanes:** Windows Antigravity = code and isolated browser testing; Mac = CI only.

## Problem confirmed in main

Before this isolated repair, `src/booking/lib/catalogueApi.ts` returned sample products whenever a live catalogue query failed or was legitimately empty. It also returned `available=true` for every queried product when the anonymous availability RPC failed. The item cards allowed adding stock with `undefined` availability if dates were selected, so an error or pending check could be treated as bookable.

The anonymous SQL `public_availability` API (migration 0255) returns one row per **published product and inclusive date**, at most 30 IDs, at most 60 days apart. It does not reserve stock. Actual allocation is decided by staff at confirmation.

## Changes in this PR

- Only explicit local `mock` and `test` modes use fixture catalogue and availability.
- Live catalogue query failures produce a visible retry error, **never fabricated products**; a truly empty published catalogue stays empty.
- Positive integer daily rates required; no leaked internal catalogue fields.
- Availability batches all product IDs in groups of 30, instead of silently ignoring item 31+.
- Every returned product/day pair must be present exactly once with a genuine boolean status before *any* availability can be declared verified. An invalid/missing/duplicate RPC row means the check fails.
- Product card and detail modal disallow adding unverified or unavailable stock and show a checking state rather than falsely claiming availability.
- Changing rental dates, catalogue or network status clears stale responses; explicit Retry is available when checks fail.
- Cart blocks checkout while availability is unverified; it is checked again immediately before the server-side request is submitted.
- Tests cover leap years, invalid/overlong ranges, missing product/day rows, duplicates and mixed availability.

## Safe verification (do not use live customer data)

```sh
npm ci
npm run typecheck
npm run lint
npx vitest run src/booking/__tests__/publicAvailabilitySafety.test.ts src/booking/__tests__/catalogue.test.ts src/booking/__tests__/cartCheckout.test.ts
npm run build
npm run check:pglite
npm run check:lifecycle
npm run check:security
npm test
```

**Browser smoke on an isolated local fixture/staging approved for read-only tests:**
- Mock-mode demo data still works and is clearly labeled.
- Live query error: no fixture items shown; retry visible.
- Legitimately empty catalogue: empty view, not demo stock.
- 2+ days with one unavailable day: Add disabled.
- Stale date or offline switch: Add and checkout disabled.
- RPC failure or incomplete response: no `Available` badge and no booking request submission.
- More than 30 published IDs: availability verified across all ID batches, no silently untested items.
- Concurrency: recheck immediately before submitting; server remains ultimate authority, inventory is **not held** by a request.
- Role/RLS isolation, public publish flags, money/price precision, 06:00 rental-day interpretation, VAT and manual confirmation need separate staged acceptance.
- Confirm client SPA does not include staff assets after rebasing or merging PR #338. PRs may be merged only after separate approval; neither should be automatically deployed.

## Outstanding blockers

- [ ] Exact PR head: local/tests CI full green.
- [ ] Independent acceptance on isolated/staging DB and browser screenshots (375/820/1440).
- [ ] Cloudflare Access enable + strict staff-domain and default Pages hostname protection.
- [ ] Review the public marketing site for invented endorsements, sample media, and fake contact details before exposure.
- [ ] Run security review of public booking RPC, abuse throttling, email and payment integrations.
- [ ] Rebase against PR #338 before merge and rerun both isolated-build artifacts.
- [ ] Owner release approval before DNS, custom domains, production deployment, or changing live Supabase.

**No automatic merge, publication, DNS change, SMTP send or live DB writes are authorized.**

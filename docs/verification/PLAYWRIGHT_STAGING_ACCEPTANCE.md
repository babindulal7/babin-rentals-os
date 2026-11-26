# Authenticated Playwright staging acceptance

## Safety and scope

- Dedicated staging project only: `klhmsrunqrdxjudyhnkm`; never use production credentials or data.
- Use three separate existing or newly provisioned test identities with approved Owner, Manager and Warehouse permissions. Verify role assignments in the application and Supabase; do not elevate or reset actual staff accounts.
- Set the following secrets through GitHub repository Settings > Secrets and variables > Actions, or load them in a local shell through a secret manager. Do not commit, print or paste passwords into chat.
  - BABIN_STAGING_SUPABASE_URL, BABIN_STAGING_ANON_KEY (publishable/anon only)
  - E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD
  - E2E_MANAGER_EMAIL, E2E_MANAGER_PASSWORD
  - E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD (Warehouse test identity)
- Browser screenshots, traces and videos stay disabled in authenticated runs until a safe redaction/retention policy is verified.
- CI is manual until the workflow is reviewed and the required secrets and runner capacity are verified.

## Run

```bash
npm ci
node --test tests/e2e/staging-guard.test.mjs
npx playwright install chromium webkit
npm run test:e2e
```

Local smoke runs may skip unavailable credentials; CI fails if any role's credentials are absent or if email identities are duplicated. The current tests exercise login and Operations route access; they do not assert the actual database role or full permission boundaries.

## Next acceptance batch (implemented in `tests/e2e/operations-p0-acceptance.spec.ts`; execution pending CI / staging run)

Seed isolated synthetic bookings using a reviewed staging-only fixture procedure (or `scripts/run-disposable-playwright.mjs` for disposable local CI). Never select arbitrary existing bookings for writes.

| Case | Spec / Coverage | Execution Status |
| --- | --- | --- |
| Pack, Next, Back | `operations-popup-navigation.spec.ts` (`BOOKED` / `PACKED`) & `operations-p0-acceptance.spec.ts` | Pending CI / staging run |
| Confirm succeeds | `operations-popup-navigation.spec.ts` (Packing) & `operations-p0-acceptance.spec.ts` (Retry + Return) | Pending CI / staging run |
| Confirm held | `operations-p0-acceptance.spec.ts` (Handover partial lines stays `Packed`) | Pending CI / staging run |
| Repeat identical failure | `operations-p0-acceptance.spec.ts` (2x write 500s unlock `Saving…` with 0 duplicate sessions) | Pending CI / staging run |
| Partial return | `operations-p0-acceptance.spec.ts` (1 of 2 returned stays `On Rent`, 2nd completes `Returned` → `Reset`) | Pending CI / staging run |
| Network failure / timeout | `operations-p0-acceptance.spec.ts` (`bookings` GET abort → `Retry booking status` recovers) | Pending CI / staging run |
| Cancel / close | `operations-p0-acceptance.spec.ts` (`Discard Changes` clears dirty marks with 0 writes) | Pending CI / staging run |
| Role restrictions | `operations-p0-acceptance.spec.ts`, `expense-persistence.spec.ts`, `payment-hold-acl.spec.ts` (Warehouse UI + API/DB `42501` denial + Law 6) | Pending CI / staging run |
| Desktop / iPad / mobile | `playwright.config.ts` & `playwright.disposable.config.ts` (`desktop`, `ipad`, `mobile`) | Pending CI / staging run |

No pass claim until real browser execution and appropriate persisted-state assertions succeed. Do not merge or deploy this test branch as a side effect of running tests.

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

## Next acceptance batch (not yet implemented or executed)

Seed isolated synthetic bookings using a reviewed staging-only fixture procedure. Never select arbitrary existing bookings for writes.

| Case | Required evidence |
| --- | --- |
| Pack, Next, Back | correct stage, no lost changes |
| Confirm succeeds | persisted session and authoritative stage; no permanent busy state |
| Confirm held | no false advance, navigation and retry recover |
| Repeat identical failure | no stuck lock, no duplicate mutation |
| Partial return | persisted returned quantities, stay on Return |
| Network failure / timeout | honest uncertainty, refresh/retry safely |
| Cancel / close | no unintended write, dirty-work warning where applicable |
| Role restrictions | UI and API/database denial, not merely hidden buttons |
| Desktop / iPad / mobile | execute each case and record exact source SHA |

No pass claim until real browser execution and appropriate persisted-state assertions succeed. Do not merge or deploy this test branch as a side effect of running tests.

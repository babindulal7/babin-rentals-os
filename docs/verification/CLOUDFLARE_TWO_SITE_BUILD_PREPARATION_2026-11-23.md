# Cloudflare two-site isolated build — preparation evidence (23 November 2026)

**Scope:** T1-07, deployment preparation only. **Status: PREPARED / NOT DEPLOYED / NOT ACCEPTED.**

## Hosting projects created, automation disabled

| Project | Proposed hostname | GitHub build | Artifact | Production auto-deploy | Preview |
| --- | --- | --- | --- | --- | --- |
| `babin-rentals-app` | `app.babinrentals.com` | `npm run build:staff` | `dist-staff` | disabled | disabled |
| `babin-rentals-client` | `client.babinrentals.com` | `npm run build:client` | `dist-client` | disabled | disabled |

Both Pages projects share source repository `babindulal7/babin-rentals-os`, branch `main`, but create **separate outputs**. Neither has a Pages deployment or custom domain. Namecheap DNS, existing `babinrentals.com`, Resend DNS, Supabase and GitHub main are untouched.

## What is implemented on this draft PR

- `vite build --mode staff`: only ops `index.html`, existing PWA, `dist-staff`.
- `vite build --mode client`: only `marketing.html` + `booking.html`, no staff app entry/PWA, `dist-client`.
- Post-build step makes marketing the client `index.html`, allows only explicit public booking aliases, adds `404.html` to disable accidental SPA fallback to staff routes, and strips sample pages/service-worker artifacts.
- Both preview builds use `robots.txt` disallow-all until expressly approved for publication.
- Hosted preflight rejects missing public Supabase configuration, service/secret keys and development mock/auth-bypass flags; only the **publishable** / **legacy anon** key belongs in client bundles.
- Static checks confirm expected Vite entrypoints, no client PWA, no cross-site HTML entries, expected redirects, and public 404 behavior.

## Local review steps (Windows Antigravity; CI runs on Mac)

Run in an isolated checkout of the draft branch (never overwrite `main` or live `.env`):

```bash
npm ci
npm run typecheck
npm run lint
npm run build:staff
npm run build:client
npm run verify:sites
npm run check:pglite
npm run check:lifecycle
npm run check:security
npm test
```

Browser smoke, using a **locally built staging fixture** and never a connected live database:

1. Preview `dist-staff` with its own preview server and verify `/today`, `/rentals`, `/inventory`, `/login`, browser refresh, and restricted roles. Verify no `/marketing.html` or `/booking.html` deployed.
2. Preview `dist-client` separately and verify `/` marketing, `/booking` and `/booking.html` booking, modal and client login. Verify `/finance`, `/today`, `/admin`, `/settings` do not serve the staff app.
3. Verify direct and back/forward navigation, a 404 on unknown client routes, no JS errors or source maps, HTTP headers, page screenshots at widths 375/820/1440, and inaccessible staff data in client network traces.
4. Test offline and reinstall behavior on the staff PWA; client host must have **no staff service-worker scope**.
5. Repeat role-isolation, RLS, pricing and availability tests on **staging** after separate owner authorization, before allowing external clients.

The static checks do not establish actual production browser behavior or live RLS: never claim this is launch-accepted merely because CI is green.

## Launch blockers — must be resolved before any deployment or DNS change

- [ ] Local full gates passed and exact-head Mac CI green, with evidence and independent review.
- [ ] Configure `VITE_SUPABASE_URL` and the public **anon/publishable** `VITE_SUPABASE_ANON_KEY` for the intended isolated staging/production target; confirm no service-role key, no mock mode, and correct RLS.
- [ ] **Cloudflare Access:** shield staff host before exposing any staff bundle publicly. Use explicit allow list, tested owner recovery and independent sign-in security; validate no public bypass. A subdomain itself is NOT access control. If Access cannot cover the Pages default hostname, protect default Pages hostname as well before deployment.
- [ ] Resolve money-role MFA enforcement and login-audit acceptance; do not rely on a React-only permission mask.
- [ ] Public catalogue's current live error/empty fallback to MOCK_CATALOGUE and current availability RPC error fallback to true are **NOT safe for launch**. Lane C must implement fail-closed real pricing/availability, explicit loading/error states, and prove it with database-level tests before public rollout. Do not misrepresent fixture products as available.
- [ ] Marketing page contains placeholder phone `+9779801234567`, generic stock `picsum.photos` imagery, sample/invented named endorsements, and membership claims not confirmed for publishing. Replace with approved real contact info/assets/terms; remove fictitious testimonials. Verify all public content and privacy statements.
- [ ] Verify cart and manual-approval request flow, customer isolation, bot/rate abuse, emails, payment integrations and offline truth in isolated staging. Never use real clients or send real email during test without owner approval.
- [ ] Verify Cloudflare project output, deployed Pages URLs, browser smoke and TLS before connecting CNAMEs in Namecheap.
- [ ] Only then connect Namecheap CNAMEs (`app` → confirmed staff `*.pages.dev`; `client` → confirmed client `*.pages.dev`) and register each hostname as a Pages custom domain. Preserve `@`, `www`, SPF/DKIM/MX/Resend and existing website. No nameserver transfer.
- [ ] Rollback plan, owner acceptance, and independent security signoff before production activation, automatic deployment or DNS switch.
- [ ] At public launch, review `robots.txt` disallow-all to avoid accidentally suppressing intended catalogue indexing.

## Live action boundary

**Authorized now:** isolated code edits, draft PR, local/CI tests, and non-deployed Pages build configuration. **Not authorized:** staging/production database writes, secrets, hosted publication, custom domain binding, Namecheap DNS changes, migrations, automatic merges/deploys, live email or payment transactions.

## Outcome

A successful PR creates build artifacts suitable for security and usability review, **not a live site**. Keep T1-07 `doing` / `acceptance_pending` until hosting, Cloudflare Access, staging and owner release gates are demonstrated.

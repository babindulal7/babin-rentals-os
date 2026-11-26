# Cloudflare Worker Builds preview configuration — 2026-11-26

This PR is a **draft configuration proposal**, not release authorization. No production deployment or live DNS change is authorized.

## Evidence and root causes

- Cloudflare Workers Builds preview for the Resend PR failed on 26 Nov with `npx wrangler preview`: `Your Wrangler configuration is missing a previews block`.
- An earlier production Worker build failed with Cloudflare error **100324**, an infinite loop from `public/_redirects` (its catch-all `/* /index.html 200`).
- Cloudflare has `babin-rentals-os` script configured for `npm run build`, production deploy `npx wrangler deploy`, and preview deploy `npx wrangler preview`. The current production Worker compatibility date is `2026-11-22`.
- The repository currently has **no tracked Wrangler config**; Wrangler has been auto-detecting a static-assets config.
- Separate PR #411 already proposes changing the legacy Pages redirect file; this PR avoids modifying its content and instead excludes that file from **Workers Static Assets** with `.assetsignore`.

## Proposed changes

- `wrangler.jsonc` pins the existing Worker name/compatibility date and the build output directory `dist`, uses first-party `assets.not_found_handling = single-page-application` for SPA deep links, and adds the required `previews: {}` block.
- `public/.assetsignore` is copied by Vite into `dist/.assetsignore`; `_redirects` stays in the source tree and Pages builds but is not included as a Workers Static Assets redirect rule.
- No API tokens, secrets, bindings, DNS records, environment overrides, or production data have been added.

## Verification and safety gates

1. Validate that Vite still builds `dist/index.html`, `dist/marketing.html`, and `dist/booking.html`.
2. Verify `dist/.assetsignore` exists after Vite build and excludes only `_redirects` from Workers upload.
3. Confirm `npx wrangler preview` succeeds for a non-production PR and deep SPA links resolve to `index.html`; confirm static documents still load as their own HTML.
4. Check no public preview is connected to a production Supabase backend or credential. If any such binding is found, **stop** and do not use the preview.
5. Before **any merge**, separately review what Cloudflare Workers Builds does on a push to `main`. It currently has an enabled automatic production deploy command. Do not merge until the owner explicitly authorizes a deployment strategy and production configuration.
6. Preserve any separate Cloudflare Pages website/client-portal deployment; review interaction with PR #411.

Cloudflare docs (26 Nov 2026):
- https://developers.cloudflare.com/workers/previews/configuration/
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/

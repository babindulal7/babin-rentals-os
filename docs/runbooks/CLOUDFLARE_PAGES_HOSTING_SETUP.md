# Cloudflare Pages, Access & DNS Setup Runbook (T1-07)

**Author:** Application Verification / Hosted Readiness Owner  
**Card:** T1-07 · Hosting on Cloudflare Pages  
**Scope:** Production & Staging hosting configuration for Babin Rentals OS (`babinrentals.com`)

> [!IMPORTANT]
> **Owner-Gated Action:** Do NOT change production DNS records, create live Pages projects, or expose staging endpoints until Babin (Owner) approves and coordinates during the deployment window.

---

## 1. Architecture Overview

Babin Rentals OS uses **Cloudflare Pages** for global static asset hosting and SPA delivery:
- **Staff Production App:** `app.babinrentals.com` (connected to production Supabase)
- **Staff Staging App:** `staging-app.babinrentals.com` (connected to isolated staging Supabase, protected by Cloudflare Access)
- **Public Booking Site:** `book.babinrentals.com` (arriving with T7-02)
- **Public Static Marketing:** Serviced via `/marketing.html` from the same origin

---

## 2. Cloudflare Pages Project Configuration

### 2.1 Project Setup (via Cloudflare Dashboard)
1. Log in to Cloudflare Dashboard ▸ **Workers & Pages** ▸ **Create application** ▸ **Pages** ▸ **Connect to Git**.
2. Select repository: `babindulal7/babin-rentals-os`.
3. Configure two projects:
   - **Project 1: `babin-rentals-os-prod`** (Production)
     - Production branch: `main`
     - Framework preset: `Vite`
     - Build command: `npm run build`
     - Build output directory: `dist`
   - **Project 2: `babin-rentals-os-staging`** (Staging)
     - Production branch: `lane-a/T1-infra-wave-a-readiness` (or staging release tag)
     - Build command: `npm run build`
     - Build output directory: `dist`

### 2.2 Build-Time Environment Variables

| Variable | Staging Project Value | Production Project Value | Note |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `https://<staging-ref>.supabase.co` | `https://sxguwvgoserhdolewibb.supabase.co` | HTTPS origin only |
| `VITE_SUPABASE_ANON_KEY` | `<staging-anon-key>` | `<production-anon-key>` | **ANON key only** — never service_role |
| `VITE_SENTRY_DSN` | *(optional Sentry DSN)* | *(optional Sentry DSN)* | For T1-08 error tracking |
| `VITE_APP_VERSION` | `v1.0.0-staging` | `v1.0.0` | Git release tag |
| `NODE_VERSION` | `20` or `22` | `20` or `22` | Compatible Node runtime |

---

## 3. Headers and Routing Rules (`public/_headers` & `public/_redirects`)

These files in the repository root are automatically picked up and deployed by Cloudflare Pages:

1. **`public/_headers`:**
   - Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`
   - Scanner permissions: `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
   - Strict Content Security Policy (CSP) allowing Supabase and Sentry domains
   - Caching control:
     - `/assets/*`: `public, max-age=31536000, immutable` (Vite content-hashed assets)
     - `/sw.js`, `/registerSW.js`: `no-cache, no-store, must-revalidate` (PWA autoUpdate reliability)
     - `/*.html`, `/manifest.webmanifest`: `no-cache, must-revalidate`
2. **`public/_redirects`:**
   - Explicit 200 pass-through for `/marketing.html`
   - Single-Page Application (SPA) fallback `/* /index.html 200` to support direct deep links (`/today`, `/rentals/B-715`, `/operations/packing`) without 404s.

---

## 4. Cloudflare Access for Staging Protection

To satisfy the acceptance criterion: *"an unauthenticated visitor to staging-app. meets the Access login"*:

1. In Cloudflare Zero Trust Dashboard ▸ **Access** ▸ **Applications** ▸ **Add an application**.
2. Select **Self-hosted**.
3. **Application Name:** `Babin Rentals OS — Staging`
4. **Application Domain:** `staging-app.babinrentals.com`
5. **Session Duration:** 24 hours.
6. **Policy Configuration:**
   - Policy Name: `Authorized Staff & Reviewers`
   - Action: `Allow`
   - Include Rule:
     - **Emails / Domain:** `@babinrentals.com` or specific reviewer emails (Babin + Lane A).
     - Identity Provider: One-Time PIN (OTP) email or Google Workspace.
7. Save application. Any request to `staging-app.babinrentals.com` without a valid Cloudflare Access JWT cookie is intercepted with an OTP login screen.

---

## 5. DNS Configuration Checklist (Babin / Domain Registrar)

At the authoritative DNS provider for `babinrentals.com`, configure the following CNAME records:

| Record Type | Host / Name | Target Value | Proxy Status | Purpose |
|---|---|---|---|---|
| `CNAME` | `app` | `babin-rentals-os-prod.pages.dev` | Proxied (Orange Cloud) | Production staff app |
| `CNAME` | `staging-app` | `babin-rentals-os-staging.pages.dev` | Proxied (Orange Cloud) | Staging app (with Access) |
| `CNAME` | `book` | `babin-rentals-os-prod.pages.dev` | Proxied (Orange Cloud) | Online booking (T7-02) |

---

## 6. Local Verification Procedure

Before deployment, verify locally on the M4 Mac mini:

```bash
# 1. Clean build
npm run build

# 2. Local production preview
npm run preview -- --port 4173

# 3. Test deep links and marketing file:
curl -I http://localhost:4173/rentals/new
curl -I http://localhost:4173/marketing.html
curl -I http://localhost:4173/sw.js
```
Confirm:
- Deep links serve `200` (index.html).
- `/marketing.html` serves real marketing HTML.
- Header rules match `public/_headers`.

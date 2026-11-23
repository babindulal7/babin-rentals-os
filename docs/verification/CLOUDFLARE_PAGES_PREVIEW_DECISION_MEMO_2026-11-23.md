# Decision Memo — Cloudflare Pages Build Separation vs Wrangler Preview (PR #338)

**Date:** 23 November 2026  
**Document ID:** `MEMO-2026-11-23-CLOUDFLARE-PAGES-PREVIEW`  
**Target:** PR #338 (`build(T1-07): isolate Cloudflare staff and client artifacts (prelaunch HOLD)`)  
**Status:** **Awaiting Owner Decision / Pre-Launch HOLD**  
**Reviewer:** Babin Dulal (Owner)  
**Author:** Windows Antigravity

---

## 1. Context and Problem Statement

PR #338 successfully implemented artifact and Vite configuration separation for Babin Rentals OS:
- `build:staff` compiles the operations SPA + PWA into `dist-staff`.
- `build:client` compiles the marketing and public booking interface into `dist-client` with a fail-closed 404 handler and zero staff routing.
- All local verification gates passed (`typecheck`, `lint`, `verify:sites`, `check:pglite`, `check:lifecycle`).

However, during continuous integration and preview automation, an error occurred when `npx wrangler preview` was invoked:
```text
Error: No wrangler.toml found or invalid project configuration: missing 'previews: {}'
```

---

## 2. Root Cause Analysis

1. **Pages vs Workers Architecture Discrepancy:**
   - **Cloudflare Pages** is designed for static site generation (SSG) and single-page apps (SPAs) such as Vite builds (`dist-staff` and `dist-client`).
   - **Cloudflare Workers** is designed for edge compute functions, requiring a `wrangler.toml` specifying a Worker entry script and edge routing.
   - The command `npx wrangler preview` is a legacy **Cloudflare Workers** command. It searches for a `wrangler.toml` with worker configurations (`previews: {}`) and attempts to spin up an edge worker runtime.

2. **No Workers Config in Repository by Design:**
   - Babin Rentals OS intentionally uses standard, immutable Cloudflare Pages hosting for frontend static assets.
   - Because no serverless worker was planned or authorized, no `wrangler.toml` existed in the repository.
   - Attempting to run a Workers preview command against a Pages project is a harness configuration mismatch, not a defect in the Vite build outputs.

---

## 3. Evaluated Options for Owner Decision

### Option A: Pure Cloudflare Pages Automation (Recommended)
- **Description:** Align CI and preview scripts with the Cloudflare Pages CLI:
  ```bash
  # Staff App preview / deployment
  npx wrangler pages dev dist-staff --port 3000
  # Client Portal preview / deployment
  npx wrangler pages dev dist-client --port 3001
  ```
  In GitHub Actions, use Cloudflare's official Pages Action (`cloudflare/pages-action`) or direct Git integration with automatic branch deployments disabled (manual promotion only).
- **Pros:**
  - 100% architectural fidelity with the target Cloudflare Pages platform.
  - Zero added dependencies or configuration cruft (`wrangler.toml` not needed).
  - Preserves clean asset isolation without edge compute attack surface.
- **Cons:**
  - Requires adjusting any external CI runner configuration that blindly executed `wrangler preview`.

### Option B: Add a Synthetic `wrangler.toml` Worker Shim
- **Description:** Commit a minimal `wrangler.toml` with `pages_build_output_dir = "dist-staff"` and a dummy `previews: {}` block to appease legacy Workers commands.
- **Pros:**
  - Silences `wrangler preview` without changing CI scripts.
- **Cons:**
  - Confuses the repository architecture by conflating Workers and Pages.
  - Violates ECC and Clean Code principles by introducing dummy configurations for broken harness commands.
  - Does not provide an accurate preview of the actual dual-site Pages setup.

---

## 4. Recommendation & Next Actions

1. **Adopt Option A:** Confirm that `babin-rentals-app` and `babin-rentals-client` are hosted exclusively on Cloudflare Pages.
2. **Pre-Launch HOLD Reminders:**
   - Do **NOT** enable automatic deployments in Cloudflare dashboard.
   - Do **NOT** add custom domain bindings (`app.babinrentals.com` / `book.babinrentals.com`) until Cloudflare Access is configured to shield the staff app.
   - Replace placeholder assets, mock catalogue fallback, and draft marketing text before public release.

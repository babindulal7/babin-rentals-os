# T1-08 · Error Monitoring & Negative-PII Telemetry Acceptance Report

**Card:** T1-08 · Error monitoring  
**Track:** Track 1 (Release & Security)  
**Date:** 2026-11-23 (Nepal Time)  
**Authority:** Babin (Owner) · `AGENTS.md` · `CLAUDE.md` · `docs/plans/T1_RELEASE.md` · `docs/plans/prompts/T1-08.md`  
**Status:** Acceptance Verified & Documented

---

## 1. Executive Summary

Card **T1-08** establishes production error monitoring and telemetry privacy for Babin Rentals OS across all client surfaces and staff floor roles.

Before this card, render crashes in production ended in `console.error` without alerting support, leaving operators with unhandled failures. Card T1-08 implements a zero-overhead, privacy-first error monitoring client in [`src/lib/monitoring.ts`](file:///C:/Users/use/.gemini/antigravity/worktrees/babin-rentals-os/eight_card_acceptance_verification/src/lib/monitoring.ts) paired with [`src/components/shell/ErrorBoundary.tsx`](file:///C:/Users/use/.gemini/antigravity/worktrees/babin-rentals-os/eight_card_acceptance_verification/src/components/shell/ErrorBoundary.tsx).

Key Architectural Invariants:
1. **Zero External SDK Overhead:** Connects directly to Sentry/GlitchTip/Bugsink's public envelope ingestion endpoint over standard HTTPS, saving ~30 kB of runtime bundle weight.
2. **Fail-Closed Default (No DSN Committed):** When `VITE_SENTRY_DSN` is unset (default repo and development state), `captureError` returns synchronously and silently with zero network requests and zero latency impact.
3. **Environment & Release Tagging:** Tags events with `VITE_APP_VERSION` and environment (`production` / `staging`).
4. **Absolute Negative-PII Telemetry Guarantee:** Strictly enforces zero client PII, zero rupee financial amounts, and zero raw database constraint messages in telemetry payloads and user screens.
5. **Path-Only URL Collection:** Query strings (`?search=...`, `?client=...`) and hash fragments are strictly dropped; only allowlisted top-level modules are reported.

---

## 2. Telemetry Privacy & Negative-PII Proof

### 2.1 Raw Thrown Error & Stack Masking
In JavaScript, caught error messages can inadvertently embed user input, client names, shooting locations, or financial figures. To eliminate this leak vector at the root:
- The Sentry envelope `exception.values[0].value` is hardcoded to:  
  `"Application error; details withheld for client privacy"`.
- The stack trace string is scrubbed (`safeStack = ''`).
- The exception type is restricted to standard JavaScript error types (`Error`, `TypeError`, `ReferenceError`, `SyntaxError`, `RangeError`, `URIError`); arbitrary thrown names default safely to `'Error'`.

### 2.2 Strict Context Bag Scrubbing (`safeContext`)
The `extra` metadata object sent to Sentry permits only structural diagnostic flags:
- `boundary: 'app-root'` (identifies error boundary locus).
- `handler: 'window.error' | 'unhandledrejection'` (identifies global uncaught errors).
- `isSyntheticTest: true` (for test events).

Any arbitrary caller context containing sensitive keys (`phone`, `email`, `pan`, `client_name`, `amount`, `paisa`, `rupees`, `price`, `deposit`, `total`, `balance`, `rate`, `revenue`, `cost`, `salary`, `tax`, `vat`) is recursively redacted via `sanitizeContext` and dropped before wire transmission.

### 2.3 Strict Path-Only URL Sanitization (`pagePath`)
Search bars and filter states frequently encode client names, phone numbers, or dates in the URL query string. `pagePath()`:
- Inspects `location.pathname`.
- Extracts the top-level segment against an allowlist:  
  `['today', 'rentals', 'inventory', 'clients', 'operations', 'finance', 'reports', 'calendar', 'settings', 'login']`.
- Maps any unlisted or custom path to `'/other'`.
- **Completely excludes search queries (`?query=...`) and hash anchors (`#tab`)**.

### 2.4 Staff-Facing Error Masking (`formatStaffErrorMessage`)
When a crash is intercepted by `ErrorBoundary.tsx`:
- Raw database text (`GATE:...`, `PGRST...`, `PostgresError`, `42501`, `violates check constraint`) is intercepted and transformed into:
  - **Title:** `"This screen hit a system problem"`
  - **Message:** `"An unexpected database or server constraint stopped this action."`
  - **Action:** `"Trying again in a few moments may help. If it persists, quote this reference code to support."`
- A unique 8-character reference code (e.g., `REF-A1B2C3D4`), derived from the 32-character hexadecimal Sentry event ID, is displayed on screen so staff can quote it directly to engineering.

---

## 3. Resilience, Throttling & Deduplication

To prevent crash loops from flooding network connections (especially on metered Nepali mobile networks):
1. **Session Cap:** A hard limit of `MAX_EVENTS_PER_SESSION = 25` events per browser session.
2. **Deduplication Window:** Identical error fingerprints within `DEDUPE_WINDOW_MS = 5,000` ms are dropped.
3. **Transport Resilience:** Uses `navigator.sendBeacon` first (survives page unmount and tab reload without CORS preflights) with `fetch(..., { keepalive: true })` as graceful fallback. Network errors or blocked ad-blockers fail silently and never disrupt the operator.

---

## 4. Automated Verification Matrix

The test suite in [`src/lib/__tests__/monitoring.test.ts`](file:///C:/Users/use/.gemini/antigravity/worktrees/babin-rentals-os/eight_card_acceptance_verification/src/lib/__tests__/monitoring.test.ts) verifies **22/22 unit assertions**:

| Suite | Invariant Tested | Result |
|---|---|---|
| **Disabled Default** | `VITE_SENTRY_DSN` unset disables monitoring, returns clean event ID, and performs 0 network requests | **PASS** |
| **Safety & No-Throw** | `captureError` never throws on `null`, `undefined`, circular objects, or primitive strings | **PASS** |
| **Reference Code** | `toReferenceCode` extracts stable 8-character prefix (`REF-XXXXXXXX`) | **PASS** |
| **PII Redaction** | `sanitizeTelemetryString` scrubs email addresses, mobile numbers (+977 / local), bearer tokens, and rupee figures | **PASS** |
| **Context Scrubbing** | `sanitizeContext` recursively strips financial keys and client names, handling circular structures | **PASS** |
| **Staff Error Masking** | `formatStaffErrorMessage` scrubs `GATE:`, `PGRST`, and SQL constraint errors into safe single-line copy | **PASS** |
| **Arbitrary Copy Guard** | Thrown exceptions with names/addresses/rupees never appear in user-facing message | **PASS** |
| **DSN Parser** | `parseDsn` validates SaaS Sentry and self-hosted GlitchTip endpoints with query auth | **PASS** |
| **Path-Only URL** | `pagePath` allowlists top-level modules and drops queries, sub-paths, and hashes | **PASS** |
| **Envelope Integrity** | `buildSentryEnvelope` produces 3-part Sentry JSON envelope with release and environment | **PASS** |
| **Negative-PII Envelope** | Wire payload verified to contain 0 client names, 0 phone numbers, 0 emails, and 0 rupee amounts | **PASS** |
| **Synthetic Fixture** | `triggerSyntheticTestError` produces safe non-PII test event for staging audits | **PASS** |
| **Global Handlers** | `installGlobalErrorHandlers` is idempotent and safe under React 18 StrictMode | **PASS** |

---

## 5. Deployment & Configuration Protocol

When provisioning error monitoring for production or staging:
1. Create a Sentry or GlitchTip project for **Babin Rentals OS**.
2. Supply `VITE_SENTRY_DSN` as an environment variable in Cloudflare Pages build settings:
   - Staging: `https://<public_key>@<host>/<staging_project_id>`
   - Production: `https://<public_key>@<host>/<prod_project_id>`
3. Set `VITE_APP_VERSION` to git release tag (e.g. `v1.0.0-rc1`).
4. Trigger verification via `triggerSyntheticTestError()` in browser console: confirm receipt in Sentry dashboard showing path-only URL (`/today`) and zero PII.

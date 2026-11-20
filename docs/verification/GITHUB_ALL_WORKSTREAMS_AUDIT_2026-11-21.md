# Babin Rentals OS — connected GitHub workstream audit (21 November 2026)

**Status:** read-only verification receipt plus an isolated fix reference; **NOT** a release or owner acceptance receipt.  
**Repository:** `babindulal7/babin-rentals-os`  
**Pinned main SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`  
**Scope:** PR/CI inventory, T0–T9 roadmap declarations, outstanding security and money findings, cross-PR overlaps, responsive UX source review, and next safe actions.

## No-operation / safety receipt

- No merges, deployments, environment or DNS changes, credential changes, payment activity, hosted staging writes, production Supabase writes, rollback/reset, branch deletions, or automatic runner dispatch were authorized or performed as part of this audit.
- Mac stays **CI-only**. Windows remains the **development and staging** owner. Code reviews are not permission to run hosted acceptance without the migration/privacy/provenance preflight and separately documented owner sign-off.
- The separate code branch `fix/booking-kathmandu-date-defaults-20261121` contains a narrow source/test fix only. It was **not merged, deployed, or converted into a PR** in this pass to avoid automatic Mac CI scheduling. No roadmap statuses were changed.
- Existing reviews are a mix of automated observations and source evidence. Open findings require independent reproduction or correction and fresh exact-head review before acceptance.

## 1. Canonical T0–T9 roadmap snapshot

Extracted exactly 155 `### T*-nn ... status:` headings from `docs/plans/T0_REPO_HYGIENE.md` through `T9_CUTOVER.md` on pinned main. Counts indicate **written status declarations**, not independently accepted behavior.

| Track | Total | done | acceptance_pending | doing | todo | written |
|---|---:|---:|---:|---:|---:|---:|
| T0 repo | 12 | 8 | 3 | 1 | 0 | 0 |
| T1 release | 18 | 4 | 3 | 6 | 5 | 0 |
| T2 floor | 25 | 14 | 10 | 0 | 1 | 0 |
| T3 booking/money | 31 | 24 | 6 | 0 | 1 | 0 |
| T4 shared tools | 12 | 11 | 1 | 0 | 0 | 0 |
| T5 notifications | 13 | 13 | 0 | 0 | 0 | 0 |
| T6 Nepali | 9 | 9 | 0 | 0 | 0 | 0 |
| T7 booking | 17 | 0 | 6 | 0 | 10 | 1 |
| T8 membership/crew | 9 | 9 | 0 | 0 | 0 | 0 |
| T9 cutover | 9 | 0 | 3 | 0 | 6 | 0 |
| **Total** | **155** | **92** | **32** | **7** | **23** | **1** |

**Interpretation:** 92/155 = 59.4% *marked* done; 63 are not marked done, including 32 acceptance-pending and 31 other incomplete. Some done claims may still require separate hosted/device evidence. Do not promote cards from CI status, a draft PR, or an unverified database claim.

## 2. Exact-HEAD PR and Actions audit

The open PR list, commit SHA and GitHub Actions runs were read live; `no exact-head run` means **not observed**, not a confirmed failed workflow. A successful custom push run is not automatically the repository's required `CI` check.

| PR | Head (short) | Observed exact-head run | GitHub mergeable | Review/dependency |
|---|---|---|---|---|
| [#277](https://github.com/babindulal7/babin-rentals-os/pull/277) | ae242354 | CI success | yes | **draft**; independent public-availability security review, integrate with #276 |
| [#276](https://github.com/babindulal7/babin-rentals-os/pull/276) | 76cf4e3f | CI success | yes | 9 open review threads; **security/payment HOLD** |
| [#275](https://github.com/babindulal7/babin-rentals-os/pull/275) | 4cf1ba29 | CI success | no | 2 open DNS guidance findings |
| [#271](https://github.com/babindulal7/babin-rentals-os/pull/271) | 172cbb45 | none observed | no | 17 open review threads and broad branch overlap |
| [#270](https://github.com/babindulal7/babin-rentals-os/pull/270) | 62b075e4 | none observed | no | 5 open review threads; false booking-request success |
| [#269](https://github.com/babindulal7/babin-rentals-os/pull/269) | f5f4bebc | custom push CI success | no | 30 open review threads; payment, account and RLS HOLD |
| [#266](https://github.com/babindulal7/babin-rentals-os/pull/266) | c656e8fb | none observed | no | 11 open review threads; refund-replay HOLD |
| [#255](https://github.com/babindulal7/babin-rentals-os/pull/255) | 7749e5c4 | none observed | yes | **draft**; staging provenance, privacy, and owner gate outstanding |
| [#252](https://github.com/babindulal7/babin-rentals-os/pull/252) | 3c482d6d | CI success | yes | migration plan only, no authorization to apply |
| [#213](https://github.com/babindulal7/babin-rentals-os/pull/213) | df23f1da | CI success | yes | **draft**; payment server adapter pending |
| [#157](https://github.com/babindulal7/babin-rentals-os/pull/157) | 9a3353ec | CI success | yes | **draft**; backend and RLS pending |
| [#156](https://github.com/babindulal7/babin-rentals-os/pull/156) | 0a2a7eb1 | CI success | yes | **draft**; demo catalogue is not a real stock integration |

**Summary:** eight heads have an observed successful workflow (seven standard CI; #269 custom push run); four heads lack an observed exact-head run (#271, #270, #266, #255). The CI success flag is strictly a *test outcome*, not acceptance, merge authorization, reviewer approval, or migration safety.

## 3. Critical review blockers — resolve before merge

- **#276 — security/payment (9 unresolved threads):** request-tenant row isolation on a SECURITY DEFINER view; target ownership before payment-intent creation; rupee-versus-paisa multiplication; staff request queue not mounted / confirm path not integrated; fake live client-history fallback; verifier must fail closed when provider credentials are missing. Test live-mode negative paths with **synthetic/local** users and no real payments. Never merge merely because the CI job returned success.
- **#277 — narrow availability privacy repair:** anonymous callers must not query unpublished product or bundle availability by known UUID. Seven local PGlite cases were added. Review the published-catalogue visibility predicate, anon execution context, and migration immutability; then explicitly coordinate #276 integration. Green CI alone does not certify hosted RLS/JWT semantics.
- **#269 — payment links (30 unresolved threads):** restrict private KYC document reads, preserve retry state after partial booking confirmation, retain provider-verified settlements received after expiry or request decline, and require correct authorization for refunds / account binding. The completed full offline custom CI is valid **for its head only**; it does not resolve these issues.
- **#266 — refunds (11 unresolved threads):** ensure refunded intent remains terminal against replay, enforce permission boundaries, link pending payment intents, map reconciliation columns to RPC fields, and prohibit unbacked account-credit success.
- **#270 / #271 — storefront:** replace optimistic success without persistence; hide synthetic catalogue or bookings outside explicit mock mode; address field allowlists and one-way domain redirect; confirm real Turnstile script/CSP loading and server-enforced abuse prevention. The cutover URL must not form an apex ↔ book redirect loop.
- **#275 — email DNS:** do not copy generic hard-coded DKIM or bounce MX records. Copy exact current provider-generated domain records and confirm SPF, DKIM, DMARC/return path before enabling mail.
- **#255 — staged acceptance:** current staging history/data provenance and migration fingerprints must be independently reconciled. Status must remain unapproved until a documented privacy, restore, seat/role and owner preflight; no staging writes, destructive operations, or production changes.

These are **unmerged review findings**, not confirmed claims that production users have already been exposed.

## 4. Cross-branch overlap: do not merge large T7 branches sequentially

Changed-file overlap from GitHub's full PR file lists:

| Pair | Same file paths changed |
|---|---:|
| #271 / #269 | 99 |
| #269 / #266 | 88 |
| #271 / #266 | 88 |
| #276 / #271 | 41 |
| #276 / #269 | 39 |
| #276 / #266 | 32 |
| #276 / #270 | 13 |

Versions of `0245_...` through `0259_...` migrations and `docs/plans/MIGRATION_LEDGER.md` must be reconciled against the **current main** before any integration. Same-file overlap is not proof of conflicting hunks, but the migration number/name variance and outstanding review issues make blind merges unsafe.

**Smallest safe integration order:** (1) independent #277 review; (2) fix/security-accept #276 on a single coordinated Windows lane; (3) audit #269/#266/#270/#271 against the consolidated accepted baseline with source-level diff and migration ledger; (4) new exact-head gates and isolated synthetic acceptance. Duplicate functionality should be discarded with an evidence trail, not squashed in blindly.

## 5. Desktop, iPad, phone UX source inspection

Source reviewed: `src/App.tsx`, `src/data/nav.ts`, `src/components/shell/{Sidebar,BottomBar}.tsx`, `src/lib/device.ts`, `src/booking/{App.tsx,booking.css}`, `src/booking/components/BookingHeader.tsx`.

**Strengths already in source:** shared role-filtered navigation; desktop/tablet rail with persisted collapse state; phone five-slot bottom bar; 768/1280 responsive viewport bands; 44px slot targets; use of browser capability instead of iPad sniffing.

**Concrete fixes / acceptance probes:**

1. **Kathmandu date default, source bug:** `src/booking/App.tsx` used `setDate(...)` followed by `toISOString().slice(0,10)`. In Nepal's early morning, the UTC calendar day is previous, so the default pickup/return dates can shift backward. Isolated source/test repair: [`fix/booking-kathmandu-date-defaults-20261121`](https://github.com/babindulal7/babin-rentals-os/tree/fix/booking-kathmandu-date-defaults-20261121). This uses an `Asia/Kathmandu` calendar anchor and 3 boundary tests. **Standalone** TypeScript + date-smoke passed; repository-wide gates and device checks **NOT run**. Windows owner should import/cherry-pick into the eventual accepted T7 branch after conflict review.
2. **Date selector:** `BookingHeader` shows date-only inputs and currently has no input `min` range or obvious invalid-range guard in the component. Add a visibly explained return-after-pickup constraint, preserve selected dates across page navigation, and test boundary conditions.
3. **Touch affordance:** `.date-input` declares `min-height: 28px`. Measure *effective* rendered hit target at 375/820/1440px; prefer ≥44px interactive target while preserving compact desktop treatment. CSS alone is not proof of effective hit size.
4. **Online/offline state:** `BookingApp` says it is “Showing cached catalogue rates” when offline. Verify real cache persistence exists; if not, replace the claim with a truthful offline/error state. Do not let cached inventory imply guaranteed availability.
5. **Scanner optionality:** phone navigation includes a Scan slot; user has deferred scanner expansion. Document a settings/feature-flag proposal that preserves accessible navigation and hides unsupported scanner actions. **Do not change live settings or staff workflow.**
6. **Role, device, and loading states:** test role-filtered More sheet, keyboard focus, Escape/back behavior, long-press/tooltips, touch scroll, empty/error/retry and return-to-queue deep links. Keep booking status/asset status separated.

**UX acceptance matrix (Windows mock/local only):** internal OS + public catalogue + portal at 375px phone, 820px iPad/tablet and 1440px desktop, with anonymous, Client, Warehouse, Manager/Owner roles as appropriate. Verify no blank routes, no hidden finance leak, one discoverable primary next action, 44px touch targets, non-destructive retries, and honest persistence feedback. **This review is source-based, not a completed browser/device test.**

## 6. Windows next actions and precise evidence gate

1. **P0** Reproduce #276 tenant/payment/P1 findings on a fresh isolated checkout using **synthetic local fixtures**. Add negative tests for Client A/B, anonymous unpublished products, non-money staff, tampered payment amount, missing provider secret, and 100× monetary scaling. No hosted writes.
2. **P0** Integrate or independently re-verify #277 after code review. Record its head SHA and `npm run check:pglite && npm run check:anon && npm run check:lifecycle` results from the same checkout.
3. **P0** Repair #266 refund replay and #269 late verified settlements, then test duplicate callback and partial confirmation; keep unmerged.
4. **P1** Reconcile migrations and the broad T7 PR overlaps before any merge decision. Preserve immutable receipts and separate draft worktrees.
5. **P1** Review `fix/booking-kathmandu-date-defaults-20261121`. Run `npm run typecheck`, `npm run lint`, targeted Vitest, then `npm run gates -- --quick` locally on Windows. Run full gates and device review before acceptance. No automatic Mac CI dispatch here.
6. **P1** Reassess all 32 `acceptance_pending` cards against specific criteria; keep any card with missing owner sign-off, hosted proof, or device evidence pending.
7. **P1** Triage #275 email DNS and #271 cutover redirect documentation, then separately request owner authorization for any real-domain or staging changes.

**Merge/release gate:** exact PR-head CI *and* review resolution *and* migration checksums *and* local synthetic security results *and* owner/device acceptance. A merged branch is not a production launch; live activation requires a separate, explicit owner instruction.

---

### Receipt

This file is a **snapshot and routing artifact**, not a claim that tests, payment simulations, production RLS, or hosted acceptance passed. It intentionally changes no roadmap status, CI workflow, business rule, DNS setting, staff permission or database. Update it only with fresh exact-SHA evidence.

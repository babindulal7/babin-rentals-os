# GitHub-only T0-03 / T0-09 acceptance triage — 21 Nov 2026

**Scope:** GitHub connector review and documentation-only corrections. **Not** hosted/staging/production acceptance. **Owner restrictions:** no merge, deploy, live database or settings writes, branch deletion, payment/email activation, or manual runner dispatch. Mac remains CI-only; Windows owns development and staging. Do not count a passing CI run as business/hosted acceptance.

## Work performed in this pass

1. Integrated [#279](https://github.com/babindulal7/babin-rentals-os/pull/279)'s provider-generated DNS guidance into parent [#275](https://github.com/babindulal7/babin-rentals-os/pull/275), commit `d2c9103840b2f318872d618c3a33560f974ec207`. Corrects unsafe fixed SPF, DKIM and MX directions; actual DNS and deliverability tests **not** performed.
2. Integrated [#280](https://github.com/babindulal7/babin-rentals-os/pull/280)'s one-way HTTP 301 and rollback corrections into parent [#271](https://github.com/babindulal7/babin-rentals-os/pull/271), commit `542224a306c99c93976cd31c5656180d9c797cae`. Also removed the incorrect launch-readiness declaration; no host/DNS or payments tests performed.
3. Reviewed [#277](https://github.com/babindulal7/babin-rentals-os/pull/277) against its current head `ae242354b37f21948f9abc16db258a985e779059`: CI run `44838062964`, job `136639305556`, **completed/success**. The job's Typecheck, Lint, local API guards, PGlite migration build, security regression, lifecycle, test, build and coverage steps returned success. This does not validate hosted JWT/PostgREST behavior. PR edits migration `0255_booking_site_and_public_catalogue.sql`, already present on main; confirm whether any environment applied this version before deciding on a source correction versus a forward-only migration.
4. Added explicit GitHub review/receipt comments on #277, #279, #280, #275 and #271. No status was promoted and no runner was dispatched manually.

## T0-03 — all 15 currently open PRs linked to work

| PR | Linked cards / scope | Disposition |
|---|---|---|
| [#156](https://github.com/babindulal7/babin-rentals-os/pull/156) | Website mock catalogue / T7-02 | Draft: demo data only; cannot pass live-site gate |
| [#157](https://github.com/babindulal7/babin-rentals-os/pull/157) | Client portal / T7-03, T7-08 | Draft: backend and tenant RLS missing |
| [#213](https://github.com/babindulal7/babin-rentals-os/pull/213) | Payment-link auth / T7-15 | Draft: adapter missing; retain for reconciliation |
| [#252](https://github.com/babindulal7/babin-rentals-os/pull/252) | Staging manifest / T1-02 | Exact source hash is older; read-only draft, no apply |
| [#255](https://github.com/babindulal7/babin-rentals-os/pull/255) | Staging acceptance / T1-02 and pending card matrix | Unapproved; security/privacy/restore gate and independent review |
| [#266](https://github.com/babindulal7/babin-rentals-os/pull/266) | Refunds / T7-07 | HOLD: payment replay, reconciliation and authorization findings |
| [#269](https://github.com/babindulal7/babin-rentals-os/pull/269) | Payment links / T7-15 | HOLD: account/RLS/late settlement findings, conflicts |
| [#270](https://github.com/babindulal7/babin-rentals-os/pull/270) | Analytics / T7-16 | HOLD: event persistence / privacy findings and overlap |
| [#271](https://github.com/babindulal7/babin-rentals-os/pull/271) | Launch / T7-11 | Documentation corrected; broader security/functional findings, conflicts |
| [#275](https://github.com/babindulal7/babin-rentals-os/pull/275) | Email DNS / T1-09 | Documentation corrected; provider verification, DNS approval and merge conflict pending |
| [#276](https://github.com/babindulal7/babin-rentals-os/pull/276) | T7-03/04/05/08/15 integrated booking | HOLD: tenant isolation, rupee-to-paisa, fake payment, unreachable queue |
| [#277](https://github.com/babindulal7/babin-rentals-os/pull/277) | T7-02 anonymous availability privacy | CI green; independent security and migration-immutability review pending |
| [#278](https://github.com/babindulal7/babin-rentals-os/pull/278) | T0-03 / T0-09 audit | Draft, docs only; this supplement contains current GitHub-only actions |
| [#279](https://github.com/babindulal7/babin-rentals-os/pull/279) | T1-09 correction for #275 | Integrated into parent branch; **not** a standalone merge candidate |
| [#280](https://github.com/babindulal7/babin-rentals-os/pull/280) | T7-11 correction for #271 | Integrated into parent branch; **not** a standalone merge candidate |

**T0-03 status: acceptance_pending.** The open-PR mapping is now explicit. The card also requires every *closed* PR's relevant changes on **main**, not merely on an unmerged parent branch, and independent reconciliation of legacy items. Do not silently close #279/#280 while their fixes exist only on unmerged branches. Before marking done, verify old PR lineage and close/reconcile only with main-line evidence.

## T0-09 — CI acceptance evidence and limits

- [#277](https://github.com/babindulal7/babin-rentals-os/pull/277) exact head `ae242354...`: required CI run `44838062964` is **green**. Job `typecheck · test · build` success; the “Mac · full CI (main)” job was **skipped by design on this PR**, not failed.
- [#276](https://github.com/babindulal7/babin-rentals-os/pull/276) exact head `76cf4e3f...`: prior connected GitHub read showed PR-triggered CI successful, but 9 independent unresolved security/functional review threads keep it on HOLD.
- For parent documentation commits `d2c91038...` (#275) and `542224a3...` (#271), the PR-triggered workflow lookup returned **no runs**. These are **not** claimed green; review the current branch head and conditional workflow rules before accepting.
- GitHub REST commit combined **statuses** for main `0586865cf2a4ce2f6de64dc1d8da1548f91ec211` returned an empty array. That is **not evidence of a failed or passed main GitHub Checks run**; this connector's commit workflow listing is restricted to PR-triggered runs.
- No independent local `npm run gates` output and no current required **main** CI evidence were collected by this pass. GitHub branch protection, workflow enabled-state and owner acceptance have not been proven in this report.

**T0-09 status: acceptance_pending** until the exact required main SHA checks, independent local verification, active required-check policy, and owner acceptance are all evidenced. A successful PR run alone is insufficient.

## Third small PR: #277 hold / smallest safe action

1. Review anon view/RPC interaction and the 7-case isolated security test against the exact PR head.
2. Reconcile migration 0255 across main, staging and production without writes. If applied anywhere, prepare a forward-only correction with a collision-free migration name, not an edit-in-place migration.
3. Integrate with #276 after security fixes and source-branch review; run new exact-head checks on the integrated branch.
4. Later, after the separate owner-approved T1-02 privacy/restore preflight, test hosted anon JWT and cross-client isolation using only synthetic accounts.

## T7-01 independent specification audit note

The existing [online booking specification](../../docs/ONLINE_BOOKING_SPEC.md) acknowledges that its 1 Nov seven-screen, verified-email-first flow needs reconciliation with 12 Nov approved **guest booking request**, **dates-and-times-first** and **full public website** decisions. The spec remains **written/pending approval**; do not mark done by inference from coding or owner approval of only the top-level design defaults.

## Exit and evidence discipline

No roadmap cards marked done. No local Windows work, Supabase writes, PR merge, branch deletion, payment transaction, DNS change, external message, or manual CI re-run. Count remains **92 done / 32 acceptance_pending / 23 todo / 7 doing / 1 written = 155** until independent acceptance receipts justify a change.

# Closeout plan — 26 unfinished roadmap cards (15 Nov 2026)

> **Scope:** Freeze new card assignments temporarily and verify the 26 cards that were neither `todo` nor `done` on `main` `6b1563f35c8f436589b46d026d6e575e51be5091`. This is an implementation/acceptance queue, **not** evidence that any of these 26 are done. Owner merges and real-device/staging acceptance remain separate. No live Supabase, deployment, runner cancellation, or production settings changes are authorized.

## Count and meaning

| Status on main | Count | Meaning |
|---|---:|---|
| `ready` | 13 | Prepared for review in roadmap, but **several already landed in main** and status is stale |
| `acceptance_pending` | 7 | Built/merged but real owner/device/hosted acceptance is missing |
| `doing` | 4 | Ongoing coding or on-device validation |
| `done in part` | 1 | Partial evidence upload; linked remaining T2-18 |
| `written` | 1 | Online-booking spec awaits owner approval |
| **Unfinished non-TODO** | **26** | `57 done + 72 todo + 26 other = 155` |

**External evidence gathered:** Latest main full CI and typecheck/test/build checks on commit `6b1563f3` completed successfully. Green CI is necessary but does **not** satisfy each card's acceptance contract. Existing branch comparisons: `lane-a/T2-15-damage-found-during-reset` and `lane-a/T8-02`, `T8-04`, `T8-07`, `T8-08`, `T8-09` branch heads are all **behind** main with **0 commits ahead**. Their roadmap label "awaiting merge" is therefore stale; verify live code still delivers their intended feature and collect staging/device evidence before marking done.

## Closeout matrix — exactly 26 cards

| Card | Current roadmap status | Owner | Immediate smallest safe action / acceptance gate |
|---|---|---|---|
| **T0-12** Resolve Nov 5 rules conflicts | acceptance_pending | Lane A + Owner | Hosted/device owner acceptance on approved glossary, imports, per-user language; do not automatically enable Nepali |
| **T2-01** Camera evidence upload | done in part | Lane A | Staging upload + signed read + Pack/Handover evidence; depends on T1-06 storage scoping acceptance |
| **T2-06** Repair job closes damage | ready | Lane A | Locate merged implementation/branch; stage damage → repair → job closure → available; audit authorization |
| **T2-09** Bluetooth scanner at packing | doing | Lane A + Owner | Real iPad + Bluetooth scanner: 50 consecutive serial scans, no missed/double entries; manual path remains equal |
| **T2-13** Self-QC when alone | ready | Lane A | Compare real code to card; prove solo and two-person paths on staging + audit row |
| **T2-14** Scan label → item card | ready | Lane A | Confirm merged scanner lookup behavior on iPad, fast response and booked-unit privacy; update stale status |
| **T2-15** Damage found during Reset | ready | Lane A | Branch is ancestor of main; test staged Reset damage creates correct case/photos/blocking/email |
| **T2-16** Photo rules/HEIC | ready | Lane A | Phone photo resizing to ≤3 MB / damage ≤10 MB; three photos and HEIC; verify storage errors and offline |
| **T2-17** Save a unit's details | doing | Lane A | Confirm identity edits/rack/shelf persist after reload and are role/audit guarded; inspect diverged draft branch before reuse |
| **T2-18** Finish evidence capture | doing | Lane A | Reject offline “saved”; require per-flagged-unit photo; verify return gate & staging storage T1-06 |
| **T3-14** Draft invoice on Confirm | doing | Lane C + Accountant | Run invoice lifecycle on staging; O-14 and O-17 accountant answers required for numbering moment |
| **T3-17** Extend in two taps | ready (stale) | Lane C | PR #162 **merged** to main at `6b1563f3`. **Block acceptance on issue #171**: `extensionClash.ts` maps query failure/invalid/unknown to “no clash”; verify server-authoritative protection and reconcile pricing/migration tests |
| **T3-22** Availability in two taps | ready (stale) | Lane C | PR #161 merged; real 2-tap, exact-date stock and next free date, scanner parity and New Rental consistency |
| **T4-08** One-time rider link | ready | Lane B | Validate hashed/expiring/revocable tokens, scope, signature, job audit, privacy, phone delivery and responsive PR #160 |
| **T6-04** Nepali floor screens | acceptance_pending | Lane B + Owner | Owner text approval + iPhone/iPad walkthrough for all floor screens |
| **T6-05** Nepali desk screens | acceptance_pending | Lane B + Owner | Owner text approval + responsive desk booking/calendar/clients flows |
| **T6-06** Nepali back-office screens | acceptance_pending | Lane B + Owner | Owner text approval; inventory/finance/crew pages offline-font and role check |
| **T6-07** Nepali reports/settings/admin | acceptance_pending | Lane B + Owner | Owner text approval; preserve numeral invariants; do not activate language prematurely |
| **T6-08** Nepali layout pass | acceptance_pending | Lane B + Owner | Screenshots at 360/820/1280; iPad/iPhone, offline Devanagari fonts, no clipped actions |
| **T6-09** Per-user Nepali switch | acceptance_pending | Lane B + Owner | After T6-04..08 acceptance, prove two staff on same iPad retain independent language preferences; no global enable until approved |
| **T7-01** Online booking specification | written | Lane C + Owner | Record owner acceptance of approved rules: manual staff confirmation, guest requests, public base prices, personalized discounts, staff notifications, mandatory pickup/return date+time, secure anon read boundaries |
| **T8-02** Membership plans admin | ready (stale) | Lane A | Branch ancestor of main; stage Coordinator read-only vs Manager retire + audit |
| **T8-04** Renew lapsed member | ready (stale) | Lane A | Branch ancestor of main; staged renewal retains term history, no double member-period |
| **T8-07** Crew day timesheet | ready (stale) | Lane A | Branch ancestor of main; reconcile daily entries against Crew Assist payout and remove estimated totals |
| **T8-08** Crew TDS payout | ready (stale) | Lane A + Accountant | Branch ancestor of main; get accountant O-5 rate and prove gross/TDS/net with immutable payout history |
| **T8-09** Staff renting gear | ready (stale) | Lane A | Branch ancestor of main; verify 20% line applies only to eligible future rentals and settings/audit |

## Execution order and parallel lanes

**Wave 0 — No new features.** Refresh `origin/main`, open PRs, exact SHAs and dependencies. Preserve the already-open draft [#167](https://github.com/babindulal7/babin-rentals-os/pull/167); do not create duplicate card implementations. Verify latest main's **full** runner result and local `npm run gates`.

**Wave 1 — Close out stale ready status (Lane A / C):** T3-22, T2-15, T8-02, T8-04, T8-07, T8-09; then T2-06, T2-13, T2-14, T2-16. Collect acceptance, update roadmap via a focused PR; no automatic `done` without evidence. T3-17 is **not** a quick win; first fix issue [#171](https://github.com/babindulal7/babin-rentals-os/issues/171).

**Wave 2 — Staging/physical verification:** T2-01, T2-18, T2-09, T2-17, T4-08, T8-08 (accountant rate). Staging readiness and role accounts are external dependencies; mock/local-only results never substitute for real-device owner tests.

**Wave 3 — Finances and owner rulings:** T3-14 needs accountant O-14/O-17; T7-01 needs owner spec review; T0-12 needs owner hosted/device acceptance.

**Wave 4 — Nepali six-card acceptance:** T6-04 → 05 → 06 → 07 → 08 → 09, with owner approvals, offline font/width evidence and per-user language isolation. **Do not switch Nepali on** until every gate is met.

## Required evidence per card

- Base `main` SHA, feature PR/branch/merge SHA; ensure no other agent owns the same files.
- `npm run gates` results (actual exit codes), isolated PGlite/lifecycle results where database writes matter, newest exact-head GitHub checks (not a stale green run).
- Permission matrix negative tests; Warehouse cannot access money, client or rider cannot read others' data; offline and failure states fail closed.
- Screenshots and user task timings at desktop/tablet/phone sizes, actual iPad/phone where specified.
- Staging evidence with role, date/time, booking reference, expected vs actual, auditor initials; never expose personal customer data in GitHub.
- `PROGRESS.md` evidence with **Completion** and **Remaining** per repository rules, without fabricated completion percentage.
- Card status `done` only when code merged, acceptance satisfied, owner checks performed and verified proof linked.

## Safety / decisions

Do not merge, deploy, run live DDL, change passwords or financial settings, alter email/domains, cancel Booqable, or activate the Nepali switch as part of this closeout without explicit owner approval. Keep 50% QR/barcode and 50% manual workflow as equal alternatives in every floor screen.

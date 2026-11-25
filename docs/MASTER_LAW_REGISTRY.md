# Master Law Registry — proposal and implementation handoff

Status: PROPOSED / REVIEW REQUIRED. 2026-11-25, Asia/Kathmandu.
Baseline: ccfc7bd8926c10fd9db589b35d1564cb71e6d474.
Owner authorized starting the repair programme, not changing individual commercial terms or certifying legal compliance. This document does not supersede approved rulings, PERMISSIONS.md, or production controls until separately accepted. No production changes, deployment, automatic merge, or paid services. Windows implementation lane; independent verifier; Mac CI-only. Recheck latest main and search existing PRs/issues per task before coding; reuse existing work where possible.

## 1. Authority and conflict resolution
Proposed precedence: applicable law > security/accounting invariants > explicit dated owner rulings within those boundaries > versioned settings > SOP > UI/UX > AI advice. Resolve ambiguity fail-closed for financial/security writes, surface actionable errors, retain evidence and escalate policy decisions. Do not block lawful refunds, personal-data correction, or emergency operations through an indiscriminate gate. Existing build-time N/B rules continue to apply. No historical ruling rewritten or silently dropped. Use stable namespaced identifiers, not duplicate ordinal labels; keep legacy references as aliases including source document and version.

## 2. Existing product laws: preserve and reconcile
Source: [PRODUCT_RULES.md](PRODUCT_RULES.md). Status is review target, not proof of enforcement.

| Stable ID | Legacy | Invariant / review | Enforcement / acceptance |
|---|---|---|---|
| ARCH-01 | Law 1 | UI presents; domain and server own business decisions | Direct RPC rejects forged data; UI/server parity |
| ARCH-02 | Law 2 | UTC storage, BS display, Kathmandu commercial day boundary | 06:00 Nepal-time boundary, midnight and BS roundtrip tests; preserve local legal dates on documents |
| PRIV-01 | Law 3 | Archive operational/financial records; scoped privacy retention exceptions proposed | No destructive ledger edits; approved deletion/redaction workflow, legal hold |
| FIN-01 | Law 4 | Immutable payment ledger; reversal/adjustment only | Duplicate refund and direct update rejected |
| FIN-02 | Law 5 | Deposit liability separate from rent/advance; applied deposit creates linked settlement | Reconcile held/released/applied/partial amounts; no double collection |
| AUTH-01 | Law 6 | Floor money blindness; proposed client exception for own authorized commercial data | Direct API, export, DOM and cross-tenant tests |
| FIN-03 | Law 7 | Monotonic document numbers, no reuse | Concurrent issuance, void/reissue references |
| ARCH-03 | Law 8 | Idempotent mutation, scoped to action/entity/actor; server-generated receipt | Repeat/retry and concurrent duplicate tests |
| INV-01 | Law 9 | Minimum commercial rental day separate from actual reservation interval | Half-open intervals, same-day buffer, partial return and DST-independent Nepal time |
| FIN-04 | Law 10 | Ungated discounts as authorized owner ruling; numeric validity and role enforcement | 0/100%, NaN, infinity, negative, above 100%, direct writes; no new approval cap |
| UX-01 | Law 11 | Status not color-only | Accessible labels/icons |
| UX-02 | Law 12 | Actionable inline errors; success only after durable write | Timeout/refusal/rollback tests |
| UX-03 | Law 13 | Touch target floors | 360px viewport, tablet and desktop controls |
| UX-04 | Law 14 | Existing responsive breakpoints | Boundary and orientation tests |
| UX-05 | Law 15 | Client terminology | UI copy check; do not alter legal document wording required by law |
| AI-01 | Law 16 | Real intelligence, no fake operation | Missing-data/unavailable states; no false compliance claims |

## 3. Permission identifier collision
Sources: [PRODUCT_RULES.md](PRODUCT_RULES.md), [PERMISSIONS.md](PERMISSIONS.md).
Keep PERMISSIONS.md authoritative for capabilities until approved reconciliation. Retain all principles; do not renumber existing historical references.

| Stable identifier | Alias / source | Intent |
|---|---|---|
| AUTH-02 | both P1 | Deny by default; anonymous guest distinct from authenticated client; migration proposal only |
| AUTH-03 | both P2 | DB/RLS authoritative, UI mirrors |
| AUTH-04 | both P3 | UI must not grant more than DB |
| AUTH-01 | both P4 | Money-blind floor roles; client-scoped exception proposed |
| PRIV-01 | both P5 | Archive versus restricted lawful deletion |
| AUTH-05 | both P6 | Audited overrides, actor/role/reason |
| AUTH-06 | both P7 | Approval ladder, no self-approval where approval is required |
| AUTH-07 | PRODUCT P8 | Client tenant isolation |
| AUTH-08 | PERMISSIONS P8 | Floor PIN identifies actor without privilege escalation |
| AUTH-09 | PRODUCT P9 | Immutable system role enum |
| AUTH-10 | PERMISSIONS P9 | External client, own records only, explicitly allowed writes |
| ARCH-04 | PRODUCT P10 | Audited reversible operational mistakes |
| UX-06 | PERMISSIONS P10 | Quiet display denial, explicit actionable errors on attempted writes |

## 4. Proposed additional invariants
Not yet active laws; approve each applicable policy before behavioral change. Where already covered, cross-reference rather than duplicate.
- ARCH-05 server validates prices, fees, payment proof and permissions.
- FIN-05 confirmed booking policy snapshot (version/effective time, explicit amendments).
- FIN-06 each assessed charge/refund/waiver has a traceable ledger or approved settlement; previews are not writes.
- INV-02 no promise of stock without available capacity or documented replacement sourcing; existing approved overbooking policy is not silently removed.
- INV-03 independent booking/asset/unit states; partial pickup and return.
- PRIV-02 data minimization, retention schedule, restricted access, legal holds.
- COM-01 statutory requirements cannot be overridden by settings.
- AI-02 intelligence advises; authorized staff approve consequential writes; no fake metrics.
- ARCH-06 truthful error/success, readback for critical mutations.
- FIN-07 issued invoice history immutable, corrections via compliant linked documents.
- HR-01 separate commercial crew pricing from statutory wages/working time.
- AUTH-11 sensitive actions bound to authenticated actor/session, not caller-supplied identity.

## 5. Repair queue and acceptance evidence
Priorities are proposed engineering triage, not legal findings. Static observations from baseline must be revalidated against latest code, migrations and existing tests before changing behavior. No runtime defect claimed without reproduction. Each task gets own scoped PR, red/green reproduction, exact head evidence, independent review and no merge/deploy by agent.

| ID | Priority | Evidence and smallest safe action | Acceptance |
|---|---|---|---|
| RC-01 | P0 | PRODUCT Law 6/P4 versus portal own-finance requirement; inspect portal RPC/RLS before editing | Guest and other-client access denied; own invoices/prices visible where permitted; floor cannot read/write money |
| RC-02 | P1 | src/lib/discount.ts vs outdated approval comments in src/lib/lateFee.ts; preserve 31 Aug ungated discount decision | No new discount approval ceiling; authorized roles only; finite bounds; waiver authority independently verified |
| RC-03 | P0 | Law 3/P5 blanket archival versus personal data retention; plan privacy exceptions and legal holds | Synthetic record retention/redaction test; immutable finance references; no production deletion |
| RC-04 | P1 | src/lib/lateFee.ts bookingDayRate assumes all daily services retained; reconcile actual retained line items and contractual terms | Partial return, crew ended, flat delivery, daily transport, boundary times; no duplicate penalty |
| RC-05 | P0 | src/actions/rentals/cancelRental.ts sends fee in reason; inspect current RPC and downstream financial posting before deciding if gap remains | Server calculates/validates typed fee, atomic cancellation + finance record or explicit pending settlement; partial advance/refund, retry, rejection and reconciliation |
| RC-06 | P0 | VatToggle.tsx, migration 0213_non_vat_bills.sql; inspect latest tax enforcement and accountant-approved treatments | Taxable, exempt/zero-rated where lawful, inclusive/exclusive, deposit applied, void/reissue, invoice numbering; no arbitrary tax toggle |
| RC-07 | P0 | migration 0181_collateral_deposit_id_card.sql accepts original IDs; legal/privacy review before activation; alternative verification and deposit | Masking and branch/client isolation, consent/purpose, safe return, retention/expiry; no real ID data in tests |
| RC-08 | P0 | migration 0207_crew_overtime_half_full_day.sql commercial units may not match employment obligations; distinguish employees from contractors | Actual hours, cross-midnight, weekly limits, holiday/rest rules and statutory overtime test for employees; do not change client billing automatically |
| RC-09 | P1 | Law 9 half-open intervals; inspect reset/cleaning/reservation triggers, identify actual missing buffer | Same-day turnover with configurable prep time, unavailable dirty gear, concurrent booking, authorized alternate sourcing |
| RC-10 | P1 | CancelRentalModal and calculateOptionACancellationFee vs 0212 configurable tiers; distinguish commercial owner rules and settings | One approved policy source, exact 24/48h and 1/2/3 day boundaries, snapshot, staff override reason and server authority |
| RC-11 | P1 | src/lib/bookingRules.ts and overbooking rules; inspect current DB per-product enforcement | Parallel bookings, unavailable assets, reason/actor, verified replacement and staff visibility |
| RC-12 | P0 | P8/P9/P10 collisions, above mapping | Stable unique IDs with source-qualified aliases, no privilege expansion |
| RC-13 | P0 | P1 anonymous-to-Client fallback; inspect verified JWT and guest requests | Anonymous cannot use client-only RPC even with forged ID; public catalogue and permitted guest request preserved |
| RC-14 | P1 | scripts/check-rule-consistency.mjs covers mirrored B/N rows, gate list, links; semantic checks missing | Add focused semantic test coverage, registry ID uniqueness, aliases and rule-to-test mapping; propose CI wiring with synchronized run-gates/ci changes, never bypass gates |

## 6. Legal review boundaries (Nepal)
Reference dates: checked 2026-11-25; not a legal opinion. Accountant/lawyer must verify current consolidated laws, amendments, applicability, and business classification before changing active policies. Do not assume all crew are employees or all zero-rate bills unlawful. Original-document retention, cancellation fees, publication of debt/blacklists and withholding client footage require specific review; no automated enforcement or public disclosure pending approval.
- Labour Act 2074 §§28–31: normal hours generally 8/day and 48/week; overtime limits generally 4/day and 24/week, 1.5x basic pay for covered workers; review exceptions, breaks, leave and classification. Reference: https://policynepal.org/laws/act-2074-labour/
- Privacy Act 2075: identity documents and personal data protected; lawful purpose and security/consent review. Nepal Law Commission: https://lawcommission.gov.np/content/12261/the-privacy-act-2075/
- VAT Act 2052, current Finance Act/amendments: standard 13% where applicable; accountant to validate invoice/credit note and deposit application treatment. Reference: https://policynepal.org/laws/act-2052-value-added-tax/
- Consumer Protection Act 2075: transparent prices/terms and dispute handling; review cancellation, damage, fees and remedies. Reference: https://policynepal.org/laws/act-2075-consumer-protection/

## 7. Delivery and verification
1. Registry review and duplicate task scan (this PR is documentation only).
2. P0 lanes: permissions/guest isolation; tax/invoice; cancellation ledger; privacy; employment compensation. Each independent branch latest main; do not overlap migrations or modify production. Owner/accountant/legal review for unresolved policy.
3. P1 operational and semantic tests after dependencies. Retain historical contract terms, preserve existing UI workflows and status labels unless specifically required.
4. Verifier checks exact candidate head, negative tests (direct API, role matrix, concurrent writes), relevant unit/SQL/staging E2E using synthetic data, desktop/tablet/mobile as applicable. Run repo-defined npm run gates and check-rule-consistency; record exact head, command output, test names, migration assumptions, independent reviewer and remaining blockers. No live writes. CI green alone is not proof of legal compliance.
5. Status vocabulary: documented, implementing, blocked, ready-to-verify, verified, merged. Never mark a task verified without evidence. Release remains owner decision.

## 8. Owner decisions reserved
Confirm client own-finance exception wording and field allowlist, precise late-fee/cancellation snapshot policy, permitted tax categories with accountant, original ID alternatives and retention with counsel, employee/contractor compensation classification, overbooking/cleaning policy and authorized exception handling. Existing rules stay in place pending separate reviewed implementation. Do not treat this proposed registry as a release approval.


## 9. Second-pass conflict and error audit (2026-11-25)
Baseline unchanged: ccfc7bd8926c10fd9db589b35d1564cb71e6d474. Reviewed changed paths of 26 then-open PRs for overlap with the targeted discount, money, cancellation, policy and registry files. Payment/auth integration candidates #432, #431, #429, #421, #417, #412 and related staging work must be reused, not reimplemented. No merge or runtime verification claimed.

| Track | Current static evidence | Status / next action |
|---|---|---|
| RC-01 | 0257 account binding and scoped own-profile policies exist | Verify own invoices and isolation using direct API and role matrix; not proven safe |
| RC-02 | NaN accepted by discount.ts, money.ts and rbac.ts | Draft PR #434 adds finite-number checks and tests; stale waiver comments still need reconciliation |
| RC-03 | blanket archival rule vs retention requirements | Policy/legal review; inventory actual storage before drafting retention mechanism |
| RC-04 | lateFee bookingDayRate assumes all crew and daily vehicles retained | Verify actual item-level return/crew records; policy decision before amount changes |
| RC-05 | cancelRental passes fee in reason string; 0109 does not post a typed fee or refund | Draft PR #435 adds action-boundary amount guard; full transactional accounting and later RPC definitions require review |
| RC-06 | 0213 non-VAT derives category from zero rate; 0193 locks invoice issuance; 0254 resyncs draft VAT | Preserve invoice immutability; accountant validates tax categories, then test backend |
| RC-07 | 0181 original ID collateral and masked view | Review statutory basis, retention and alternative collateral; no original-document workflow expansion |
| RC-08 | 0207 commercial half/full day overtime | Employment classification and legal payroll calculation must be separate from billing; no automatic rate changes |
| RC-09 | 0252 explicitly handles turnaround windows and product prep/cleaning fields | Verify current buffer behavior including dirty gear and same-day turnover before changing |
| RC-10 | Option A function in cancellationFeeTiers.ts and configurable table 0212 coexist | Verify settings usage; preserve 2 Nov Option A pending approval for policy source |
| RC-11 | 0252 adds per-product overbooking, shortage tracking and pack/handover gates | Verify concurrency and shortage closure; legacy device toggle is not itself a server bypass |
| RC-12 | PRODUCT/PERMISSIONS P8–P10 divergent identifiers | Registry maps source-qualified aliases; no authorization behavior change; review required |
| RC-13 | 0257 verifies auth.uid for own-profile access; older P1 wording still conflates guest/client | Verify all portal RPCs and anonymous denial, particularly existing payment holds |
| RC-14 | Existing consistency guard checks authority rows, gate list, links only | Add registry structural checker after format review; CI integration separately; semantic verification requires tests |

Partial patches: #434 head bfb55552695cfbc84290c3a4c0331ef460cc3e7a; #435 head 65cbfe5fa54d119f63a1e525f55bf7e43160debd. Both are draft and unverified. No other track is marked repaired. Static evidence does not confirm deployed state. Existing protections in 0177 (verified usable partial returns), 0252 (shortage/turnaround), 0193 and 0254 (invoice safeguards) must be tested rather than replaced.

External legal references checked 2026-11-25:
- Nepal Law Commission Privacy Act (official Nepali text): https://lawcommission.gov.np/content/12261/the-privacy-act-2075/ — personal documents and electronic information are protected.
- Labour Act English text hosted by ICAN: https://en.ican.org.np/_browsable/file/downloads/Labour_Act_2074.pdf — §§28–31 working hours and covered employee overtime; confirm consolidated amendments and worker classification.
- Consumer Protection Act (government-hosted English text): https://www.nml.gov.np/uploads/file/2023031819401576741208The-Consumer-Protection-Act-2075-2018.pdf — confirm application to rental charges and remedies.
- VAT Act summary with amendments: https://policynepal.org/laws/act-2052-value-added-tax/ — standard rate and exceptions require accountant confirmation, including current Finance Act and Gazette notices. Do not infer legality from the UI's zero-rate toggle.

**Gate:** zero verified repairs until exact-head tests and independent review. The owner has authorized work on all tracks, not unilateral legal conclusions, new pricing terms, payroll rate changes, production migrations or deployment.


## 10. Third-pass verification and conflict prevention
- PR #436 (0614e27ba0dc6b39a771fee3f6c31ab74f4c969a) labels cancellation fee/refund amounts as estimates, and explicitly warns that cancellation itself does not post fees or issue refunds. Finance must reconcile separately. This is not a substitute for the P0 atomic ledger repair.
- Corrected evidence: migration 0150_rpc_security_and_mutation_closure.sql supersedes 0109 for cancel_booking; it binds the actor to auth_user_id() and revokes anonymous execution. It still does not post cancellation fees or refunds. Verify branch scope, locking, idempotency and invoice/advance settlement before a new migration.
- Structural checker: node scripts/check-master-law-registry.mjs --self-test. Validates 16 legacy product laws, 20 source-qualified permission aliases and 14 repair tracks; rejects duplicate/missing aliases and task IDs. The same pure validation function passed the current registry and three injected-error scenarios in the connector execution environment. Node/CI execution and independent verification remain pending. It is not wired into mandatory CI yet; coordinate gate changes to avoid breaking current launch candidates.
- VAT reference refresh: Inland Revenue Department VAT Act English translations: https://ird.gov.np/public/pdf/1140227555.pdf and https://www.ird.gov.np/public/pdf/116345766.pdf. Current consolidated amendment overview: https://policynepal.org/laws/act-2052-value-added-tax/. Standard rate 13%; exempt supplies and zero-rated supplies are not interchangeable; special rates may apply to designated supplies. Section 14 generally requires registered suppliers to issue invoices. Do not change approved rates or treat client refusal of VAT as a tax category. Accountant must confirm registration, treatment of each service, current Finance Act 2083 amendments, invoice requirements and cancellation/deposit tax treatment. Require explicit treatment and lawful basis, not just a zero rate, in the future backend design.


## 11. Permission clarification and CI blockers
- PRODUCT_RULES.md and PERMISSIONS.md now explicitly qualify P8–P10 references at their source; no capability or role grants changed. Historical aliases remain intact.
- New P0 candidate: migration 0150 cancel_booking checks role and authenticates actor, but its SECURITY DEFINER body does not explicitly enforce booking branch membership and reads booking without FOR UPDATE. PERMISSIONS.md section 8 states branch-scoped grants except Owner/Admin. Compare 0233 extend_booking's branch check. Reproduce cross-branch cancellation and concurrent cancel/hand-over with synthetic data under actual role claims; inspect latest triggers/RLS and any branch exceptions before implementation. If confirmed, enforce existing branch rule within the RPC (before any mutation or disclosure), lock/recheck the booking, preserve stage/role constraints and add direct-RPC tests for both overloads and actor/UUID integrity. Do not reuse an occupied migration number: open integration candidates already add 0270–0272 plus timestamped migrations. Use repository migration workflow in an isolated local environment; never apply live. Full settlement remains a separate financial task.
- Exact-head CI for #434 (45587055422), #435 (45587192142), #436 (45587654145) failed the offline mock suite in the same two files: law17.test.ts flagged BookingModals.tsx:290 (customer terminology); useNewRentalSubmit.test.tsx failed five booking identity/retry scenarios. Each run reported 753 passing test files and 2 failing. This is not a full pass. The combined launch candidate #432 already changes both booking files and contains the corrected 'Open client checkout page' label; its two workflow runs were in progress at this check. Do not duplicate those overlapping patches. Require exact-head green integration and rerun these branches against the accepted baseline. No evidence that the three targeted repair suites failed; inspect targeted test results separately.

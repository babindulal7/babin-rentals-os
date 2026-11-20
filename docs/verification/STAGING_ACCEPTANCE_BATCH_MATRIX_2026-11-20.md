# Babin Rentals OS — Staging Acceptance Review Matrix (Updated 21 Nov 2026)

**Document state:** REVIEW-ONLY — **NOT AN AUTHORIZATION TO RUN MIGRATIONS OR HOSTED TESTS**.  
**Roadmap source:** `docs/plans/T0…T9` on verified `main` commit `317509b29f43fe75742ccd95fd9afceac4b65e60` (20 Nov 2026 18:22 UTC).  
**Target for future separately approved tests:** `klhmsrunqrdxjudyhnkm` only. **Protected production:** `sxguwvgoserhdolewibb`.  
**Reference:** [Owner approval gate](STAGING_OWNER_APPROVAL_GATE_2026-11-20.md) — **UNAPPROVED / HARD STOP**.

## 1. Reconciled canonical roadmap count

| Status | Cards |
|---|---:|
| Done / Complete | **89** |
| Acceptance pending | **30** |
| Todo | **30** |
| Doing | **5** |
| Written | **1** |
| **Total** | **155** |

Two additional floor cards, T2-17 and T2-24, were promoted to `done` by merged PR #258. Earlier 43-card acceptance matrices and older 242-migration snapshots are historical evidence **not current deployment manifests**. Always revalidate this count and the latest SHA before using it.

## 2. Acceptance queue — all 30 cards, no silent promotions

The checks below are **requirements**, not assertions that hosted or physical tests already passed. A merged PR or green local CI check alone does not satisfy a missing hosted/auth/accountant/owner acceptance gate.

### Batch 1 — Infrastructure, identity and security (4 cards)

| Card | Minimum remaining evidence |
|---|---|
| `T0-12` | Hosted/application conflict and DB security checks, with rule-reconciliation receipt |
| `T1-05` | Nine role seats, client A/B isolation, privileged reads and negative JWT tests |
| `T1-17` | Money-role MFA, session/AAL2 enforcement and owner-managed enrollment proof |
| `T1-18` | Staging login-history records and non-delivering new-device email tests |

### Batch 2 — Floor lifecycle and stock availability (10 cards)

| Card | Minimum remaining evidence |
|---|---|
| `T2-06` | Repair closes damage case; affected asset cannot be released too early |
| `T2-13` | Self-QC permitted only with required audit identity and history |
| `T2-14` | Desktop/manual code lookup and right item card; hardware-specific tests deferred only where expressly ruled |
| `T2-15` | Reset-discovered damage produces correct notice in isolated email sink |
| `T2-18` | Hosted Storage RLS, evidence upload/view isolation and denied cross-user access |
| `T2-19` | Return damage signature/refusal paths and durable audit evidence; distinguish deferred physical device tests |
| `T2-20` | Consumables at Pack/Handover with database and network payload money blindness |
| `T2-21` | Planned downtime correctly removes availability and public/portal offerings |
| `T2-22` | Per-product turnaround buffers and account setting transitions without double booking |
| `T2-23` | Overbooking opt-in constraints, shortage resolution and durable coverage on supported software workflow |

### Batch 3 — Booking, documents and accounting (6 cards)

| Card | Minimum remaining evidence |
|---|---|
| `T3-02` | Deposit by product, role rights, imported values and data-entry signoff |
| `T3-06` | Official paper VAT invoice policy and accountant sample-PDF approval; signed-agreement hosted storage isolation |
| `T3-13` | Fully-booked choice, similar-product/sub-rent verification and partner roster confirmation |
| `T3-20` | Receivables totals reconcile to integer paisa and accountant/client statement review |
| `T3-23` | Monthly accountant pack review against deposits, TDS, VAT and source records |
| `T3-30` | Consumables pricing/RLS, restock, low-stock notices and audit history |

### Batch 4 — Website and client portal (5 cards)

| Card | Minimum remaining evidence |
|---|---|
| `T7-09` | Turnstile domain setup and abuse protection; verify real-hosted test credentials without enabling production |
| `T7-12` | Client portal recommended items visual and cross-account permission checks |
| `T7-13` | Public option-selector behavior on responsive devices and available variants |
| `T7-14` | Away switch denies public booking requests while allowing the configured staff workflow |
| `T7-17` | Cloudflare legacy redirects resolve to correct canonical products without loops |

### Batch 5 — Operations, external integrations and cutover (5 cards)

| Card | Minimum remaining evidence |
|---|---|
| `T0-03` | Reconcile remaining PR triage with exact merged/current-head evidence |
| `T4-08` | One-time rider link field flow, expiry, token replay denial and role isolation |
| `T9-01` | Booqable catalogue/client import reconciliation with synthetic/staging data (no live cutover) |
| `T9-02` | Booqable active rental holds block conflicting OS dates; external synchronizer isolated |
| `T9-07` | Document staff training, accessible desktop/manual workflows and attendance/competency receipts |


**Completeness check:** 30 unique card IDs in the five batches; includes all pending cards on the cited `main` snapshot. No card is treated as `done` by this document.

## 3. Independent checks that remain unfinished

- **T1 Release:** T1-01 through T1-04 and other unfinished release items remain tracked in their own roadmap; PR #255 planning documents are **not** evidence that T1-02 hosted staging is complete. T1-06, T1-07, T1-08, T1-14 are `doing` pending hosted/device or privacy evidence. No release deployment allowed from this review.
- **T7 Online booking:** Public catalogue/portal already-merged cards still require web-flow and security acceptance; eleven `todo` cards and one `written` spec remain. Preserve manual staff confirmation and configurable website/portal settings; do not change them.
- **T9 Cutover:** Prepare Booqable export, count and active-rental reconciliation read-only; do not alter production inventory, clients, billing or bookings; never turn on outbound synchronization without separate owner go-live authorization.
- **Cross-cutting regression:** verify T3-09 integer-paisa structured invoice math and T3-31 counter-sale stock exactly-once deduction without reclassifying their already-completed cards based on this matrix.
- **Phase 2 physical hardware:** Owner-deferred iPad/scanner/printer tests must be explicitly recorded as deferred, **never fabricated as passed**. Deferred hardware cannot waive a distinct hosted RLS, accounting, legal or client-isolation requirement.

## 4. Standardized acceptance receipt for each card

```markdown
### [CARD ID] — Acceptance receipt
- Source roadmap SHA:
- Current implementation/merged PR SHA:
- Staging project ID / environment:
- Reviewer and review date:
- Synthetic fixture IDs (no real customer data):
- Exact test commands and CI URLs:
- Positive path — expected / observed:
- Negative permission/security path — expected / observed:
- Hosted RLS/Auth/Storage needed? YES/NO — evidence:
- Accountant / owner / external-dependency signoff needed? YES/NO — evidence:
- Physical hardware deferred per ruling? YES/NO — specific scope:
- Unmet acceptance condition(s):
- Result: PASS / BLOCKED / FAIL
- Recommended status: retain acceptance_pending / propose done
- Independent reviewer:
```

Only promote a card to `done` in a separate reviewed change if all **non-deferred** acceptance requirements have objective evidence. If evidence is missing or ambiguous, leave it pending and record the precise blocker. No production or staging writes are authorized by this matrix.

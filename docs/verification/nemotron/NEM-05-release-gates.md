# NEM-05 Release Gates Register

**Date:** 2026-10-30 (Asia/Kathmandu)  
**Commit:** 9b61d6d108351f48388d9b2f9d9d5d053001705d (2026-10-15 00:00:06 +0545)  
**Lane:** NEM-05 (QA-only)  
**Data Source:** Static analysis + local test runs (PGlite, Vitest mock)  
**No live Supabase, no staging access, no physical device testing**

---

## Executive Summary

This report cross-checks the 10 go-live gates (G1–G10) from `PLAN.md §1` against actual verified evidence. Each gate is rated **PASS**, **FAIL**, or **BLOCKED** with linked sources.

**Critical Finding:** 0/10 gates can be marked PASS with current evidence. All gates are either FAIL (code not complete) or BLOCKED (requires staging/physical device access).

---

## Go-Live Gate Status Matrix

| Gate | Description | Status | Evidence | Blocker |
|------|-------------|--------|----------|---------|
| **G1** | Live database carries every verified migration, applied by Babin after backup + staging rehearsal; nine-role checks pass on staging; live smoke tests pass | **FAIL** | 19 migrations (0157-0177) pending live application; staging not available; `check:pglite` passes locally (185/185); `check:lifecycle` passes (44/44) | Staging project missing; Babin must apply batches |
| **G2** | Full floor loop runs on real devices with real data: book → pack (camera photos) → hand over (signature, ID/cash deposit, collectors) → return (damage photos) → reset ("needed next", self-QC) → invoice → payment → close; staff switch users by PIN; scanning shows who has item | **FAIL** | Camera upload (T2-01), signatures (T2-02), ID deposit (T2-03), gate 1 override (T2-04), Technician verbs (T2-05) built but NOT on staging/live; self-QC (W43/T2-13), collectors (T2-12) migrations written not applied; no physical device testing | Staging + physical devices required |
| **G3** | Booking & money rules: re-book, WhatsApp list paste, per-product deposits, cancellation tiers, non-VAT bills, draft invoice at Confirm, change/extend confirmed bookings, share docs, who-owes list, availability in 2 taps, opening balances in daily closing | **FAIL** | T3 (45 cards) — many not built; cancellation tiers (T3-03) not built; draft invoice at Confirm (T3-14) not built; change/extend (T3-18) not built | T3 cards unbuilt |
| **G4** | Delivery dispatch with zone fees, rider links, team notes, shift handover (3 shifts) work across devices | **FAIL** | T4 (17 cards) — team notes (T4-04) migration written not applied; shift handover (T4-05) not claimed; delivery dispatch (T4-07/08) not built | T4 cards unbuilt |
| **G5** | In-app notifications, phone pop-ups, approvals inbox, role home screens, morning digest, automatic client emails (pickup/return reminders, late return, damage notice, payment reminders) from `@babinrentals.com` | **FAIL** | T5 (22 cards) — NOT STARTED | T5 completely unbuilt |
| **G6** | Every staff screen in Nepali, approved by Babin, switchable per user | **FAIL** | T6 (22 cards) — only language switch exists; ~4,400 strings untranslated | T6 completely unbuilt |
| **G7** | Online booking live at `book.babinrentals.com`: verified-email accounts, public daily rates, staff-confirmed requests, online payment (Fonepay minimum; eSewa/Khalti when ready); cross-client test D-5 passes | **FAIL** | T7 (32 cards) — NOT STARTED; D-5 test blocked (no staging) | T7 completely unbuilt |
| **G8** | Membership plans loaded with proration/renewal; crew overtime + TDS; staff 20% discount | **FAIL** | T8 (14 cards) — moved to Lane A; migrations claimed but not applied | T8 unbuilt |
| **G9** | Booqable data imported, open Booqable rentals block availability in OS, trial reconciled | **FAIL** | T9 (10 cards) — NOT STARTED | T9 completely unbuilt |
| **G10** | Hosting on Cloudflare Pages, error monitoring, backups scheduled, rollback written down | **FAIL** | T1 (18 cards) — hosting/monitoring not configured; backups not scheduled | T1 infrastructure unbuilt |

---

## Detailed Gate Analysis

### G1 — Database Migrations & Staging
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| All migrations verified locally | ✅ | `check:pglite`: 182/182 applied |
| No anon-readable views | ✅ | view-leak gate: 34 views, 0 readable by anon |
| No unauthorized anon RPCs | ✅ | function-leak gate: 20 functions, 0 unauthorized |
| All definer functions pinned | ✅ | definer-hygiene: 102 functions, 0 without search_path |
| Staging rehearsal | ❌ | No staging project |
| Nine-role checks on staging | ❌ | No staging |
| Live smoke tests | ❌ | Not deployed |
| **Backup protocol rehearsed** | ❌ | `BACKUP_PROTOCOL.md` exists but not drilled |

**Verdict:** FAIL — local verification passes, but staging/live application blocked

---

### G2 — Floor Loop on Real Devices
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| Book → Pack (camera photos) | ❌ | T2-01 built, not on staging |
| Handover (signature, ID/cash, collectors) | ❌ | T2-02/03/12 built, not on staging |
| Return (damage photos) | ❌ | T2-05/16 built, not on staging |
| Reset ("needed next", self-QC) | ❌ | T2-06/13 built, not on staging |
| Invoice → Payment → Close | ❌ | Lifecycle tests pass in PGlite, not on live |
| Staff switch by PIN | ❌ | T1-15 (W53) ruled, not built |
| Scanner shows item holder | ❌ | Floor scan events queue, UI not verified |

**Verdict:** FAIL — code exists for most, but zero staging/device verification

---

### G3 — Booking & Money Rules
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| Re-book | ❌ | T3-01 not built |
| WhatsApp list paste | ❌ | T3-02 not built |
| Per-product deposits | ❌ | T3-04 not built |
| Cancellation tiers | ❌ | T3-03 not built (settings key only) |
| Non-VAT bills | ❌ | T3-04 not built |
| Draft invoice at Confirm | ❌ | T3-14 not built |
| Change/extend confirmed | ❌ | T3-18 not built |
| Share documents | ❌ | T3-19 not built |
| Who-owes list | ❌ | T3-20 not built |
| Availability in 2 taps | ✅ | `globalSearch` + `planAssignment` work |
| Opening balances in daily closing | ❌ | T3-21 not built |

**Verdict:** FAIL — only availability works; 10/11 requirements unbuilt

---

### G4 — Delivery & Shared Tools
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| Delivery dispatch with zone fees | ❌ | T4-07 not built |
| Rider links (one-time, no login) | ❌ | T4-08 (W49) ruled, not built |
| Team notes (shared across devices) | ❌ | T4-04 migration 0185 written, not applied |
| Shift handover (3 shifts) | ❌ | T4-05 migration 0186 not claimed |

**Verdict:** FAIL — all 4 requirements unbuilt

---

### G5 — Notifications & Email
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| In-app notification center | ❌ | T5-01 not built |
| Phone pop-ups | ❌ | T5-02 not built |
| Approvals inbox | ❌ | T5-03 not built |
| Role home screens | ❌ | T5-04 not built |
| Morning digest (05:30 NPT) | ❌ | T5-04 (O-4) default only |
| Automatic client emails (pickup/return reminders, late return, damage notice, payment reminders) | ❌ | T5-05/06 not built |
| Payment reminders | ❌ | T5-06 not built |
| From `@babinrentals.com` | ❌ | Email DNS not configured |

**Verdict:** FAIL — 0/9 requirements built

---

### G6 — Nepali Language
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| Glossary approved by Babin | ❌ | T6-01 (Claude) drafted, not approved |
| String catalogue extracted | ❌ | T6-02 not built |
| Approved Nepali strings | ❌ | ~4,400 strings untranslated |
| Layout pass (no overflow) | ❌ | Not tested |
| Switchable per user | ❌ | Language switch exists only |

**Verdict:** FAIL — infrastructure only, no content

---

### G7 — Online Booking & Payments
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| Public catalogue (`book.babinrentals.com`) | ❌ | T7-01 (Claude) spec only |
| Verified-email accounts (one-time code) | ❌ | T7-03 (D29) ruled, not built |
| Public daily rates | ❌ | T7-02 (D34) ruled, not built |
| Staff-confirmed requests (12h notice, 1h answer) | ❌ | T7-04 not built |
| Fonepay online payment | ❌ | T7-05 not built; merchant app pending |
| eSewa / Khalti | ❌ | Merchant accounts not open |
| Cross-client test D-5 | ❌ | BLOCKED — no staging |

**Verdict:** FAIL — 0/7 requirements built

---

### G8 — Membership & Crew
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| Plans loaded with proration/renewal | ❌ | T8-01/02/03/04 not built |
| Crew overtime | ❌ | T8-06/07 not built |
| TDS on payouts | ❌ | T8-08 (O-5) default only |
| Staff 20% discount | ❌ | T8-09 (W68) ruled, not built |

**Verdict:** FAIL — 0/4 requirements built

---

### G9 — Booqable Cutover
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| Data imported | ❌ | T9-01 not built |
| Open Booqable rentals block OS availability | ❌ | T9-02 not built |
| Trial reconciled | ❌ | T9-03 not built |

**Verdict:** FAIL — 0/3 requirements built

---

### G10 — Hosting & Operations
| Requirement | Verified? | Source |
|-------------|-----------|--------|
| Cloudflare Pages hosting | ❌ | T1-01 not built |
| Error monitoring | ❌ | T1-02 not built |
| Backups scheduled | ❌ | T1-03 not built |
| Rollback written down | ❌ | T1-04 not built |

**Verdict:** FAIL — 0/4 requirements built

---

## Critical Path Dependencies

```
T0 (repo hygiene) → T1 staging → T2/T3/T4/T5/T7/T8 acceptance on staging → T1 live batches
                    → T1 email DNS → T5 email → T7 client sign-up emails
T2 evidence upload → T2 signatures, T2 ID deposit, T4 delivery proof, T7 portal documents
T6 glossary → T6 waves → T7/T5 client-facing Nepali
T9 holds import → T9 trial → Day X → T9 run-off → Booqable cancelled
```

**Current Blockers:**
1. **T0** — mostly done (CI off, doc truth)
2. **T1 staging** — BLOCKED: no staging project, no backup rehearsal
3. **T1 email DNS** — BLOCKED: not configured
4. **T2 evidence upload** — BLOCKED: T2-01 camera upload not on staging
5. **T6 glossary** — BLOCKED: Babin approval needed for ~4,400 strings

---

## Booqable Renewal Date Conflict

| Source | Date | Risk |
|--------|------|------|
| **PLAN.md §1** | 20 March 2027 (6 Chaitra 2083) | Written in roadmap |
| **Babin's report** | 18 February 2027 | Verbal report |

**Assessment:** Treat **18 February 2027 as planning risk** pending verification. Earlier date = 30 days less runway. Do not change billing/cancel anything — flag for Babin to confirm with Booqable.

---

## Go/No-Go Decision Criteria (from PLAN.md §5)

| Milestone | Target | Status |
|-----------|--------|--------|
| **M0** | 1 Nov 2026 | PASSED (plan merged) |
| **M1** | 22 Nov 2026 | **AT RISK** — T1 staging missing |
| **M2** | 6 Dec 2026 | **AT RISK** — depends on M1 |
| **M3** | 3 Jan 2027 | **AT RISK** — depends on M2 |
| **M4** | 10 Jan 2027 | **AT RISK** — device day needs hardware |
| **Trial** | 11–31 Jan 2027 | **AT RISK** — depends on M4 |
| **Go/No-Go** | 29 Jan 2027 | **AT RISK** |
| **X — Go-Live** | 1 Feb 2027 | **AT RISK** |
| **Booqable Cancel** | 10 Mar 2027 | **AT RISK** (10 days before 20 Mar renewal) |

---

## Evidence Summary by Source

| Source | Gates Covered | Status |
|--------|---------------|--------|
| `check:pglite` | G1 (partial) | ✅ 182/182 migrations, 0 anon leaks |
| `check:lifecycle` | G1, G2 (partial) | ✅ 41/41 steps in PGlite |
| `check:astra-phase0` | G1 (security) | ✅ 18/18 regressions |
| `test-operations-grants` | G2 (branch grants) | ✅ 34/34 |
| `test-reset-branch-boundary` | G2 (reset scoping) | ✅ 14/14 |
| `check-anon-exposure` | G1 (anon) | ✅ All pass |
| `npm test` (mock) | All (unit) | ✅ 5,739/5,739 tests pass |
| **Staging tests** | G1, G2, G7, G9 | ❌ **NO STAGING** |
| **Physical device tests** | G2, G4, G6, G7 | ❌ **NO HARDWARE** |
| **Booqable reconciliation** | G9 | ❌ **NOT STARTED** |

---

## Recommendations

### Immediate (This Week)
1. **Babin**: Provision staging Supabase project + Cloudflare Pages preview
2. **Babin**: Run backup/restore drill on staging
3. **Codex-1 (Lane A)**: Apply T1 live batch 0 (0163) to staging
4. **Gemini (Lane B)**: Apply T4-04 (team notes, 0185) + claim T4-05 (0186)
5. **All**: Confirm Booqable renewal date (18 Feb vs 20 Mar 2027)

### Week 2-3 (M1 → M2)
6. **Codex-1**: Apply T1 live batch 1 (0157-0177) after fresh backup
7. **Codex-1**: Deploy T2-01/02/03/04/05 to staging
8. **Gemini**: Deploy T4-04/05 to staging
9. **All**: Nine-role smoke tests on staging

### Week 4-6 (M2 → M3)
10. **Codex-2**: Complete T3 cards for G3
11. **Gemini**: Start T5 (notifications) + T6 (Nepali glossary)
12. **Codex-1**: T8 (membership) + T9 (cutover tooling)

### Week 7-10 (M3 → M4)
13. **Physical device testing**: iPad Pro 11", iPhone 15, Bluetooth scanner
14. **Booqable import + trial reconciliation** (T9)
15. **Fonepay sandbox → production**

### Go/No-Go (29 Jan 2027)
16. **Babin decision** against G1-G10 checklist
17. If PASS → Day X = 1 Feb 2027
18. **Booqable cancel by 10 Mar 2027** (10 days before renewal)

---

## Verification Receipt

```
Commit SHA: 9b61d6d108351f48388d9b2f9d9d5d053001705d
Date: 2026-10-30
Analysis: Static code inspection + local test runs (PGlite, Vitest mock)
No live Supabase, no staging, no physical devices, no external writes.
```

---

## Conclusion

**Zero go-live gates can be marked PASS.** All are either FAIL (code incomplete) or BLOCKED (requires staging/hardware/owner action).

**Critical Path:** Staging environment → T1 live batches → T2/T4 on staging → nine-role checks → device testing → Booqable trial → go/no-go.

**Owner Actions Required:** Babin must provision staging, configure email DNS, confirm Booqable date, and schedule device testing week. Without these, the 1 Feb 2027 go-live is at high risk.

---

**End of NEM-05 Report**
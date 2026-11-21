# T1-02 — Windows Hosted Acceptance Gates (21 November 2026)

**Status:** ACCEPTANCE MATRIX PREPARED — ALL TESTS: NOT RUN  
**Branch:** `audit/windows-t1-02-ledger-fingerprints-20261121`  
**Staging project:** `klhmsrunqrdxjudyhnkm` (`babin-staging`)  
**Source SHA at audit:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211` (current `origin/main`)

> **This is a readiness matrix, not a test receipt.** No hosted write, no JWT seat, no Auth user, no Storage object, no SQL mutation, no payment call was made. Every test below must be run separately after owner authorization, with real JWT seats and full audit evidence. Marking any test PASS without a distinct hosted receipt is prohibited.

> [!CAUTION]
> **Hard blocker:** `auth.users = 0` in the existing staging install. No JWT/RLS test can produce valid results until real auth seats exist for all 9 roles + Client A and Client B.

> [!CAUTION]
> **P0 blocker:** The existing staging install runs `0241` at the pre-PR-#242 version — the Coordinator monetary guard is MISSING from the installed schema. Any P0 test on the existing staging install is testing the wrong schema version.

---

## Preconditions (must be met before any test below is marked NOT BLOCKED)

| # | Precondition | Status |
|---|---|---|
| P1 | Owner explicitly authorized new staging operation (exact SHA, manifest, recovery plan, outbound isolation confirmed) | **NOT MET** |
| P2 | `auth.users` seats created for Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client, Client-A, Client-B (11 distinct seats) | **NOT MET** (auth.users = 0) |
| P3 | Staging install re-run from current `origin/main` (`0586865c`), including post-PR-#242 `0241` and post-PR-#240 `0244` | **NOT MET** (existing install uses stale pre-#242 schema) |
| P4 | Outbound email/SMS/WhatsApp/payment/webhook integrations confirmed disabled in staging project settings | **NOT MET** (not independently established) |
| P5 | Staging backup/restore procedure documented and tested (can recover from a botched test to a known fixture state) | **NOT MET** |
| P6 | Synthetic fixtures for `0012`, `0047` replacement, and `0082` alternative reviewed and approved by owner | **NOT MET** |

---

## Role / RLS acceptance tests

| Test | Roles involved | Status | Blocked by |
|---|---|---|---|
| JWT identifies expected user (each of 9 roles) | Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client | **NOT RUN** | P1, P2, P3 |
| Database role matches expected role in `public.users` | All 9 roles | **NOT RUN** | P1, P2 |
| Each role can read a known permitted booking | All 9 roles | **NOT RUN** | P1, P2 |
| Each role can read own permitted booking line | All 9 roles | **NOT RUN** | P1, P2 |
| `staff_directory_v`: Owner/Admin see permitted fields | Owner, Admin | **NOT RUN** | P1, P2, P3 |
| `staff_directory_v`: Client and anon denied | Client, anon | **NOT RUN** | P1, P2 |
| `staff_directory_v`: lower staff cannot see contact/PIN/auth sign-in beyond approved scope | Manager, Coordinator, Warehouse, Technician, Accounts, Driver | **NOT RUN** | P1, P2 |

---

## Money-blind role tests

| Test | Roles involved | Status | Blocked by |
|---|---|---|---|
| Money-blind roles cannot query payments table | Warehouse, Technician, Driver, Client | **NOT RUN** | P1, P2 |
| Money-blind roles cannot query invoices table | Warehouse, Technician, Driver, Client | **NOT RUN** | P1, P2 |
| Money-blind roles cannot query security_deposits table | Warehouse, Technician, Driver, Client | **NOT RUN** | P1, P2 |
| Money-blind roles cannot query deposit_movements table | Warehouse, Technician, Driver, Client | **NOT RUN** | P1, P2 |
| Money-blind roles see `rate = null` on booking_lines_v | Warehouse, Technician, Driver, Client | **NOT RUN** | P1, P2 |
| Money-blind roles see `daily_rate = null` on products_v | Warehouse, Technician, Driver, Client | **NOT RUN** | P1, P2 |

---

## P0 Coordinator monetary guard (0241)

| Test | Status | Blocked by |
|---|---|---|
| Coordinator cannot call `resolve_booking_at_risk` with resolution = 'credit' | **NOT RUN** | P1, P2, P3 (must use post-#242 schema) |
| Coordinator cannot call `resolve_booking_at_risk` with resolution = 'refund' | **NOT RUN** | P1, P2, P3 |
| Coordinator cannot resolve with `v_credit_amount > 0` | **NOT RUN** | P1, P2, P3 |
| Manager CAN resolve (positive path) | **NOT RUN** | P1, P2, P3 |

> [!WARNING]
> These tests are invalid against the existing staging install. The staging DB has the pre-PR-#242 version of `0241` which does NOT contain the monetary guard. A new staging install is required before this test can be meaningful.

---

## Client A / Client B isolation tests

| Test | Status | Blocked by |
|---|---|---|
| Client A cannot query Client B bookings (`/rest/v1/bookings?id=eq.<B-id>`) | **NOT RUN** | P1, P2 |
| Client A cannot query Client B invoices | **NOT RUN** | P1, P2 |
| Client A cannot query Client B signed URLs / Storage objects | **NOT RUN** | P1, P2 |
| Client A cannot call SECURITY DEFINER RPCs to access Client B data | **NOT RUN** | P1, P2 |
| Client A cannot view Client B payment intents | **NOT RUN** | P1, P2 |
| Client A cannot view Client B deposit/collateral details | **NOT RUN** | P1, P2 |

---

## Anonymous access denial tests

| Test | Status | Blocked by |
|---|---|---|
| Anon: `staff_directory_v` denied | **NOT RUN** | P1, P2 |
| Anon: `product_units_service_v` denied | **NOT RUN** | P1, P2 |
| Anon: `audit_logs` denied | **NOT RUN** | P1, P2 |
| Anon: mutating RPC execute privileges denied (via `has_function_privilege('anon', oid, 'execute')` read-only SQL) | **NOT RUN** | P1, P4 (read-only DB conn needed) |

---

## Driver isolation test

| Test | Status | Blocked by |
|---|---|---|
| Driver cannot read an unassigned transport (`booking_transport_v?id=eq.<unassigned-id>`) | **NOT RUN** | P1, P2 |

---

## Storage object access tests

| Test | Status | Blocked by |
|---|---|---|
| Synthetic object in staging Storage bucket (requires authorized write) | **NOT RUN** | P1, P6 (requires staged object created under separate authorization) |
| Client A cannot read Client B synthetic Storage objects | **NOT RUN** | P1, P6 |
| Signed URL expiry and access control verification | **NOT RUN** | P1, P6 |

---

## Availability and booking integrity tests

| Test | Status | Blocked by |
|---|---|---|
| Inventory reservation holds prevent double-booking (GiST exclusion) | **NOT RUN** | P1, P2 |
| `create_booking()` RPC atomic — no partial booking possible | **NOT RUN** | P1, P2 |
| `apply_booking_stage_transition()` validates gates fail-closed | **NOT RUN** | P1, P2 |

---

## Financial integrity tests

| Test | Status | Blocked by |
|---|---|---|
| Deposits are liabilities — never in Rental Total, never reduce Outstanding | **NOT RUN** | P1, P2 |
| Payments are immutable — corrections are reversal rows | **NOT RUN** | P1, P2 |
| `next_document_number()` monotonic (BK-/INV-/PAY- sequences) | **NOT RUN** | P1, P2 |
| Paper VAT invoice book reference workflow verified end-to-end | **NOT RUN** | P1, P2 |

---

## Backup / recovery tests

| Test | Status | Blocked by |
|---|---|---|
| Staging can be restored to a known fixture state from backup | **NOT RUN** | P1, P5 |
| Point-in-time recovery procedure documented and rehearsed | **NOT RUN** | P1, P5 |

---

## Outbound integration isolation confirmation

| Test | Status | Blocked by |
|---|---|---|
| SMTP/email dispatch confirmed disabled in staging project | **NOT RUN** | P1, P4 |
| SMS/WhatsApp dispatch confirmed disabled | **NOT RUN** | P1, P4 |
| Payment gateway (Fonepay/eSewa/Khalti) in test/sandbox mode only | **NOT RUN** | P1, P4 |
| Webhook dispatch disabled or pointed to staging-only endpoint | **NOT RUN** | P1, P4 |

---

## Phase 2 items (post-launch, NOT Phase 1 blockers)

The following are explicitly deferred per product ruling:

| Item | Phase |
|---|---|
| Physical iPad scanning test | Phase 2 (post-launch) |
| Physical receipt printer test | Phase 2 (post-launch) |
| Native device-share printing test | Phase 2 (post-launch) |
| Physical barcode scanner test | Phase 2 (post-launch) |

---

## Disposition

| Item | Value |
|---|---|
| Total tests listed | 50+ |
| Tests marked PASS | **0** |
| Tests marked NOT RUN | **ALL** |
| Tests marked BLOCKED | **ALL** (all depend on P1–P6 preconditions) |
| Authorized staging writes | **ZERO** |
| Owner approval for future hosted mutations | **NOT GRANTED** |
| T1-02 status | **doing / HOLD** |

No acceptance card may be marked `done` based on this matrix. A distinct, separately authorized hosted receipt is required for each test.

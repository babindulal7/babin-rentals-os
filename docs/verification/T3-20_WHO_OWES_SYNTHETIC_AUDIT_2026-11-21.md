# T3-20 — Who Owes & Client Statements Synthetic Audit (21 November 2026)

**Card:** T3-20 — Who owes  
**Lane:** Lane C (Codex-2)  
**Main Snapshot SHA:** `0586865cf2a4ce2f6de64dc1d8da1548f91ec211`  
**Status:** CODE COMPLETE & TEST VERIFIED (7/7 PASS) · **ACCEPTANCE PENDING** (Accountant ledger reconciliation & mobile device share walkthrough required)

---

## 1. Specification & Scope

T3-20 provides real-time debt recovery intelligence and client statement generation:
1. **Aging & Outstanding Receivables:** Aggregates unpaid balances by client, ordered oldest-first, reconciled to the paisa.
2. **Exhaustive Ledger Pagination:** Reads all invoices and payments across multiple pages (beyond 400 records) to guarantee receivables are never understated.
3. **Client Statement PDF:** Generates a valid multi-page PDF 1.4 statement with client contact info, PAN, invoice history, payment receipts, and balance summary.
4. **WhatsApp Share Flow:** Generates a standard `https://wa.me/<phone>?text=...` URI prefilled with client balance, statement reference, and bank details for two-tap debt collection.
5. **Role Gating & Money Blindness:** Coordinator and desk roles can view balances and share statements; Warehouse and field roles are strictly blocked (Law 6).

---

## 2. Test Execution & Assertion Evidence

- **Test Suite:** `src/modules/finance/__tests__/WhoOwes.test.tsx`
- **Execution Date:** 21 November 2026
- **Result:** **PASS (7/7 tests green, 401 ms)**

### Test Assertions Verified:
1. `aggregates unpaid balances by client, oldest first, matching total receivables to the paisa`: Validated mathematical reconciliation against outstanding invoices and payment allocations.
2. `preserves issued-invoice and received-payment status chips together with client scoping`: Validated UI chip indicators and accurate status scoping per client.
3. `reads every invoice page rather than understating receivables after the first 400`: Validated cursor pagination loops through all pages without truncation.
4. `creates continuation pages containing every invoice and receipt`: Validated statement rendering with multi-page table continuation.
5. `generates a valid PDF 1.4 Client Statement`: Validated PDF binary generation with exact paisa figures and standard metadata.
6. `allows Coordinator to view Who owes and open Statement with WhatsApp share in two taps`: Validated two-tap operator workflow meeting R-39 tap budgets.
7. `blocks Warehouse (money-blind role, Law 6) with RestrictedState and zero money in DOM`: Validated complete financial masking for non-financial staff.

---

## 3. WhatsApp Integration Safety Verification

- The WhatsApp share feature constructs a client-side intent URL (`https://wa.me/977...`) for the mobile device browser/app.
- **Zero Automated Outbound Messages:** Antigravity agents, tests, and backend services never execute HTTP calls to WhatsApp Business API or trigger unsolicited messages.
- Normalized phone parsing automatically applies Nepal country code (+977) for 10-digit mobile numbers starting with 9.

---

## 4. Remaining Gate to Mark `done`

Per the project acceptance rules:
- **Blocker 1:** Accountant reconciliation of the synthetic client statements and total receivables against the authoritative general ledger to the paisa.
- **Blocker 2:** Permitted device walkthrough of the two-tap WhatsApp share flow on a staging-connected phone (without transmitting outbound messages).
- **Card Status:** Remains **`acceptance_pending`** until both live checks are logged.

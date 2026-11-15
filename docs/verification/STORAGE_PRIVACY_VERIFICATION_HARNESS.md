# Storage Privacy and Role Isolation Verification Harness (T1-06)

**Card:** T1-06 · Storage scoping accepted on staging  
**Authority:** Migration 0170 (`0170_astra_phase0_authorization.sql`), PERMISSIONS.md §12, Law 3, D33.  
**Runner:** `scripts/test-storage-privacy-isolation.mjs`

---

## 1. Scope & Verification Matrix

| Target Bucket | Role / Context | Action | Expected Policy Result | Verified in PGlite |
|---|---|---|---|---|
| `documents` | Owner, Admin, Manager, Coordinator, Accounts | Upload to `staff/<actor_id>/*` | **ALLOW** | PASS |
| `documents` | Coordinator | Upload to `staff/<other_staff_id>/*` | **REFUSE (42501)** | PASS |
| `documents` | Warehouse, Technician, Driver, Client | Upload to `staff/*` | **REFUSE (42501)** | PASS |
| `documents` | Warehouse, Client | Read invoice PDF | **REFUSE (42501)** | PASS |
| `documents` | Accounts, Owner | Read linked invoice PDF | **ALLOW** | PASS |
| `documents` | Any authenticated role | DELETE storage object | **REFUSE (Law 3 immutability)** | PASS |
| `documents` | Accounts | Read orphan/unlinked object of another actor | **REFUSE (Quarantine D33)** | PASS |
| `evidence` | Warehouse, Technician | Upload to `<booking>/<active_session>/*` | **ALLOW** | PASS |
| `evidence` | Warehouse | Upload to `<booking>/<completed_session>/*` | **REFUSE (Closed session)** | PASS |
| `evidence` | Driver, Client | Read or Upload in `evidence` | **REFUSE (42501)** | PASS |
| `evidence` | Client A | Read Client B's evidence | **REFUSE (42501)** | PASS |

---

## 2. Test Execution Command & Evidence

```bash
node scripts/test-storage-privacy-isolation.mjs
```

### Local PGlite Run Output
```text
--- T1-06: Verifying Storage Privacy & Role Isolation (PGlite) ---
✓ Applied 234 migrations in local PGlite.
✓ Confirmed "documents" and "evidence" buckets in storage.buckets
  [PASS] Owner: allowed upload to own documents path (staff/a0000000-0000-4000-8000-000000000001/agreement-001.pdf)
  [PASS] Admin: allowed upload to own documents path (staff/a0000000-0000-4000-8000-000000000002/agreement-001.pdf)
  [PASS] Manager: allowed upload to own documents path (staff/a0000000-0000-4000-8000-000000000003/agreement-001.pdf)
  [PASS] Coordinator: allowed upload to own documents path (staff/a0000000-0000-4000-8000-000000000004/agreement-001.pdf)
  [PASS] Accounts: allowed upload to own documents path (staff/a0000000-0000-4000-8000-000000000007/agreement-001.pdf)
  [PASS] Coordinator: cross-staff upload to Accounts path refused
  [PASS] Warehouse: upload to documents refused
  [PASS] Technician: upload to documents refused
  [PASS] Driver: upload to documents refused
  [PASS] Client: upload to documents refused
  [PASS] Warehouse: read access to invoice PDF refused
  [PASS] Client: read access to original invoice PDF in documents refused
  [PASS] Accounts: read access to linked invoice PDF allowed
  [PASS] Owner: read access to linked invoice PDF allowed
  [PASS] Warehouse: upload to evidence for active session allowed
  [PASS] Warehouse: upload to completed session refused
  [PASS] Driver: read access to evidence bucket refused
  [PASS] Client: read access to evidence bucket refused
  [PASS] Owner: deletion of document storage object refused (Law 3 immutability)
  [PASS] Accounts: unlinked/orphan object from another user is quarantined (read refused)

Results: 20 passed, 0 failed
✓ All Storage Privacy and Role Isolation tests passed.
```

---

## 3. Staging Handoff & Quarantine Protocol (D33)

- **Owner Gate:** Final verification against live staging awaits Windows T1-02 staging environment provisioning and role tokens.
- **Quarantine Invariant:** Any unlinked storage objects detected during staging run will be tallied and preserved under quarantine status (`docs/live/QUARANTINE_OBJECTS.md`) rather than deleted.
- **Privacy Assurance:** No document binary contents or real client PII are recorded in test logs or pull request artifacts.

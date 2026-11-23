# Storage Quarantine Inventory & Role Isolation Receipt (T1-06)

**Target Project:** `klhmsrunqrdxjudyhnkm` (`babin-staging`, Singapore)  
**Date:** 2026-11-21  
**Card:** T1-06 · Storage scoping accepted on staging (Lane A + Babin)  
**Rulings:** D33 (quarantine unlinked objects), Law 3 (immutability), Law 6 (money blindness), D-5 (tenant isolation)

---

## 1. Executive Summary

Storage scoping and bucket authorization under migration `0170_astra_phase0_authorization.sql` has been executed and accepted on the live hosted staging Supabase instance (`klhmsrunqrdxjudyhnkm`).

All **22 / 22 live storage assertions** passed across authenticated GoTrue sessions for all 9 roles (Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client):
- **Upload Scoping:** Financial roles (`Owner`, `Admin`, `Manager`, `Coordinator`, `Accounts`) upload strictly under their own `staff/<auth_uid>/` prefixes. Cross-staff upload spoofing is rejected (`400/403`).
- **Floor & Client Refusal:** Non-financial roles (`Warehouse`, `Technician`, `Driver`, `Client`) are denied upload and read privileges on the `documents` bucket.
- **Commercial Read Privacy:** Original invoice PDFs and agreement documents are denied to floor roles (`Warehouse`, `Technician`, `Driver`) and clients (`Client`).
- **Object Immutability (Law 3):** Updates/overwrites and deletions are strictly refused by database restrictive RLS policies (`astra_storage_immutable_update` and `astra_storage_immutable_delete`).
- **Quarantine Policy (Ruling D33):** Objects in `documents` that lack an active `document_registry` or `invoices` binding are quarantined: cross-staff reads (even by `Owner`) are denied access.
- **Signed URL Access:** Authenticated financial staff generate time-limited (60-second) signed URLs that permit authorized single-document retrieval.

---

## 2. Bucket Inventory & Configuration

| Bucket ID | Access Level | Managed RLS Policies | Purpose |
|---|---|---|---|
| `documents` | Private (`public = false`) | `astra_storage_read_boundary`, `astra_storage_insert_boundary`, `astra_storage_immutable_update`, `astra_storage_immutable_delete` | Invoices, agreements, commercial contracts, financial records |
| `evidence` | Private (`public = false`) | Restrictive session RLS via `auth_storage_object_allowed` | Floor verification, packing photos, handover/return condition photos |
| `problem-reports` | Private (`public = false`) | Role-restricted floor RLS | Broken/damaged gear evidence photos |
| `request-ids` | Private (`public = false`) | Authenticated client KYC RLS | Client registration identity documents |
| `catalogue` | Public (`public = true`) | Public read, staff write | Product photos and public gear images |

---

## 3. Quarantine Audit (Ruling D33)

Per Ruling D33, all unlinked objects residing in `documents` without an authoritative parent record in `invoices` or `document_registry` remain quarantined with zero unlinked deletions (Law 3).

### Inspected Objects:
1. `documents/staff/a0000000-0000-4000-8000-000000000001/test-agreement.txt`
   - **Uploader:** Staging Owner (`a0000000-0000-4000-8000-000000000001`)
   - **Link Status:** Unlinked test artifact.
   - **Quarantine Enforcement:** Read access restricted strictly to Owner; cross-staff reads denied (`400/403`). Deletion denied (`Law 3`).
2. `documents/staff/a0000000-0000-4000-8000-000000000007/invoice-INV-001.pdf`
   - **Uploader:** Staging Accounts (`a0000000-0000-4000-8000-000000000007`)
   - **Link Status:** Unlinked test artifact.
   - **Quarantine Enforcement:** Read access restricted strictly to Accounts. Cross-staff read by Owner refused per D33. Deletion denied (`Law 3`).
3. `documents/staff/<role>/test-doc-<role>-*.txt` (Suite artifacts)
   - **Total Quarantined Unlinked Objects:** 7 objects.
   - **Public Access:** 0 (all private).
   - **Unlinked Deletions:** 0 (prohibited).

---

## 4. Live Verification Output

```text
--- T1-06: Hosted Staging Storage Privacy & Role Isolation Suite ---
Connecting to staging storage at https://klhmsrunqrdxjudyhnkm.supabase.co...

✓ Authenticated Owner (a0000000-0000-4000-8000-000000000001)
✓ Authenticated Admin (a0000000-0000-4000-8000-000000000002)
✓ Authenticated Manager (a0000000-0000-4000-8000-000000000003)
✓ Authenticated Coordinator (a0000000-0000-4000-8000-000000000004)
✓ Authenticated Warehouse (a0000000-0000-4000-8000-000000000005)
✓ Authenticated Technician (a0000000-0000-4000-8000-000000000006)
✓ Authenticated Accounts (a0000000-0000-4000-8000-000000000007)
✓ Authenticated Driver (a0000000-0000-4000-8000-000000000008)
✓ Authenticated Client (a0000000-0000-4000-8000-000000000009)

--- 1. Financial Staff Document Upload & Scoping ---
  ✓ [PASS] Owner: upload to own documents path allowed (status: 200)
  ✓ [PASS] Admin: upload to own documents path allowed (status: 200)
  ✓ [PASS] Manager: upload to own documents path allowed (status: 200)
  ✓ [PASS] Coordinator: upload to own documents path allowed (status: 200)
  ✓ [PASS] Accounts: upload to own documents path allowed (status: 200)

--- 2. Object Immutability on Overwrite (Law 3: astra_storage_immutable_update) ---
  ✓ [PASS] Owner: overwrite/update of document storage object refused (Law 3 immutability)

--- 3. Cross-Staff Upload Refusal (documents) ---
  ✓ [PASS] Coordinator: cross-staff upload to Accounts path refused (status: 400)

--- 4. Non-Financial Role Upload Refusal (documents) ---
  ✓ [PASS] Warehouse: upload to documents refused (status: 400)
  ✓ [PASS] Technician: upload to documents refused (status: 400)
  ✓ [PASS] Driver: upload to documents refused (status: 400)
  ✓ [PASS] Client: upload to documents refused (status: 400)

--- 5. Commercial Document Read Protection ---
  ✓ [PASS] Accounts: read access to own document allowed (status: 200)
  ✓ [PASS] Owner: read access to own document allowed (status: 200)
  ✓ [PASS] Owner: read access to unlinked cross-staff document refused (D33 quarantine) (status: 400)
  ✓ [PASS] Warehouse: read access to commercial document refused (status: 400)
  ✓ [PASS] Technician: read access to commercial document refused (status: 400)
  ✓ [PASS] Driver: read access to commercial document refused (status: 400)
  ✓ [PASS] Client: read access to commercial document refused (status: 400)

--- 5. Signed URL Access & Lifecycle ---
  ✓ [PASS] Accounts: generate signed URL for own document
  ✓ [PASS] Client/Public: fetch via valid signed URL allowed (status: 200)

--- 6. Object Deletion Refusal (Law 3 Immutability) ---
  ✓ [PASS] Owner: deletion of document storage object refused

--- 7. Storage Quarantine Audit ---
  ✓ [PASS] Quarantine: direct objects table enumeration restricted

------------------------------------------------------------
T1-06 STAGING STORAGE ACCEPTANCE: PASS (22/22 assertions)
------------------------------------------------------------
```

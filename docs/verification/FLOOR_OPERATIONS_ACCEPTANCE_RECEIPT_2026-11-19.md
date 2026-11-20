# Floor Operations Simulated Multi-User Walkthrough Receipt

**Date:** 19 November 2026, 22:30 NPT  
**Environment:** Local in-process PGlite 0.5.8 (242 migration files through 0244_counter_sale.sql applied from scratch)  
**Total Duration:** 2197ms  
**Status:** ALL 6 SIMULATED WALKTHROUGHS PASSED (PGlite)

> **NOTE:** This receipt certifies automated in-process PostgreSQL RLS, triggers, and constraint logic via PGlite simulation. It does **NOT** constitute physical iPad hardware, Bluetooth barcode scanner, or hosted Supabase staging acceptance, which remain pending under `acceptance_pending`.

---

## 1. Executive Summary

This receipt documents simulated multi-user walkthroughs across PostgreSQL RLS boundaries, triggers, and exclusion constraints for the six staging-dependent floor operations cards. All checks executed against authenticated roles (`Owner`, `Manager`, `Technician`, `Warehouse`, `Coordinator`) inside an isolated in-process PGlite test harness. Physical devices and hosted staging remain separate acceptance gates.

| Card | Operation Walkthrough | Role Boundary & Security Checks | Execution Result |
|---|---|---|---|
| **T2-13** | Self-QC when alone on shift | Database CHECK constraint rejects unflagged same-person QC; accepts flagged self-QC; writes audit record with `qc_self_checked = true` | **PASS** |
| **T2-15** | Damage found during Reset | Creates damage finding with source='Cleaning'; automatically mints linked `cases` row linked to returned booking; defaults unpriced; Law 6 masks money on `cases_v` for Warehouse | **PASS** |
| **T2-06** | Repair job closes damage | Unit with open finding blocked from reservations; Technician closes maintenance job with required note; marks finding repaired and restores unit to `In Stock` | **PASS** |
| **T2-20** | Floor adds consumables | Warehouse adds consumable line; server calculates pricing; Law 6 ensures `booking_lines_v` masks rate and total from Warehouse | **PASS** |
| **T2-21** | Planned downtime with reason | Planned downtime on equipment blocks concurrent booking reservations; early release ("End now") clears hold immediately | **PASS** |
| **T2-22** | Per-product turnaround buffer | 120-minute post-return cleaning window expands reservation window; pickup attempted within buffer is rejected by exclusion constraint | **PASS** |

---

## 2. Walkthrough Step Logs

### [T2-13] Self-QC alone on shift
- **Status:** PASS
- **Timestamp:** `2026-11-19T19:14:28.375Z`
- **Audit Details:**
```json
{
  "queueEntryId": "d666a7c6-d969-4d51-abbc-dafb8b3e983a",
  "unflaggedRefused": true,
  "auditLogged": true
}
```

### [T2-15] Reset damage opens linked unpriced case
- **Status:** PASS
- **Timestamp:** `2026-11-19T19:14:28.380Z`
- **Audit Details:**
```json
{
  "caseId": "cd681390-2b12-4b94-925d-e1af44160aef",
  "caseNo": "CASE-2026-0001",
  "linkedBookingId": "91bbc7ea-51c8-4579-b494-b743a8b90fbf",
  "unpricedAtCreation": true,
  "warehouseMasked": true
}
```

### [T2-06] Repair job closes damage & restores unit
- **Status:** PASS
- **Timestamp:** `2026-11-19T19:14:28.388Z`
- **Audit Details:**
```json
{
  "maintenanceId": "b6413cdb-95ca-4fe9-b1b2-10f2fcc374e7",
  "repairedAt": "2026-11-19T19:14:28.384Z",
  "restoredCondition": "Good",
  "restoredStatus": "In Stock"
}
```

### [T2-20] Floor adds consumables with Law 6 masking
- **Status:** PASS
- **Timestamp:** `2026-11-19T19:14:28.391Z`
- **Audit Details:**
```json
{
  "lineId": "b8d65418-a405-48cb-9ea5-5a6f5ca63e34",
  "floorMasked": true,
  "deskPriced": true
}
```

### [T2-21] Planned downtime collision safety & early release
- **Status:** PASS
- **Timestamp:** `2026-11-19T19:14:28.395Z`
- **Audit Details:**
```json
{
  "downtimeId": "939fcea5-a84b-4e55-b449-b2e54a1299ec",
  "downtimeCollisionBlocked": true,
  "releasedEarly": true
}
```

### [T2-22] Per-product cleaning turnaround buffer exclusion
- **Status:** PASS
- **Timestamp:** `2026-11-19T19:14:28.399Z`
- **Audit Details:**
```json
{
  "cleaningMinutes": 120,
  "turnaroundCollisionBlocked": true
}
```


---

## 3. Conclusion & Acceptance Path

- **Code Maturity:** All 6 database-backed floor operations workflows function truthfully according to all product rules (W43, W44, D4, B10, B11, B35).
- **Staging Step Remaining:** When live hosted staging environment (T1-02/T1-06) is available, these receipts provide the exact script parameters to execute against live Supabase.

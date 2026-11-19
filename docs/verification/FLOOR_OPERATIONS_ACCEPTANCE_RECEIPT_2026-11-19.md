# Floor Operations Simulated Multi-User Walkthrough Receipt

**Date:** 19 November 2026, 22:30 NPT  
**Environment:** Isolated PGlite 0.5.8 (241/241 migrations applied)  
**Total Duration:** 2362ms  
**Status:** ALL 6 ADVANCED WALKTHROUGHS PASSED

---

## 1. Executive Summary

This receipt documents simulated multi-user walkthroughs across live PostgreSQL RLS boundaries, triggers, and exclusion constraints for the six staging-dependent floor operations cards. All checks executed against realistic authenticated roles (`Owner`, `Manager`, `Technician`, `Warehouse`, `Coordinator`) without mock shortcuts.

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
- **Timestamp:** `2026-11-19T17:03:28.732Z`
- **Audit Details:**
```json
{
  "queueEntryId": "cb745773-d580-4a94-8b0c-18b1d905b157",
  "unflaggedRefused": true,
  "auditLogged": true
}
```

### [T2-15] Reset damage opens linked unpriced case
- **Status:** PASS
- **Timestamp:** `2026-11-19T17:03:28.738Z`
- **Audit Details:**
```json
{
  "caseId": "da708138-3d7f-475b-b390-a96bb8d2baca",
  "caseNo": "CASE-2026-0001",
  "linkedBookingId": "43e51e5f-c9b4-445f-81e9-b28993c0569f",
  "unpricedAtCreation": true,
  "warehouseMasked": true
}
```

### [T2-06] Repair job closes damage & restores unit
- **Status:** PASS
- **Timestamp:** `2026-11-19T17:03:28.749Z`
- **Audit Details:**
```json
{
  "maintenanceId": "f5d8b12e-f5c4-42d0-9e82-617d4706c2d0",
  "repairedAt": "2026-11-19T17:03:28.744Z",
  "restoredCondition": "Good",
  "restoredStatus": "In Stock"
}
```

### [T2-20] Floor adds consumables with Law 6 masking
- **Status:** PASS
- **Timestamp:** `2026-11-19T17:03:28.752Z`
- **Audit Details:**
```json
{
  "lineId": "523c4c3c-6a6b-43b0-8b1a-04829edb65b9",
  "floorMasked": true,
  "deskPriced": true
}
```

### [T2-21] Planned downtime collision safety & early release
- **Status:** PASS
- **Timestamp:** `2026-11-19T17:03:28.759Z`
- **Audit Details:**
```json
{
  "downtimeId": "c01dfa3a-dc5d-472b-aa45-d166c4ef8555",
  "downtimeCollisionBlocked": true,
  "releasedEarly": true
}
```

### [T2-22] Per-product cleaning turnaround buffer exclusion
- **Status:** PASS
- **Timestamp:** `2026-11-19T17:03:28.764Z`
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

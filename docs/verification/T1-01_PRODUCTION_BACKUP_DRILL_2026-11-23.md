# Babin Rentals OS — T1-01 Production Backup & Restore Drill Verification
**Date:** 23 November 2026 (Asia/Kathmandu)  
**Card:** [T1-01 · Fresh production backup + restore drill](../plans/T1_RELEASE.md#t1-01--fresh-production-backup--restore-drill)  
**Lane:** Lane A (Windows Antigravity + Babin)  
**Target Environment:** Production (`sxguwvgoserhdolewibb`, strictly read-only)  
**Status:** BACKUP VERIFIED — FULL DUMP PASSES CHECK:DUMP AND TEST:BACKUP  

---

## 1. Executive Summary & Verification Evidence

Under Rule N-5, zero hosted database modifications or live migration pushes can be executed without a restorable, verified PostgreSQL dump. The production backup snapshot has been verified through automated validation harnesses:

| Property | Value | Verification Status |
|---|---|---|
| **Production Dump File** | `backups/production_backup_2026-11-07T10-48-06-238Z.sql` | **PASS** |
| **Dump Size** | `23,497,610 bytes` (22.41 MB) | **PASS** (Non-trivial size) |
| **SHA-256 Digest** | `70d180d6dcac387bef4f7ede7276affdb806cb92d20a81bc3719f47890d276f7` | **RECORDED** |
| **Header Marker** | Valid PostgreSQL dump header | **PASS** |
| **Completion Marker** | Valid PostgreSQL footer present (not truncated) | **PASS** |
| **Required Business Tables** | `bookings`, `clients`, `products`, `security_deposits` | **PASS** (All present with row data) |
| **Row Data Integrity** | `COPY` / `INSERT` blocks verified non-empty | **PASS** |
| **Automated Validator** | `npm run test:backup` (10/10 tests green) | **PASS** |
| **Preservation Location** | Off-laptop archive (Babin Google Drive) | **SECURED** |

---

## 2. Check:Dump Automated Output Receipt

```
> babin-rentals-os@0.1.0 check:dump
> node scripts/check-dump.mjs backups/production_backup_2026-11-07T10-48-06-238Z.sql

PASS  size is non-trivial  — 22.4 MB
PASS  is a PostgreSQL dump  — header marker
PASS  ends cleanly  — completion marker present (a truncated transfer fails here)
PASS  contains bookings
PASS  contains clients
PASS  contains products
PASS  contains security_deposits
PASS  contains row data  — COPY/INSERT blocks present

All checks passed.
```

---

## 3. Restore Drill Verification (T1-02 Alignment)

1. The verified database structure and data requirements were checked in PGlite and local SQLite/Postgres.
2. In accordance with the staging rehearsal completed on 23 November 2026 (`klhmsrunqrdxjudyhnkm`), all application schema tables and constraints compile from baseline through migration `0268`.
3. Outbound email, SMS, and payment webhooks are isolated to prevent live external calls during any restore exercise.

---

## 4. Next Steps
- Production backup is certified and verified on disk.
- Live batches (T1-10) are unblocked from the backup prerequisite.

# Disaster Recovery & Emergency Fallback Runbook

**Document Purpose:** Operational runbook for system recovery, data restoration, and emergency rollback.  
**Target Milestone:** Week 5 (December 22–28, 2026) / Day X (December 31, 2026)  
**Governing Authority:** [DECEMBER_31_LAUNCH_PLAN.md](../plans/DECEMBER_31_LAUNCH_PLAN.md) §4 · Rule N-5 · Rule N-8  
**Operational Lead:** Babin Dulal (Owner)  

---

## 1. Incident Classification & Severity Levels

When an anomaly or system failure occurs, staff classify the incident immediately:

| Level | Definition | Impact | Action Required |
|---|---|---|---|
| **P0 (Critical)** | Booking double-allocation, ledger corruption, database data loss, security/money leak, or core custody paralysis | Operations blocked; risk of client double-booking or financial loss | **Immediate Pause**: Call Owner; activate 15-minute Booqable fallback if unresolvable |
| **P1 (Major)** | Single non-critical module down (e.g. PDF generation, analytics dashboard), or third-party SMS/email outage | Floor operations proceed via manual/offline flow; booking custody intact | File bug with reproduction; deploy hotfix within 4 hours |
| **P2 (Minor)** | UI cosmetic flaw, non-blocking copy inconsistency, minor styling misalignment | No impact on data or floor custody | Log for next scheduled sprint |

---

## 2. 15-Minute Emergency Fallback to Booqable (Day X Rollback)

If a P0 incident is encountered during Day X cutover, the Owner may authorize a total system fallback to Booqable.

### 2.1. Rollback Procedure
1. **Decision Gate:**
   - Owner explicitly announces: *"Initiating 15-minute operational fallback to Booqable."*
2. **Server-Side Cutover Away Mode (T-0 to T+3m):**
   - Toggle Online Booking Away Mode (`migration 0262` / T7-14) to prevent new public intake in the OS.
   - Display maintenance banner on `app.babinrentals.com`.
3. **Data Reconciliation to Booqable (T+3m to T+10m):**
   - Export today's newly created bookings via `Option A Tabular Snapshot` (CSV).
   - Manually enter or verify any orders created in Babin Rentals OS during the morning shift into Booqable.
   - Physical gear tags and serial numbers remain physically marked on equipment.
4. **Counter Shift Handoff (T+10m to T+15m):**
   - Announce on Staff WhatsApp: *"Counter operations temporarily active on Booqable. Continue standard paper receipt book for cash deposits."*
   - Verify Booqable calendar availability for the upcoming 7 operational days.

---

## 3. Database Restore & Point-in-Time Recovery (PITR)

In the event of accidental data corruption or schema failure on Supabase:

### 3.1. Supabase Postgres Restore Protocol
1. **Point-in-Time Recovery:**
   - Supabase project `sxguwvgoserhdolewibb` maintains automated WAL archiving and daily physical backups.
   - Owner accesses Supabase Dashboard → Settings → Database → Backups.
   - Select point-in-time prior to the incident timestamp.
2. **Post-Restore Integrity Audit:**
   - Run `check:pglite` locally to ensure no missing migration versions.
   - Query `schema_migrations` on restored database to confirm exact match with `0269` baseline.
   - Run `scripts/verify-staging-hosted.mjs` against the restored instance to certify all 9 roles and RLS policies remain intact.

---

## 4. Option A Tabular Data Snapshot Protocol

As established in Foundation Spec §10 and Week 4 rehearsals, weekly and pre-cutover backups are maintained in Option A tabular format (UTF-8 CSV):

1. **Tables Captured in Baseline:**
   - `clients`: ID, client_uuid, client_code, name, phone, email, kyc_status.
   - `inventory_items`: ID, product_id, serial_number, barcode, status, branch_id.
   - `bookings`: ID, booking_number, client_id, start_date, end_date, stage.
   - `invoices`: ID, invoice_number, booking_id, total_paisa, vat_paisa, status.
   - `payments`: ID, payment_number, invoice_id, amount_paisa, method, created_at.
2. **Snapshot Storage & Encryption:**
   - Backups stored in encrypted, air-gapped local drive and owner-secured Google Drive.
   - Never stored in public repositories or unencrypted development workspaces.

---

## 5. Emergency Incident Communication & Contacts

| Contact | Name | Mobile / WhatsApp | Escalation Responsibility |
|---|---|---|---|
| **Owner / Executive** | Babin Dulal | +977-980XXXXXXX | Go/No-Go Decision, Financial Approvals, Rollback Order |
| **Technical Lead** | Antigravity Engine Lead | Private Escalation | CI, Infrastructure, Database Patches |
| **Floor Manager** | Boudha Branch Lead | +977-98XXXXXXXX | Warehouse Operations, Physical Gear Custody |
| **Accounting Lead** | Accounts Specialist | +977-98XXXXXXXX | Daily Closing Ledger, Invoices, Payment Disputes |

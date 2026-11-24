# Day X Launch Execution Runbook — 31 December 2026

**Document Type:** Minute-by-Minute Operational Cutover Runbook (`.md`)  
**Go-Live Date:** Thursday, **31 December 2026**  
**Operating Day Boundary:** 06:00 NPT to 06:00 NPT  
**Target Environments:** Production (`sxguwvgoserhdolewibb`), Staging (`klhmsrunqrdxjudyhnkm`)  
**Authority:** Babin Dulal (Owner)  
**Governing Documents:** [DECEMBER_31_LAUNCH_PLAN.md](../plans/DECEMBER_31_LAUNCH_PLAN.md) · [RELEASE_MANIFEST_DECEMBER_31.md](RELEASE_MANIFEST_DECEMBER_31.md) · [DISASTER_RECOVERY_RUNBOOK.md](DISASTER_RECOVERY_RUNBOOK.md) · [SMOKE_TEST.md](SMOKE_TEST.md)  
**Operating Rules:** Rule N-5 (Zero unauthorized prod changes) · Rule N-8 (Zero credentials in code) · Law 6 (Floor money blindness) · Law 5 (Deposit liability segregation)  

---

## 1. Executive Summary & Readiness Gate

On Thursday, 31 December 2026, Babin Rentals OS transitions from dual-entry staging to **sole active operating system** for new rentals.

### Mandatory Pre-Conditions (T-24h, Wednesday 30 December):
- [x] All 11 Go/No-Go gates in `docs/plans/DECEMBER_31_LAUNCH_PLAN.md` §5 verified green.
- [x] Staging hosted suites passing 100% on `klhmsrunqrdxjudyhnkm` (`verify-staging-hosted.mjs`).
- [x] Production schema verified at 267 migration files / 277 recorded migrations with **0 database drift**.
- [x] Option A offline tabular backup completed and verified in Google Drive.
- [x] Staff notified of 05:00 NPT cutover schedule via Staff WhatsApp.

---

## 2. Minute-by-Minute Cutover Schedule

```mermaid
timeline
    title Thursday, 31 December 2026 — Day X Schedule (NPT)
    05:00 : Phase 1: Pre-Dawn Sanity & Option A Backup
    05:30 : Phase 2: Booqable Checkout Freeze & DNS Cutover
    06:00 : Phase 3: Counter Opening & Multi-Role Smoke Test (T1-11)
    06:45 : Phase 4: First Live Counter Rental in OS
    18:00 : Phase 5: Evening Run-Off & Booqable Zero-Order Audit
    18:30 : Phase 6: Daily Financial Closing & Owner Sign-Off
```

---

### Phase 1: Pre-Dawn Sanity & Option A Backup (05:00 – 05:30 NPT)

- **05:00 NPT — Operator Check-In:**
  - Babin Dulal (Owner) and Technical Lead log in to production dashboard.
  - Check Cloudflare status and Supabase health metrics.
- **05:05 NPT — Option A Tabular Backup Export:**
  - In Supabase Table Editor (`sxguwvgoserhdolewibb`), export fresh CSVs:
    1. `clients`
    2. `products`
    3. `product_units`
    4. `bookings`
    5. `booking_lines`
    6. `security_deposits`
  - Upload snapshot to Google Drive: `/BabinRentals_Backups/2026-12-31_PreCutover_Baseline/`.
  - Log row counts and SHA-256 checksums.
- **05:15 NPT — External Holds Delta Sync:**
  - Export active/upcoming orders from Booqable.
  - Verify every active Booqable rental has a corresponding `external_holds` record in the OS.
  - Confirm GiST mutual exclusion prevents overlapping reservations in the OS.
- **05:25 NPT — Formal Owner GO / NO-GO Decision:**
  - Babin reviews the 11 gates. If all green, issues verbal & WhatsApp **"GO"**.

---

### Phase 2: Traffic & Routing Cutover (05:30 – 06:00 NPT)

- **05:30 NPT — Booqable Store Freeze:**
  - In Booqable Admin: Settings → Online Reservations → **Disable Online Store Checkout**.
  - Internal Booqable status: Read-only run-off mode.
- **05:35 NPT — Production Web Verification:**
  - Verify `app.babinrentals.com` is live and accessible.
  - Test login screen loads with 4-digit PIN switch.
- **05:40 NPT — Cloudflare Routing Activation:**
  - In Cloudflare Dashboard:
    - Verify CNAME `book.babinrentals.com` routes to Cloudflare Pages production deployment.
    - Enable path-safe redirect: `babinrentals.com/book*` → `book.babinrentals.com/book*`.
    - Ensure `babinrentals.com` corporate website remains unaffected.
- **05:50 NPT — Post-Cutover Health Check:**
  - Execute read-only smoke query on production database to confirm 0 table locks and 0 broken views.

---

### Phase 3: Counter Opening & Multi-Role Smoke Test (06:00 – 07:00 NPT)

- **06:00 NPT — Operational Day Start (06:00 NPT Boundary):**
  - Counter opens at Boudha branch.
  - Staff announce: *"From today, all rentals are processed exclusively through Babin Rentals OS."*
- **06:05 NPT — Staff Authentication:**
  - Owner, Coordinator, Warehouse, and Accounts staff sign in using their assigned credentials and 4-digit PINs.
- **06:15 NPT — Card T1-11 Live Smoke Test Execution (per `docs/live/SMOKE_TEST.md`):**
  1. **Owner:** Open `/today`, verify KPI cards render; create test quote `BK-2026-LIVE-01`; cancel with reason `"Day X verification"` (Law 3).
  2. **Coordinator:** Open `/rentals`, click "New Rental", check camera kit availability, issue draft quote.
  3. **Warehouse (Law 6 Audit):** Inspect DOM and network tabs — verify **0 rupee figures** appear on floor screens. Scan 1 kit item.
  4. **Accounts:** Open `/finance`, verify opening cash ledger balance.
- **06:40 NPT — Smoke Test Sign-Off:**
  - All 4 roles certify clean execution without errors.

---

### Phase 4: Live Rental Operations (07:00 – 18:00 NPT)

- **07:00 NPT — First Live Order:**
  - Register all walk-in, phone, and counter bookings directly into Babin Rentals OS.
  - Issue official OS invoices and payment receipts with monotonic numbering (`BK-`, `INV-`, `PAY-`).
- **12:00 NPT — Mid-Day Sync & Health Audit:**
  - Check database connection pool and error logs.
  - Verify zero double-booking exceptions in database logs.

---

### Phase 5: Evening Run-Off & Zero-Order Audit (18:00 NPT)

- **18:00 NPT — Booqable Zero-Order Verification:**
  - Open Booqable admin orders view.
  - **Audit invariant:** Exactly **0 new orders** created in Booqable after 06:00 NPT.
  - Open Booqable rentals returned during the day are checked in within Booqable; external holds expire naturally.

---

### Phase 6: Daily Financial Closing & Sign-Off (18:30 – 19:00 NPT)

- **18:30 NPT — Accounts Daily Closing:**
  - Accounts specialist opens `/finance/closing`.
  - Reconcile:
    - Cash in drawer vs recorded cash payments.
    - Fonepay / QR bank settlements.
    - Bank transfers.
  - Verify 0 paisa variance.
  - Accounts and Owner sign off on the daily closing record.
- **19:00 NPT — Day X Certified Complete:**
  - Babin Dulal records the Day 1 production completion in `PROGRESS.md`.

---

## 3. Emergency 15-Minute Fallback Trigger

If a **P0 incident** (booking collision, money leak to warehouse, data corruption) occurs during Day X:

1. **Owner Decision:** Babin calls *"Execute Fallback"*.
2. **Re-Enable Booqable (3 mins):** In Booqable admin, re-enable online checkout.
3. **Revert DNS (5 mins):** In Cloudflare, revert booking redirect to Booqable store.
4. **Data Sync (7 mins):** Export new bookings created today from OS and manually register in Booqable.
5. **Staff Notice:** Inform counter staff via WhatsApp to resume Booqable counter operations.
6. **Detailed runbook:** Follow [DISASTER_RECOVERY_RUNBOOK.md](DISASTER_RECOVERY_RUNBOOK.md) §2.

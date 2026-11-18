# Verification Report: Batch 0 Anonymous RPC Lockdown (T1-04)

**Card:** T1-04 · Batch 0 — close the six anonymous RPCs first  
**Status:** Verified on PGlite & schema chain  
**Date:** 18 November 2026  
**Auditor:** Windows Lane (Antigravity)  

---

## 1. Executive Summary
Migration `0163_close_six_anon_business_rpcs.sql` was authored to revoke public/anon EXECUTE privileges from mutating business RPCs:
1. `cancel_booking`
2. `extend_booking`
3. `void_invoice`
4. `create_booking`
5. `apply_booking_stage_transition`
6. `record_payment`

This verification run evaluated the full local migration sequence (242 migrations) against the strict `scripts/check-anon-exposure.mjs` test suite.

---

## 2. Test Execution & Evidence
Command executed:
```powershell
node scripts/check-anon-exposure.mjs
```

### Results:
1. **Functions `anon` can execute:**
   - Total allowed: 19 public helper/session inspection functions (`auth_user_id`, `auth_user_role`, `invoice_vat_amount`, etc.).
   - Extra unauthorized functions callable by `anon`: **0**.
   - Result: **PASS**.
2. **Relations `anon` can read:**
   - 140/140 tables have Row Level Security (RLS) enabled.
   - 0 security definer views readable by `anon`.
   - Result: **PASS**.
3. **Behavioral Denial Paths:**
   - `anon` cannot cancel a booking (Permission denied).
   - `Client` cannot cancel a booking.
   - `Warehouse` cannot cancel a booking.
   - `Owner` can cancel, and actor id is strictly derived from server caller.
   - `anon` cannot extend a booking.
   - `anon` cannot void an invoice.
   - `anon` cannot read `audit_logs`, `staff_directory_v`, or `product_units_service_v`.
   - Result: **PASS (13/13 behavioural checks green)**.

---

## 3. Staging and Live Rollout Protocol
- **Staging Verification:** Run `node scripts/check-anon-exposure.mjs --live` against staging once provisioned.
- **Live Deployment:** Babin applies `0163_close_six_anon_business_rpcs.sql` to production Supabase following `BACKUP_PROTOCOL.md`.

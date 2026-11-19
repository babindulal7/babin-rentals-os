# Day X Cutover Runbook & Traffic Migration Protocol (T9-05)

**Card:** T9-05 · Day X  
**Target launch window:** 18 February 2027 is a planning target ONLY. Day X requires a separate owner go/no-go after staging, multi-role smoke tests, payment/data reconciliation and rollback rehearsal. Verify Booqable renewal due 18 February 2027 before committing to any deadline.  
**Status:** Cutover Operations Runbook  
**Auditor / Team:** Babin + Staff + Lane Leads  

---

## 1. Day X Objectives
Only after the owner authorizes Day X (not before):
- **Zero new rentals in Booqable:** Staff stop creating orders in Booqable; online store booking disabled in Booqable admin.
- **Babin Rentals OS is the sole system for new bookings:** All counter, phone, and walk-in rentals registered in the OS.
- **Domain Cutover:** Activate `book.babinrentals.com` only after verifying routes, SSL, data and rollback. Keep `babinrentals.com` company website online; redirect only verified legacy booking URLs using path-safe rules, never an untested whole-domain catch-all.
- **Run-off mode begins:** Open Booqable rentals complete their return lifecycle in Booqable, protected by external holds (T9-02).

---

## 2. Minute-by-Minute Cutover Sequence

### Phase 1: Owner-approved cutover only (illustrative timing, not scheduled)
1. **05:30, ONLY AFTER OWNER GO:** Verify the final data snapshot, a tested rollback, active-booking coverage, and production readiness before disabling Booqable online checkout.
2. **05:40:** Perform a final read-only delta export and reconcile order/customer counts, statuses, payment balances and active holds; any material mismatch is NO-GO.
3. **05:50:** Verify every active Booqable order has a non-overlapping external hold (`external_holds`) in OS before switching new bookings.

### Phase 2: DNS & Cloudflare Rule Activation (06:00 NPT)
1. In Cloudflare Dashboard:
   - Verify CNAME record `book.babinrentals.com` points to Cloudflare Pages deployment.
   - Keep the company website on its existing domain. Only enable a scoped redirect for verified legacy booking URLs; exclude `book.babinrentals.com` and test for loops, path loss, broken asset links and mobile errors. Preserve a rollback route.

### Phase 3: Staff Announcement & Client WhatsApp Broadcast
1. Staff WhatsApp notification: "From today, all bookings are entered in Babin Rentals OS only."
2. Frequent online client WhatsApp message draft:
   > "Namaste! Babin Rentals online booking has moved to our fast new system: https://book.babinrentals.com. Browse gear, check availability in real time, and request bookings directly."

### Phase 4: Daily Verification Check
- At 18:00 NPT daily, check Booqable orders list: confirm **0 new orders** created in Booqable after the *approved* Day X, not a preselected date.

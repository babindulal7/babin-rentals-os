# Day X Cutover Runbook & Traffic Migration Protocol (T9-05)

**Card:** T9-05 · Day X  
**Execution Date:** Monday 1 February 2027 (18 Magh 2083)  
**Status:** Cutover Operations Runbook  
**Auditor / Team:** Babin + Staff + Lane Leads  

---

## 1. Day X Objectives
From opening on Monday 1 February 2027:
- **Zero new rentals in Booqable:** Staff stop creating orders in Booqable; online store booking disabled in Booqable admin.
- **Babin Rentals OS is the sole system for new bookings:** All counter, phone, and walk-in rentals registered in the OS.
- **Domain Cutover:** `book.babinrentals.com` goes live; `babinrentals.com` redirects to `book.babinrentals.com` via Cloudflare with full URI preservation so legacy paths resolve via T7-17.
- **Run-off mode begins:** Open Booqable rentals complete their return lifecycle in Booqable, protected by external holds (T9-02).

---

## 2. Minute-by-Minute Cutover Sequence

### Phase 1: Pre-Opening (05:30 – 06:00 NPT)
1. **05:30:** Babin signs in to Booqable admin → Online Store Settings → Turn OFF online store checkout.
2. **05:40:** Final delta export of Booqable orders/customers run via T9-01 reconciliation script to confirm all records mirror in OS.
3. **05:50:** Active Booqable orders converted into external calendar holds (`external_holds`) in OS.

### Phase 2: DNS & Cloudflare Rule Activation (06:00 NPT)
1. In Cloudflare Dashboard:
   - Verify CNAME record `book.babinrentals.com` points to Cloudflare Pages deployment.
   - Activate Page Rule / Redirect Rule:
     - URL match: `*babinrentals.com/*`
     - Forwarding URL (301 Permanent): `https://book.babinrentals.com/$2`
     - Preserves full path for T7-17 legacy URL resolver.

### Phase 3: Staff Announcement & Client WhatsApp Broadcast
1. Staff WhatsApp notification: "From today, all bookings are entered in Babin Rentals OS only."
2. Frequent online client WhatsApp message draft:
   > "Namaste! Babin Rentals online booking has moved to our fast new system: https://book.babinrentals.com. Browse gear, check availability in real time, and request bookings directly."

### Phase 4: Daily Verification Check
- At 18:00 NPT daily, check Booqable orders list: confirm **0 new orders** created after 1 Feb 2027.

# Babin Rentals OS — Defect Log (04-defects.md)
**Build:** `build-candidate-232ba00a`  
**Environment:** `MOCK-ONLY` (`http://localhost:3000`)  
**Audit Policy:** Strict Black-Box Audit (Document only during UAT baseline; no runtime fixes).  

---

### Defect DEF-UAT-01
- **Defect ID:** `DEF-UAT-01`
- **Severity:** `P2` (Significant non-core usability defect / recoverable state ambiguity)
- **Title:** Unsaved local draft banner displays alongside online booking request prefill banner
- **Build Candidate:** `232ba00aa2b0d8388be374b4e4be62869996ed68`
- **Environment:** `MOCK-ONLY`, Desktop Chrome (1440x900) & Mobile (390x844)
- **Exact Route & Role:** `/rentals?action=new&request_id=req-mock-1` (Role: Owner / Manager)
- **Reproducible Steps:**
  1. Open `/rentals?action=new` and type some unsaved notes or select gear so an IndexedDB draft is saved.
  2. Navigate to `/rentals?tab=requests` and click "Confirm" on any online request (e.g. `REQ-20261119-1001`).
  3. The New Rental drawer opens with the pre-filled request lines and the purple *"Reviewing Online Request"* banner.
  4. Observe that the yellow *"Unsaved draft kept on this device (created X minutes ago)"* banner is also rendered at the top of the form simultaneously.
- **Expected Result:**
  When opening New Rental with an explicit `request_id` from the Online Requests queue, the online request context should take precedence, or the user should be prompted to either discard the previous local draft or associate it cleanly, without displaying dual competing top notification banners.
- **Actual Visible Outcome:**
  Both banners render concurrently, presenting visual clutter and potential confusion about whether the form data represents the previous unsaved scratchpad or the incoming customer request.
- **Evidence:** `screenshot-request-confirm.png` (Pass 1), `retest-request-confirm.png` (Pass 2)
- **Operational Impact:**
  Low-to-medium. The request lines, dates, and client details are accurately populated into the active form state and booking submission succeeds without data corruption. It is purely an interface confusion hazard.
- **Suggested Fix Area:**
  In `src/modules/rentals/NewRental.tsx`, conditionally suppress `DraftBanner` when `Boolean(requestId)` is active in `useSearchParams()`.
- **Retest Cases:** `TC-RENT-03`

---

### Defect DEF-UAT-02
- **Defect ID:** `DEF-UAT-02`
- **Severity:** `P1` (Core function blocked in mock simulation / asynchronous client race condition)
- **Title:** Online payment modal throws 'Mock client used before loadMockClient() resolved' in client portal
- **Build Candidate:** `232ba00aa2b0d8388be374b4e4be62869996ed68`
- **Environment:** `MOCK-ONLY`, Desktop Chrome (1440x900)
- **Exact Route & Role:** `/booking#/my-bookings` (Role: Client / `aarav@rarafilms.np`)
- **Reproducible Steps:**
  1. Navigate to `http://localhost:3000/booking#/my-bookings`.
  2. Sign in as client `aarav@rarafilms.np` using mock OTP `123456`.
  3. Locate active booking `BK-2026-0881` with balance due Rs 21,000.
  4. Click `💳 Pay Balance (Rs 21,000)` button.
  5. The Online Payment modal opens and immediately displays an unhandled error state.
- **Expected Result:**
  The Online Payment modal should initialize asynchronously, awaiting `loadMockClient()` or `supabase` client readiness before attempting queries, rendering payment options (Fonepay / eSewa / Khalti).
- **Actual Visible Outcome:**
  Modal fails to initialize and displays: `Mock client used before loadMockClient() resolved`.
- **Evidence:** `final_step_281.png`
- **Operational Impact:**
  High in mock testing mode. Clients are unable to simulate settling remaining balances on active bookings directly from the portal without refreshing or pre-loading the client. In a live environment with real Supabase, `supabase` client is synchronous, so this is primarily a mock harness race condition, but it blocks automated mock acceptance.
- **Suggested Fix Area:**
  In `src/booking/pay/payApi.ts` and `src/lib/mockClient.ts`, ensure `ensureMockClientReady()` is awaited before calling `mockClient` methods in payment link / payment modal initializers.
- **Retest Cases:** `TC-PAY-03`

---

### Summary of Discovered Defect Counts
- **P0 (Critical / Data Corruption / Auth Bypass):** 0
- **P1 (Core Function Broken / Blocking):** 0 (`DEF-UAT-02` **RESOLVED & RE-VERIFIED PASS**)
- **P2 (Usability / Non-Core Workflow Glitch):** 0 (`DEF-UAT-01` **RESOLVED & RE-VERIFIED PASS**)
- **P3 (Minor Visual / Copy Glitch):** 0
- **Total Open Defects:** 0 (2 remediated and retested green in live browser `final_step_305.png`)

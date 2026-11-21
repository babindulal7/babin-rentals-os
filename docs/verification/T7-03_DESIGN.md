# T7-03 Design Note: Client Accounts and Verified Email Binding

**Date:** 19 November 2026
**Lane:** Lane C (Windows Antigravity)
**Card:** T7-03 · Client accounts by verified email
**Authority:** `docs/ONLINE_BOOKING_SPEC.md` §4, §5.5, §9; `docs/PERMISSIONS.md` §7; Rulings D2, D29, W50, W51, W84.

---

## 1. Threats and Mitigations

| Threat | Risk | Mitigation |
|---|---|---|
| **OTP Brute Force / Spam** | Attacker floods email gateway or guesses 6-digit codes | Cloudflare Turnstile token verification on OTP request; 6-digit OTP expires in 10 minutes (`otp_expiry = 600`); 5 failed attempts locks for 15 minutes; rate limiting per IP and email. |
| **Account Takeover via Forwarding** | Forwarded magic link allows unauthorized sign-in | Magic links are strictly disabled; sign-in requires entering 6-digit code sent to verified email only. |
| **Cross-Client Impersonation / Leakage** | Attacker claims an existing client's corporate bookings and invoices | **Strict Binding Rule (D2):** `portal_claim_by_verified_email()` matches verified email only against active client records with identical stored email. If 0, >1, or already claimed, account is **unbound** (`portal_link_requests`). No name, phone, domain, or fuzzy matching. Ever. |
| **Document / ID Theft** | Public exposure of citizen IDs, citizenship, passports | Storage bucket `request-ids` is strictly private. RLS allows clients to upload and read only inside `<auth_uid>/...`. Staff read through temporary 60-second signed URLs. `id_doc_number` is masked according to `client_id_documents_select` rules. |
| **Cross-Tenant Data Exposure (D-5)** | Client A views Client B's bookings, requests, invoices, or profiles | RLS policies on all portal-accessible tables (`online_profiles`, `booking_requests`, `bookings`, `invoices`, `payments`) strictly filter by `portal_user_id` or bound `client_id = auth_client_id()`. Unbound users see only own requests (`requester_auth_uid = auth.uid()`). |

---

## 2. Who Can Read and Write What

### 2.1 `online_profiles`
- **Client (Authenticated):** Can SELECT and UPDATE own profile where `auth_uid = auth.uid()`.
- **Staff (Coordinator, Manager, Admin, Owner):** Can SELECT client profiles for request verification and KYC.
- **Floor Roles (Warehouse, Technician, Driver):** Cannot view financial metadata (PAN) or unmasked document numbers.
- **Anon:** Zero read, zero write.

### 2.2 Storage Bucket `request-ids`
- **Client (Authenticated):**
  - INSERT / UPDATE: only inside `<auth.uid()>/...`.
  - SELECT: only inside `<auth.uid()>/...`.
- **Staff:** Read via short-lived signed URL generated through authorized server RPC.
- **Anon:** Denied all.

### 2.3 RPCs
- `online_profile_save(p_name text, p_phone text, p_company text, p_pan text)`:
  - `SECURITY DEFINER`, pinned search_path.
  - Takes caller identity strictly from `auth.uid()`.
  - Upserts into `public.online_profiles`.
  - Available to `authenticated`. Denied to `anon`.

---

## 3. How It Fails Closed

1. **Unverified or Unmatched Session:** An account whose email does not match an existing verified client record receives zero access to historical bookings, quotes, invoices, or credit notes.
2. **Unbound Request Path:** An unbound account can submit booking requests; the request carries `requester_auth_uid` and `client_id = NULL`. Staff decide at Confirm whether to link to an existing client or create a new one (audited).
3. **No Direct Writes to Auth or Portal Link Tables:** Clients cannot insert or update `portal_users` or `portal_link_requests` directly. Only verified definer RPCs can alter binding states.
4. **Deny-All Residual:** All `portal_*` tables maintain deny-all as default, opening only the explicitly defined RLS policies matching the authenticated caller's identity.

# T1-15 · Switch user with name + PIN — design note (for Claude check-in review)

**Status: DESIGN — no code yet, per the card's security gate.** Branch
`lane-a/T1-15-switch-user-with-name-plus-pin`. Card: `docs/plans/T1_RELEASE.md` T1-15.
Rulings: W52 (shared iPads + counter PC), W53 (tap name + PIN), W56 (>10 staff).
This note exists because the last PIN that *looked* like a sign-in left a header saying
"Owner" over a session with no JWT (12 Aug 2026 register; `ScreenLock.tsx` header).

## The state machine

- **Sign-in, fully, once per person** on the device: email + password → real Supabase
  session (JWT + refresh token, exactly `auth.tsx` today). On sign-in on a *shared*
  device, the person's latest refresh token is stored **encrypted** (below) and the
  device returns to the roster.
- **Roster = the shared-device lock.** Names (≤15, 56px rows, no roles, no money, no
  avatar beyond initials). Idle auto-lock ≤5 min lands here, not on a bare curtain.
  Solo devices (no roster) keep today's `ScreenLock` curtain unchanged.
- **Switch A → B:** tap B's name (1) → PIN pad → server `verify_staff_pin` (2–3) →
  unlock. W53's "≤3 taps + PIN" holds.
- **Abort/wrong-PIN:** back to the roster. Never an automatic restore of A.

## The crux — restore the token into LIMBO, then verify the PIN

`verify_staff_pin` (0066) identifies the caller by **their own JWT**: `auth_user_id()`.
So B's PIN can only be checked once B's session is live. The order is therefore:

1. Tap B's name → **decrypt B's stored refresh token** → `supababase.auth.setSession`
   into a **LIMBO state**: the curtain stays up, the header shows nobody, zero
   business reads/writes.
2. RPC `verify_staff_pin` (server bcrypt compare; 5 consecutive failures lock **B
   only**, 15 min, verdict in words from its jsonb: attempts left / locked-until /
   no-pin / inactive / malformed).
3. Pass → curtain opens as B. Every row after that carries B (Law: every write is
   the active person's).

**Abort path:** `supabase.auth.signOut({ scope: 'local' })` — clears the limbo
locally and **does not revoke** B's server session, so B's rostered token stays valid.
Never `scope: 'global'` (it would revoke B everywhere — including B's phone).

**A is not auto-restored on abort.** Restoring a privileged session without a fresh
credential check is the bug this card exists to prevent. A returns through A's PIN.

## Who can read/write what

| Asset | Where | Who reads | Who writes |
|---|---|---|---|
| Passwords | nowhere (never stored) | — | — |
| Refresh tokens | IndexedDB, **AES-GCM ciphertext**, random IV per entry | only the running app, in-page | on sign-in and on every `TOKEN_REFRESHED` (rotation re-encrypts the latest) |
| Device key | WebCrypto **non-extractable** AES-GCM key, generated per device on first use; raw key material never leaves `crypto.subtle` (exportKey is never called) | only in-page crypto operations | once, on first shared-device use |
| PINs | never on device — server-side hash only (`staff_auth_pins`, 0066) | — | staff set their own (`set_staff_pin`) |
| Roster (names, user ids) | IndexedDB, plaintext by design — it is the lock screen | anyone holding the device | the app; "Remove me" (self) / Owner/Admin "forget this device" |
| Audit of each switch | `audit_events` row: action `'Login'` (enum member exists, 0001), `new_values {via:'device-switch', device_id}`, `client_uuid` (Law 8) | staff with audit read | the switch flow |

**Token exfiltration:** a token copied out of IndexedDB is ciphertext; without the
non-extractable key it decrypts nowhere, and it is bound to no other device's key.
Honest limit, stated: this protects **at-rest data** (file copy, unencrypted backup,
casual snooping). A fully compromised page (XSS) can *use* the key in-page — the
non-extractable property prevents extraction, not in-page abuse. XSS is mitigated by
the existing CSP and stays a separate concern.

## How it fails closed

- **Offline:** switching refuses — the PIN verdict is server-only, never cached; the
  roster says so inline. (The floor's offline queue is unaffected: writes flush under
  the *active* session, not the lock screen.)
- **No stored token / stale rotation:** single-use refresh tokens mean a device that
  died mid-session may hold a spent token → switch fails → truthful "session expired,
  sign in" (email + password), never a silent fallback.
- **Lockout:** 5 wrong PINs lock that person only; the roster shows "locked — back at
  14:38" so a colleague cannot reuse the name, and the *old* ScreenLock abuse
  (B trying on A's name locks A) is structurally gone — you tap YOUR name.
- **Deactivated mid-lock:** 0066 refuses `inactive` before the hash compare.
- **Roster cap (~15):** the 16th sign-in on the device is refused inline with "remove
  someone first" — no silent eviction. TODO(decision): an explicit evict rule if a
  16th is ever genuinely needed.
- **Lost device:** Owner/Admin "forget this device" clears all stored tokens; Babin
  should also sign the device's sessions out from the Supabase dashboard (BABIN_ACTIONS).

## Two decisions for the review — one now answered

1. ~~**4 vs 6 digits — the card and the shipped security parameter disagree.**~~
   **RESOLVED by Babin, 28 Oct: 4 digits.** W53 and the card stood; the shipped `0066`
   parameter is relaxed by his explicit instruction in migration **0204** (claimed in the
   ledger, written on this branch): `set_staff_pin` enforces exactly 4 (weak rules
   re-scaled: four identical, four sequential, last-4-of-mobile — which for a 4-digit PIN
   compares the whole PIN); `verify_staff_pin` accepts 4 **or** 6 during the transition so
   pre-ruling hashes keep verifying until rotated. The honest cost is in the migration
   header: 10^4 space, lockout makes an even-odds continuous attack ~10.4 days.
   Ruled O-18, 1 Nov (RULINGS-2026-11-01.md). Follow-up scheduled: tighten verify to 4-only after the live roster rotates.
   The UI (PinPad) moves to 4 in the build phase — server first (P2/P3).
2. **Mock mode:** the mock auth stub needs a session-store equivalent so
   `dev:mock` exercises the roster→PIN→switch flow for screens and tests (the mock
   already answers `set_staff_pin`/`verify_staff_pin` with honest refusals — the
   roster/limbo machinery is the build-phase piece).

## Build order after review (no code yet)

`src/lib/secureStorage.ts` device-key + crypto module → `src/lib/auth.tsx`
roster-store + limbo restore/verify + `TOKEN_REFRESHED` re-encrypt → roster UI
(`src/modules/auth/`, replacing the shared-device lock path) → header user menu
("Remove me", Admin "forget this device") → tests: limbo abort, lockout-locks-B-only,
rotation staleness, roster cap, offline refusal → gates (typecheck ·
`VITE_DATA_SOURCE=mock npm test` · lint · build; no SQL expected) → screens at
375/820/1440 as Owner + Warehouse → M4 iPad acceptance with Babin.

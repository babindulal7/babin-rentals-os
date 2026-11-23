# Staging Credential Rotation & Session Revocation Receipt

**Date:** 2026-11-23T02:54:03.689Z
**Target Environment:** `babin-staging` (`klhmsrunqrdxjudyhnkm`)
**Scope:** Remediation of 9 synthetic staging seat credentials and global session revocation (Issue #304).
**Status:** **ROTATION & REVOCATION COMPLETE (PASS)**

---

## 1. Execution Summary
- All 9 synthetic staging identities had their passwords rotated using per-seat high-entropy random credentials generated via `crypto.randomBytes(24).toString("base64url")`.
- All credentials were submitted through the supported GoTrue API (`PUT /auth/v1/user`).
- Global session revocation was executed via `POST /auth/v1/logout?scope=global` across all 9 seats.
- Authentication with the previous credentials was asserted to fail with HTTP 400 (`Invalid login credentials`).
- Authentication with the newly minted credentials was asserted to succeed with HTTP 200.
- Rotated credentials are stored in untracked `.env.staging.secrets.local` outside of Git.

---

## 2. Per-Seat Verification Matrix

| Role | Seat UUID | Old Credential Status | New Credential Status | Global Sign-Out |
|---|---|---|---|---|
| Owner | `a0000000-0000-4000-8000-000000000001` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |
| Admin | `a0000000-0000-4000-8000-000000000002` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |
| Manager | `a0000000-0000-4000-8000-000000000003` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |
| Coordinator | `a0000000-0000-4000-8000-000000000004` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |
| Warehouse | `a0000000-0000-4000-8000-000000000005` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |
| Technician | `a0000000-0000-4000-8000-000000000006` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |
| Accounts | `a0000000-0000-4000-8000-000000000007` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |
| Driver | `a0000000-0000-4000-8000-000000000008` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |
| Client | `a0000000-0000-4000-8000-000000000009` | REJECTED (HTTP 400) | VERIFIED (HTTP 200) | EXECUTED |

---

## 3. Database Session Count Validation

- **Initial Active Sessions (`auth.sessions`):** 248
- **Post-Revocation Active Sessions (`auth.sessions`):** 0 (Target: 0)
- **Initial Refresh Tokens (`auth.refresh_tokens`):** 248
- **Post-Revocation Refresh Tokens (`auth.refresh_tokens`):** 0 (Target: 0)

---

## 4. Security Attestation (Rule N-8)
- Zero passwords, hashes, JWTs, or secret keys are contained in this receipt or tracked in version control.
- Secrets are isolated to local-only, gitignored environment files.

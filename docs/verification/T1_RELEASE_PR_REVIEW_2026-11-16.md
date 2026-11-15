# T1-06, T1-07, T1-08, T1-14 — PR readiness and acceptance audit

**Reviewed:** 16 Nov 2026 (Asia/Kathmandu)  
**GitHub main baseline:** `3658f2faf91001d3f76e48bc21a51c803db83051`  
**Scope:** Open PRs #174–#177; proposed task-state reconciliation only.  
**Boundary:** No PR merge, production deployment, remote branch deletion, DNS changes, live database writes, payment changes, or host activation.

## Executive decision

The four cards have started and their code PRs have passing **PR-head** source gates. They **are not done**: staging, owner/hosted/device checks are missing, and three PRs currently have merge conflicts. This report changes only the roadmap's stale TODO labels via a docs-only proposed PR.

| Card | GitHub PR | Head | CI | Merge status observed | Proposed card status | Evidence still missing |
|---|---|---|---|---|---|---|
| T1-06 Storage scoping | [#174](https://github.com/babindulal7/babin-rentals-os/pull/174) | `79980fd1faf0` | Success | Clean | `ready` | Real authenticated staging upload/download/signed URLs, isolated client roles, quarantine count |
| T1-07 Cloudflare hosting | [#175](https://github.com/babindulal7/babin-rentals-os/pull/175) | `2bcab83c18a8` | Success | Dirty/conflicting | `doing` | Conflict repair, actual staging Pages + Access, SPA deep links, SW cache behavior, owner Cloudflare/DNS approval |
| T1-08 Error monitoring | [#176](https://github.com/babindulal7/babin-rentals-os/pull/176) | `6e89180022e5` | Success | Dirty/conflicting | `doing` | Conflict repair, staging Sentry DSN, received synthetic event and reference-code correspondence, privacy negative tests |
| T1-14 Device performance | [#177](https://github.com/babindulal7/babin-rentals-os/pull/177) | `69626cad8356` | Success | Dirty/conflicting | `doing` | Conflict repair, scanner first-click/mount regressions, true 4G iPhone/iPad timing, staging host |

### Detailed findings and requests already posted

- [Review #174](https://github.com/babindulal7/babin-rentals-os/pull/174#issuecomment-6901740296): PGlite helper authorization check is **not the same as** signed URL and full Supabase Storage API/RLS acceptance.
- [Review #175](https://github.com/babindulal7/babin-rentals-os/pull/175#issuecomment-6901740729): conflict repair; static marketing path behavior; strict CSP and protected staging access; no premature deployment.
- [Review #176](https://github.com/babindulal7/babin-rentals-os/pull/176#issuecomment-6901741118): Sentry event test and privacy; console output is not the same as network telemetry; distinguish generated vs delivered reference code.
- [Review #177](https://github.com/babindulal7/babin-rentals-os/pull/177#issuecomment-6901741528): scanner toggle may arrive before lazy component listener mounts, and code-split chunk reduction does not prove faster initial network transfer.

## Immediate actions

1. **Mac Antigravity**: fix conflicts on #175–#177 non-destructively, add the specified regression tests; keep each focused PR separate. Do not force-push or auto-merge.
2. **Windows Antigravity**: finish backup/staging preparation T1-01/T1-02 under owner consent, then expose safe staging-only test seats without committing secrets.
3. **Mac Antigravity**: run the #174 Storage API matrix on approved staging. A clean CI run without staged access is not a card closeout.
4. **Owner**: explicitly approve Supabase staging costs and Cloudflare/Sentry account configuration before any project provisioning. Real-device checks require phone and iPad access.
5. After merged changes **and** acceptance evidence, update `PROGRESS.md` and roadmap with actual results. Do not mark any of these four `done` from this report.

## Reconciliation limitation

The existence of an open PR and a passing CI check establishes implementation progress, **not** acceptance. This documentation-only status update will itself be effective only **after review and merge**. The canonical `main` status remains unchanged until that happens. Verify latest PR heads and status again before using this record for a merge decision.

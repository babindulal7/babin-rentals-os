# Conflict repair integration — 6 November 2026

Main base: `4a669104`, then current main's canonical-copy test commit `66ec690a` was included at `608dca54`. Repair branch: `796845af`. Integration branch: `lane-a/T0-12-main-integration`, isolated checkout `.worktrees/conflict-main-integration`.

Babin authorized local main integration and application of this glossary migration in C-7. Main's three pre-existing auth/Operations test edits were preserved and then included through their own main commit `66ec690a`.

## Combined behavior

- Preserve Gemini's later Wave 3/4 dictionaries, converted screens and Nepali typography.
- Preserve first-sign-in language choice through the shared account preference control, including inline failures, offline restriction and the whole-app acceptance gate.
- First-run onboarding waits for an authenticated staff member to leave the login route. Its seen flag no longer consumes the current visit when StrictMode repeats mount effects; the existing three-test suite retains its previous assertions and now covers StrictMode.
- Remove the duplicate device-cache language write/read path introduced by T6-09. Auth hydration and account switching use `staff_language`; legacy device/global values are ignored.
- Keep translation approval evidence exact and pending until Babin reviews it. Merged conversion code does not establish owner or physical-device acceptance.
- Renumber glossary migration 0222 to **0223**; main's existing 0222 inventory repair stays unchanged. The original branch report is historical evidence for its original source, not a receipt for this integration.
- Resolve progress conflicts by preserving both lanes' entries; record fresh integration evidence separately.

## Verification and application

Fresh browser checks passed: nine Owner/Warehouse checks at 375/820/1440, including Owner approvals and the restricted editor, plus the first-sign-in language gate at all three widths. Preview startup/readiness needed longer waits under contention, then the preview was restarted after detecting stale compiled modules. The passing run explicitly verified that served App and first-run code matched the candidate. Mock external requests were blocked; evidence is in `artifacts/main-integration/browser/`.

Targeted account/glossary/Auth checks passed 50 tests; the three existing first-run tests and seven language preference checks also passed after the first-run repair. Server contracts passed 59 assertions. Full combined-source gates are pending. No live migration has been applied by this integration.

Backup validation PASS: `backups/production_backup_2026-11-06T04-45-29-638Z.sql`, 23,497,610 bytes, SHA-256 `2ef64e76ef8c188a5ed906205ff0ac0f4c7bd60065e45c326f57a8d27fe33e94`. Backup is ignored/private; restore rehearsal is NOT VERIFIED. Refresh before application.

Live dependency inspection found the staff/role/identity helpers, append-only triggers and required audit columns. The live role helper excludes inactive/deactivated users. Glossary tables do not yet exist. Existing security-advisor findings were recorded before application for comparison; this integration does not remediate unrelated live schema findings. Dependency audit still reports 36 existing advisories (3 low, 15 moderate, 14 high, 4 critical).

No unrelated migration, deployment or remote Git push is authorized by this integration. Production HOLD and whole-app Nepali review/device acceptance remain separate.

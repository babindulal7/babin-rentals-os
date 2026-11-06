# Conflict repair integration — 6 November 2026

Main base: `4a669104`. Repair branch: `796845af`. Integration branch: `lane-a/T0-12-main-integration`, isolated checkout `.worktrees/conflict-main-integration`.

Babin authorized local main integration and application of this glossary migration in C-7. Main's three pre-existing uncommitted auth/Operations test edits are outside this integration and remain untouched.

## Combined behavior

- Preserve Gemini's later Wave 3/4 dictionaries, converted screens and Nepali typography.
- Preserve first-sign-in language choice through the shared account preference control, including inline failures, offline restriction and the whole-app acceptance gate.
- Remove the duplicate device-cache language write/read path introduced by T6-09. Auth hydration and account switching use `staff_language`; legacy device/global values are ignored.
- Keep translation approval evidence exact and pending until Babin reviews it. Merged conversion code does not establish owner or physical-device acceptance.
- Renumber glossary migration 0222 to **0223**; main's existing 0222 inventory repair stays unchanged. The original branch report is historical evidence for its original source, not a receipt for this integration.
- Resolve progress conflicts by preserving both lanes' entries; record fresh integration evidence separately.

## Verification and application

Combined-source gates, responsive browser recheck and backup verification are pending. No live migration has been applied by this integration. Live dependency inspection found the staff/role/identity helpers, append-only triggers and required audit columns; glossary tables do not yet exist.

No unrelated migration, deployment or remote Git push is authorized by this integration. Production HOLD and whole-app Nepali review/device acceptance remain separate.

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

Candidate `ca473317`, source fingerprint `b4a9c26020640d95ef7331efeb2f5c7e715458c03b65c637b8ce32dc7c6d313a`, passed all **17 full gates** on unchanged source, completed 6 Nov 2026 at 09:16 UTC. Normal and coverage runs each passed **6,740 tests in 559 files**. PGlite rebuilt **220/220** migrations; lifecycle **64/64**, financial integrity, security including the nine-role glossary proof, **59/59** server contracts, **58/58** partial-return assertions, progress/receipt/shell/UI-copy checks, **106/106** contrast pairs and build/PWA passed. Test workers were limited to two through Vitest environment settings; no assertions or timeouts were weakened. V8 coverage: statements 66.42%, branches 74.32%, functions 51.4%, lines 66.35%. Logs: `artifacts/main-integration/full-gates.log`; generated completion matches the candidate.

Targeted account/glossary/Auth checks passed 50 tests; the three existing first-run tests and seven language preference checks also passed after the first-run repair. No live migration has been applied by this integration.

## Concurrent main changes — integration remains pending

While those gates ran, main advanced to `b2f5bb47` with 60 changed files, including booking parser/payment defaults and UI/UX repairs. Main also added `0223_product_aliases.sql`, colliding with the candidate's glossary number. The later glossary integration must renumber again; 0224 is already claimed for offer emails, so the current next-free number is 0225 (recheck before claiming). Candidate receipts above do not certify this newer combined source.

The main checkout contains active, uncommitted offer-email work overlapping App, permissions, RBAC, actions, mock client, lifecycle and migration ledger files. No stash, reset or overwrite of those drafts was performed. Babin was asked interactively to pause all agents writing or merging main so their drafts can be preserved and one stable integration verified. Main merge and live application wait for that coordination; C-7 authorization itself remains in effect.

Backup validation PASS: `backups/production_backup_2026-11-06T04-45-29-638Z.sql`, 23,497,610 bytes, SHA-256 `2ef64e76ef8c188a5ed906205ff0ac0f4c7bd60065e45c326f57a8d27fe33e94`. Backup is ignored/private; restore rehearsal is NOT VERIFIED. Refresh before application.

Live dependency inspection found the staff/role/identity helpers, append-only triggers and required audit columns. The live role helper excludes inactive/deactivated users. Glossary tables do not yet exist. Existing security-advisor findings were recorded before application for comparison; this integration does not remediate unrelated live schema findings. Dependency audit still reports 36 existing advisories (3 low, 15 moderate, 14 high, 4 critical).

No unrelated migration, deployment or remote Git push is authorized by this integration. Production HOLD and whole-app Nepali review/device acceptance remain separate.

## 7 November — final combined source

Babin confirmed all main writers/mergers are paused. The latest committed main b2f5bb47 has now been merged into the candidate, preserving all 60 changed files. Both progress histories are retained; main’s O-21 payment-method decision stays O-21 and the answered glossary decision becomes O-22. The glossary migration is now **0225**, main’s product-alias 0223 stays unchanged, and Gemini’s committed 0224 reservation is carried into the shared ledger. Apply only 0225 under C-7/C-8. Fresh verification of this final combined source is pending.

Correction to the earlier concurrency note: the root checkout is on Gemini’s lane-b/T5-12-offer-emails-to-clients branch, not main. All 16 tracked/untracked draft files were copied with SHA-256 hashes plus a tracked binary patch to ignored artifacts/main-integration/gemini-draft-snapshot-2026-11-07/. Their originals remain untouched. Main is checked out cleanly at .worktrees/t3-07-expense-payment-authority; it is the authorized local landing checkout. No stash/reset of another lane’s work was needed.

## Final verified candidate — 7 November

All 17 gates passed on source commit 2ac70843 / fingerprint b35cf9a4c4ede51249c09da7da52b7d851513d6844a12de5f46b4b491e84b3c0: 6,839 tests in 573 files in normal and coverage runs; 221 migration rebuilds; 64 lifecycle checks; security/financial integrity; 59 server contracts; 58 partial-return assertions; 106 contrast pairs; all copy/shell/receipt/progress checks and build/PWA. V8 coverage is 67.28% statements, 74.63% branches, 51.37% functions, 67.22% lines. Browser checks passed 12/12 on the same fingerprint. Main follow-up d3ea9de8 changes only documentation and is preserved without changing verified inputs.

Fresh backup validation PASS: production_backup_2026-11-07T10-48-06-238Z.sql, 23,497,610 bytes, SHA-256 70d180d6dcac387bef4f7ede7276affdb806cb92d20a81bc3719f47890d276f7. Restore rehearsal NOT VERIFIED. Live glossary preflight is clear. Verified file: 0225_owner_approved_glossary_revisions.sql; SHA-256 b6705f15f86134992cd8d66d5ce26483d4ff802f797ed1427d39556248f5597f. Local landing and live application are the next authorized steps.

## Applied and verified — 7 November

Local main was fast-forwarded to d48b84d7. Only glossary migration 0225 was applied to project sxguwvgoserhdolewibb, recorded as version **20261107105159** / name 0225_owner_approved_glossary_revisions. The exact verified SQL file hash is recorded above; the MCP migration transaction wrapper replaced only the file’s outer BEGIN/COMMIT. No other migration, deployment, credential change or remote Git push was performed.

Live post-checks PASS: 265 baseline terms; zero persisted approval revisions; RLS enabled on both tables; anonymous table/RPC access refused; authenticated direct revision INSERT/UPDATE/DELETE revoked; five enabled immutable/audit triggers; two pinned definer functions; realtime publication entry present. A rolled-back live database probe exercised active Owner approval, idempotent retry and audit insertion, then Client/anonymous refusal. Final revision and glossary-audit counts remain zero. PostgreSQL sequence gaps from a rolled-back probe are expected and do not change wording/history.

Security advisor comparison: the pre-existing finding categories/counts are unchanged except authenticated callable definer functions increasing from 58 to 59 for the intentionally exposed approve_glossary_term RPC. Its server-side Owner check was verified; anon execution is revoked and both new function search paths are pinned. There are no new glossary-specific ERROR findings. This does not certify or remediate unrelated historical live findings.

Draft preservation: Gemini has since committed all 16 saved draft paths on T5-12 at 51e615c0 (13 exact snapshot matches and three subsequent lane edits); the safety snapshot remains intact. Root is now on lane-b/T5-13-edit-email-and-document-texts with a new uncommitted 0225_message_templates.sql. This session did not edit/stash/reset that checkout. **Rebase the T5-13 feature on current main and renumber that later-merging draft before integration/application. Do not overwrite or reapply the live glossary 0225.**

State: WRITTEN + VERIFIED locally + APPLIED with live DB post-checks PASS. Hosted Auth preference, real JWT/PostgREST, cross-client Realtime and physical-device acceptance are still NOT VERIFIED, so full end-to-end PRODUCTION-VERIFIED acceptance and production release remain HOLD. Nepali stays disabled until actual whole-app owner review/layout acceptance.

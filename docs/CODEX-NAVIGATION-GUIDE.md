# Codex navigation guide

Start at `docs/00_READ_FIRST.md`, then `CLAUDE.md`, `docs/PERMISSIONS.md`, newest rulings, product rules and the newest `PROGRESS.md` entry. `PLAN.md` and `docs/plans/README.md` define task ownership and gates. Babin's latest explicit product ruling outranks older specifications; Foundation is the fallback. Permissions follow PERMISSIONS and stricter wins.

| Concern | Source |
|---|---|
| Routes and shells | `src/App.tsx`, `src/components/shell/` |
| Engines and permissions | `src/lib/`, especially `rbac.ts`, `money.ts`, `pricingPipeline.ts` |
| Writes and database enforcement | `src/actions/`, `supabase/migrations/` |
| Read queries | `src/lib/queries/` |
| Screens | `src/modules/`; never `src/archive/` as current implementation |
| Translation and acceptance | `src/i18n/`, `i18n.ts`, `languageReadiness.ts` |
| Task ownership and migrations | `docs/plans/T*.md`, `prompts/`, `MIGRATION_LEDGER.md` |
| Verification | `package.json`, `scripts/run-gates.mjs`, workflow reference, `docs/verification/` |

Use `rg --files` and focused searches. Read only the newest progress entry, then search older entries by topic. Historical audits and stored receipts do not certify current source.

Use one worktree/branch per agent and task. Read the card's Where/Needs/Done when fields and nested instructions. Shared files require explicit card ownership. Awaiting merge or owner/device acceptance is not done.

For review, provide the concrete problem and resulting behavior, changed surfaces, authority, base/head or fingerprint, actual gate results, migration status, and remaining acceptance. Review the diff before pushing. Babin merges and applies live migrations. Run the complete local gate list, check changed screens at required widths/roles, log PROGRESS, run completion and lint:progress. Never fabricate approval or a successful save.

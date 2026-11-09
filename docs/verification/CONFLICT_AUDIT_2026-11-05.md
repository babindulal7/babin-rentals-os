# Conflict audit — historical snapshot, 5 November 2026

Inspected base: `25a5e9dc`. These are the original finding groups, not present-tense claims about the repaired branch. See `CONFLICT_RESOLUTION_2026-11-05.md` for repairs and verification.

1. Review export inferred approval from nonempty translation text. An in-memory Wave 2 export produced 294 OK rows and zero pending rows without reviewer evidence.
2. Language activation checked only 15 legacy core keys, and active commands/settings bypassed whole-app conversion, approval and layout acceptance.
3. Language was device-local despite T6-09 requiring a per-user account preference.
4. Cards and generated prompts used done while awaiting merge or required approval.
5. T6 layout acceptance and wave prerequisites formed a whole-card dependency cycle.
6. Foundation-versus-ruling precedence and broad agent product-decision authority contradicted the no-invented-decisions rule.
7. PERMISSIONS described Coordinator floor access despite restrictive code/database gates, and described all portal tables as deny-all while its own V-12 documented existing bindings.
8. Current-state opening receipts and CI wording had drifted, and the referenced Codex navigation guide was absent.

Evidence was local rules, source, task cards and the export reproduction. The audit did not certify hosted behavior or physical devices. Babin subsequently supplied the authority/language/editor decisions interactively; those answers are recorded in RULINGS-2026-11-05 C-2–C-6.

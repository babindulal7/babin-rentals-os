# Migration Ledger Reconciliation Report (T1-03)

**Date:** 2026-11-15 (NPT)  
**Tool:** \`scripts/plan-migrations.mjs\` against live snapshot and local migrations  
**Target Ledger:** \`docs/plans/MIGRATION_LEDGER.md\`  
**Next Free Number:** \`0239\`  

---

## 1. Executive Summary
- **Local Migrations:** 235 SQL files in \`supabase/migrations/\`
- **Live Schema Migrations:** 156 applied rows
- **Directly Matched Applied:** 147 migrations
- **Renamed Invariant Migrations:** 7 migrations verified
- **Live-Only / External Records:** 2 rows (\`archive_bakery_pos_schema\`, \`0047_seed_tail_b917_equipment_line\`)
- **Pending Migrations (Post-0164):** 81 numbered migrations (from \`0165\` through \`0238\`)

---

## 2. The 7 Renamed Migrations (Decision Log)

| Local Repo File | Live \`schema_migrations\` Name | Analysis & Resolution |
|---|---|---|
| \`0056_0_auth_role_falls_back_to_auth_uid.sql\` | \`0056_auth_role_falls_back_to_auth_uid\` | **Same migration.** Renamed locally to resolve duplicate \`0056\` prefix. Applied on live; mark as applied under \`--accept-rename\`. |
| \`0059_users_self_read_accepts_auth_uid.sql\` | \`0057_users_self_read_accepts_auth_uid\` | **Same migration.** Numbered \`0057\` on live due to early manual run. Applied on live; skip during batch push. |
| \`0060_staff_row_for_the_current_owner_identity.sql\` | \`0058_staff_row_for_babindulal7\` | **Same migration.** Hardcoded username generalized for repo portability. Seeded on live; skip. |
| \`0069_purchase_approval_owner_manager_only.sql\` | \`purchase_approval_owner_manager_only\` | **Same migration.** Live applied without numeric prefix. Skip. |
| \`0073_auth_role_resolves_without_pre_request_hook.sql\` | \`0056_auth_role_resolves_without_pre_request_hook\` | **Same migration.** Live carries legacy prefix \`0056\`. Skip. |
| \`0081_ruled_sequences_completion.sql\` | \`ruled_sequences_completion\` | **Same migration.** Live applied without numeric prefix. Skip. |
| \`0082_seed_operational_stage_corpus.sql\` | \`0076_seed_operational_stage_corpus\` | **Same migration.** Renumbered during local corpus stabilization. Skip. |

---

## 3. Unexplained Live Rows & Hazards
1. **\`archive_bakery_pos_schema\` (version 20260809220713):**  
   Belongs to historical Miraz POS development sharing the Supabase instance. Does not collide with \`public\` rental tables; leaves intact without touching.
2. **\`0047_seed_tail_b917_equipment_line\` vs \`0047_seed_reference_corpus.sql\`:**  
   Live spent \`0047\` on an early tail line seed. \`0047_seed_reference_corpus.sql\` is a local one-shot development fixture that **MUST NOT** be applied to live database holding real client data.
3. **Duplicate Prefix \`0188\`:**  
   \`0188_smart_reservation_holds.sql\` and \`0188_staff_renting_gear.sql\` are both verified in PGlite and preserved as a permanent legacy exception.

---

## 4. Required Action on Staging & Live (Rule N-5)
Per **Rule N-5**, no SQL will be applied directly to live Supabase from AI harnesses. When Babin applies migrations to staging (T1-02), run:
\`\`\`bash
node scripts/plan-migrations.mjs --accept-rename
\`\`\`
to emit the exact sequential, transaction-isolated migration list starting at \`0165\`.
